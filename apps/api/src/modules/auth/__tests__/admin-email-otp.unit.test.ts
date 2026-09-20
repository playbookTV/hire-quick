import { beforeEach, describe, expect, it, vi } from 'vitest';

type User = { id: string; email: string; role: string; status: string; phone: string };
type Record = {
  id: string;
  purpose: string;
  subjectRef: string;
  codeHash: string;
  createdAt: Date;
  expiresAt: Date;
  consumedAt: Date | null;
  attempts: number;
};
type Where = {
  id?: string;
  purpose?: string;
  subjectRef?: string;
  consumedAt?: null;
  createdAt?: { gt?: Date; gte?: Date };
  expiresAt?: { gt: Date };
};
const state = vi.hoisted(() => ({
  users: [] as User[],
  records: [] as Record[],
  tail: Promise.resolve(),
}));
const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  audit: vi.fn(),
  raw: vi.fn(),
  access: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock('../../../app.js', () => ({
  ApiError: class extends Error {
    constructor(
      public statusCode: number,
      public code: string,
      message: string,
    ) {
      super(message);
    }
  },
}));
vi.mock('../../../env.js', () => ({
  env: {
    NODE_ENV: 'test',
    OTP_VERIFIER_KEY_ID: 'unit',
    OTP_VERIFIER_SECRET: 'isolated-test-secret',
  },
}));
vi.mock('../../notifications/brevo.js', () => ({ sendEmail: mocks.send }));
vi.mock('../../audit.js', () => ({ writeAudit: mocks.audit }));
vi.mock('../tokens.js', () => ({ signAccessToken: mocks.access, signRefreshToken: mocks.refresh }));
vi.mock('@hq/database', () => {
  const matches = (row: Record, where: Where) =>
    (!where.id || row.id === where.id) &&
    (!where.purpose || row.purpose === where.purpose) &&
    (!where.subjectRef || row.subjectRef === where.subjectRef) &&
    (where.consumedAt !== null || row.consumedAt === null) &&
    (!where.createdAt?.gt || row.createdAt > where.createdAt.gt) &&
    (!where.createdAt?.gte || row.createdAt >= where.createdAt.gte) &&
    (!where.expiresAt || row.expiresAt > where.expiresAt.gt);
  const tx = {
    $queryRaw: mocks.raw,
    user: {
      findMany: async ({ where }: { where: { email: { equals: string } } }) =>
        state.users.filter((u) => u.email.toLowerCase() === where.email.equals).slice(0, 2),
    },
    verificationCode: {
      count: async ({ where }: { where: Where }) =>
        state.records.filter((r) => matches(r, where)).length,
      create: async ({ data }: { data: Omit<Record, 'consumedAt' | 'attempts'> }) => {
        const row = { ...data, consumedAt: null, attempts: 0 };
        state.records.push(row);
        return row;
      },
      updateMany: async ({ where, data }: { where: Where; data: Partial<Record> }) => {
        const rows = state.records.filter((r) => matches(r, where));
        rows.forEach((row) => Object.assign(row, data));
        return { count: rows.length };
      },
      findFirst: async ({ where }: { where: Where }) =>
        state.records
          .filter((r) => matches(r, where))
          .sort(
            (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id),
          )[0] ?? null,
      update: async ({
        where,
        data,
      }: {
        where: Where;
        data: { consumedAt?: Date; attempts?: { increment: number } };
      }) => {
        const row = state.records.find((r) => matches(r, where))!;
        if (data.attempts) row.attempts += data.attempts.increment;
        if (data.consumedAt) row.consumedAt = data.consumedAt;
        return row;
      },
    },
  };
  return {
    prisma: {
      $transaction: async (callback: (value: typeof tx) => Promise<unknown>) => {
        const prior = state.tail;
        let finish!: () => void;
        state.tail = new Promise<void>((resolve) => {
          finish = resolve;
        });
        await prior;
        const before = structuredClone(state.records);
        try {
          return await callback(tx);
        } catch (error) {
          state.records = before;
          throw error;
        } finally {
          finish();
        }
      },
    },
  };
});

