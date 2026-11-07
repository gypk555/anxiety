import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Sql } from './db.ts';

export const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../migrations');
const FILE_PATTERN = /^\d{3}_[a-z0-9_]+\.sql$/;

export class MigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MigrationError';
  }
}

/**
 * Applies pending migrations in one transaction, under an advisory lock so two deploys cannot race.
 * An applied file whose checksum changed, or that vanished, stops everything: history must not be rewritten.
 */
export async function migrate(sql: Sql, dir: string = MIGRATIONS_DIR): Promise<string[]> {
  const names = (await readdir(dir)).filter((f) => FILE_PATTERN.test(f)).sort();
  const files = await Promise.all(
    names.map(async (name) => {
      const text = await readFile(join(dir, name), 'utf8');
      return { name, text, checksum: createHash('sha256').update(text).digest('hex') };
    }),
  );

  return sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(727274001)`;
    await tx`CREATE SCHEMA IF NOT EXISTS app`;
    await tx`
      CREATE TABLE IF NOT EXISTS app.schema_migrations (
        name text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `;
    const applied = await tx<{ name: string; checksum: string }[]>`SELECT name, checksum FROM app.schema_migrations`;
    const byName = new Map(applied.map((row) => [row.name, row.checksum]));

    for (const row of applied) {
      if (!names.includes(row.name)) throw new MigrationError(`applied migration ${row.name} is missing from disk`);
    }

    const ran: string[] = [];
    for (const file of files) {
      const existing = byName.get(file.name);
      if (existing !== undefined) {
        if (existing !== file.checksum) throw new MigrationError(`checksum mismatch for applied migration ${file.name}`);
        continue;
      }
      await tx.unsafe(file.text);
      await tx`INSERT INTO app.schema_migrations (name, checksum) VALUES (${file.name}, ${file.checksum})`;
      ran.push(file.name);
    }
    return ran;
  });
}
