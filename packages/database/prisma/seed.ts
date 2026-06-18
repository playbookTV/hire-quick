/**
 * Dev seed (TRD §22 exit): one admin, one verified usher (+wallet), one client,
 * one open event. Idempotent via upsert on natural keys (phone).
 */
import { PrismaClient } from '@prisma/client';
import { naira } from '@hq/shared';

const prisma = new PrismaClient();

// Placeholder hash — Phase 3 replaces with a real Argon2id hash at signup.
const DEV_HASH = 'argon2id$dev-placeholder';

async function main(): Promise<void> {
  const admin = await prisma.user.upsert({
    where: { phone: '+2348000000001' },
    update: {},
    create: { role: 'ADMIN', phone: '+2348000000001', email: 'admin@hirequick.dev', passwordHash: DEV_HASH, status: 'ACTIVE' },
  });

  const clientUser = await prisma.user.upsert({
    where: { phone: '+2348000000002' },
    update: {},
    create: {
      role: 'CLIENT',
      phone: '+2348000000002',
      email: 'client@hirequick.dev',
      passwordHash: DEV_HASH,
      status: 'ACTIVE',
      client: { create: { displayName: 'Lagos Weddings Co.' } },
    },
    include: { client: true },
  });

  const usherUser = await prisma.user.upsert({
    where: { phone: '+2348000000003' },
    update: {},
    create: {
      role: 'USHER',
      phone: '+2348000000003',
      email: 'usher@hirequick.dev',
      passwordHash: DEV_HASH,
      status: 'ACTIVE',
      usher: {
        create: {
          bio: 'Experienced event usher, Lagos.',
          yearsExperience: 3,
          verificationStatus: 'VERIFIED',
          wallet: { create: {} },
        },
      },
    },
    include: { usher: true },
  });

  const client = clientUser.client!;
  await prisma.event.create({
    data: {
      clientId: client.id,
      title: 'Oriental Hotel Wedding — Ushers',
      venue: 'Oriental Hotel, Lekki',
      eventDate: new Date('2026-08-15'),
      startTime: '14:00',
      endTime: '22:00',
      category: 'Wedding',
      headcount: 6,
      budgetPerHead: naira(20_000), // ₦20,000/head
      status: 'OPEN',
    },
  });

  console.log('Seeded:', {
    admin: admin.id,
    client: client.id,
    usher: usherUser.usher?.id,
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
