import { addDays, emptySafetyPlan, moodList, moodResponse, safetyPlanResponse } from '@anxiocare/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { API, Client, createHarness, signIn, signInConsented, type Harness } from './helpers.ts';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

/** Today in UTC: always inside the server's allowed window. */
const today = () => new Date().toISOString().slice(0, 10);
const mood = (overrides: Record<string, unknown> = {}) => ({ rating: 2, note: 'SECRET-MOOD-NOTE about the day', ...overrides });
const plan = (overrides: Record<string, unknown> = {}) => ({
  ...emptySafetyPlan(),
  warningSigns: ['SECRET-WARNING not sleeping'],
  reasonsToLive: ['SECRET-REASON my daughter'],
  helpContacts: [{ name: 'SecretContactName', phone: '+91 98765 43210' }],
  professionals: [{ name: 'Dr SecretDoctor', phone: '080 2345 6789' }],
  ...overrides,
});

describe('mood log', () => {
  it('logs a day, updates it on the same day, lists it, and deletes it', async () => {
    const { client } = await signInConsented(h);
    const day = today();
    const first = await client.request({ method: 'PUT', url: `${API}/moods/${day}`, payload: mood() });
    expect(first.statusCode).toBe(200);
    const entry = moodResponse.strict().parse(first.json());
    expect(entry).toMatchObject({ day, rating: 2, note: 'SECRET-MOOD-NOTE about the day' });

    const again = await client.request({ method: 'PUT', url: `${API}/moods/${day}`, payload: mood({ rating: 4, note: '' }) });
    expect(again.statusCode).toBe(200);
    expect(again.json()).toMatchObject({ day, rating: 4, note: '', createdAt: entry.createdAt });

    const list = await client.get(`${API}/moods?from=${addDays(day, -30)}&to=${addDays(day, 1)}`);
    expect(list.statusCode).toBe(200);
    expect(moodList.parse(list.json()).items).toEqual([again.json()]);

    expect((await client.delete(`${API}/moods/${day}`)).statusCode).toBe(204);
    expect((await client.delete(`${API}/moods/${day}`)).statusCode).toBe(404);
    expect((await client.get(`${API}/moods?from=${day}&to=${day}`)).json().items).toEqual([]);
  });

  it('lists days in order, and only inside the range asked for', async () => {
    const { client } = await signInConsented(h);
    const day = today();
    for (const [offset, rating] of [[-2, 3], [0, 5], [-10, 1]] as const) {
      expect((await client.request({ method: 'PUT', url: `${API}/moods/${addDays(day, offset)}`, payload: mood({ rating }) })).statusCode).toBe(200);
    }
    const items = (await client.get(`${API}/moods?from=${addDays(day, -5)}&to=${day}`)).json().items as { day: string; rating: number }[];
    expect(items.map((i) => [i.day, i.rating])).toEqual([[addDays(day, -2), 3], [day, 5]]);
  });

  it('refuses future days, days more than 366 back, and malformed days', async () => {
    const { client } = await signInConsented(h);
    const day = today();
    for (const bad of [addDays(day, 2), addDays(day, -368), '2026-02-30', 'yesterday', '2026-1-1']) {
      const r = await client.request({ method: 'PUT', url: `${API}/moods/${bad}`, payload: mood() });
      expect([bad, r.statusCode, r.json().code]).toEqual([bad, 400, 'validation_failed']);
    }
    expect((await client.request({ method: 'PUT', url: `${API}/moods/${addDays(day, -365)}`, payload: mood() })).statusCode).toBe(200);
    expect((await client.delete(`${API}/moods/not-a-day`)).statusCode).toBe(400);
  });

  it('validates the rating, the note and unknown keys', async () => {
    const { client } = await signInConsented(h);
    for (const body of [mood({ rating: 0 }), mood({ rating: 6 }), mood({ rating: 2.5 }), mood({ note: 'x'.repeat(281) }), mood({ score: 1 }), { rating: 3 }]) {
      const r = await client.request({ method: 'PUT', url: `${API}/moods/${today()}`, payload: body });
      expect(r.statusCode).toBe(400);
    }
  });

  it('validates the range: both ends, to on or after from, at most 400 days', async () => {
    const { client } = await signInConsented(h);
    const day = today();
    for (const query of [
      `from=${day}`,
      `from=${day}&to=${addDays(day, -1)}`,
      `from=${addDays(day, -401)}&to=${day}`,
      `from=${day}&to=${day}&extra=1`,
      'from=nope&to=nope',
    ]) {
      expect([query, (await client.get(`${API}/moods?${query}`)).statusCode]).toEqual([query, 400]);
    }
    expect((await client.get(`${API}/moods?from=${addDays(day, -400)}&to=${day}`)).statusCode).toBe(200);
  });
});

