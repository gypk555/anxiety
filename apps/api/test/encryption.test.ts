import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.ts';
import { DecryptError, KeyRing, open, openJson, openText, seal, sealText } from '../src/crypto.ts';
import { rotateKeys } from '../src/rotate.ts';
import { toMe, type UserRow } from '../src/users.ts';
import { API, assessmentPayload, baseEnv, createHarness, journalPayload, key, moodPayload, reflectionPayload, safetyPlanPayload, signInConsented, type Harness } from './helpers.ts';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

/** Every table as an attacker with a database dump sees it: bytea rendered both as hex and as raw text. */
async function dumpAll(): Promise<string> {
  const tables = await h.admin`SELECT tablename FROM pg_tables WHERE schemaname = 'app'`;
  let dump = '';
  for (const { tablename } of tables) {
    const rows = await h.admin.unsafe(`SELECT * FROM app.${tablename}`);
    for (const row of rows) {
      for (const value of Object.values(row)) {
        if (value instanceof Uint8Array) dump += ` ${Buffer.from(value).toString('latin1')} ${Buffer.from(value).toString('hex')}`;
        else dump += ` ${String(value instanceof Date ? value.toISOString() : value)}`;
      }
    }
  }
  return dump;
}

describe('encryption at rest', () => {
  it('a raw SELECT of every table shows no plaintext', async () => {
    const email = `visible-${Date.now()}@example.com`;
    const { client } = await signInConsented(h, email);
    await client.patch(`${API}/me`, { displayName: 'SecretDisplayName' });
    await client.post(`${API}/assessments`, assessmentPayload());
    await client.post(`${API}/journal`, journalPayload({ feelings: ['SecretFeeling'] }));
    await client.request({ method: 'PUT', url: `${API}/moods/${new Date().toISOString().slice(0, 10)}`, payload: moodPayload() });
    await client.request({ method: 'PUT', url: `${API}/safety-plan`, payload: safetyPlanPayload() });
    await client.post(`${API}/reflections`, reflectionPayload({ note: 'SECRET-REFLECTION-NOTE' }));

    const dump = await dumpAll();
    for (const secret of [
      email,
      'visible-',
      'SecretDisplayName',
      'SECRET-SITUATION',
      'SECRET-THOUGHT',
      'SecretFeeling',
      'Safari on iPhone',
      'moderate',
      'severity',
      '"answers"',
      'SECRET-MOOD-NOTE',
      '"rating"',
      'SECRET-WARNING',
      'SECRET-REASON',
      'SecretContactName',
      '98765 43210',
      '9876543210',
      'SecretDoctor',
      '2345 6789',
      'SECRET-REFLECTION-NOTE',
      '"note"',
    ]) {
      expect(dump).not.toContain(secret);
    }
  });

  it('plaintext columns are limited to ids, timestamps, hashes and labels', async () => {
    const columns = await h.admin`
      SELECT table_name, column_name, data_type FROM information_schema.columns
      WHERE table_schema = 'app' AND data_type IN ('text', 'character varying', 'json', 'jsonb', 'integer', 'smallint', 'boolean')
      ORDER BY 1, 2
    `;
    expect(columns.map((c) => `${c.table_name}.${c.column_name}`)).toEqual([
      'audit_log.action',
      'consents.adult_confirmed',
      'consents.health_data',
      'consents.version',
      'otp_codes.attempts',
      'otp_codes.purpose',
      'otp_failures.purpose',
      // The question catalogue: the app's own wording, the same for everyone. Nothing personal.
      'questions.active',
      'questions.answer_set',
      'questions.brings_help',
      'questions.id',
      'questions.position',
      'questions.text',
      'questions.theme',
      'questions.type',
      'schema_migrations.checksum',
      'schema_migrations.name',
      'user_identities.provider',
      'users.consent_version',
      'users.dek_key_version',
      'users.password_hash',
    ]);
  });

  it('uses a fresh nonce per encryption', () => {
    const dek = randomBytes(32);
    const a = seal(dek, Buffer.from('same'), 'aad');
    const b = seal(dek, Buffer.from('same'), 'aad');
    expect(a.equals(b)).toBe(false);
    expect(open(dek, a, 'aad').toString()).toBe('same');
    expect(() => open(dek, a, 'other')).toThrow(DecryptError);
    expect(() => open(randomBytes(32), a, 'aad')).toThrow(DecryptError);
    const flipped = Buffer.from(a);
    flipped[flipped.length - 1]! ^= 1;
    expect(() => open(dek, flipped, 'aad')).toThrow(DecryptError);
    expect(() => open(dek, Buffer.alloc(3), 'aad')).toThrow(DecryptError);
  });

  it('gives each user their own data key', async () => {
    const a = await signInConsented(h);
    const b = await signInConsented(h);
    const rows = await h.admin<UserRow[]>`SELECT * FROM app.users WHERE id IN (${a.id}::uuid, ${b.id}::uuid)`;
    const keys = rows.map((u) => h.config.keys.ring.unwrap(u.wrapped_dek, u.dek_key_version, u.id));
    expect(keys[0]!.equals(keys[1]!)).toBe(false);
    expect(rows[0]!.wrapped_dek.length).toBeGreaterThan(32);
  });
});

