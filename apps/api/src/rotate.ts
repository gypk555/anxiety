import type { KeyRing } from './crypto.ts';
import type { Sql } from './db.ts';

/**
 * Rewraps every data key under the active master key. Safe to re-run and resumable: rows are moved
 * one at a time, guarded on their current version. Only `wrapped_dek` changes, so data is not re-encrypted.
 */
export async function rotateKeys(sql: Sql, ring: KeyRing, batchSize = 200): Promise<{ rewrapped: number }> {
  let rewrapped = 0;
  for (;;) {
    const rows = await sql<{ id: string; wrapped_dek: Buffer; dek_key_version: string }[]>`
      SELECT id, wrapped_dek, dek_key_version FROM app.users
      WHERE dek_key_version <> ${ring.activeVersion}
      ORDER BY id LIMIT ${batchSize}
    `;
    if (rows.length === 0) return { rewrapped };
    for (const row of rows) {
      const { wrapped, version } = ring.wrap(ring.unwrap(row.wrapped_dek, row.dek_key_version, row.id), row.id);
      const updated = await sql`
        UPDATE app.users SET wrapped_dek = ${wrapped}, dek_key_version = ${version}
        WHERE id = ${row.id} AND dek_key_version = ${row.dek_key_version}
      `;
      rewrapped += updated.count;
    }
  }
}
