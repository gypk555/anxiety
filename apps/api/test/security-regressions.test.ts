// Regression tests for the second security review (2026-11-07). Each block started as one of the reviewer's attack
// scripts, which only printed what happened; these assert that the attack now fails. See docs/testing/TEST-REPORT.md.
import { chmodSync, mkdtempSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FakeOidc, FAKE_CLIENT_ID, FAKE_CLIENT_SECRET, type TokenTweaks } from '../scripts/fake-oidc.ts';
import { loadConfig } from '../src/config.ts';
import { emailBlindIndex } from '../src/crypto.ts';
import { DEVICE_COOKIE_SECURE } from '../src/devices.ts';
import { emailQuotaKey, loginQuotaKey } from '../src/otp.ts';
import { ensureSecrets } from '../src/setup.ts';
import { API, baseEnv, Client, createHarness, ORIGIN, uniqueEmail, type Harness } from './helpers.ts';

const PW = 'river stone quiet morning';
const NEW_PW = 'another quiet morning walk';
const ATTACKER_PW = 'attacker owns this now';

let h: Harness;
let provider: FakeOidc;
beforeAll(async () => {
  provider = await new FakeOidc().start();
  h = await createHarness({ GOOGLE_CLIENT_ID: FAKE_CLIENT_ID, GOOGLE_CLIENT_SECRET: FAKE_CLIENT_SECRET, GOOGLE_OIDC_BASE_URL: provider.base });
});
afterAll(async () => {
  await h.close();
  await provider.stop();
});

