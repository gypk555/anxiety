import { randomUUID } from 'node:crypto';
import { assessmentResponse, CONSENT_VERSION, journalResponse, meResponse, pageOf } from '@anxiocare/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  API, assessmentPayload, Client, consentPayload, createHarness, journalPayload, signIn, signInConsented, type Harness,
} from './helpers.ts';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

describe('consent gate', () => {
  it('blocks assessments, journal and profile writes until consent, with consent_required', async () => {
    const { client } = await signIn(h);
    const id = randomUUID();
    const gated: [string, string, unknown?][] = [
      ['GET', '/assessments'],
      ['POST', '/assessments', assessmentPayload()],
      ['GET', `/assessments/${id}`],
      ['DELETE', `/assessments/${id}`],
      ['GET', '/journal'],
      ['POST', '/journal', journalPayload()],
      ['GET', `/journal/${id}`],
      ['PATCH', `/journal/${id}`, journalPayload()],
      ['DELETE', `/journal/${id}`],
      ['PATCH', '/me', { displayName: 'A' }],
      ['POST', '/me/email/request', { newEmail: 'x@example.com' }],
      ['POST', '/me/email/verify', { newEmail: 'x@example.com', currentCode: '123456', code: '123456' }],
    ];
    for (const [method, path, body] of gated) {
      const r = await client.request({ method: method as 'GET', url: `${API}${path}`, ...(body ? { payload: body as object } : {}) });
      expect([path, r.statusCode, r.json().code]).toEqual([path, 403, 'consent_required']);
    }
  });

  it('never locks anyone out of their rights: me, sessions, logout, export and delete work without consent', async () => {
    const { client, email } = await signIn(h);
    expect((await client.get(`${API}/me`)).statusCode).toBe(200);
    expect((await client.get(`${API}/auth/sessions`)).statusCode).toBe(200);
    expect((await client.get(`${API}/me/export`)).statusCode).toBe(200);
    expect((await client.post(`${API}/me/delete/request`)).statusCode).toBe(202);
    await h.app.drainBackground();
    expect((await client.post(`${API}/me/delete/confirm`, { code: h.mailer.codeFor(email, 'account_delete') })).statusCode).toBe(204);

    const other = await signIn(h);
    expect((await other.client.post(`${API}/auth/logout-all`)).statusCode).toBe(204);
    const third = await signIn(h);
    expect((await third.client.post(`${API}/auth/logout`)).statusCode).toBe(204);
  });

  it('a person whose consent is out of date keeps every right, and their data stays untouched', async () => {
    const { client, email, id } = await signInConsented(h);
    await client.post(`${API}/journal`, journalPayload());
    await h.admin`UPDATE app.users SET consent_version = '2000-01-01' WHERE id = ${id}::uuid`;

    expect((await client.get(`${API}/journal`)).statusCode).toBe(403);
    const exported = await client.get(`${API}/me/export`);
    expect(exported.statusCode).toBe(200);
    expect(exported.json().journal).toHaveLength(1);
    expect(exported.json().account).not.toHaveProperty('acceptedConsentVersion');
    expect((await client.get(`${API}/auth/sessions`)).statusCode).toBe(200);
    expect((await client.post(`${API}/auth/logout-all`)).statusCode).toBe(204);

    const again = await signIn(h, email);
    expect((await again.client.post(`${API}/me/delete/request`)).statusCode).toBe(202);
    await h.app.drainBackground();
    expect((await again.client.post(`${API}/me/delete/confirm`, { code: h.mailer.codeFor(email, 'account_delete') })).statusCode).toBe(204);
  });

  it('tells first-time consent apart from a re-prompt', async () => {
    const { client, id } = await signIn(h);
    expect((await client.get(`${API}/me`)).json()).toMatchObject({ consentRequired: true, acceptedConsentVersion: null });
    await client.post(`${API}/me/consent`, consentPayload);
    expect((await client.get(`${API}/me`)).json()).toMatchObject({ consentRequired: false, acceptedConsentVersion: CONSENT_VERSION });
    await h.admin`UPDATE app.users SET consent_version = '2000-01-01' WHERE id = ${id}::uuid`;
    expect((await client.get(`${API}/me`)).json()).toMatchObject({ consentRequired: true, acceptedConsentVersion: '2000-01-01' });
  });

  it('requires all three acknowledgements and the current version', async () => {
    const { client } = await signIn(h);
    for (const body of [
      { ...consentPayload, version: '1999-01-01' },
      { ...consentPayload, adultConfirmed: false },
      { ...consentPayload, healthDataConsent: false },
      { version: CONSENT_VERSION },
    ]) {
      expect((await client.post(`${API}/me/consent`, body)).statusCode).toBe(400);
    }
    expect((await client.get(`${API}/me`)).json().consentRequired).toBe(true);
  });

  it('records the versioned, timestamped consent and an audit row', async () => {
    const { client, id } = await signIn(h);
    const r = await client.post(`${API}/me/consent`, consentPayload);
    expect(r.statusCode).toBe(200);
    expect(meResponse.strict().parse(r.json()).consentRequired).toBe(false);
    const [row] = await h.admin`SELECT * FROM app.consents WHERE user_id = ${id}::uuid`;
    expect(row).toMatchObject({ version: CONSENT_VERSION, adult_confirmed: true, health_data: true });
    expect(row!.accepted_at).toBeInstanceOf(Date);
    const [user] = await h.admin`SELECT consent_version, consent_at FROM app.users WHERE id = ${id}::uuid`;
    expect(user!.consent_version).toBe(CONSENT_VERSION);
    expect(user!.consent_at).toBeInstanceOf(Date);
    expect((await client.get(`${API}/journal`)).statusCode).toBe(200);
  });

  it('re-prompts when the version moves on, and lets the person accept again', async () => {
    const { client, id } = await signInConsented(h);
    await h.admin`UPDATE app.users SET consent_version = '2000-01-01' WHERE id = ${id}::uuid`;
    expect((await client.get(`${API}/me`)).json().consentRequired).toBe(true);
    expect((await client.get(`${API}/assessments`)).statusCode).toBe(403);
    expect((await client.post(`${API}/me/consent`, consentPayload)).statusCode).toBe(200);
    expect((await client.get(`${API}/assessments`)).statusCode).toBe(200);
  });

  it('authentication is checked before consent', async () => {
    expect((await new Client(h).get(`${API}/journal`)).statusCode).toBe(401);
  });
});