describe('safety plan', () => {
  it('is 404 until saved, then saved whole, replaced whole, and deleted', async () => {
    const { client } = await signInConsented(h);
    expect((await client.get(`${API}/safety-plan`)).statusCode).toBe(404);

    const saved = await client.request({ method: 'PUT', url: `${API}/safety-plan`, payload: plan() });
    expect(saved.statusCode).toBe(200);
    const body = safetyPlanResponse.strict().parse(saved.json());
    expect(body.helpContacts).toEqual([{ name: 'SecretContactName', phone: '+91 98765 43210' }]);
    expect((await client.get(`${API}/safety-plan`)).json()).toEqual(saved.json());

    const replaced = await client.request({ method: 'PUT', url: `${API}/safety-plan`, payload: emptySafetyPlan() });
    expect(replaced.statusCode).toBe(200);
    expect(replaced.json()).toMatchObject(emptySafetyPlan());

    expect((await client.delete(`${API}/safety-plan`)).statusCode).toBe(204);
    expect((await client.get(`${API}/safety-plan`)).statusCode).toBe(404);
    expect((await client.delete(`${API}/safety-plan`)).statusCode).toBe(404);
  });

  it('validates bounds: items, lengths, contacts and phone characters', async () => {
    const { client } = await signInConsented(h);
    for (const body of [
      plan({ warningSigns: Array.from({ length: 11 }, () => 'x') }),
      plan({ warningSigns: ['x'.repeat(201)] }),
      plan({ helpContacts: [{ name: 'x'.repeat(81), phone: '1' }] }),
      plan({ helpContacts: [{ name: 'A', phone: '1'.repeat(21) }] }),
      plan({ helpContacts: [{ name: 'A', phone: '<script>' }] }),
      plan({ extra: [] }),
      { warningSigns: [] },
    ]) {
      expect((await client.request({ method: 'PUT', url: `${API}/safety-plan`, payload: body })).statusCode).toBe(400);
    }
  });
});

describe('access', () => {
  it('needs a session: 401 on all six', async () => {
    const client = new Client(h);
    const day = today();
    for (const [method, path, body] of [
      ['GET', `/moods?from=${day}&to=${day}`], ['PUT', `/moods/${day}`, mood()], ['DELETE', `/moods/${day}`],
      ['GET', '/safety-plan'], ['PUT', '/safety-plan', plan()], ['DELETE', '/safety-plan'],
    ] as [string, string, unknown?][]) {
      const r = await client.request({ method: method as 'GET', url: `${API}${path}`, ...(body ? { payload: body as object } : {}) });
      expect([path, r.statusCode]).toEqual([path, 401]);
    }
  });

  it('needs current consent: 403 consent_required on all six', async () => {
    const { client } = await signIn(h);
    const day = today();
    for (const [method, path, body] of [
      ['GET', `/moods?from=${day}&to=${day}`], ['PUT', `/moods/${day}`, mood()], ['DELETE', `/moods/${day}`],
      ['GET', '/safety-plan'], ['PUT', '/safety-plan', plan()], ['DELETE', '/safety-plan'],
    ] as [string, string, unknown?][]) {
      const r = await client.request({ method: method as 'GET', url: `${API}${path}`, ...(body ? { payload: body as object } : {}) });
      expect([path, r.statusCode, r.json().code]).toEqual([path, 403, 'consent_required']);
    }
  });

  it('keeps people apart: the same day is separate for each, and nobody can read or delete another person\'s', async () => {
    const a = await signInConsented(h);
    const b = await signInConsented(h);
    const day = today();
    await a.client.request({ method: 'PUT', url: `${API}/moods/${day}`, payload: mood({ rating: 1, note: 'A-ONLY' }) });
    await a.client.request({ method: 'PUT', url: `${API}/safety-plan`, payload: plan({ reasonsToLive: ['A-ONLY-REASON'] }) });

    expect((await b.client.get(`${API}/moods?from=${day}&to=${day}`)).json().items).toEqual([]);
    expect((await b.client.get(`${API}/safety-plan`)).statusCode).toBe(404);
    expect((await b.client.delete(`${API}/moods/${day}`)).statusCode).toBe(404);
    expect((await b.client.delete(`${API}/safety-plan`)).statusCode).toBe(404);

    const own = await b.client.request({ method: 'PUT', url: `${API}/moods/${day}`, payload: mood({ rating: 5, note: 'B' }) });
    expect(own.json()).toMatchObject({ rating: 5, note: 'B' });
    const aList = (await a.client.get(`${API}/moods?from=${day}&to=${day}`)).json().items;
    expect(aList).toHaveLength(1);
    expect(aList[0]).toMatchObject({ rating: 1, note: 'A-ONLY' });
    expect((await a.client.get(`${API}/safety-plan`)).json().reasonsToLive).toEqual(['A-ONLY-REASON']);
  });

  it('counts against the per-account rate limit, as every signed-in route does', async () => {
    const { client } = await signInConsented(h);
    const day = today();
    let last = 0;
    for (let i = 0; i < 61; i++) last = (await client.get(`${API}/moods?from=${day}&to=${day}`)).statusCode;
    expect(last).toBe(429);
  });
});