let ipc = 0;
/** A browser for the Google round trip: holds every cookie, as the reviewer's script did. */
class Browser {
  cookies = new Map<string, string>();
  ip = `10.66.${(++ipc >> 8) & 255}.${ipc & 255}`;
  async request(method: 'GET' | 'POST' | 'DELETE', url: string, payload?: object) {
    const headers: Record<string, string> = this.cookies.size ? { cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ') } : {};
    if (method !== 'GET') Object.assign(headers, { origin: ORIGIN, 'x-anxiocare-csrf': '1' });
    const r = await h.app.inject({ method, url, remoteAddress: this.ip, headers, ...(payload ? { payload } : {}) });
    for (const c of r.cookies as { name: string; value: string; expires?: Date }[]) {
      if (c.value === '' || (c.expires && c.expires.getTime() < Date.now())) this.cookies.delete(c.name);
      else this.cookies.set(c.name, c.value);
    }
    return r;
  }
  get(url: string) {
    return this.request('GET', url);
  }
  async google(tweaks: TokenTweaks) {
    const s = await this.get(`${API}/auth/google/start`);
    const back = new URL(provider.approve(s.headers.location as string, tweaks));
    return this.get(`${back.pathname}${back.search}`);
  }
  /** Connect from Settings: the API hands back the provider URL, and the browser goes there. */
  async connect(tweaks: TokenTweaks) {
    const r = await this.request('POST', `${API}/me/identities/google/connect`);
    if (r.statusCode !== 200) return r;
    const back = new URL(provider.approve(r.json().url as string, tweaks));
    return this.get(`${back.pathname}${back.search}`);
  }
}

async function register(email: string, client = new Client(h)) {
  await client.post(`${API}/auth/register/request`, { email });
  await h.app.drainBackground();
  const r = await client.post(`${API}/auth/register/verify`, { email, code: h.mailer.codeFor(email, 'register'), password: PW });
  expect(r.statusCode).toBe(200);
  return { client, id: r.json().id as string };
}

/** A Browser signed in by password, so it holds a session and a device cookie and has just authenticated. */
async function browserWithPassword(email: string) {
  await register(email);
  const b = new Browser();
  const r = await b.request('POST', `${API}/auth/login`, { email, password: PW });
  expect(r.statusCode).toBe(200);
  return b;
}

const identities = async (id: string) => (await h.admin<{ n: number }[]>`SELECT count(*)::int AS n FROM app.user_identities WHERE user_id = ${id}::uuid`)[0]!.n;
const userIdOf = async (email: string) => (await h.admin<{ id: string }[]>`SELECT id FROM app.users WHERE email_hash = ${emailBlindIndex(h.config.keys, email)}`)[0]?.id;
const sentTo = (email: string, purpose: string) => h.mailer.sent.filter((m) => m.to === email && m.purpose === purpose);
/** Ages a session's last re-authentication past the window. */
const staleReauth = () => h.admin`UPDATE app.sessions SET reauth_at = now() - interval '11 minutes'`;

describe('finding 1: Google account takeover by matching email', () => {
  it('a Google login with the victim address and another subject is refused, with nothing linked and no session', async () => {
    const email = uniqueEmail('victim');
    const { id } = await register(email);
    const b = new Browser();
    const r = await b.google({ email, sub: 'attacker-sub-1' });
    expect(r.statusCode).toBe(302);
    expect(r.headers.location).toBe('/sign-in?error=google_link');
    expect((await b.get(`${API}/me`)).statusCode).toBe(401);
    expect(await identities(id)).toBe(0);
    expect(sentTo(email, 'google_linked_notice')).toHaveLength(0);
  });

  it('the same is true for an account created by email code, which has no password', async () => {
    const email = uniqueEmail('codeonly');
    const c = new Client(h);
    await c.post(`${API}/auth/otp/request`, { email });
    await h.app.drainBackground();
    expect((await c.post(`${API}/auth/otp/verify`, { email, code: h.mailer.codeFor(email) })).statusCode).toBe(200);
    const r = await new Browser().google({ email, sub: 'attacker-sub-2' });
    expect(r.headers.location).toBe('/sign-in?error=google_link');
    expect(await identities((await userIdOf(email))!)).toBe(0);
  });

  it('pre-hijack: a Google login cannot create an account for an address its owner has not yet used, unless Google hosts it', async () => {
    const victim = uniqueEmail('prehijack');
    const r = await new Browser().google({ email: victim, sub: 'attacker-made-google-account' });
    expect(r.headers.location).toBe('/sign-in?error=google_new');
    expect(await userIdOf(victim)).toBeUndefined();
    // The owner can still create the account by email, and the attacker's Google login stays a stranger to it.
    const { id } = await register(victim);
    expect((await new Browser().google({ email: victim, sub: 'attacker-made-google-account' })).headers.location).toBe('/sign-in?error=google_link');
    expect(await identities(id)).toBe(0);
  });

  it('a new account comes from Google only for gmail.com, googlemail.com, or a token with an hd claim', async () => {
    const plain = uniqueEmail('plain');
    const refused = await new Browser().google({ email: plain });
    expect(refused.headers.location).toBe('/sign-in?error=google_new');
    expect(await userIdOf(plain)).toBeUndefined();

    for (const email of [`g-${Date.now()}@gmail.com`, `gm-${Date.now()}@googlemail.com`]) {
      const b = new Browser();
      expect((await b.google({ email })).headers.location).toBe('/consent?next=%2F');
      expect((await b.get(`${API}/me`)).json().email).toBe(email);
    }
    const workspace = uniqueEmail('workspace');
    const w = new Browser();
    expect((await w.google({ email: workspace, hd: 'example.com' })).headers.location).toBe('/consent?next=%2F');
    expect(await userIdOf(workspace)).toBeDefined();
  });

  it('connecting needs a recent re-authentication, then links from Settings, bound to that session', async () => {
    const email = uniqueEmail('connect');
    const b = await browserWithPassword(email);
    const id = (await userIdOf(email))!;

    await staleReauth();
    const blocked = await b.request('POST', `${API}/me/identities/google/connect`);
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().code).toBe('reauth_required');

    const wrong = await b.request('POST', `${API}/me/reauth/password`, { password: 'not the password at all' });
    expect(wrong.statusCode).toBe(400);
    expect((await b.request('POST', `${API}/me/reauth/password`, { password: PW })).statusCode).toBe(204);

    const done = await b.connect({ email: 'any-google-address@gmail.com', sub: 'owner-sub-connect' });
    expect(done.statusCode).toBe(302);
    expect(done.headers.location).toBe('/settings?google=connected');
    expect(await identities(id)).toBe(1);
    await h.app.drainBackground();
    expect(sentTo(email, 'google_linked_notice')).toHaveLength(1);

    // That Google account now signs in to this account.
    const later = new Browser();
    await later.google({ email: 'any-google-address@gmail.com', sub: 'owner-sub-connect' });
    expect((await later.get(`${API}/me`)).json().id).toBe(id);
  });

  it('a connect callback is refused when its session has ended, and in a browser that did not start it', async () => {
    const email = uniqueEmail('connect-bound');
    const b = await browserWithPassword(email);
    const id = (await userIdOf(email))!;
    const start = await b.request('POST', `${API}/me/identities/google/connect`);
    expect(start.statusCode).toBe(200);
    const back = new URL(provider.approve(start.json().url as string, { sub: 'bound-sub', email: 'bound@gmail.com' }));

    const other = new Browser();
    const elsewhere = await other.get(`${back.pathname}${back.search}`);
    expect(elsewhere.headers.location).toMatch(/^\/(sign-in|settings)\?/);
    expect(await identities(id)).toBe(0);

    await h.admin`DELETE FROM app.sessions WHERE user_id = ${id}::uuid`;
    const ended = await b.get(`${back.pathname}${back.search}`);
    expect(ended.headers.location).toBe('/settings?google=failed');
    expect(await identities(id)).toBe(0);
  });

  it('a code-only account re-authenticates by email code, and can then connect and disconnect', async () => {
    const email = uniqueEmail('code-reauth');
    const b = new Browser();
    await b.request('POST', `${API}/auth/otp/request`, { email });
    await h.app.drainBackground();
    await b.request('POST', `${API}/auth/otp/verify`, { email, code: h.mailer.codeFor(email) });
    await staleReauth();
    expect((await b.request('POST', `${API}/me/reauth/code/request`)).statusCode).toBe(202);
    await h.app.drainBackground();
    expect((await b.request('POST', `${API}/me/reauth/code`, { code: h.mailer.codeFor(email, 'reauth') })).statusCode).toBe(204);
    expect((await b.connect({ email: 'code-reauth@gmail.com', sub: 'code-reauth-sub' })).headers.location).toBe('/settings?google=connected');

    // Disconnecting needs no password, only a recent re-authentication.
    await staleReauth();
    expect((await b.request('DELETE', `${API}/me/identities/google`)).statusCode).toBe(403);
    await b.request('POST', `${API}/me/reauth/code/request`);
    await h.app.drainBackground();
    await b.request('POST', `${API}/me/reauth/code`, { code: h.mailer.codeFor(email, 'reauth') });
    expect((await b.request('DELETE', `${API}/me/identities/google`)).statusCode).toBe(204);
    expect(await identities((await userIdOf(email))!)).toBe(0);
  });

  it('a password reset removes every linked identity and mails a notice that Google was disconnected', async () => {
    const email = uniqueEmail('reset-unlinks');
    const b = await browserWithPassword(email);
    const id = (await userIdOf(email))!;
    await b.connect({ email: 'reset-unlinks@gmail.com', sub: 'reset-unlinks-sub' });
    expect(await identities(id)).toBe(1);

    const v = new Client(h);
    await v.post(`${API}/auth/password/forgot`, { email });
    await h.app.drainBackground();
    expect((await v.post(`${API}/auth/password/reset`, { email, code: h.mailer.codeFor(email, 'password_reset'), password: NEW_PW })).statusCode).toBe(200);
    expect(await identities(id)).toBe(0);
    await h.app.drainBackground();
    const [notice] = sentTo(email, 'google_unlinked_notice');
    expect(notice?.text).toMatch(/Google/);

    // The reviewer's second step: the old Google subject is now a stranger here.
    const again = new Browser();
    const r = await again.google({ email: 'attacker-new@gmail.com', sub: 'reset-unlinks-sub' });
    const me = await again.get(`${API}/me`);
    expect(me.statusCode === 200 && me.json().id === id).toBe(false);
    expect(r.statusCode).toBe(302);
  });
});

