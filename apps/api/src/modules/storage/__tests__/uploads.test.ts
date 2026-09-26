/** Object storage is in memory; PostgreSQL must be a disposable validation schema. */
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { prisma } from '@hq/database';
import { createApp } from '../../../app.js';
import { socketToken } from '../../../realtime/__tests__/session-fixture.js';
import { assertDisposableDatabase } from '../../auth/__tests__/assert-disposable-db.js';
import { eraseUser } from '../../privacy/service.js';
import { photoKey } from '../storage.js';
import {
  issueUpload,
  finalizeUpload,
  cleanupStorage,
  consumeUpload,
  lockUploadOwner,
  scheduleDeletion,
  STORAGE_TX,
  type UploadPurpose,
} from '../uploads.js';

const files = new Map<
  string,
  { size: number; contentType: string; etag: string; prefix: Uint8Array }
>();
const storage = {
  presignUpload: vi.fn(async (key: string) => `https://storage.invalid/put/${key}`),
  presignDownload: vi.fn(async (key: string) => `https://storage.invalid/get/${key}`),
  inspectObject: vi.fn(async (key: string) => {
    const file = files.get(key);
    if (!file) throw new Error('Not found');
    return file;
  }),
  copyObject: vi.fn(async (source: string, destination: string, etag: string) => {
    const file = files.get(source);
    if (!file || file.etag !== etag) throw new Error('Precondition failed');
    files.set(destination, { ...file });
  }),
  deleteObject: vi.fn(async (key: string) => {
    files.delete(key);
  }),
};
const app = createApp({ storage });
const users: string[] = [];
const keys: string[] = [];
let validated = false;
beforeAll(async () => {
  await assertDisposableDatabase();
  validated = true;
});
beforeEach(() => {
  vi.clearAllMocks();
});
afterAll(async () => {
  if (!validated) return;
  await prisma.uploadIntent.deleteMany({ where: { ownerId: { in: users } } });
  await prisma.storageDeletion.deleteMany({
    where: { key: { in: [...keys, ...keys.map((key) => `staging/${key}`)] } },
  });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
});
async function fixture() {
  const user = await prisma.user.create({
    data: {
      phone: `upload-${randomUUID()}`,
      role: 'USHER',
      status: 'ACTIVE',
      usher: { create: {} },
    },
    include: { usher: true },
  });
  users.push(user.id);
  return { userId: user.id, usherId: user.usher!.id, token: await socketToken(user.id, 'USHER') };
}
async function issue(f: Awaited<ReturnType<typeof fixture>>, purpose: UploadPurpose = 'avatar') {
  const key = photoKey(f.usherId, purpose === 'portfolio' ? 'portfolio' : 'avatar', 'jpg');
  keys.push(key);
  await issueUpload(storage, {
    key,
    ownerId: f.userId,
    scopeId: f.usherId,
    purpose,
    contentType: 'image/jpeg',
    byteSize: 16,
  });
  return key;
}
function put(key: string) {
  files.set(`staging/${key}`, {
    size: 16,
    contentType: 'image/jpeg',
    etag: randomUUID(),
    prefix: Buffer.from([255, 216, 255, 0]),
  });
}
async function ready(f: Awaited<ReturnType<typeof fixture>>, purpose: UploadPurpose = 'avatar') {
  const key = await issue(f, purpose);
  put(key);
  await finalizeUpload(storage, f.userId, key);
  return key;
}
function avatar(f: Awaited<ReturnType<typeof fixture>>, key: string) {
  return request(app)
    .put('/api/me/photos/avatar')
    .set('Authorization', `Bearer ${f.token}`)
    .send({ key });
}