describe('AAD binds ciphertext to its row and owner', () => {
  const expectOpaque500 = (r: { statusCode: number; body: string; json: () => { code: string } }) => {
    expect(r.statusCode).toBe(500);
    expect(r.json().code).toBe('internal_error');
    expect(r.body).not.toMatch(/decrypt|aes|gcm|auth|tag|cipher/i);
  };

  it('covers column, row and owner independently, even under one key', () => {
    const dek = randomBytes(32);
    const blob = sealText(dek, 'value', 'table.column', 'row-1', 'user-1');
    expect(openText(dek, blob, 'table.column', 'row-1', 'user-1')).toBe('value');
    expect(() => openText(dek, blob, 'table.other', 'row-1', 'user-1')).toThrow(DecryptError);
    expect(() => openText(dek, blob, 'table.column', 'row-2', 'user-1')).toThrow(DecryptError);
    expect(() => openText(dek, blob, 'table.column', 'row-1', 'user-2')).toThrow(DecryptError);
  });

  it('swapping journal ciphertext between two rows of one user fails', async () => {
    const { client } = await signInConsented(h);
    const a = (await client.post(`${API}/journal`, journalPayload({ thought: 'one' }))).json();
    const b = (await client.post(`${API}/journal`, journalPayload({ thought: 'two' }))).json();
    await h.admin`
      UPDATE app.journal_entries x SET payload_ct = y.payload_ct
      FROM app.journal_entries y
      WHERE x.id = ${a.id}::uuid AND y.id = ${b.id}::uuid
    `;
    expectOpaque500(await client.get(`${API}/journal/${a.id}`));
    expect((await client.get(`${API}/journal/${b.id}`)).json().thought).toBe('two');
  });

  it('swapping an assessment between two rows fails', async () => {
    const { client } = await signInConsented(h);
    const a = (await client.post(`${API}/assessments`, assessmentPayload())).json();
    const b = (await client.post(`${API}/assessments`, assessmentPayload({ answers: [0, 0, 0, 0, 0, 0, 0], difficulty: null }))).json();
    await h.admin`
      UPDATE app.assessments x SET payload_ct = y.payload_ct
      FROM app.assessments y
      WHERE x.id = ${a.id}::uuid AND y.id = ${b.id}::uuid
    `;
    expectOpaque500(await client.get(`${API}/assessments/${a.id}`));
  });

  it('reassigning a row to another user fails', async () => {
    const a = await signInConsented(h);
    const b = await signInConsented(h);
    const entry = (await a.client.post(`${API}/journal`, journalPayload())).json();
    await h.admin`UPDATE app.journal_entries SET user_id = ${b.id}::uuid WHERE id = ${entry.id}::uuid`;
    expectOpaque500(await b.client.get(`${API}/journal/${entry.id}`));
  });

  it('swapping wrapped keys between users, or the email and name columns, fails', async () => {
    const a = await signInConsented(h);
    const b = await signInConsented(h);
    await a.client.patch(`${API}/me`, { displayName: 'Name' });
    await h.admin`UPDATE app.users x SET email_ct = display_name_ct WHERE id = ${a.id}::uuid`;
    expectOpaque500(await a.client.get(`${API}/me`));
    await h.admin`
      UPDATE app.users x SET wrapped_dek = y.wrapped_dek FROM app.users y
      WHERE x.id = ${b.id}::uuid AND y.id = ${a.id}::uuid
    `;
    expectOpaque500(await b.client.get(`${API}/me`));
  });

  it('logs a decrypt failure with nothing but the request id', async () => {
    const { client } = await signInConsented(h);
    const entry = (await client.post(`${API}/journal`, journalPayload())).json();
    await h.admin`UPDATE app.journal_entries SET payload_ct = '\\x00' WHERE id = ${entry.id}::uuid`;
    const r = await client.get(`${API}/journal/${entry.id}`);
    expectOpaque500(r);
    const line = h.logs.map((l) => JSON.parse(l) as Record<string, unknown>).find((l) => l.msg === 'decrypt_failed' && l.reqId === r.json().requestId);
    expect(line).toBeTruthy();
    expect(Object.keys(line!).sort()).toEqual(['level', 'msg', 'reqId', 'time']);
  });
});

