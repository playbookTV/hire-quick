/**
 * Test accounts for QA against the live/staging API + mobile app.
 * Fully idempotent (upsert on phone). Login is phone + OTP — on non-production
 * envs the OTP code is echoed in the POST /auth/otp/request response, so these
 * numbers don't need to receive SMS.
 *
 * Creates: 1 client, 3 ushers (spread of completed-job counts so applicant
 * ranking + milestone badges are visible), the reward tiers, and one open event.
 *
 * Run: set -a && . ./.env && set +a && \
 *   pnpm --filter @hq/database exec tsx prisma/seed-test-accounts.ts
 */
import { PrismaClient } from '@prisma/client';
import { naira } from '@hq/shared';

const prisma = new PrismaClient();
const DEV_HASH = 'argon2id$dev-placeholder';

interface UsherSpec {
  phone: string;
  email: string;
  name: string;
  bio: string;
  years: number;
  completedJobsCount: number;
  ratingAvg: number;
  ratingCount: number;
}

const CLIENT = { phone: '+2348100000001', email: 'client.test@hirequick.dev', displayName: 'Bisi Events' };

const USHERS: UsherSpec[] = [
  { phone: '+2348100000011', email: 'usher.a@hirequick.dev', name: 'Ada Okafor', bio: 'New usher, eager to work.', years: 0, completedJobsCount: 0, ratingAvg: 0, ratingCount: 0 },
  { phone: '+2348100000012', email: 'usher.b@hirequick.dev', name: 'Chidi Eze', bio: 'Reliable corporate-event usher.', years: 3, completedJobsCount: 25, ratingAvg: 4.8, ratingCount: 22 },
  { phone: '+2348100000013', email: 'usher.c@hirequick.dev', name: 'Ngozi Bello', bio: 'Lead usher, weddings & galas.', years: 6, completedJobsCount: 60, ratingAvg: 4.9, ratingCount: 51 },
];

async function ensureUsher(spec: UsherSpec): Promise<string> {
  // Create the user + usher + wallet on first run.
  await prisma.user.upsert({
    where: { phone: spec.phone },
    update: { email: spec.email, status: 'ACTIVE' },
    create: {
      role: 'USHER',
      phone: spec.phone,
      email: spec.email,
      passwordHash: DEV_HASH,
      status: 'ACTIVE',
      usher: { create: { bio: spec.bio, yearsExperience: spec.years, verificationStatus: 'VERIFIED', wallet: { create: {} } } },
    },
  });
  const usher = await prisma.usher.findFirstOrThrow({ where: { user: { phone: spec.phone } } });
  // Converge profile fields on every run.
  await prisma.usher.update({
    where: { id: usher.id },
    data: {
      bio: spec.bio,
      yearsExperience: spec.years,
      verificationStatus: 'VERIFIED',
      completedJobsCount: spec.completedJobsCount,
      ratingAvg: spec.ratingAvg,
      ratingCount: spec.ratingCount,
    },
  });
  await prisma.wallet.upsert({ where: { usherId: usher.id }, update: {}, create: { usherId: usher.id } });

  // Backfill milestone unlocks to match the completed-job count (mirrors the
  // ledger's evaluateMilestones; BADGE auto-fulfils, PHYSICAL waits on admin).
  const tiers = await prisma.milestoneTier.findMany({
    where: { active: true, threshold: { lte: spec.completedJobsCount } },
  });
  if (tiers.length) {
    await prisma.usherMilestone.createMany({
      data: tiers.map((t) => ({
        usherId: usher.id,
        tierId: t.id,
        status: t.rewardType === 'BADGE' ? ('FULFILLED' as const) : ('UNLOCKED' as const),
        fulfilledAt: t.rewardType === 'BADGE' ? new Date() : null,
      })),
      skipDuplicates: true,
    });
  }
  return usher.id;
}

async function main(): Promise<void> {
  // Reward tiers (idempotent on unique threshold).
  const TIERS = [
    { threshold: 20, name: 'Premium Badge', rewardType: 'BADGE' as const, description: 'Premium profile badge.' },
    { threshold: 50, name: 'Black Dress', rewardType: 'PHYSICAL' as const, description: 'Branded black dress.' },
    { threshold: 150, name: 'iPhone', rewardType: 'PHYSICAL' as const, description: 'iPhone reward.' },
  ];
  for (const t of TIERS) {
    await prisma.milestoneTier.upsert({ where: { threshold: t.threshold }, update: {}, create: t });
  }

  const clientUser = await prisma.user.upsert({
    where: { phone: CLIENT.phone },
    update: { email: CLIENT.email, status: 'ACTIVE' },
    create: {
      role: 'CLIENT',
      phone: CLIENT.phone,
      email: CLIENT.email,
      passwordHash: DEV_HASH,
      status: 'ACTIVE',
      client: { create: { displayName: CLIENT.displayName } },
    },
    include: { client: true },
  });
  const client = await prisma.client.findFirstOrThrow({ where: { userId: clientUser.id } });

  const usherIds: string[] = [];
  for (const spec of USHERS) usherIds.push(await ensureUsher(spec));

  // One open event so the discover/jobs screens have data (find-or-create).
  const TITLE = 'Test Event — Lagos Gala Ushers';
  const existing = await prisma.event.findFirst({ where: { clientId: client.id, title: TITLE } });
  if (!existing) {
    await prisma.event.create({
      data: {
        clientId: client.id,
        title: TITLE,
        venue: 'Eko Hotel, Victoria Island',
        eventDate: new Date('2026-09-15'),
        startTime: '17:00',
        endTime: '23:00',
        accommodation: 'PROVIDED', // ends after 22:00
        category: 'Gala',
        headcount: 5,
        budgetPerHead: naira(25_000),
        status: 'OPEN',
      },
    });
  }

  console.log('Test accounts ready:');
  console.log(`  CLIENT  ${CLIENT.phone}  (${CLIENT.displayName})`);
  USHERS.forEach((u) => console.log(`  USHER   ${u.phone}  (${u.name}, ${String(u.completedJobsCount)} jobs)`));
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
