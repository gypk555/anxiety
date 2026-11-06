import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSql } from '../src/db.ts';

// A real TLS handshake against a real server, using the same options the app uses in production.
const PASSWORD = 'tls-test';
let pg: EmbeddedPostgres;
let port = 0;
let ca = '';
let otherCa = '';
const dir = mkdtempSync(join(tmpdir(), 'anxiocare-tls-'));

const openssl = (...args: string[]) => execFileSync('openssl', args, { cwd: dir, stdio: 'pipe' });

const freePort = () =>
  new Promise<number>((resolve) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as { port: number };
      server.close(() => resolve(address.port));
    });
  });

const trySelect = async (host: string, caCert: string) => {
  const sql = createSql(`postgres://postgres:${PASSWORD}@${host}:${port}/postgres`, { caCert, max: 1 });
  try {
    const [row] = await sql<{ ssl: boolean }[]>`SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()`;
    return row!.ssl;
  } finally {
    await sql.end({ timeout: 1 });
  }
};

beforeAll(async () => {
  const selfSigned = (name: string, cn: string) =>
    openssl('req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-days', '2',
      '-keyout', `${name}.key`, '-out', `${name}.crt`, '-subj', `/CN=${cn}`, '-addext', `subjectAltName=DNS:${cn}`);
  selfSigned('server', 'localhost');
  selfSigned('other', 'localhost');
  chmodSync(join(dir, 'server.key'), 0o600);
  ca = readFileSync(join(dir, 'server.crt'), 'utf8');
  otherCa = readFileSync(join(dir, 'other.crt'), 'utf8');

  port = await freePort();
  pg = new EmbeddedPostgres({
    databaseDir: join(dir, 'pg'),
    user: 'postgres',
    password: PASSWORD,
    port,
    persistent: false,
    postgresFlags: ['-c', 'ssl=on', '-c', `ssl_cert_file=${join(dir, 'server.crt')}`, '-c', `ssl_key_file=${join(dir, 'server.key')}`],
    onLog: () => {},
    onError: () => {},
  });
  await pg.initialise();
  await pg.start();
});

afterAll(async () => {
  await pg.stop();
});

describe('database TLS verify-full', () => {
  it('connects over TLS when the chain and the hostname both match', async () => {
    expect(await trySelect('localhost', ca)).toBe(true);
  });

  it('refuses a server certificate not signed by the pinned CA', async () => {
    await expect(trySelect('localhost', otherCa)).rejects.toMatchObject({ code: expect.stringMatching(/SELF_SIGNED|DEPTH_ZERO|UNABLE_TO_VERIFY/) });
  });

  it('refuses a hostname the certificate does not cover', async () => {
    await expect(trySelect('127.0.0.1', ca)).rejects.toMatchObject({ code: 'ERR_TLS_CERT_ALTNAME_INVALID' });
  });
});