describe('finding 2: a password change racing a reset', () => {
  it('the attacker never ends up with the password, over 50 runs', async () => {
    const outcomes: string[] = [];
    for (let t = 0; t < 50; t += 1) {
      const email = uniqueEmail('race');
      const { client: attacker } = await register(email);
      const v = new Client(h);
      await v.post(`${API}/auth/password/forgot`, { email });
      await h.app.drainBackground();
      const code = h.mailer.codeFor(email, 'password_reset');
      const before = h.app.passwords.stats.verifications;
      const change = attacker.post(`${API}/me/password`, { currentPassword: PW, password: ATTACKER_PW });
      while (h.app.passwords.stats.verifications === before) await new Promise((r) => setImmediate(r));
      const reset = await v.post(`${API}/auth/password/reset`, { email, code, password: NEW_PW });
      const ch = await change;
      const victim = await v.get(`${API}/me`);
      const attackerLogin = await new Client(h).post(`${API}/auth/login`, { email, password: ATTACKER_PW });
      const victimLogin = await new Client(h).post(`${API}/auth/login`, { email, password: NEW_PW });
      outcomes.push(`${reset.statusCode}/${ch.statusCode}/${victim.statusCode}/${attackerLogin.statusCode}/${victimLogin.statusCode}`);
      expect(reset.statusCode).toBe(200);
      expect(attackerLogin.statusCode, outcomes.join(' ')).toBe(400);
      expect(victimLogin.statusCode).toBe(200);
      expect(victim.statusCode).toBe(200);
      // Either the change lost (401: its session was gone) or it committed first and the reset then replaced it (204).
      // In both orders the reset wins, and the attacker's session is over.
      expect([204, 401]).toContain(ch.statusCode);
      expect((await attacker.get(`${API}/me`)).statusCode).toBe(401);
    }
  }, 120_000);

  it('a change from a session that was revoked while the hash ran is a 401, and changes nothing', async () => {
    const email = uniqueEmail('revoked');
    const { client, id } = await register(email);
    const before = h.app.passwords.stats.verifications;
    const change = client.post(`${API}/me/password`, { currentPassword: PW, password: ATTACKER_PW });
    while (h.app.passwords.stats.verifications === before) await new Promise((r) => setImmediate(r));
    await h.admin`DELETE FROM app.sessions WHERE user_id = ${id}::uuid`;
    expect((await change).statusCode).toBe(401);
    expect((await new Client(h).post(`${API}/auth/login`, { email, password: PW })).statusCode).toBe(200);
  });
});

