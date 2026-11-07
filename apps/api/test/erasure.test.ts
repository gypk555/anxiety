import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditActor, emailBlindIndex } from '../src/crypto.ts';
import { emailQuotaKey, loginQuotaKey } from '../src/otp.ts';
import { API, assessmentPayload, Client, createHarness, journalPayload, requestCode, signIn, signInConsented, uniqueEmail, type Harness } from './helpers.ts';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

/** Searches every column of every `app` table for a marker, rendered as text and hex. */
async function rowsContaining(markers: string[]): Promise<string[]> {
  const tables = await h.admin`SELECT tablename FROM pg_tables WHERE schemaname = 'app' AND tablename <> 'schema_migrations'`;
  const hits: string[] = [];
  for (const { tablename } of tables) {
    const rows = await h.admin.unsafe(`SELECT t::text AS row FROM app.${tablename} t`);
    for (const { row } of rows) {
      if (markers.some((m) => String(row).includes(m))) hits.push(`${tablename}: ${row}`);
    }
  }
  return hits;
}

describe('export', () => {
  it('downloads all decrypted data as a JSON attachment', async () => {
    const { client, email, id } = await signInConsented(h);
    await client.patch(`${API}/me`, { displayName: 'Asha' });
    await client.post(`${API}/assessments`, assessmentPayload());
    await client.post(`${API}/journal`, journalPayload());

    const r = await client.get(`${API}/me/export`);
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-disposition']).toMatch(/^attachment; filename="account-data-\d{4}-\d{2}-\d{2}\.json"$/);
    expect(r.headers['content-type']).toContain('application/json');
    expect(r.headers['cache-control']).toBe('no-store, no-transform');

    const body = r.json();
    expect(body.account).toMatchObject({ id, email, displayName: 'Asha' });
    expect(body.consents).toHaveLength(1);
    expect(body.assessments).toHaveLength(1);
    expect(body.assessments[0]).toMatchObject({ score: 12, severity: 'moderate', answers: [3, 3, 2, 2, 1, 1, 0] });
    expect(body.journal[0].situation).toContain('SECRET-SITUATION');
    expect(body.sessions[0].deviceLabel).toBe('Safari on iPhone');
    expect(r.body).not.toMatch(/token|wrapped|hash|_ct/i);
  });

  it('exports only your own data', async () => {
    const a = await signInConsented(h);
    const b = await signInConsented(h);
    await a.client.post(`${API}/journal`, journalPayload({ thought: 'A-ONLY' }));
    const r = await b.client.get(`${API}/me/export`);
    expect(r.body).not.toContain('A-ONLY');
    expect(r.json().journal).toEqual([]);
  });

  it('requires a session and is audited', async () => {
    expect((await new Client(h).get(`${API}/me/export`)).statusCode).toBe(401);
    const { client, id } = await signInConsented(h);
    await client.get(`${API}/me/export`);
    const actor = auditActor(h.config.keys, id);
    const rows = await h.admin`SELECT action FROM app.audit_log WHERE actor_hmac = ${actor}`;
    expect(rows.map((row) => row.action)).toContain('export');
  });
});

