import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { meResponse } from '@anxiocare/shared';
import { sealJson } from '../src/crypto.ts';
import { dekFor, loadUser } from '../src/users.ts';
import { API, assessmentPayload, consentPayload, createHarness, signIn, signInConsented, type Harness } from './helpers.ts';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

const FULL = { avatar: 'leaf', ageRange: '25-34', gender: 'woman', occupation: 'student', stressFactors: ['sleep', 'studies'] };

describe('profile details', () => {
  it('start empty and unseen, can be set in part, and cleared field by field', async () => {
    const { client } = await signInConsented(h);
    const me = meResponse.strict().parse((await client.get(`${API}/me`)).json());
    expect(me.profile).toEqual({});
    expect(me.aboutSeen).toBe(false);

    const set = await client.patch(`${API}/me/profile`, FULL);
    expect(set.statusCode).toBe(200);
    expect(meResponse.strict().parse(set.json()).profile).toEqual(FULL);

    const part = await client.patch(`${API}/me/profile`, { gender: null, stressFactors: [] });
    expect(part.json().profile).toEqual({ avatar: 'leaf', ageRange: '25-34', occupation: 'student' });
    expect((await client.get(`${API}/me`)).json().profile).toEqual({ avatar: 'leaf', ageRange: '25-34', occupation: 'student' });
  });

  it('refuses anything not on the lists, and unknown fields, echoing none of it', async () => {
    const { client } = await signInConsented(h);
    for (const body of [{ avatar: 'MarkerAvatar' }, { ageRange: 'Marker17' }, { gender: 'MarkerGender' }, { occupation: 'MarkerJob' }, { stressFactors: ['MarkerStress'] }, { birthDate: 'Marker' }, { stressFactors: ['work', 'work'] }]) {
      const r = await client.patch(`${API}/me/profile`, body);
      expect(r.statusCode, JSON.stringify(body)).toBe(400);
      expect(r.json().code).toBe('validation_failed');
      expect(r.body).not.toContain('Marker');
    }
    expect((await client.get(`${API}/me`)).json().profile).toEqual({});
  });

  it('records that About you was seen, once, whether skipped or saved', async () => {
    const { client } = await signInConsented(h);
    const r = await client.post(`${API}/me/about-seen`);
    expect(r.statusCode).toBe(200);
    expect(r.json().aboutSeen).toBe(true);
    expect((await client.post(`${API}/me/about-seen`)).json().aboutSeen).toBe(true);
    expect((await client.get(`${API}/me`)).json()).toMatchObject({ aboutSeen: true, profile: {} });
  });

  it('waits for consent, like the rest of the account', async () => {
    const { client } = await signIn(h);
    for (const [method, url, payload] of [['PATCH', '/me/profile', FULL], ['POST', '/me/about-seen', undefined]] as const) {
      const r = await client.request({ method, url: `${API}${url}`, ...(payload ? { payload } : {}) });
      expect(r.statusCode, url).toBe(403);
      expect(r.json().code).toBe('consent_required');
    }
    await client.post(`${API}/me/consent`, consentPayload);
    expect((await client.patch(`${API}/me/profile`, FULL)).statusCode).toBe(200);
  });

  it('belongs to one account only', async () => {
    const a = await signInConsented(h);
    const b = await signInConsented(h);
    await a.client.patch(`${API}/me/profile`, FULL);
    expect((await b.client.get(`${API}/me`)).json().profile).toEqual({});
  });

  it('is sealed at rest, every profile the same size, and moving it to another account fails', async () => {
    const a = await signInConsented(h);
    const b = await signInConsented(h);
    await a.client.patch(`${API}/me/profile`, FULL);
    await b.client.patch(`${API}/me/profile`, { avatar: 'sage' });
    const rows = await h.admin<{ id: string; profile_ct: Buffer; raw: string }[]>`SELECT id, profile_ct, u::text AS raw FROM app.users u WHERE id IN (${a.id}::uuid, ${b.id}::uuid)`;
    for (const row of rows) for (const word of ['leaf', 'student', 'woman', 'sleep', '25-34', 'sage']) expect(row.raw).not.toContain(word);
    expect(rows[0]!.profile_ct.length).toBe(rows[1]!.profile_ct.length);

    await h.admin`UPDATE app.users x SET profile_ct = y.profile_ct FROM app.users y WHERE x.id = ${b.id}::uuid AND y.id = ${a.id}::uuid`;
    const r = await b.client.get(`${API}/me`);
    expect(r.statusCode).toBe(500);
    expect(r.body).not.toContain('leaf');
  });

  it('is in the export in words, and goes with the account', async () => {
    const { client, id } = await signInConsented(h);
    await client.patch(`${API}/me/profile`, FULL);
    const body = (await client.get(`${API}/me/export`)).json();
    expect(body.profile).toEqual({ avatar: 'Gentle Leaf', ageRange: '25 to 34', gender: 'Woman', occupation: 'Student', stressFactors: ['Sleep', 'Studies and exams'] });
    expect(body.account.profile).toBeUndefined();
    await client.post(`${API}/me/delete/request`, {});
    await h.app.drainBackground();
    const code = h.mailer.codeFor(body.account.email, 'account_delete');
    expect((await client.post(`${API}/me/delete/confirm`, { code })).statusCode).toBe(204);
    expect(await h.admin`SELECT 1 FROM app.users WHERE id = ${id}::uuid`).toHaveLength(0);
  });
});

