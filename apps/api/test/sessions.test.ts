import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { sessionResponse } from '@anxiocare/shared';
import { deviceLabel } from '../src/device.ts';
import { API, Client, createHarness, signIn, type Harness } from './helpers.ts';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

const expectRejected = async (client: Client) => {
  const r = await client.get(`${API}/me`);
  expect(r.statusCode).toBe(401);
  expect(r.json().code).toBe('unauthenticated');
};

describe('session cookie', () => {
  it('is __Host-session, HttpOnly, Secure, SameSite=Strict, Path=/, no Domain', async () => {
    const client = new Client(h);
    const email = `cookie-${randomUUID()}@example.com`;
    await client.post(`${API}/auth/otp/request`, { email });
    await h.app.drainBackground();
    const r = await client.post(`${API}/auth/otp/verify`, { email, code: h.mailer.codeFor(email) });
    const raw = String([r.headers['set-cookie']].flat().find((c) => String(c).startsWith('__Host-session=')));
    expect(raw).toMatch(/^__Host-session=[A-Za-z0-9_-]{43};/);
    expect(raw).toContain('HttpOnly');
    expect(raw).toContain('Secure');
    expect(raw).toContain('SameSite=Strict');
    expect(raw).toContain('Path=/');
    expect(raw).not.toMatch(/Domain=/i);
  });

  it('stores only the SHA-256 of the token', async () => {
    const { client, id } = await signIn(h);
    const rows = await h.admin`SELECT token_hash FROM app.sessions WHERE user_id = ${id}::uuid`;
    expect(rows).toHaveLength(1);
    const expected = createHash('sha256').update(client.cookie!).digest();
    expect((rows[0]!.token_hash as Buffer).equals(expected)).toBe(true);
    const dump = JSON.stringify(await h.admin`SELECT s.*, encode(token_hash,'escape') AS t FROM app.sessions s`);
    expect(dump).not.toContain(client.cookie!);
  });

  it('issues a new token at each login', async () => {
    const first = await signIn(h);
    const second = await signIn(h, first.email);
    expect(second.client.cookie).not.toBe(first.client.cookie);
    expect(second.id).toBe(first.id);
  });

  it('rejects missing, garbage and well-formed but unknown tokens', async () => {
    const client = new Client(h);
    await expectRejected(client);
    client.cookie = 'garbage';
    await expectRejected(client);
    client.cookie = 'A'.repeat(43);
    await expectRejected(client);
  });
});

describe('session lifetime', () => {
  it('rejects a session past the idle limit', async () => {
    const { client, id } = await signIn(h);
    await h.admin`UPDATE app.sessions SET last_seen_at = now() - interval '30 days 1 minute' WHERE user_id = ${id}::uuid`;
    await expectRejected(client);
  });

  it('rejects a session past the absolute limit even when recently active', async () => {
    const { client, id } = await signIn(h);
    await h.admin`UPDATE app.sessions SET absolute_expires_at = now() - interval '1 minute', last_seen_at = now() WHERE user_id = ${id}::uuid`;
    await expectRejected(client);
  });

  it('sets the absolute expiry to 90 days and slides the idle window on use', async () => {
    const { client, id } = await signIn(h);
    const [row] = await h.admin`SELECT absolute_expires_at, created_at FROM app.sessions WHERE user_id = ${id}::uuid`;
    expect(Math.round(((row!.absolute_expires_at as Date).getTime() - (row!.created_at as Date).getTime()) / 86_400_000)).toBe(90);

    await h.admin`UPDATE app.sessions SET last_seen_at = now() - interval '29 days' WHERE user_id = ${id}::uuid`;
    expect((await client.get(`${API}/me`)).statusCode).toBe(200);
    const [after] = await h.admin`SELECT last_seen_at > now() - interval '1 minute' AS fresh FROM app.sessions WHERE user_id = ${id}::uuid`;
    expect(after!.fresh).toBe(true);
  });

  it('does not extend the absolute limit on use', async () => {
    const { client, id } = await signIn(h);
    await h.admin`UPDATE app.sessions SET last_seen_at = now() - interval '1 hour' WHERE user_id = ${id}::uuid`;
    const [before] = await h.admin`SELECT absolute_expires_at FROM app.sessions WHERE user_id = ${id}::uuid`;
    await client.get(`${API}/me`);
    const [after] = await h.admin`SELECT absolute_expires_at FROM app.sessions WHERE user_id = ${id}::uuid`;
    expect((after!.absolute_expires_at as Date).getTime()).toBe((before!.absolute_expires_at as Date).getTime());
  });
});

