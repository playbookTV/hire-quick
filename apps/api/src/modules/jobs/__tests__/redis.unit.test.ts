import { describe, expect, it } from 'vitest';
import { redisConnection, redisConnectionLabel } from '../redis.js';

describe('BullMQ Redis URL options', () => {
  it('uses the plain Redis defaults without changing retry policy', () => {
    expect(redisConnection('redis://localhost')).toEqual({
      host: 'localhost',
      port: 6379,
      db: 0,
      maxRetriesPerRequest: null,
    });
  });
  it('preserves TLS, database, and percent-decoded credentials', () => {
    expect(redisConnection('rediss://worker%40hq:p%3Aa%2Fs%25%3F%23@redis.example:6380/5')).toEqual(
      {
        host: 'redis.example',
        port: 6380,
        db: 5,
        username: 'worker@hq',
        password: 'p:a/s%?#',
        tls: { servername: 'redis.example' },
        maxRetriesPerRequest: null,
      },
    );
  });
  it('accepts password-only authentication and a trailing root path', () => {
    expect(redisConnection('redis://:p%40ss@localhost/')).toMatchObject({
      password: 'p@ss',
      db: 0,
    });
    expect(redisConnection('redis://:p%40ss@localhost/').username).toBeUndefined();
  });
  it('passes IPv6 hosts without brackets and avoids IP SNI', () => {
    expect(redisConnection('rediss://[::1]:6380/2')).toMatchObject({
      host: '::1',
      port: 6380,
      db: 2,
      tls: {},
    });
    expect(redisConnectionLabel('rediss://u:p@[::1]:6380/2')).toBe('rediss://[::1]:6380/2');
  });
  it.each([
    'not-a-url',
    'https://localhost/1',
    'redis://localhost/-1',
    'redis://localhost/1.5',
    'redis://localhost/1/2',
    'redis://localhost/2147483648',
    'redis://localhost/9007199254740993',
    'redis://localhost:0',
    'redis://localhost:70000',
    'redis://localhost/1?db=2',
    'rediss://localhost/1?rejectUnauthorized=false',
    'redis://localhost/1#secret',
    'redis://bad%ZZ:secret@localhost',
  ])('rejects unsupported or ambiguous URL %s', (url) => {
    expect(() => redisConnection(url)).toThrow(/^REDIS_URL /);
  });
  it('omits both username and password from the routing label', () => {
    expect(redisConnectionLabel('rediss://secret-user:p%3Aa%40ss@redis.example:6380/5')).toBe(
      'rediss://redis.example:6380/5',
    );
  });
  it('does not attach credential-containing input to URL errors', () => {
    try {
      redisConnection('redis://private-user:private-password@host:bad-port');
    } catch (error) {
      expect(String(error)).not.toContain('private-');
      expect(error).not.toHaveProperty('input');
      return;
    }
    throw new Error('Expected invalid URL to fail');
  });
});
