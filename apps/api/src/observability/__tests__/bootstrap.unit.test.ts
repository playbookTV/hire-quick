import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('fatal process reporting', () => {
  it.each(['throw', 'reject'])('exits unsuccessfully and withholds sensitive messages on %s', (kind) => {
    const trigger = kind === 'throw'
      ? "setImmediate(() => { throw new Error('fixture-sensitive-value'); });"
      : "void Promise.reject(new Error('fixture-sensitive-value'));";
    const child = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval',
      `await import('./src/observability/init.ts'); ${trigger}`], {
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: 'test', SENTRY_DSN: '', LOG_LEVEL: 'info' },
      encoding: 'utf8', timeout: 10000,
    });
    expect(child.error).toBeUndefined();
    expect(child.status).toBe(1);
    expect(child.stdout).toContain('PROCESS_FATAL');
    expect(child.stdout + child.stderr).not.toContain('fixture-sensitive-value');
  });
});
