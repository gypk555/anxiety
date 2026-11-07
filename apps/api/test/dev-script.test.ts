import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSql } from '../src/db.ts';
import { migrate } from '../src/migrate.ts';

const API_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PASSWORD = 'devscripttest';

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => (address && typeof address === 'object' ? resolve(address.port) : reject(new Error('no port'))));
    });
  });
}

const accepting = (port: number) =>
  new Promise<boolean>((resolve) => {
    const socket = createServer();
    socket.once('error', () => resolve(true));
    socket.listen(port, '127.0.0.1', () => socket.close(() => resolve(false)));
  });

/** A real data directory that scripts/dev.ts will adopt, with an applied migration whose checksum no longer matches. */
describe('scripts/dev.ts when migrating fails', () => {
  const dir = mkdtempSync(join(tmpdir(), 'anxiocare-dev-'));
  const pgDir = join(dir, 'pg');
  let port = 0;
  let result: { code: number | null; output: string };

  beforeAll(async () => {
    port = await freePort();
    const key = () => Buffer.alloc(32, 7).toString('base64');
    writeFileSync(`${pgDir}.keys.json`, JSON.stringify({
      superPassword: PASSWORD,
      runtimePassword: 'devruntime',
      ENCRYPTION_KEYS: `v1:${key()}`,
      EMAIL_INDEX_KEY: key(),
      OTP_PEPPER: key(),
      AUDIT_KEY: key(),
    }));
    const pg = new EmbeddedPostgres({ databaseDir: pgDir, user: 'postgres', password: PASSWORD, port, persistent: true, onLog: () => {}, onError: () => {} });
    await pg.initialise();
    await pg.start();
    const server = postgres({ host: '127.0.0.1', port, user: 'postgres', pass: PASSWORD, database: 'postgres', max: 1, onnotice: () => {} });
    await server.unsafe('CREATE DATABASE anxiocare');
    await server.end();
    const sql = createSql(`postgres://postgres:${PASSWORD}@127.0.0.1:${port}/anxiocare`, { caCert: null, max: 1 });
    await migrate(sql);
    await sql`UPDATE app.schema_migrations SET checksum = 'tampered'`;
    await sql.end();
    await pg.stop();

    result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['scripts/dev.ts'], {
        cwd: API_ROOT,
        env: { ...process.env, DEV_PG_DIR: pgDir, DEV_PG_PORT: String(port), PORT: String(port + 1), DEV_FRESH: undefined, DEV_USE_BUILD: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let output = '';
      child.stdout.on('data', (d) => (output += String(d)));
      child.stderr.on('data', (d) => (output += String(d)));
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`dev.ts did not exit: ${output}`));
      }, 60_000);
      child.on('exit', (code) => {
        clearTimeout(timer);
        resolve({ code, output });
      });
    });
  }, 120_000);

  afterAll(async () => {
    // Only if the test failed: this postmaster is ours, identified by the pid file in our own temporary directory.
    const pidFile = join(pgDir, 'postmaster.pid');
    if (existsSync(pidFile)) {
      const pid = Number(readFileSync(pidFile, 'utf8').split('\n', 1)[0]);
      if (Number.isInteger(pid) && pid > 0) {
        try {
          process.kill(pid, 'SIGTERM');
        } catch {
          /* Already gone. */
        }
        for (let i = 0; i < 50 && existsSync(pidFile); i += 1) await new Promise((r) => setTimeout(r, 100));
      }
    }
    rmSync(dir, { recursive: true, force: true });
  });

  it('adds a pepper to a keys file from before passwords existed, keeping everything else', () => {
    const saved = JSON.parse(readFileSync(`${pgDir}.keys.json`, 'utf8')) as Record<string, string>;
    expect(saved.PASSWORD_PEPPER).toMatch(/^[A-Za-z0-9+/]{43}=$/);
    expect(saved.superPassword).toBe(PASSWORD);
    expect(saved.runtimePassword).toBe('devruntime');
  });

  it('exits with a failure', () => {
    expect(result.code, result.output).toBe(1);
  });

  it('leaves no Postgres behind', async () => {
    expect(existsSync(join(pgDir, 'postmaster.pid')), 'postmaster.pid still there').toBe(false);
    expect(await accepting(port)).toBe(false);
  });

  it('says what went wrong, and that DEV_FRESH=1 wipes local data', () => {
    expect(result.output).toMatch(/checksum mismatch for applied migration 001_init\.sql/);
    expect(result.output).toMatch(/DEV_FRESH=1/);
    expect(result.output).toMatch(/wipes? .*local/i);
  });

  it('prints no database credentials or keys', () => {
    expect(result.output).not.toContain(PASSWORD);
    expect(result.output).not.toContain('postgres://');
  });
});

describe('dev.ts on a machine with no keys file yet', () => {
  let dir: string;
  let keysFile: string;
  let output = '';

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'anxiocare-devfresh-'));
    const pgDir = join(dir, 'pg');
    keysFile = `${pgDir}.keys.json`;
    const port = await freePort();
    // The keys file is written before Postgres starts, so stop as soon as it exists: this is about the file only.
    await new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, ['scripts/dev.ts'], {
        cwd: API_ROOT,
        env: { ...process.env, DEV_PG_DIR: pgDir, DEV_PG_PORT: String(port), PORT: String(port + 1), DEV_FRESH: undefined },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      child.stdout.on('data', (d) => (output += String(d)));
      child.stderr.on('data', (d) => (output += String(d)));
      const timer = setInterval(() => {
        if (existsSync(keysFile) && readFileSync(keysFile, 'utf8').length > 0) child.kill('SIGTERM');
      }, 50);
      const deadline = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`dev.ts never wrote its keys file: ${output}`));
      }, 60_000);
      child.on('exit', () => {
        clearInterval(timer);
        clearTimeout(deadline);
        resolve();
      });
    });
  }, 120_000);

  afterAll(async () => {
    const pidFile = join(dir, 'pg', 'postmaster.pid');
    if (existsSync(pidFile)) {
      const pid = Number(readFileSync(pidFile, 'utf8').split('\n', 1)[0]);
      if (Number.isInteger(pid) && pid > 0) {
        try {
          process.kill(pid, 'SIGTERM');
        } catch {
          /* Already gone. */
        }
        for (let i = 0; i < 50 && existsSync(pidFile); i += 1) await new Promise((r) => setTimeout(r, 100));
      }
    }
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates the keys file, owner-only, with every key, and without crashing on reading it back', () => {
    expect(output).not.toMatch(/EBADF|bad file descriptor/);
    const saved = JSON.parse(readFileSync(keysFile, 'utf8')) as Record<string, string>;
    for (const name of ['superPassword', 'runtimePassword', 'ENCRYPTION_KEYS', 'EMAIL_INDEX_KEY', 'OTP_PEPPER', 'AUDIT_KEY', 'PASSWORD_PEPPER']) {
      expect(saved[name], name).toBeTruthy();
    }
    expect(statSync(keysFile).mode & 0o777).toBe(0o600);
  });
});