describe('account deletion', () => {
  it('needs a fresh code; a wrong code deletes nothing', async () => {
    const { client, id } = await signInConsented(h);
    await client.post(`${API}/me/delete/request`);
    await h.app.drainBackground();
    const r = await client.post(`${API}/me/delete/confirm`, { code: '000000' });
    // All zeros could only collide once in a hundred million runs.
    expect(r.statusCode).toBe(400);
    const [row] = await h.admin`SELECT count(*)::int AS n FROM app.users WHERE id = ${id}::uuid`;
    expect(row!.n).toBe(1);
  });

  it('deletes code rows for the user and for every spelling of the address at once, leaving other people alone', async () => {
    const email = uniqueEmail('spellings');
    const alias = email.replace('@', '+shopping@');
    const { client, id } = await signInConsented(h, email);
    const bystander = uniqueEmail('bystander');
    await requestCode(h, new Client(h), alias);
    await requestCode(h, new Client(h), bystander);
    await client.post(`${API}/me/email/request`, { newEmail: uniqueEmail('elsewhere') });
    await client.post(`${API}/me/delete/request`);
    await h.app.drainBackground();
    expect((await client.post(`${API}/me/delete/confirm`, { code: h.mailer.codeFor(email, 'account_delete') })).statusCode).toBe(204);

    const quota = emailQuotaKey(h.config.keys, email);
    const [left] = await h.admin`
      SELECT count(*)::int AS n FROM app.otp_codes
      WHERE subject_user_id = ${id}::uuid OR email_hash = ${emailBlindIndex(h.config.keys, email)} OR quota_hash = ${quota}`;
    expect(left!.n).toBe(0);
    const [other] = await h.admin`SELECT count(*)::int AS n FROM app.otp_codes WHERE email_hash = ${emailBlindIndex(h.config.keys, bystander)}`;
    expect(other!.n).toBe(1);
  });

  it('hard-deletes every row, leaving only pseudonymous audit rows', async () => {
    const email = uniqueEmail('erase');
    const { client, id } = await signInConsented(h, email);
    const bystander = await signInConsented(h);
    await bystander.client.post(`${API}/journal`, journalPayload({ thought: 'bystander' }));
    await client.patch(`${API}/me`, { displayName: 'Erase Me' });
    const assessment = (await client.post(`${API}/assessments`, assessmentPayload())).json();
    const entry = (await client.post(`${API}/journal`, journalPayload())).json();
    await signIn(h, email); // a second session
    await requestCode(h, new Client(h), email); // and a live login code
    await client.post(`${API}/me/email/request`, { newEmail: uniqueEmail('never') });

    await client.post(`${API}/me/delete/request`);
    await h.app.drainBackground();
    const code = h.mailer.codeFor(email, 'account_delete');
    const stale = client.cookie;
    const r = await client.post(`${API}/me/delete/confirm`, { code });
    expect(r.statusCode).toBe(204);
    expect(String(r.headers['set-cookie'])).toContain('__Host-session=;');
    expect(client.cookie).toBeNull();

    const emailHash = emailBlindIndex(h.config.keys, email).toString('hex');
    expect(await rowsContaining([id, assessment.id, entry.id, emailHash])).toEqual([]);
    for (const table of ['users', 'sessions', 'consents', 'assessments', 'journal_entries']) {
      const column = table === 'users' ? 'id' : 'user_id';
      const [row] = await h.admin.unsafe(`SELECT count(*)::int AS n FROM app.${table} WHERE ${column} = '${id}'::uuid`);
      expect([table, row!.n]).toEqual([table, 0]);
    }
    const [codes] = await h.admin`SELECT count(*)::int AS n FROM app.otp_codes WHERE email_hash = ${emailBlindIndex(h.config.keys, email)} OR subject_user_id = ${id}::uuid`;
    expect(codes!.n).toBe(0);

    // The audit trail survives, keyed only by the HMAC.
    const actor = auditActor(h.config.keys, id);
    const audit = await h.admin`SELECT * FROM app.audit_log WHERE actor_hmac = ${actor}`;
    expect(audit.map((a) => a.action)).toEqual(expect.arrayContaining(['login', 'consent', 'account_delete']));
    expect(Object.keys(audit[0]!).sort()).toEqual(['action', 'actor_hmac', 'created_at', 'id']);
    // Computed independently of the code under test: a keyed HMAC, not an encoding of the id.
    const independent = createHmac('sha256', h.config.keys.auditKey).update(`actor:${id}`).digest();
    expect(actor.equals(independent)).toBe(true);
    for (const row of audit) expect((row.actor_hmac as Buffer).equals(independent)).toBe(true);
    expect(await rowsContaining([Buffer.from(id).toString('hex'), id.replaceAll('-', '')])).toEqual([]);

    // Old cookie is dead, and the bystander is untouched.
    client.cookie = stale;
    expect((await client.get(`${API}/me`)).statusCode).toBe(401);
    expect((await bystander.client.get(`${API}/journal`)).json().items).toHaveLength(1);
  });

  it('after erasure the same address starts a brand-new, empty account', async () => {
    const { client, email, id } = await signInConsented(h);
    await client.post(`${API}/journal`, journalPayload());
    await client.post(`${API}/me/delete/request`);
    await h.app.drainBackground();
    await client.post(`${API}/me/delete/confirm`, { code: h.mailer.codeFor(email, 'account_delete') });

    const again = await signInConsented(h, email);
    expect(again.id).not.toBe(id);
    expect((await again.client.get(`${API}/journal`)).json().items).toEqual([]);
  });
});

describe('audit', () => {
  it('records login, logout, logout-all, session revoke, consent, email change', async () => {
    const { client, id, email } = await signInConsented(h);
    const second = await signIn(h, email);
    const other = ((await client.get(`${API}/auth/sessions`)).json().items as { id: string; current: boolean }[]).find((s) => !s.current)!;
    await client.delete(`${API}/auth/sessions/${other.id}`);
    expect((await second.client.get(`${API}/me`)).statusCode).toBe(401);

    const newEmail = uniqueEmail('audit');
    await client.post(`${API}/me/email/request`, { newEmail });
    await h.app.drainBackground();
    await client.post(`${API}/me/email/verify`, { newEmail, currentCode: h.mailer.codeFor(email, 'email_change_current'), code: h.mailer.codeFor(newEmail, 'email_change') });

    const third = await signIn(h, newEmail);
    await third.client.post(`${API}/auth/logout`);
    await client.post(`${API}/auth/logout-all`);

    const actor = auditActor(h.config.keys, id);
    const rows = await h.admin`SELECT action FROM app.audit_log WHERE actor_hmac = ${actor}`;
    expect(new Set(rows.map((r) => r.action))).toEqual(
      new Set(['login', 'consent', 'session_revoke', 'email_change', 'logout', 'logout_all']),
    );
  });
});

describe('erasure and sign-in data', () => {
  it('removes login failures for every spelling of the address, and the password hash with the row', async () => {
    const { client, email, id } = await signInConsented(h);
    const quota = loginQuotaKey(h.config.keys, email);
    const [local, domain] = email.split('@');
    await new Client(h).post(`${API}/auth/login`, { email, password: 'a wrong password here' });
    await new Client(h).post(`${API}/auth/login`, { email: `${local}+tag@${domain}`, password: 'a wrong password here' });
    const before = await h.admin<{ n: number }[]>`SELECT count(*)::int AS n FROM app.login_failures WHERE quota_hash = ${quota}`;
    expect(before[0]!.n).toBe(2);
    await client.post(`${API}/me/delete/request`);
    await h.app.drainBackground();
    expect((await client.post(`${API}/me/delete/confirm`, { code: h.mailer.codeFor(email, 'account_delete') })).statusCode).toBe(204);
    const after = await h.admin<{ n: number }[]>`SELECT count(*)::int AS n FROM app.login_failures WHERE quota_hash = ${quota}`;
    expect(after[0]!.n).toBe(0);
    const users = await h.admin<{ n: number }[]>`SELECT count(*)::int AS n FROM app.users WHERE id = ${id}::uuid`;
    expect(users[0]!.n).toBe(0);
  });
});