describe('master-key rotation', () => {
  it('rewraps every data key, data stays readable, and the old key can then go', async () => {
    const oldKey = key();
    const newKey = key();
    const rotating = await createHarness({ ENCRYPTION_KEYS: `old:${oldKey}`, ENCRYPTION_ACTIVE_KEY: 'old' });
    try {
      const a = await signInConsented(rotating);
      const b = await signInConsented(rotating);
      const entry = (await a.client.post(`${API}/journal`, journalPayload({ thought: 'kept' }))).json();

      const both = loadConfig({
        ...baseEnv({ DATABASE_URL: rotating.config.databaseUrl }),
        ENCRYPTION_KEYS: `old:${oldKey},new:${newKey}`,
        ENCRYPTION_ACTIVE_KEY: 'new',
      });
      expect(await rotateKeys(rotating.runtime, both.keys.ring)).toEqual({ rewrapped: 2 });
      expect(await rotateKeys(rotating.runtime, both.keys.ring)).toEqual({ rewrapped: 0 });

      const versions = await rotating.admin`SELECT DISTINCT dek_key_version FROM app.users`;
      expect(versions.map((v) => v.dek_key_version)).toEqual(['new']);

      // With the old key removed from the ring entirely, everything still opens.
      const onlyNew = new KeyRing(new Map([['new', Buffer.from(newKey, 'base64')]]), 'new');
      const users = await rotating.admin<UserRow[]>`SELECT * FROM app.users WHERE id = ${a.id}::uuid`;
      const keys = { ...rotating.config.keys, ring: onlyNew };
      expect(toMe(keys, users[0]!).email).toBe(a.email);
      const [row] = await rotating.admin`SELECT payload_ct FROM app.journal_entries WHERE id = ${entry.id}::uuid`;
      const dek = onlyNew.unwrap(users[0]!.wrapped_dek, users[0]!.dek_key_version, a.id);
      expect(openJson<{ thought: string }>(dek, row!.payload_ct as Buffer, 'journal_entries.payload', entry.id, a.id).thought).toBe('kept');

      // And the old key alone can no longer open anything.
      const onlyOld = new KeyRing(new Map([['old', Buffer.from(oldKey, 'base64')]]), 'old');
      expect(() => onlyOld.unwrap(users[0]!.wrapped_dek, users[0]!.dek_key_version, a.id)).toThrow(DecryptError);
      expect(b.id).not.toBe(a.id);
    } finally {
      await rotating.close();
    }
  });
});