describe('finding 3: anyone can lock an owner out', () => {
  const login = (email: string, password: string, client = new Client(h)) => client.post(`${API}/auth/login`, { email, password });
  /** Past the per-minute limit on sign-in attempts from one client, which is in memory, so a daily cap can be seen alone. */
  const aMinuteLater = () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 61_000);
  };

  it('10 wrong passwords from many places do not stop the owner on a new device', async () => {
    const email = uniqueEmail('lock');
    await register(email);
    for (let i = 0; i < 10; i += 1) await login(email, `wrong password ${i}xx`);
    expect((await login(email, PW)).statusCode).toBe(200);
  });

  it('one source is capped at 10 for an address, and its refusal looks like any wrong password', async () => {
    const email = uniqueEmail('one-source');
    await register(email);
    const attacker = new Client(h);
    const wrong = await login(email, 'wrong password 0xx', attacker);
    for (let i = 1; i < 10; i += 1) await login(email, `wrong password ${i}xx`, attacker);
    expect((await login(email, PW, attacker)).statusCode, 'the per-minute limit comes first').toBe(429);
    aMinuteLater();
    const before = h.app.passwords.stats.verifications;
    const refused = await login(email, PW, attacker);
    vi.useRealTimers();
    expect(refused.statusCode).toBe(400);
    expect(refused.json().code).toBe(wrong.json().code);
    expect(h.app.passwords.stats.verifications).toBe(before);
    expect((await login(email, PW)).statusCode).toBe(200);
  });

  it('over the overall cap of 100 a day, a new device is refused but a known device still signs in', async () => {
    const email = uniqueEmail('overall');
    const { client: known } = await register(email);
    expect(known.device).not.toBeNull();
    await known.post(`${API}/auth/logout`);
    await h.admin`INSERT INTO app.login_failures (quota_hash, source_hash) SELECT ${loginQuotaKey(h.config.keys, email)}, sha256(gen_random_uuid()::text::bytea) FROM generate_series(1, 100)`;
    expect((await login(email, PW)).statusCode).toBe(400);
    expect((await login(email, PW, known)).statusCode).toBe(200);
  });

  it('a known device has its own cap: 10 wrong passwords an hour', async () => {
    const email = uniqueEmail('device-cap');
    const { client: known } = await register(email);
    await known.post(`${API}/auth/logout`);
    for (let i = 0; i < 10; i += 1) expect((await login(email, `wrong password ${i}xx`, known)).statusCode).toBe(400);
    aMinuteLater();
    const refused = await login(email, PW, known);
    vi.useRealTimers();
    expect(refused.statusCode).toBe(400);
    // Its own cap only: the address is not capped, so a new device still gets in.
    expect((await login(email, PW)).statusCode).toBe(200);
  });

  it('the reviewer\'s full lockout (20 code guesses and 10 passwords from many places): password still works on a new device, and everything works on a known one', async () => {
    const email = uniqueEmail('full');
    const { client: known } = await register(email);
    await known.post(`${API}/auth/logout`);
    for (let round = 0; round < 4; round += 1) {
      await new Client(h).post(`${API}/auth/otp/request`, { email });
      await h.app.drainBackground();
      const real = h.mailer.codeFor(email);
      for (let i = 0; i < 5; i += 1) {
        const guess = String((Number(real) + 1 + i) % 1e6).padStart(6, '0');
        await new Client(h).post(`${API}/auth/otp/verify`, { email, code: guess });
      }
    }
    for (let i = 0; i < 10; i += 1) await login(email, `wrong password ${i}xx`);

    expect((await login(email, PW)).statusCode, 'password, new device').toBe(200);

    await known.post(`${API}/auth/otp/request`, { email });
    await h.app.drainBackground();
    expect((await known.post(`${API}/auth/otp/verify`, { email, code: h.mailer.codeFor(email) })).statusCode, 'code, known device').toBe(200);
    await known.post(`${API}/auth/logout`);
    await known.post(`${API}/auth/password/forgot`, { email });
    await h.app.drainBackground();
    const reset = await known.post(`${API}/auth/password/reset`, { email, code: h.mailer.codeFor(email, 'password_reset'), password: NEW_PW });
    expect(reset.statusCode, 'reset, known device').toBe(200);
  });

  it('codes keep the 20-a-day address cap for a device never seen before, so the guessing odds do not rise; 5 per source', async () => {
    const email = uniqueEmail('code-cap');
    const { client: known } = await register(email);
    await known.post(`${API}/auth/logout`);
    const oneSource = new Client(h);
    for (let round = 0; round < 4; round += 1) {
      await new Client(h).post(`${API}/auth/otp/request`, { email });
      await h.app.drainBackground();
      const real = h.mailer.codeFor(email);
      for (let i = 0; i < 5; i += 1) {
        const guess = String((Number(real) + 1 + i) % 1e6).padStart(6, '0');
        await (round === 0 ? oneSource : new Client(h)).post(`${API}/auth/otp/verify`, { email, code: guess });
      }
    }
    const failures = await h.admin<{ n: number }[]>`SELECT count(*)::int AS n FROM app.otp_failures WHERE quota_hash = ${emailQuotaKey(h.config.keys, email)}`;
    expect(failures[0]!.n).toBe(20);
    const stranger = new Client(h);
    await stranger.post(`${API}/auth/otp/request`, { email });
    await h.app.drainBackground();
    expect((await stranger.post(`${API}/auth/otp/verify`, { email, code: h.mailer.codeFor(email) })).statusCode, 'new device, over the cap').toBe(400);
    await known.post(`${API}/auth/otp/request`, { email });
    await h.app.drainBackground();
    expect((await known.post(`${API}/auth/otp/verify`, { email, code: h.mailer.codeFor(email) })).statusCode, 'known device').toBe(200);
  });

  it('the device cookie is __Host-, HttpOnly, Secure, SameSite=Strict and long-lived; only an HMAC is stored', async () => {
    const email = uniqueEmail('cookie');
    const c = new Client(h);
    await c.post(`${API}/auth/register/request`, { email });
    await h.app.drainBackground();
    const r = await c.post(`${API}/auth/register/verify`, { email, code: h.mailer.codeFor(email, 'register'), password: PW });
    const cookie = (r.cookies as { name: string; value: string; httpOnly?: boolean; secure?: boolean; sameSite?: string; path?: string; maxAge?: number }[]).find((x) => x.name === DEVICE_COOKIE_SECURE)!;
    expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Strict', path: '/' });
    expect(cookie.maxAge).toBeGreaterThanOrEqual(180 * 24 * 3600);
    const stored = await h.admin.unsafe(`SELECT * FROM app.device_tokens`);
    expect(JSON.stringify(stored)).not.toContain(cookie.value);
    expect(stored.some((row) => (row.token_hmac as Buffer).length === 32)).toBe(true);
  });

  it('a reset revokes every device of that account; deleting the account revokes them too', async () => {
    const email = uniqueEmail('revoke-devices');
    const { client: known, id } = await register(email);
    await known.post(`${API}/auth/logout`);
    const v = new Client(h);
    await v.post(`${API}/auth/password/forgot`, { email });
    await h.app.drainBackground();
    await v.post(`${API}/auth/password/reset`, { email, code: h.mailer.codeFor(email, 'password_reset'), password: NEW_PW });
    const devices = async () => (await h.admin<{ n: number }[]>`SELECT count(*)::int AS n FROM app.device_tokens WHERE user_id = ${id}::uuid`)[0]!.n;
    expect(await devices()).toBe(1); // the browser that reset
    await h.admin`INSERT INTO app.login_failures (quota_hash, source_hash) SELECT ${loginQuotaKey(h.config.keys, email)}, sha256(gen_random_uuid()::text::bytea) FROM generate_series(1, 100)`;
    expect((await login(email, NEW_PW, known)).statusCode, 'the old device is a stranger now').toBe(400);

    await v.post(`${API}/me/delete/request`);
    await h.app.drainBackground();
    await v.post(`${API}/me/delete/confirm`, { code: h.mailer.codeFor(email, 'account_delete') });
    expect(await devices()).toBe(0);
  });
});

