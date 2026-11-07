import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import type { TestProject } from 'vitest/node';
import postgres from 'postgres';
import { runtimeRoleSql } from '../src/db.ts';

declare module 'vitest' {
  export interface ProvidedContext {
    pgPort: number;
  }
}

export const SUPER_PASSWORD = 'test-super';
export const MIGRATOR_PASSWORD = 'testmigrator';
export const RUNTIME_PASSWORD = 'testruntime';

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

export default async function setup(project: TestProject) {
  const port = await freePort();
  const pg = new EmbeddedPostgres({
    databaseDir: join(mkdtempSync(join(tmpdir(), 'anxiocare-test-')), 'pg'),
    user: 'postgres',
    password: SUPER_PASSWORD,
    port,
    persistent: false,
    postgresFlags: ['-c', 'max_connections=300', '-c', 'fsync=off'],
    onLog: () => {},
    onError: () => {},
  });
  await pg.initialise();
  await pg.start();

  const admin = postgres({ host: '127.0.0.1', port, user: 'postgres', pass: SUPER_PASSWORD, database: 'postgres', onnotice: () => {} });
  // A realistic migration role: can create the schema and roles but is not a superuser (like Supabase's postgres).
  await admin.unsafe(`CREATE ROLE anxiocare_migrator LOGIN CREATEDB CREATEROLE BYPASSRLS NOSUPERUSER PASSWORD '${MIGRATOR_PASSWORD}'`);
  await admin.unsafe(runtimeRoleSql(RUNTIME_PASSWORD));
  await admin.end();

  project.provide('pgPort', port);
  return async () => {
    await pg.stop();
  };
}
