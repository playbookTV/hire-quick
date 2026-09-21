/** Disposable PostgreSQL validation. Never runs tests with configured URLs unchanged. */
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const requireApi = createRequire(new URL('../../apps/api/package.json', import.meta.url));
const { parse } = requireApi('dotenv');
const { PrismaClient } = requireApi('@hq/database');
const configured = { ...parse(readFileSync(`${root}/.env`)), ...process.env };
const source = new URL(configured.DIRECT_URL ?? configured.DATABASE_URL);
if (!['postgresql:', 'postgres:'].includes(source.protocol))
  throw new Error('PostgreSQL URL required');
source.hostname = source.hostname.replace('-pooler.', '.');
source.searchParams.delete('pgbouncer');
source.searchParams.set('connect_timeout', '20');
source.searchParams.set('connection_limit', '8');
const schema = `hq_validation_${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}_${randomBytes(4).toString('hex')}`;
const url = new URL(source);
url.searchParams.set('schema', schema);
url.searchParams.set('options', `-c search_path=${schema}`);
const logPath = `/private/tmp/${schema}.log`;
function clean(text) {
  let result = String(text).replace(
    /postgres(?:ql)?:\/\/[^\s\u001b"']+/g,
    '[REDACTED_DATABASE_URL]',
  );
  for (const secret of [
    source.hostname,
    source.username,
    source.password,
    configured.PAYSTACK_SECRET_KEY,
  ].filter(Boolean)) {
    result = result.split(secret).join('[REDACTED]');
  }
  return result.replace(/\b[sp]k_(?:live|test)_[A-Za-z0-9]+/g, '[REDACTED_PAYSTACK_KEY]');
}
function log(message) {
  const safe = clean(message);
  appendFileSync(logPath, safe + '\n', { mode: 0o600 });
  process.stdout.write(safe + '\n');
}
const control = new PrismaClient({ datasources: { db: { url: source.toString() } } });
let created = false;
let isolated;
async function command(label, args) {
  log(`START ${label}`);
  const env = {
    ...process.env,
    DATABASE_URL: url.toString(),
    DIRECT_URL: url.toString(),
    NODE_ENV: 'test',
    OTP_VERIFIER_KEY_ID: 'isolated-test',
    OTP_VERIFIER_SECRET: 'isolated-test-verifier-secret-never-deployed',
    OTP_VERIFIER_PREVIOUS_KEY_ID: '',
    OTP_VERIFIER_PREVIOUS_SECRET: '',
    // Keep dotenv from importing external provider credentials during test startup.
    PAYSTACK_SECRET_KEY: 'sk_test_isolated_validation',
    BREVO_API_KEY: '',
    REDIS_URL: '',
    PAYSTACK_WEBHOOK_SECRET: 'isolated-webhook-secret',
    PAYSTACK_OPERATING_RECIPIENT: '',
    FCM_PROJECT_ID: '',
    FCM_CLIENT_EMAIL: '',
    FCM_PRIVATE_KEY: '',
    DOJAH_APP_ID: '',
    DOJAH_SECRET_KEY: '',
    DOJAH_WIDGET_ID: '',
    STORAGE_BUCKET: '',
    STORAGE_ACCESS_KEY: '',
    STORAGE_SECRET_KEY: '',
    WITHDRAWAL_REQUIRE_BVN: 'false',
  };
  await new Promise((resolve, reject) => {
    const child = spawn('pnpm', args, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
    // Buffer whole lines so URL redaction cannot be bypassed by chunk boundaries.
    for (const stream of [child.stdout, child.stderr]) {
      let pending = '';
      stream.on('data', (chunk) => {
        pending += chunk.toString();
        const lines = pending.split('\n');
        pending = lines.pop();
        for (const line of lines) log(line);
      });
      stream.on('end', () => {
        if (pending) log(pending);
      });
    }
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${label} exited ${code}`)),
    );
  });
  log(`PASS ${label}`);
}
try {
  const [server] = await control.$queryRawUnsafe(
    'SELECT current_schema() AS schema, version() AS version',
  );
  log(
    JSON.stringify({
      check: 'direct_connection',
      schema: server.schema,
      version: server.version.split(' on ')[0],
      pooled: source.hostname.includes('-pooler'),
      logPath,
    }),
  );
  if (!process.argv.includes('--run')) {
    log(
      'Read-only preflight complete. Pass --run only after authorization for a disposable remote schema.',
    );
  } else {
    await control.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    created = true;
    log(`Created disposable schema ${schema}`);
    isolated = new PrismaClient({ datasources: { db: { url: url.toString() } } });
    const connections = await Promise.all(
      Array.from({ length: 8 }, () =>
        isolated.$transaction(
          async (tx) => {
            const [row] = await tx.$queryRawUnsafe(
              "SELECT current_schema() AS schema, current_setting('search_path') AS search_path, pg_backend_pid() AS pid",
            );
            await tx.$queryRawUnsafe('SELECT 1 FROM pg_sleep(0.15)');
            return row;
          },
          { maxWait: 30000, timeout: 30000 },
        ),
      ),
    );
    if (
      connections.some((row) => row.schema !== schema ||
        ![schema, `"${schema}"`].includes(row.search_path)) ||
      new Set(connections.map((row) => row.pid)).size !== 8
    ) {
      throw new Error('Isolation verification failed; refusing migrations and tests');
    }
    log('PASS raw SQL isolation on eight distinct concurrent direct connections');
    await command('Prisma generation', ['--filter', '@hq/database', 'exec', 'prisma', 'generate']);
    if (!process.argv.includes('--static-already-passed')) {
      await command('Workspace typecheck', ['exec', 'turbo', 'run', 'typecheck', '--force']);
      await command('Workspace lint', ['exec', 'turbo', 'run', 'lint', '--force']);
    }
    await command('Tracked migrations', [
      '--filter',
      '@hq/database',
      'exec',
      'prisma',
      'migrate',
      'deploy',
    ]);
    await command('Migration drift', [
      '--filter',
      '@hq/database',
      'exec',
      'prisma',
      'migrate',
      'diff',
      '--from-url',
      url.toString(),
      '--to-schema-datamodel',
      'prisma/schema.prisma',
      '--exit-code',
    ]);
    if (process.argv.includes('--actual-test-withdrawal-only')) {
      await command('Actual TEST seeded-wallet withdrawal', [
        '--filter',
        '@hq/api',
        'exec',
        'tsx',
        '../../scripts/validation/test-provider-withdrawal.ts',
      ]);
    } else if (process.argv.some((arg) => arg.startsWith('--api-test-files='))) {
      if (process.argv.includes('--audit-antecedents-first')) {
        await command('Audit antecedent DB suites', [
          '--filter',
          '@hq/api',
          'exec',
          'vitest',
          'run',
          'src/modules/auth/__tests__/auth.test.ts',
          'src/modules/rewards/__tests__/rewards-api.test.ts',
          'src/modules/__tests__/remediation-pass.test.ts',
        ]);
      }
      const files = process.argv
        .find((arg) => arg.startsWith('--api-test-files='))
        .split('=')[1]
        .split(',');
      if (!files.length || files.some((file) => !/^src\/[a-zA-Z0-9_/.\-]+\.test\.ts$/.test(file))) {
        throw new Error('Explicit API test paths are required');
      }
      await command('Final affected API tests', [
        '--filter',
        '@hq/api',
        'exec',
        'vitest',
        'run',
        ...files,
      ]);
      if (process.argv.includes('--actual-test-withdrawal-after')) {
        await command('Actual TEST seeded-wallet withdrawal', [
          '--filter',
          '@hq/api',
          'exec',
          'tsx',
          '../../scripts/validation/test-provider-withdrawal.ts',
        ]);
      }
    } else {
      await command('Local provider lifecycle integration', [
        'exec',
        'vitest',
        'run',
        '--config',
        'scripts/validation/vitest.config.mts',
      ]);
      await command('Full serial API suite', ['--filter', '@hq/api', 'exec', 'vitest', 'run']);
    }
  }
} catch (error) {
  log(`FAIL ${error.message}`);
  process.exitCode = 1;
} finally {
  if (isolated) await isolated.$disconnect();
  if (created) {
    await control.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    const remaining = await control.$queryRawUnsafe(
      'SELECT 1 FROM pg_namespace WHERE nspname = $1',
      schema,
    );
    if (remaining.length) throw new Error('Disposable schema cleanup could not be verified');
    log(`PASS removed disposable schema ${schema}`);
  }
  await control.$disconnect();
}