describe('finding 4: an Argon2 flood shuts everyone out', () => {
  it('a known device signs in through a flood of 40 strangers', async () => {
    const email = uniqueEmail('sat');
    const { client: owner } = await register(email);
    await owner.post(`${API}/auth/logout`);
    // Long enough for the bucket to refill after earlier tests.
    await new Promise((r) => setTimeout(r, 1600));
    const flood = Array.from({ length: 40 }, (_, i) => new Client(h).post(`${API}/auth/login`, { email: uniqueEmail('f'), password: `flood flood ${i}` }));
    await new Promise((r) => setImmediate(r));
    const mine = owner.post(`${API}/auth/login`, { email, password: PW });
    const results = await Promise.all(flood);
    expect((await mine).statusCode).toBe(200);
    expect(results.filter((r) => r.statusCode === 429).length).toBeGreaterThan(0);
  });

  it('with both general slots busy and the queue full, a stranger is shed and a known device still gets the kept slot', async () => {
    const email = uniqueEmail('reserved');
    const { client: owner } = await register(email);
    await owner.post(`${API}/auth/logout`);
    await new Promise((r) => setTimeout(r, 1600));
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    const { generalLimit, queueLimit } = h.app.passwords.stats;
    const occupying = Array.from({ length: generalLimit + queueLimit }, () => h.app.passwords.withSlot(() => held));
    await new Promise((r) => setImmediate(r));
    expect(h.app.passwords.stats.queued).toBe(queueLimit);
    try {
      const stranger = await new Client(h).post(`${API}/auth/login`, { email, password: PW });
      expect(stranger.statusCode).toBe(429);
      const known = await owner.post(`${API}/auth/login`, { email, password: PW });
      expect(known.statusCode).toBe(200);
    } finally {
      release();
      await Promise.all(occupying);
    }
  });

  it('one /64 gets 10 sign-in attempts a minute before anything is hashed', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 12; i += 1) {
      const c = new Client(h, { ip: `2001:db8:77:1::${i + 1}` });
      statuses.push((await c.post(`${API}/auth/login`, { email: uniqueEmail('v6'), password: `nope nope ${i}zz` })).statusCode);
    }
    expect(statuses.slice(0, 10).every((s) => s === 400)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
  });

  it('never runs more than three hashes at once, one of them kept for known devices', () => {
    expect(h.app.passwords.stats.limit).toBe(3);
    expect(h.app.passwords.stats.generalLimit).toBe(2);
  });

  it('caps PASSWORD_ARGON2_MEMORY_KIB at 65536, so three hashes stay under 200 MB', () => {
    expect(() => loadConfig(baseEnv({ PASSWORD_ARGON2_MEMORY_KIB: '65537' }))).toThrow(/PASSWORD_ARGON2_MEMORY_KIB/);
    expect(loadConfig(baseEnv({ PASSWORD_ARGON2_MEMORY_KIB: '65536' })).passwordHash.memory).toBe(65536);
  });

  it('timing stays the same for a password account, a code-only account and an unknown address', async () => {
    const withPw = uniqueEmail('tp');
    await register(withPw);
    const noPw = uniqueEmail('np');
    const cl = new Client(h);
    await cl.post(`${API}/auth/otp/request`, { email: noPw });
    await h.app.drainBackground();
    await cl.post(`${API}/auth/otp/verify`, { email: noPw, code: h.mailer.codeFor(noPw) });
    const t: Record<string, number[]> = { pw: [], nopw: [], unk: [] };
    for (let i = 0; i < 9; i += 1) {
      for (const [k, e] of [['pw', withPw], ['nopw', noPw], ['unk', uniqueEmail('u')]] as const) {
        const s = performance.now();
        await new Client(h).post(`${API}/auth/login`, { email: e, password: `nope nope ${i}zz` });
        t[k]!.push(performance.now() - s);
      }
    }
    const median = (a: number[]) => a.sort((x, y) => x - y)[4]!;
    const [a, b, c] = [median(t.pw!), median(t.nopw!), median(t.unk!)];
    const spread = Math.max(a, b, c) / Math.min(a, b, c);
    expect(spread, `pw ${a.toFixed(1)} nopw ${b.toFixed(1)} unknown ${c.toFixed(1)}`).toBeLessThan(1.5);
  });
});