describe('deleting all check-ins', () => {
  it('removes only this account\'s check-ins, and says how many', async () => {
    const a = await signInConsented(h);
    const b = await signInConsented(h);
    for (let i = 0; i < 3; i += 1) await a.client.post(`${API}/assessments`, assessmentPayload());
    await b.client.post(`${API}/assessments`, assessmentPayload());
    const r = await a.client.delete(`${API}/assessments`);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ deleted: 3 });
    expect((await a.client.get(`${API}/assessments`)).json().items).toEqual([]);
    expect((await b.client.get(`${API}/assessments`)).json().items).toHaveLength(1);
  });

  it('needs a recent re-authentication', async () => {
    const a = await signInConsented(h);
    await a.client.post(`${API}/assessments`, assessmentPayload());
    await h.admin`UPDATE app.sessions SET reauth_at = NULL WHERE user_id = ${a.id}::uuid`;
    const blocked = await a.client.delete(`${API}/assessments`);
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().code).toBe('reauth_required');
    expect((await a.client.get(`${API}/assessments`)).json().items).toHaveLength(1);
  });

  it('is a right: it works without accepting the current notice, still for this account only, and is audited', async () => {
    const a = await signInConsented(h);
    const b = await signInConsented(h);
    for (let i = 0; i < 2; i += 1) await a.client.post(`${API}/assessments`, assessmentPayload());
    await b.client.post(`${API}/assessments`, assessmentPayload());
    await h.admin`UPDATE app.users SET consent_version = '2000-01-01' WHERE id = ${a.id}::uuid`;
    const before = (await h.admin<{ n: number }[]>`SELECT count(*)::int AS n FROM app.audit_log WHERE action = 'assessments_delete'`)[0]!.n;
    const r = await a.client.delete(`${API}/assessments`);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ deleted: 2 });
    expect((await h.admin<{ n: number }[]>`SELECT count(*)::int AS n FROM app.audit_log WHERE action = 'assessments_delete'`)[0]!.n).toBe(before + 1);
    expect((await b.client.get(`${API}/assessments`)).json().items).toHaveLength(1);
    // A never-consented account has nothing to delete, and is not refused either.
    const fresh = await signIn(h);
    expect((await fresh.client.delete(`${API}/assessments`)).json()).toEqual({ deleted: 0 });
  });
});

