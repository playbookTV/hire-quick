import { prisma } from '@hq/database';
import { assertDisposableDatabase } from './assert-disposable-db.js';

/** Run before test imports, including suites without their own DB guard. */
export default async function setup(): Promise<void> {
  try {
    await assertDisposableDatabase();
  } finally {
    await prisma.$disconnect();
  }
}
