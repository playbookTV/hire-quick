import { prisma } from '@hq/database';

/** Fail before database access unless the URL names disposable validation/CI storage. */
export async function assertDisposableDatabase(): Promise<void> {
  const url = new URL(process.env.DATABASE_URL ?? '');
  const schema = url.searchParams.get('schema') ?? 'public';
  const validationSchema = /^hq_validation_\d{14}_[a-f0-9]{8}$/.test(schema);
  const localCi =
    process.env.CI === 'true' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
    url.pathname === '/hirequick_test';
  if (!validationSchema && !localCi) {
    throw new Error(
      'Database tests require a disposable hq_validation schema or local hirequick_test CI database',
    );
  }
  const [row] = await prisma.$queryRaw<{ schema: string }[]>`SELECT current_schema() AS schema`;
  if (row?.schema !== schema)
    throw new Error('Raw SQL and ORM must use the same isolated database schema');
}