describe('clearing the profile is a right', () => {
  it('DELETE /me/profile empties it without accepting the current notice', async () => {
    const { client, id } = await signInConsented(h);
    await client.patch(`${API}/me/profile`, FULL);
    await h.admin`UPDATE app.users SET consent_version = '2000-01-01' WHERE id = ${id}::uuid`;
    expect((await client.patch(`${API}/me/profile`, { avatar: 'sage' })).statusCode).toBe(403);
    const r = await client.delete(`${API}/me/profile`);
    expect(r.statusCode).toBe(200);
    expect(r.json().profile).toEqual({});
    expect((await client.get(`${API}/me`)).json().profile).toEqual({});
  });

  it('needs a session', async () => {
    const { Client } = await import('./helpers.ts');
    expect((await new Client(h).delete(`${API}/me/profile`)).statusCode).toBe(401);
  });
});

describe('a stored profile from an older list', () => {
  it('never breaks /me or the export: an unknown value is dropped, and logged without it', async () => {
    const { client, id } = await signInConsented(h);
    const user = await loadUser(h.admin, id);
    const blob = sealJson(dekFor(h.config.keys, user), { avatar: 'RetiredAvatarMarker', gender: 'woman', stressFactors: ['sleep', 'RenamedMarker'] }, 'users.profile', id, id);
    await h.admin`UPDATE app.users SET profile_ct = ${blob} WHERE id = ${id}::uuid`;
    h.logs.length = 0;
    const me = await client.get(`${API}/me`);
    expect(me.statusCode).toBe(200);
    expect(me.json().profile).toEqual({ gender: 'woman', stressFactors: ['sleep'] });
    const exported = await client.get(`${API}/me/export`);
    expect(exported.statusCode).toBe(200);
    expect(exported.json().profile).toEqual({ gender: 'Woman', stressFactors: ['Sleep'] });
    const lines = h.logs.map((l) => JSON.parse(l) as Record<string, unknown>).filter((l) => l.msg === 'profile_value_dropped');
    expect(lines.length).toBeGreaterThan(0);
    expect(h.logs.join('\n')).not.toMatch(/RetiredAvatarMarker|RenamedMarker/);
  });
});

describe('the stored profile says nothing by its presence', () => {
  it('is sealed, at the same size, whether skipped, saved or cleared', async () => {
    const skipped = await signInConsented(h);
    const saved = await signInConsented(h);
    const cleared = await signInConsented(h);
    await skipped.client.post(`${API}/me/about-seen`);
    await saved.client.patch(`${API}/me/profile`, FULL);
    await cleared.client.patch(`${API}/me/profile`, FULL);
    await cleared.client.patch(`${API}/me/profile`, { avatar: null, ageRange: null, gender: null, occupation: null, stressFactors: [] });
    const rows = await h.admin<{ len: number | null }[]>`SELECT octet_length(profile_ct)::int AS len FROM app.users WHERE id IN (${skipped.id}::uuid, ${saved.id}::uuid, ${cleared.id}::uuid)`;
    expect(rows.map((r) => r.len)).toEqual([rows[0]!.len, rows[0]!.len, rows[0]!.len]);
    expect(rows[0]!.len).not.toBeNull();
    expect((await cleared.client.get(`${API}/me`)).json().profile).toEqual({});
  });
});

describe('two changes at once', () => {
  it('keeps both', async () => {
    const { client } = await signInConsented(h);
    for (let round = 0; round < 5; round += 1) {
      await client.patch(`${API}/me/profile`, { avatar: null, gender: null });
      await Promise.all([client.patch(`${API}/me/profile`, { avatar: 'leaf' }), client.patch(`${API}/me/profile`, { gender: 'man' })]);
      expect((await client.get(`${API}/me`)).json().profile, `round ${round}`).toMatchObject({ avatar: 'leaf', gender: 'man' });
    }
  });
});