describe('profile', () => {
  it('sets, trims and clears the display name', async () => {
    const { client } = await signInConsented(h);
    const set = await client.patch(`${API}/me`, { displayName: '  Asha  ' });
    expect(set.statusCode).toBe(200);
    expect(meResponse.strict().parse(set.json()).displayName).toBe('Asha');
    expect((await client.get(`${API}/me`)).json().displayName).toBe('Asha');
    expect((await client.patch(`${API}/me`, { displayName: '   ' })).json().displayName).toBeNull();
    expect((await client.patch(`${API}/me`, { displayName: null })).json().displayName).toBeNull();
    expect((await client.patch(`${API}/me`, { displayName: 'x'.repeat(61) })).statusCode).toBe(400);
  });
});

describe('assessments', () => {
  it('computes the score and severity on the server', async () => {
    const { client } = await signInConsented(h);
    const r = await client.post(`${API}/assessments`, assessmentPayload());
    expect(r.statusCode).toBe(201);
    const body = assessmentResponse.strict().parse(r.json());
    expect(body.score).toBe(12);
    expect(body.severity).toBe('moderate');
  });

  it('refuses client-supplied scores', async () => {
    const { client } = await signInConsented(h);
    const r = await client.post(`${API}/assessments`, assessmentPayload({ score: 0, severity: 'minimal' }));
    expect(r.statusCode).toBe(400);
  });

  it.each([
    ['too few answers', { answers: [0, 0] }],
    ['out-of-range answer', { answers: [4, 0, 0, 0, 0, 0, 0] }],
    ['fractional answer', { answers: [0.5, 0, 0, 0, 0, 0, 0] }],
    ['difficulty missing with symptoms', { difficulty: null }],
    ['bad request id', { clientRequestId: 'nope' }],
    ['offset timestamp', { takenAt: '2026-01-01T00:00:00+05:30' }],
  ])('rejects %s', async (_name, overrides) => {
    const { client } = await signInConsented(h);
    expect((await client.post(`${API}/assessments`, assessmentPayload(overrides))).statusCode).toBe(400);
  });

  it('is idempotent per user on clientRequestId, returning the original row', async () => {
    const { client, id } = await signInConsented(h);
    const payload = assessmentPayload();
    const first = await client.post(`${API}/assessments`, payload);
    const second = await client.post(`${API}/assessments`, { ...payload, answers: [0, 0, 0, 0, 0, 0, 0], difficulty: null });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual(first.json());
    const [row] = await h.admin`SELECT count(*)::int AS n FROM app.assessments WHERE user_id = ${id}::uuid`;
    expect(row!.n).toBe(1);
  });

  it('is idempotent under parallel replays', async () => {
    const { client, id } = await signInConsented(h);
    const payload = assessmentPayload();
    const results = await Promise.all(Array.from({ length: 6 }, () => client.post(`${API}/assessments`, payload)));
    expect(new Set(results.map((r) => r.json().id)).size).toBe(1);
    expect(results.filter((r) => r.statusCode === 201)).toHaveLength(1);
    const [row] = await h.admin`SELECT count(*)::int AS n FROM app.assessments WHERE user_id = ${id}::uuid`;
    expect(row!.n).toBe(1);
  });

  it('scopes idempotency to the user: the same id from another account is a new row', async () => {
    const a = await signInConsented(h);
    const b = await signInConsented(h);
    const payload = assessmentPayload();
    const ra = await a.client.post(`${API}/assessments`, payload);
    const rb = await b.client.post(`${API}/assessments`, payload);
    expect(rb.statusCode).toBe(201);
    expect(rb.json().id).not.toBe(ra.json().id);
  });

  it('accepts a guest result up to 24h old and rejects older or future times', async () => {
    const { client } = await signInConsented(h);
    const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();
    const hour = 3_600_000;
    const ok = await client.post(`${API}/assessments`, assessmentPayload({ takenAt: iso(-23 * hour) }));
    expect(ok.statusCode).toBe(201);
    const old = await client.post(`${API}/assessments`, assessmentPayload({ takenAt: iso(-25 * hour) }));
    expect(old.statusCode).toBe(400);
    expect(old.json().fieldErrors.takenAt).toBeTruthy();
    const future = await client.post(`${API}/assessments`, assessmentPayload({ takenAt: iso(hour) }));
    expect(future.statusCode).toBe(400);
    expect(future.json().fieldErrors.takenAt).toBeTruthy();
  });

  it('never stores a future time: a slightly fast phone clock is clamped to now', async () => {
    const { client } = await signInConsented(h);
    const r = await client.post(`${API}/assessments`, assessmentPayload({ takenAt: new Date(Date.now() + 20_000).toISOString() }));
    expect(r.statusCode).toBe(201);
    expect(new Date(r.json().takenAt).getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('replays an old request after the 24h window instead of rejecting it', async () => {
    const { client, id } = await signInConsented(h);
    const takenAt = new Date(Date.now() - 3_600_000).toISOString();
    const payload = assessmentPayload({ takenAt });
    const first = await client.post(`${API}/assessments`, payload);
    await h.admin`UPDATE app.assessments SET taken_at = now() - interval '3 days' WHERE user_id = ${id}::uuid`;
    const replay = await client.post(`${API}/assessments`, { ...payload, takenAt: new Date(Date.now() - 48 * 3_600_000).toISOString() });
    expect(replay.statusCode).toBe(200);
    expect(replay.json().id).toBe(first.json().id);
  });

  it('gets and deletes one', async () => {
    const { client } = await signInConsented(h);
    const { id } = (await client.post(`${API}/assessments`, assessmentPayload())).json();
    expect((await client.get(`${API}/assessments/${id}`)).json().id).toBe(id);
    expect((await client.delete(`${API}/assessments/${id}`)).statusCode).toBe(204);
    expect((await client.get(`${API}/assessments/${id}`)).statusCode).toBe(404);
    expect((await client.delete(`${API}/assessments/${id}`)).statusCode).toBe(404);
  });
});

describe('journal', () => {
  it('creates, reads, replaces and deletes', async () => {
    const { client } = await signInConsented(h);
    const created = await client.post(`${API}/journal`, journalPayload());
    expect(created.statusCode).toBe(201);
    const entry = journalResponse.strict().parse(created.json());
    expect(entry.situation).toContain('SECRET-SITUATION');

    expect((await client.get(`${API}/journal/${entry.id}`)).json()).toEqual(created.json());

    const replaced = await client.patch(`${API}/journal/${entry.id}`, journalPayload({ thought: 'changed', intensityAfter: null }));
    expect(replaced.statusCode).toBe(200);
    expect(replaced.json()).toMatchObject({ thought: 'changed', intensityAfter: null, createdAt: entry.createdAt });
    expect(new Date(replaced.json().updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(entry.updatedAt).getTime());

    expect((await client.delete(`${API}/journal/${entry.id}`)).statusCode).toBe(204);
    expect((await client.get(`${API}/journal/${entry.id}`)).statusCode).toBe(404);
  });

  it('PATCH needs the full body', async () => {
    const { client } = await signInConsented(h);
    const { id } = (await client.post(`${API}/journal`, journalPayload())).json();
    expect((await client.patch(`${API}/journal/${id}`, { thought: 'only this' })).statusCode).toBe(400);
  });

  it('validates sizes and ranges', async () => {
    const { client } = await signInConsented(h);
    for (const overrides of [
      { situation: '   ' },
      { situation: 'x'.repeat(2001) },
      { intensityBefore: 11 },
      { feelings: Array.from({ length: 11 }, () => 'a') },
    ]) {
      expect((await client.post(`${API}/journal`, journalPayload(overrides))).statusCode).toBe(400);
    }
  });
});

describe('cross-user access', () => {
  it('returns 404 on every :id route and changes nothing', async () => {
    const a = await signInConsented(h);
    const b = await signInConsented(h);
    const assessment = (await a.client.post(`${API}/assessments`, assessmentPayload())).json();
    const entry = (await a.client.post(`${API}/journal`, journalPayload())).json();
    const session = ((await a.client.get(`${API}/auth/sessions`)).json().items as { id: string }[])[0]!;

    const attempts: [string, string, unknown?][] = [
      ['GET', `/assessments/${assessment.id}`],
      ['DELETE', `/assessments/${assessment.id}`],
      ['GET', `/journal/${entry.id}`],
      ['PATCH', `/journal/${entry.id}`, journalPayload({ thought: 'hijacked' })],
      ['DELETE', `/journal/${entry.id}`],
      ['DELETE', `/auth/sessions/${session.id}`],
    ];
    for (const [method, path, body] of attempts) {
      const r = await b.client.request({ method: method as 'GET', url: `${API}${path}`, ...(body ? { payload: body as object } : {}) });
      expect([path, r.statusCode, r.json().code]).toEqual([path, 404, 'not_found']);
    }
    expect((await a.client.get(`${API}/assessments/${assessment.id}`)).statusCode).toBe(200);
    expect((await a.client.get(`${API}/journal/${entry.id}`)).json().thought).toBe(entry.thought);
    expect((await a.client.get(`${API}/me`)).statusCode).toBe(200);
  });

  it('lists only contain own rows', async () => {
    const a = await signInConsented(h);
    const b = await signInConsented(h);
    await a.client.post(`${API}/assessments`, assessmentPayload());
    await a.client.post(`${API}/journal`, journalPayload());
    expect((await b.client.get(`${API}/assessments`)).json().items).toEqual([]);
    expect((await b.client.get(`${API}/journal`)).json().items).toEqual([]);
    const items = (await b.client.get(`${API}/auth/sessions`)).json().items as unknown[];
    expect(items).toHaveLength(1);
  });

  it("a cursor from another user's list reveals nothing", async () => {
    const a = await signInConsented(h);
    const b = await signInConsented(h);
    for (let i = 0; i < 3; i += 1) await a.client.post(`${API}/journal`, journalPayload());
    const { nextCursor } = (await a.client.get(`${API}/journal?limit=1`)).json();
    expect(nextCursor).toBeTruthy();
    expect((await b.client.get(`${API}/journal?cursor=${nextCursor}`)).json().items).toEqual([]);
  });

  it('treats a malformed id as not found', async () => {
    const { client } = await signInConsented(h);
    for (const path of ['/assessments/nope', '/journal/nope', "/journal/1'%20OR%201=1"]) {
      expect((await client.get(`${API}${path}`)).statusCode).toBe(404);
    }
  });
});

describe('pagination', () => {
  const walk = async (client: Client, path: string, limit: number) => {
    const seen: { id: string }[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const response = await client.get(`${API}${path}?limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`);
      expect(response.statusCode).toBe(200);
      const body = response.json() as { items: { id: string }[]; nextCursor: string | null };
      seen.push(...body.items);
      cursor = body.nextCursor;
      pages += 1;
    } while (cursor && pages < 50);
    return { seen, pages };
  };

  it('walks assessments newest first with no gaps or repeats, even with identical timestamps', async () => {
    const { client, id } = await signInConsented(h);
    const responses = [];
    for (let i = 0; i < 7; i += 1) responses.push((await client.post(`${API}/assessments`, assessmentPayload())).json());
    await h.admin`UPDATE app.assessments SET taken_at = '2026-11-01T10:00:00.123Z' WHERE user_id = ${id}::uuid AND id = ANY(${responses.slice(0, 4).map((r) => r.id)}::uuid[])`;
    const { seen, pages } = await walk(client, '/assessments', 2);
    expect(pages).toBe(4);
    expect(seen.map((r) => r.id).length).toBe(7);
    expect(new Set(seen.map((r) => r.id)).size).toBe(7);
    const expected = await h.admin`SELECT id FROM app.assessments WHERE user_id = ${id}::uuid ORDER BY taken_at DESC, id DESC`;
    expect(seen.map((r) => r.id)).toEqual(expected.map((r) => r.id));
    pageOf(assessmentResponse.strict()).parse((await client.get(`${API}/assessments`)).json());
  });

  it('walks the journal the same way, with an exact last page', async () => {
    const { client, id } = await signInConsented(h);
    for (let i = 0; i < 4; i += 1) await client.post(`${API}/journal`, journalPayload());
    await h.admin`UPDATE app.journal_entries SET created_at = '2026-11-01T10:00:00.5Z' WHERE user_id = ${id}::uuid`;
    const { seen, pages } = await walk(client, '/journal', 2);
    expect(new Set(seen.map((r) => r.id)).size).toBe(4);
    expect(pages).toBe(2);
    pageOf(journalResponse.strict()).parse((await client.get(`${API}/journal`)).json());
  });

  it('cursors are opaque, and tampered ones are a clean 400', async () => {
    const { client } = await signInConsented(h);
    for (let i = 0; i < 2; i += 1) await client.post(`${API}/journal`, journalPayload());
    const { nextCursor } = (await client.get(`${API}/journal?limit=1`)).json();
    expect(nextCursor).toMatch(/^[A-Za-z0-9_-]+$/);
    const bad = Buffer.from(JSON.stringify(['nope', 'nope'])).toString('base64url');
    for (const cursor of ['garbage', bad, '%00', 'x'.repeat(201)]) {
      const r = await client.get(`${API}/journal?cursor=${cursor}`);
      expect(r.statusCode).toBe(400);
      expect(r.json().code).toBe('validation_failed');
    }
  });

  it('bounds limit', async () => {
    const { client } = await signInConsented(h);
    for (const limit of ['0', '101', 'abc', '-1']) {
      expect((await client.get(`${API}/journal?limit=${limit}`)).statusCode).toBe(400);
    }
  });
});