describe('minor items', () => {
  it('login_failures and otp_codes key the same address under different HMACs, so the tables cannot be joined', async () => {
    const email = uniqueEmail('join');
    await new Client(h).post(`${API}/auth/login`, { email, password: 'wrong password 1xx' });
    await new Client(h).post(`${API}/auth/otp/request`, { email });
    await h.app.drainBackground();
    const joined = await h.admin`SELECT 1 FROM app.login_failures l JOIN app.otp_codes o ON o.quota_hash = l.quota_hash`;
    expect(joined).toHaveLength(0);
    expect(loginQuotaKey(h.config.keys, email).equals(emailQuotaKey(h.config.keys, email))).toBe(false);
  });

  it('setup writes the secrets file 0600, and fixes the mode of one that exists', () => {
    const dir = mkdtempSync(join(tmpdir(), 'secrets-mode-'));
    const fresh = join(dir, 'new.env');
    ensureSecrets(fresh, 'postgres://admin:pw@db.example.com:5432/postgres');
    expect(statSync(fresh).mode & 0o777).toBe(0o600);

    const loose = join(dir, 'loose.env');
    writeFileSync(loose, '# by hand\n');
    chmodSync(loose, 0o644);
    ensureSecrets(loose, 'postgres://admin:pw@db.example.com:5432/postgres');
    expect(statSync(loose).mode & 0o777).toBe(0o600);

    const complete = join(dir, 'complete.env');
    writeFileSync(complete, '');
    ensureSecrets(complete, 'postgres://admin:pw@db.example.com:5432/postgres');
    chmodSync(complete, 0o640);
    ensureSecrets(complete, 'postgres://admin:pw@db.example.com:5432/postgres');
    expect(statSync(complete).mode & 0o777).toBe(0o600);
  });
});