describe('verified uploads and durable cleanup', () => {
  it('persists issuance before PUT; refuses missing, forged, foreign, wrong-sized and disguised files', async () => {
    const f = await fixture();
    const other = await fixture();
    const key = await issue(f);
    expect(
      await prisma.storageDeletion.findUnique({ where: { key: `staging/${key}` } }),
    ).toMatchObject({ completedAt: null });
    await expect(finalizeUpload(storage, f.userId, key)).rejects.toMatchObject({
      code: 'UPLOAD_INCOMPLETE',
    });
    await expect(finalizeUpload(storage, other.userId, key)).rejects.toMatchObject({
      code: 'INVALID_UPLOAD',
    });
    await expect(
      finalizeUpload(storage, f.userId, photoKey(f.usherId, 'avatar', 'jpg')),
    ).rejects.toMatchObject({ code: 'INVALID_UPLOAD' });
    put(key);
    files.get(`staging/${key}`)!.size = 17;
    await expect(finalizeUpload(storage, f.userId, key)).rejects.toMatchObject({
      code: 'INVALID_UPLOAD_CONTENT',
    });
    put(key);
    files.get(`staging/${key}`)!.prefix = Buffer.from('<html>bad</html>');
    await expect(finalizeUpload(storage, f.userId, key)).rejects.toMatchObject({
      code: 'INVALID_UPLOAD_CONTENT',
    });
    expect(storage.copyObject).not.toHaveBeenCalled();
    expect((await avatar(f, key)).status).toBe(400);
  });

  it('finalization is retryable and saved bytes cannot be overwritten with the PUT URL', async () => {
    const f = await fixture();
    const key = await issue(f);
    put(key);
    storage.copyObject.mockRejectedValueOnce(new Error('interrupted'));
    await expect(finalizeUpload(storage, f.userId, key)).rejects.toMatchObject({
      code: 'UPLOAD_INCOMPLETE',
    });
    expect(
      (await prisma.uploadIntent.findUniqueOrThrow({ where: { key } })).finalizedAt,
    ).toBeNull();
    await finalizeUpload(storage, f.userId, key);
    const saved = files.get(key)!.etag;
    put(key); // Same signed PUT now contains other bytes.
    await finalizeUpload(storage, f.userId, key);
    expect(files.get(key)!.etag).toBe(saved);
    expect(storage.copyObject).toHaveBeenCalledTimes(2);
    expect((await avatar(f, key)).status).toBe(200);
    expect((await avatar(f, key)).status).toBe(200);
    const replay = await request(app)
      .post('/api/me/photos/portfolio')
      .set('Authorization', `Bearer ${f.token}`)
      .send({ key });
    expect(replay.status).toBe(400);
  });

  it('serializes duplicate portfolio requests and rolls back consumption on a full portfolio', async () => {
    const f = await fixture();
    const key = await ready(f, 'portfolio');
    const save = () =>
      request(app)
        .post('/api/me/photos/portfolio')
        .set('Authorization', `Bearer ${f.token}`)
        .send({ key });
    const responses = await Promise.all([save(), save()]);
    expect(responses.map((r) => r.status)).toEqual([201, 201]);
    expect(responses[0]!.body.id).toBe(responses[1]!.body.id);
    expect(await prisma.photo.count({ where: { usherId: f.usherId } })).toBe(1);
    await prisma.photo.createMany({
      data: Array.from({ length: 4 }, () => ({ usherId: f.usherId, imageUrl: 'legacy' })),
    });
    const excess = await ready(f, 'portfolio');
    expect(
      (
        await request(app)
          .post('/api/me/photos/portfolio')
          .set('Authorization', `Bearer ${f.token}`)
          .send({ key: excess })
      ).status,
    ).toBe(409);
    expect(
      (await prisma.uploadIntent.findUniqueOrThrow({ where: { key: excess } })).consumedAt,
    ).toBeNull();
  });

  it('saves replacement before deletion, retains failures, checks shared references and blocks resurrection', async () => {
    const f = await fixture();
    const first = await ready(f);
    const second = await ready(f);
    expect((await avatar(f, first)).status).toBe(200);
    // Historical duplicate: this reference must protect the old file.
    const shared = await prisma.photo.create({ data: { usherId: f.usherId, imageUrl: first } });
    expect((await avatar(f, second)).status).toBe(200);
    expect(storage.deleteObject).not.toHaveBeenCalled();
    expect((await prisma.usher.findUniqueOrThrow({ where: { id: f.usherId } })).avatarKey).toBe(
      second,
    );
    expect(await cleanupStorage(storage, [first])).toMatchObject({ deleted: 0, deferred: 1 });
    await prisma.photo.delete({ where: { id: shared.id } });
    await prisma.storageDeletion.update({
      where: { key: first },
      data: { nextAttemptAt: new Date(0) },
    });
    storage.deleteObject.mockRejectedValueOnce(new Error('provider outage with sensitive details'));
    expect(await cleanupStorage(storage, [first])).toMatchObject({ deleted: 0, failed: 1 });
    expect(await prisma.storageDeletion.findUnique({ where: { key: first } })).toMatchObject({
      attempts: 1,
      completedAt: null,
      lastError: 'STORAGE_DELETE_FAILED',
    });
    await prisma.storageDeletion.update({
      where: { key: first },
      data: { nextAttemptAt: new Date(0) },
    });
    expect(await cleanupStorage(storage, [first])).toMatchObject({ deleted: 1, failed: 0 });
    expect(files.has(first)).toBe(false);
    expect((await avatar(f, first)).status).toBe(409);
    expect(await prisma.storageDeletion.findUnique({ where: { key: first } })).toMatchObject({
      attempts: 2,
      lastError: null,
    });
  });

  it('consumes only once across references and expires abandoned uploads', async () => {
    const f = await fixture();
    const key = await ready(f, 'portfolio');
    const claim = (reference: string) =>
      prisma.$transaction(async (tx) => {
        await lockUploadOwner(tx, f.userId);
        await consumeUpload(tx, {
          key,
          ownerId: f.userId,
          scopeId: f.usherId,
          purpose: 'portfolio',
          reference,
        });
      }, STORAGE_TX);
    await claim('photo:one');
    await expect(claim('photo:two')).rejects.toMatchObject({ code: 'UPLOAD_ALREADY_USED' });
    const abandoned = await ready(f);
    await prisma.uploadIntent.update({
      where: { key: abandoned },
      data: { attachExpiresAt: new Date(0) },
    });
    expect((await avatar(f, abandoned)).status).toBe(409);
    expect(await cleanupStorage(storage, [abandoned])).toMatchObject({ deleted: 1 });
    expect(files.has(abandoned)).toBe(false);
  });

  it('erasure inventories pending and saved media before scrub; reports actual deletion success', async () => {
    const f = await fixture();
    const key = await ready(f);
    const pending = await issue(f);
    expect((await avatar(f, key)).status).toBe(200);
    const result = await prisma.$transaction((tx) => eraseUser(tx, f.userId), STORAGE_TX);
    expect(result.storageKeys).toEqual(expect.arrayContaining([key, pending]));
    expect(await prisma.storageDeletion.findUnique({ where: { key } })).toMatchObject({
      completedAt: null,
    });
    expect(
      (await prisma.usher.findUniqueOrThrow({ where: { id: f.usherId } })).avatarKey,
    ).toBeNull();
    storage.deleteObject.mockRejectedValueOnce(new Error('outage'));
    expect(await cleanupStorage(storage, [key])).toMatchObject({ deleted: 0, failed: 1 });
    await expect(finalizeUpload(storage, f.userId, pending)).rejects.toMatchObject({
      code: 'UPLOAD_UNAVAILABLE',
    });
  });

  it('binds ID and selfie uploads to separate purposes and accepts a matching submission retry', async () => {
    const f = await fixture();
    const documents: string[] = [];
    for (const kind of ['id', 'selfie']) {
      const issued = await request(app)
        .post('/api/me/verification/upload-url')
        .set('Authorization', `Bearer ${f.token}`)
        .send({ kind, contentType: 'image/jpeg', byteSize: 16 });
      expect(issued.status).toBe(201);
      const key = issued.body.key as string;
      keys.push(key);
      documents.push(key);
      put(key);
      const finalized = await request(app)
        .post('/api/me/uploads/finalize')
        .set('Authorization', `Bearer ${f.token}`)
        .send({ key });
      expect(finalized.status).toBe(200);
    }
    const submit = (idDocumentUrl: string, selfieUrl: string) =>
      request(app)
        .post('/api/me/verification')
        .set('Authorization', `Bearer ${f.token}`)
        .send({ idDocumentUrl, selfieUrl });
    expect((await submit(documents[1]!, documents[0]!)).status).toBe(400);
    const saved = await submit(documents[0]!, documents[1]!);
    expect(saved.status).toBe(201);
    const replay = await submit(documents[0]!, documents[1]!);
    expect(replay.status).toBe(201);
    expect(replay.body.id).toBe(saved.body.id);
  });

  it('rolls back the deletion intent when the enclosing reference change fails', async () => {
    const f = await fixture();
    const key = await ready(f);
    await expect(
      prisma.$transaction(async (tx) => {
        await scheduleDeletion(tx, key);
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(await prisma.storageDeletion.findUnique({ where: { key } })).toBeNull();
    expect(await cleanupStorage(storage, [key])).toMatchObject({ deleted: 0 });
  });
});