describe('listing and revoking', () => {
  it('lists own sessions with a coarse label and marks the current one', async () => {
    const first = await signIn(h);
    const android = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36';
    await signIn(h, first.email, { userAgent: android });
    const r = await first.client.get(`${API}/auth/sessions`);
    expect(r.statusCode).toBe(200);
    const items = r.json().items as unknown[];
    expect(items).toHaveLength(2);
    const parsed = items.map((i) => sessionResponse.strict().parse(i));
    expect(parsed.map((s) => s.deviceLabel).sort()).toEqual(['Chrome on Android', 'Safari on iPhone']);
    expect(parsed.filter((s) => s.current).map((s) => s.deviceLabel)).toEqual(['Safari on iPhone']);
  });

  it('does not store the User-Agent, its parts or the IP anywhere', async () => {
    const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 UniqueMarker/99 Version/18.0 Safari/605.1.15';
    await signIn(h, undefined, { userAgent, ip: '10.200.77.77' });
    const dump = JSON.stringify(await h.admin`SELECT s.id, encode(device_label_ct, 'escape') AS d FROM app.sessions s`);
    expect(dump).not.toContain('UniqueMarker');
    expect(dump).not.toContain('Safari');
    const columns = await h.admin`SELECT column_name FROM information_schema.columns WHERE table_schema = 'app'`;
    expect(columns.map((c) => c.column_name as string).filter((c) => /agent|\bip\b|_ip$|^ip_/.test(c))).toEqual([]);
  });

  it('revokes a session: it is rejected at once and other sessions keep working', async () => {
    const first = await signIn(h);
    const second = await signIn(h, first.email);
    const list = (await first.client.get(`${API}/auth/sessions`)).json().items as { id: string; current: boolean }[];
    const other = list.find((s) => !s.current)!;
    expect((await first.client.delete(`${API}/auth/sessions/${other.id}`)).statusCode).toBe(204);
    await expectRejected(second.client);
    expect((await first.client.get(`${API}/me`)).statusCode).toBe(200);
  });

  it('revoking the current session clears the cookie', async () => {
    const { client } = await signIn(h);
    const list = (await client.get(`${API}/auth/sessions`)).json().items as { id: string }[];
    const stale = client.cookie;
    const r = await client.delete(`${API}/auth/sessions/${list[0]!.id}`);
    expect(r.statusCode).toBe(204);
    expect(String(r.headers['set-cookie'])).toContain('__Host-session=;');
    client.cookie = stale;
    await expectRejected(client);
  });

  it("returns 404 for another user's session and leaves it alive", async () => {
    const a = await signIn(h);
    const b = await signIn(h);
    const bSession = ((await b.client.get(`${API}/auth/sessions`)).json().items as { id: string }[])[0]!.id;
    expect((await a.client.delete(`${API}/auth/sessions/${bSession}`)).statusCode).toBe(404);
    expect((await b.client.get(`${API}/me`)).statusCode).toBe(200);
    expect((await a.client.delete(`${API}/auth/sessions/not-a-uuid`)).statusCode).toBe(404);
  });

  it('logout ends this session only, is idempotent and audited', async () => {
    const first = await signIn(h);
    const second = await signIn(h, first.email);
    const stale = first.client.cookie;
    const r = await first.client.post(`${API}/auth/logout`);
    expect(r.statusCode).toBe(204);
    expect(first.client.cookie).toBeNull();
    first.client.cookie = stale;
    await expectRejected(first.client);
    expect((await first.client.post(`${API}/auth/logout`)).statusCode).toBe(204);
    expect((await second.client.get(`${API}/me`)).statusCode).toBe(200);
  });

  it('logout-all ends every session of this user only', async () => {
    const first = await signIn(h);
    const second = await signIn(h, first.email);
    const unrelated = await signIn(h);
    expect((await first.client.post(`${API}/auth/logout-all`)).statusCode).toBe(204);
    await expectRejected(second.client);
    expect((await unrelated.client.get(`${API}/me`)).statusCode).toBe(200);
  });

  it('accepts a logout sent with a JSON content type and an empty body, and rejects junk bodies', async () => {
    const { client } = await signIn(h);
    const junk = await client.post(`${API}/auth/logout`, { surprise: true });
    expect(junk.statusCode).toBe(400);
    const r = await client.request({ method: 'POST', url: `${API}/auth/logout`, headers: { 'content-type': 'application/json' } });
    expect(r.statusCode).toBe(204);
  });
});

describe('device labels', () => {
  it.each([
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1', 'Safari on iPhone'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/131.0 Mobile/15E148 Safari/604.1', 'Chrome on iPhone'],
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36', 'Chrome on Android'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0', 'Edge on Windows'],
    ['Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0', 'Firefox on Linux'],
    ['Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36', 'Samsung Internet on Android'],
    ['curl/8.0', 'Unknown device'],
    [undefined, 'Unknown device'],
  ])('%s', (ua, label) => {
    expect(deviceLabel(ua)).toBe(label);
  });
});