describe('at rest', () => {
  it('every mood ciphertext is the same size, whatever the rating or note', async () => {
    const { client, id } = await signInConsented(h);
    const day = today();
    await client.request({ method: 'PUT', url: `${API}/moods/${day}`, payload: { rating: 1, note: '' } });
    await client.request({ method: 'PUT', url: `${API}/moods/${addDays(day, -1)}`, payload: { rating: 5, note: '\u0001'.repeat(280) } });
    await client.request({ method: 'PUT', url: `${API}/moods/${addDays(day, -2)}`, payload: { rating: 3, note: 'मन'.repeat(140) } });
    const rows = await h.admin<{ n: number }[]>`SELECT octet_length(payload_ct) AS n FROM app.mood_entries WHERE user_id = ${id}::uuid`;
    expect(new Set(rows.map((r) => r.n)).size).toBe(1);
  });

  it('safety plans fall into 16 KB size steps, so a typical plan shows no size at all', async () => {
    const { client, id } = await signInConsented(h);
    await client.request({ method: 'PUT', url: `${API}/safety-plan`, payload: emptySafetyPlan() });
    const [small] = await h.admin<{ n: number }[]>`SELECT octet_length(payload_ct) AS n FROM app.safety_plans WHERE user_id = ${id}::uuid`;
    await client.request({ method: 'PUT', url: `${API}/safety-plan`, payload: plan({ warningSigns: Array.from({ length: 10 }, () => 'y'.repeat(200)) }) });
    const [bigger] = await h.admin<{ n: number }[]>`SELECT octet_length(payload_ct) AS n FROM app.safety_plans WHERE user_id = ${id}::uuid`;
    expect(small!.n).toBe(bigger!.n);
    expect(small!.n).toBeGreaterThan(16384);
  });

  it('swapping mood ciphertext between two days of one person fails, opaquely', async () => {
    const { client, id } = await signInConsented(h);
    const day = today();
    const yesterday = addDays(day, -1);
    await client.request({ method: 'PUT', url: `${API}/moods/${day}`, payload: mood({ rating: 1 }) });
    await client.request({ method: 'PUT', url: `${API}/moods/${yesterday}`, payload: mood({ rating: 5 }) });
    await h.admin`
      UPDATE app.mood_entries x SET payload_ct = y.payload_ct FROM app.mood_entries y
      WHERE x.user_id = ${id}::uuid AND y.user_id = ${id}::uuid AND x.day = ${day}::date AND y.day = ${yesterday}::date
    `;
    const r = await client.get(`${API}/moods?from=${yesterday}&to=${day}`);
    expect(r.statusCode).toBe(500);
    expect(r.json().code).toBe('internal_error');
    expect(r.body).not.toMatch(/decrypt|aes|gcm|cipher/i);
  });

  it("a safety plan moved to another person's row can't be read", async () => {
    const a = await signInConsented(h);
    const b = await signInConsented(h);
    await a.client.request({ method: 'PUT', url: `${API}/safety-plan`, payload: plan() });
    await h.admin`UPDATE app.safety_plans SET user_id = ${b.id}::uuid WHERE user_id = ${a.id}::uuid`;
    const r = await b.client.get(`${API}/safety-plan`);
    expect(r.statusCode).toBe(500);
    expect(r.json().code).toBe('internal_error');
  });
});
