import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => {
    if (!server.listening) return resolve();
    server.close(error => error ? reject(error) : resolve());
    server.closeAllConnections();
  })));
});

async function listen(server: Server, host: string, port = 0): Promise<number> {
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host, port, ipv6Only: host === '::1' }, () => {
      server.off('error', reject);
      resolve();
    });
  });
  return (server.address() as AddressInfo).port;
}

describe('HTTP test server isolation', () => {
  it('reaches the IPv6 test server when a different IPv4 service owns the same port', async () => {
    let foreignRequests = 0;
    const foreign = createServer((_req, res) => {
      foreignRequests += 1;
      res.writeHead(403).end('Different service');
    });
    const port = await listen(foreign, '127.0.0.1');
    const target = createServer((_req, res) => {
      res.writeHead(201, { 'content-type': 'application/json' }).end('{"server":"target"}');
    });
    await listen(target, '::1', port);

    const response = await request(target).post('/origin').send({ message: 'test fixture' });
    expect(response.status).toBe(201);
    expect(response.body).toEqual({ server: 'target' });
    expect(foreignRequests).toBe(0);
  });

  it('continues to reach an explicitly bound IPv4 test server', async () => {
    const target = createServer((_req, res) => res.writeHead(204).end());
    await listen(target, '127.0.0.1');
    expect((await request(target).get('/origin')).status).toBe(204);
  });
});