import { adminEmailSchema, requestAdminEmailOtp, verifyAdminEmailOtp } from '../admin-email-otp.js';
import { hashOtp, verifyOtpHash, OTP_TTL_MS } from '../hash.js';

const email = 'admin@example.test';
const admin = (): User => ({
  id: '00000000-0000-4000-8000-000000000001',
  email,
  role: 'ADMIN',
  status: 'ACTIVE',
  phone: '+2348000000000',
});
const sentCode = (index = mocks.send.mock.calls.length - 1): string => {
  const html = String(mocks.send.mock.calls[index]![2]);
  return /<strong>(\d{6})<\/strong>/.exec(html)![1]!;
};
beforeEach(() => {
  vi.clearAllMocks();
  state.users = [admin()];
  state.records = [];
  state.tail = Promise.resolve();
  mocks.send.mockResolvedValue(true);
  mocks.audit.mockResolvedValue(undefined);
  mocks.raw.mockResolvedValue([]);
  mocks.access.mockResolvedValue('access');
  mocks.refresh.mockResolvedValue('refresh');
});

describe('admin-only email OTP', () => {
  it('normalizes and validates email, hashes its account-bound code, and never echoes it', async () => {
    expect(adminEmailSchema.parse('  ADMIN@EXAMPLE.TEST ')).toBe(email);
    expect(adminEmailSchema.safeParse('invalid').success).toBe(false);
    expect(adminEmailSchema.safeParse(`${'a'.repeat(245)}@example.test`).success).toBe(false);
    await expect(requestAdminEmailOtp('  ADMIN@EXAMPLE.TEST ')).resolves.toEqual({ sent: true });
    const row = state.records[0]!;
    expect(row.subjectRef).toBe(`admin-email:${email}:${admin().id}`);
    expect(
      verifyOtpHash(row.codeHash, sentCode(), {
        purpose: 'AUTH',
        subjectRef: row.subjectRef,
        id: row.id,
      }),
    ).toBe(true);
    expect(row.codeHash).not.toContain(sentCode());
    expect(mocks.send).toHaveBeenCalledWith(email, expect.any(String), expect.any(String));
    expect(mocks.raw.mock.calls[0]?.[1]).toBe(`auth-admin-email:${email}`);
  });

  it.each(['missing', 'CLIENT', 'USHER', 'PENDING', 'SUSPENDED', 'ANONYMIZED', 'ambiguous'])(
    'denies %s accounts without provisioning or delivery',
    async (kind) => {
      if (kind === 'missing') state.users = [];
      else if (kind === 'CLIENT' || kind === 'USHER') state.users[0]!.role = kind;
      else if (kind === 'ambiguous')
        state.users.push({ ...admin(), id: 'other', email: email.toUpperCase(), role: 'CLIENT' });
      else state.users[0]!.status = kind;
      const before = structuredClone(state.users);
      await expect(requestAdminEmailOtp(email)).resolves.toEqual({ sent: true });
      await expect(verifyAdminEmailOtp(email, '123456')).rejects.toMatchObject({
        code: 'OTP_INVALID',
      });
      expect(state.users).toEqual(before);
      expect(state.records).toHaveLength(0);
      expect(mocks.send).not.toHaveBeenCalled();
      expect(mocks.access).not.toHaveBeenCalled();
    },
  );

  it('enforces five requests per hour and expires earlier codes', async () => {
    for (let i = 0; i < 5; i++) await requestAdminEmailOtp(email);
    await expect(requestAdminEmailOtp(email)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    expect(state.records.filter((r) => r.expiresAt > new Date())).toHaveLength(1);
    expect(mocks.send).toHaveBeenCalledTimes(5);
  });

  it('consumes once, signs an ADMIN session and audits without the email/code', async () => {
    await requestAdminEmailOtp(email);
    const code = sentCode();
    const results = await Promise.allSettled([
      verifyAdminEmailOtp(email, code),
      verifyAdminEmailOtp(email, code),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(mocks.access).toHaveBeenCalledWith(admin().id, 'ADMIN', 'refresh');
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'auth.login', target: admin().id }),
      expect.anything(),
    );
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain(email);
  });

  it('commits wrong attempts and locks out the correct code after five failures', async () => {
    await requestAdminEmailOtp(email);
    const code = sentCode();
    const wrong = code === '000000' ? '000001' : '000000';
    for (let i = 0; i < 5; i++)
      await expect(verifyAdminEmailOtp(email, wrong)).rejects.toMatchObject({
        code: 'OTP_INVALID',
      });
    expect(state.records[0]!.attempts).toBe(5);
    await expect(verifyAdminEmailOtp(email, code)).rejects.toMatchObject({ code: 'OTP_LOCKED' });
    expect(mocks.audit).toHaveBeenCalledOnce();
  });

  it.each(['expiry', 'ttl'])('rejects code after %s', async (kind) => {
    await requestAdminEmailOtp(email);
    const row = state.records[0]!;
    if (kind === 'expiry') row.expiresAt = new Date(0);
    else row.createdAt = new Date(Date.now() - OTP_TTL_MS - 1);
    await expect(verifyAdminEmailOtp(email, sentCode())).rejects.toMatchObject({
      code: 'OTP_INVALID',
    });
  });

  it('rejects copied hashes and an email reassigned to a different admin', async () => {
    await requestAdminEmailOtp(email);
    const code = sentCode();
    const row = state.records[0]!;
    row.codeHash = hashOtp(code, { purpose: 'AUTH', subjectRef: admin().phone, id: row.id });
    await expect(verifyAdminEmailOtp(email, code)).rejects.toMatchObject({ code: 'OTP_INVALID' });
    row.codeHash = hashOtp(code, { purpose: 'AUTH', subjectRef: row.subjectRef, id: row.id });
    state.users[0]!.id = '00000000-0000-4000-8000-000000000002';
    await expect(verifyAdminEmailOtp(email, code)).rejects.toMatchObject({ code: 'OTP_INVALID' });
  });

  it('rechecks eligibility after locking the user', async () => {
    await requestAdminEmailOtp(email);
    mocks.raw.mockImplementation(async (query: TemplateStringsArray) => {
      if (query.join('').includes('FROM users')) state.users[0]!.status = 'SUSPENDED';
      return [];
    });
    await expect(verifyAdminEmailOtp(email, sentCode())).rejects.toMatchObject({
      code: 'OTP_INVALID',
    });
    expect(state.records[0]!.consumedAt).toBeNull();
  });

  it('rolls back consumption when token signing or audit fails', async () => {
    await requestAdminEmailOtp(email);
    mocks.audit.mockRejectedValueOnce(new Error('audit unavailable'));
    await expect(verifyAdminEmailOtp(email, sentCode())).rejects.toThrow('audit unavailable');
    expect(state.records[0]!.consumedAt).toBeNull();
    await expect(verifyAdminEmailOtp(email, sentCode())).resolves.toMatchObject({
      accessToken: 'access',
    });
  });

  it('invalidates failed delivery without invalidating a newer issuance', async () => {
    let fail!: (value: boolean) => void;
    mocks.send.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          fail = resolve;
        }),
    );
    const first = requestAdminEmailOtp(email);
    await vi.waitFor(() => expect(mocks.send).toHaveBeenCalledOnce());
    await requestAdminEmailOtp(email);
    const code = sentCode();
    fail(false);
    await expect(first).resolves.toEqual({ sent: false });
    expect(state.records[0]!.expiresAt.getTime()).toBeLessThanOrEqual(Date.now());
    await expect(verifyAdminEmailOtp(email, code)).resolves.toMatchObject({
      accessToken: 'access',
    });
  });
});
