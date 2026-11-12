import { createHash, randomBytes } from 'node:crypto';
import { CONSENT_VERSION } from '@anxiocare/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { emailBlindIndex } from '../src/crypto.ts';
import { emailQuotaKey, loginQuotaKey, otpTarget, consumeOtp } from '../src/otp.ts';
import { API, baseEnv, CapturingMailer, Client, consentPayload, createHarness, requestCode, signIn, signInConsented, uniqueEmail, type Harness } from './helpers.ts';

const PASSWORD = 'river stone quiet morning';
const OTHER_PASSWORD = 'mango season on the terrace';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

const sentTo = (email: string, purpose?: string) => h.mailer.sent.filter((m) => m.to === email && (!purpose || m.purpose === purpose));
const strip = (body: string) => {
  const { requestId: _r, ...rest } = JSON.parse(body) as Record<string, unknown>;
  return rest;
};
/** Everything a caller can compare, apart from the values that differ on every response anyway. */
const observable = (r: { statusCode: number; body: string; headers: Record<string, unknown> }) => {
  const { date: _d, 'x-ratelimit-remaining': _x, 'x-ratelimit-reset': _y, 'x-ratelimit-limit': _z, ...headers } = r.headers;
  return { status: r.statusCode, body: r.body ? strip(r.body) : null, headers };
};

async function register(email = uniqueEmail('reg'), password = PASSWORD, client = new Client(h), displayName = 'Asha') {
  const asked = await client.post(`${API}/auth/register/request`, { email });
  if (asked.statusCode !== 202) throw new Error(`register request failed: ${asked.statusCode}`);
  await h.app.drainBackground();
  const code = h.mailer.codeFor(email, 'register');
  const done = await client.post(`${API}/auth/register/verify`, { email, code, password, displayName });
  if (done.statusCode !== 200) throw new Error(`register verify failed: ${done.statusCode} ${done.body}`);
  return { client, email, id: done.json().id as string, password };
}

const login = (email: string, password: string, client = new Client(h)) => client.post(`${API}/auth/login`, { email, password });
const hashOf = async (email: string) => {
  const [row] = await h.admin<{ password_hash: string | null }[]>`SELECT password_hash FROM app.users WHERE email_hash = ${emailBlindIndex(h.config.keys, email)}`;
  return row?.password_hash ?? null;
};
const userCount = async (email: string) => {
  const [row] = await h.admin<{ n: number }[]>`SELECT count(*)::int AS n FROM app.users WHERE email_hash = ${emailBlindIndex(h.config.keys, email)}`;
  return row!.n;
};
const failures = async (email: string) => {
  const [row] = await h.admin<{ n: number }[]>`SELECT count(*)::int AS n FROM app.login_failures WHERE quota_hash = ${loginQuotaKey(h.config.keys, email)}`;
  return row!.n;
};
/** Fills an address's overall daily cap, as failures from many clients would. */
const fillOverallCap = (email: string, n = 100) =>
  h.admin`INSERT INTO app.login_failures (quota_hash, source_hash) SELECT ${loginQuotaKey(h.config.keys, email)}, sha256(gen_random_uuid()::text::bytea) FROM generate_series(1, ${n}::int)`;
/** Steps past the in-memory per-minute limit on sign-in attempts from one client, so a daily cap can be seen alone. */
const aMinuteLater = () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.now() + 61_000);
};
const sessionsOf = async (id: string) => {
  const [row] = await h.admin<{ n: number }[]>`SELECT count(*)::int AS n FROM app.sessions WHERE user_id = ${id}::uuid`;
  return row!.n;
};

describe('create account: request', () => {
  it('mails a register code to a new address and stores nothing about the account', async () => {
    const email = uniqueEmail('new');
    const r = await new Client(h).post(`${API}/auth/register/request`, { email });
    expect(r.statusCode).toBe(202);
    expect(r.body).toBe('');
    await h.app.drainBackground();
    expect(h.mailer.codeFor(email, 'register')).toMatch(/^\d{6}$/);
    expect(await userCount(email)).toBe(0);
  });

  it('an existing address is told so, 409 account_exists, and nothing is mailed', async () => {
    const { email } = await register();
    h.mailer.sent.length = 0;
    h.logs.length = 0;
    const taken = await new Client(h).post(`${API}/auth/register/request`, { email });
    expect(taken.statusCode).toBe(409);
    expect(taken.json().code).toBe('account_exists');
    expect(taken.body).not.toContain(email);
    await h.app.drainBackground();
    expect(h.mailer.sent.filter((m) => m.to === email)).toEqual([]);
    expect(h.logs.join('\n')).not.toContain(email);
  });

  it('a new address still gets 202 and its code, mailed after the response', async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    h.mailer.hook = () => gate;
    const email = uniqueEmail('slow');
    const fresh = await new Client(h).post(`${API}/auth/register/request`, { email });
    expect(fresh.statusCode).toBe(202);
    release();
    h.mailer.hook = async () => {};
    await h.app.drainBackground();
    expect(h.mailer.codeFor(email, 'register')).toMatch(/^\d{6}$/);
  });

  it('counts the same quota for an existing address as for a new one, so it cannot be checked in bulk past it', async () => {
    const { email } = await register();
    const fresh = uniqueEmail('quota');
    const client = new Client(h);
    const takenStatuses: number[] = [];
    const freshStatuses: number[] = [];
    for (let i = 0; i < 7; i += 1) {
      takenStatuses.push((await client.post(`${API}/auth/register/request`, { email })).statusCode);
      freshStatuses.push((await client.post(`${API}/auth/register/request`, { email: fresh })).statusCode);
    }
    await h.app.drainBackground();
    // Five an hour from one client, for either kind; past that, the same quiet 202 for both, and nothing is mailed.
    expect(takenStatuses).toEqual([409, 409, 409, 409, 409, 202, 202]);
    expect(freshStatuses).toEqual([202, 202, 202, 202, 202, 202, 202]);
    expect(sentTo(fresh, 'register')).toHaveLength(5);
    // Counted as rows, the same way as a new address's codes: one from creating the account, then five.
    const [row] = await h.admin<{ n: number }[]>`SELECT count(*)::int AS n FROM app.otp_codes WHERE purpose = 'register' AND email_hash = ${emailBlindIndex(h.config.keys, email)}`;
    expect(row!.n).toBe(6);
  });

  it('rejects a malformed address before anything else', async () => {
    const r = await new Client(h).post(`${API}/auth/register/request`, { email: 'not-an-address' });
    expect(r.statusCode).toBe(400);
    expect(r.json().code).toBe('validation_failed');
  });
});

describe('create account: verify', () => {
  it('creates the account, stores an Argon2id PHC string, starts a session and leaves consent for later', async () => {
    const email = uniqueEmail('created');
    const client = new Client(h);
    await client.post(`${API}/auth/register/request`, { email });
    await h.app.drainBackground();
    const r = await client.post(`${API}/auth/register/verify`, { email, code: h.mailer.codeFor(email, 'register'), password: PASSWORD, displayName: 'Asha' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ email, displayName: 'Asha', consentRequired: true, acceptedConsentVersion: null });
    expect(r.body).not.toContain('password');
    expect(client.cookie).toBeTruthy();
    expect((await client.get(`${API}/me`)).statusCode).toBe(200);
    const hash = await hashOf(email);
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=\d+,t=\d+,p=\d+\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/);
    const [, , , params] = hash!.split('$');
    const [m, t, p] = params!.split(',').map((kv) => Number(kv.split('=')[1]));
    expect(m).toBeGreaterThanOrEqual(19456);
    expect(t).toBeGreaterThanOrEqual(2);
    expect(p).toBeGreaterThanOrEqual(1);
    expect(hash).not.toContain(PASSWORD);
  });

  it('refuses an account with no name, echoing nothing back, and leaves the code to use with one', async () => {
    const email = uniqueEmail('noname');
    const client = new Client(h);
    await client.post(`${API}/auth/register/request`, { email });
    await h.app.drainBackground();
    const code = h.mailer.codeFor(email, 'register');
    const long = 'NameMarker'.repeat(7);
    for (const displayName of [undefined, null, '', '   ', long]) {
      const r = await client.post(`${API}/auth/register/verify`, { email, code, password: PASSWORD, ...(displayName === undefined ? {} : { displayName }) });
      expect(r.statusCode, JSON.stringify(displayName)).toBe(400);
      expect(r.json().code).toBe('validation_failed');
      expect(r.json().fieldErrors.displayName).toHaveLength(1);
      expect(r.body).not.toContain('NameMarker');
      expect(r.body).not.toContain(PASSWORD);
      expect(r.body).not.toContain(email);
    }
    expect(await userCount(email)).toBe(0);
    expect(client.cookie).toBeNull();
    const done = await client.post(`${API}/auth/register/verify`, { email, code, password: PASSWORD, displayName: '  Asha  ' });
    expect(done.statusCode).toBe(200);
    expect(done.json().displayName).toBe('Asha');
  });

  it('a wrong code creates nothing', async () => {
    const email = uniqueEmail('wrongcode');
    const client = new Client(h);
    await client.post(`${API}/auth/register/request`, { email });
    await h.app.drainBackground();
    const code = h.mailer.codeFor(email, 'register');
    const r = await client.post(`${API}/auth/register/verify`, { email, code: code === '000000' ? '111111' : '000000', password: PASSWORD, displayName: 'Asha' });
    expect(r.statusCode).toBe(400);
    expect(r.json().code).toBe('invalid_code');
    expect(await userCount(email)).toBe(0);
    expect(client.cookie).toBeNull();
  });

  it('checks the password rules before the code, so a refused password does not burn the code', async () => {
    const email = uniqueEmail('policy');
    const client = new Client(h);
    await client.post(`${API}/auth/register/request`, { email });
    await h.app.drainBackground();
    const code = h.mailer.codeFor(email, 'register');
    for (const bad of ['password1234', `${email.split('@')[0]}-long-enough`, 'short']) {
      const r = await client.post(`${API}/auth/register/verify`, { email, code, password: bad, displayName: 'Asha' });
      expect(r.statusCode).toBe(400);
      expect(r.json().code).toBe('validation_failed');
      expect(r.json().fieldErrors.password).toHaveLength(1);
      expect(r.body).not.toContain(bad);
    }
    expect((await client.post(`${API}/auth/register/verify`, { email, code, password: PASSWORD, displayName: 'Asha' })).statusCode).toBe(200);
  });

  it('a code from before the account existed cannot set a password on it, or sign in to it', async () => {
    const email = uniqueEmail('race');
    const late = new Client(h);
    await late.post(`${API}/auth/register/request`, { email });
    await h.app.drainBackground();
    const code = h.mailer.codeFor(email, 'register');
    // The address gets its account another way while that code is live.
    const { client: first } = await signIn(h, email);
    expect(first.cookie).toBeTruthy();
    const r = await late.post(`${API}/auth/register/verify`, { email, code, password: PASSWORD, displayName: 'Asha' });
    expect(r.statusCode).toBe(400);
    expect(r.json().code).toBe('invalid_code');
    expect(late.cookie).toBeNull();
    expect(await hashOf(email)).toBeNull();
    expect(await userCount(email)).toBe(1);
  });

  it('an attacker cannot pre-hijack an address: asking for a code stores nothing, and the real owner is unaffected', async () => {
    const email = uniqueEmail('prehijack');
    const attacker = new Client(h);
    await attacker.post(`${API}/auth/register/request`, { email });
    await h.app.drainBackground();
    expect(await userCount(email)).toBe(0);
    expect((await login(email, OTHER_PASSWORD, attacker)).json().code).toBe('invalid_credentials');

    const owner = await signIn(h, email);
    expect(owner.client.cookie).toBeTruthy();
    expect((await login(email, OTHER_PASSWORD, attacker)).json().code).toBe('invalid_credentials');
  });

  it('two tabs racing the same code make one account', async () => {
    const email = uniqueEmail('tabs');
    const client = new Client(h);
    await client.post(`${API}/auth/register/request`, { email });
    await h.app.drainBackground();
    const code = h.mailer.codeFor(email, 'register');
    const results = await Promise.all([1, 2, 3].map(() => new Client(h).post(`${API}/auth/register/verify`, { email, code, password: PASSWORD, displayName: 'Asha' })));
    expect(results.filter((r) => r.statusCode === 200)).toHaveLength(1);
    expect(await userCount(email)).toBe(1);
  });
});

describe('sign in with a password', () => {
  it('signs in with a new token each time, audits it and sends the sign-in notice', async () => {
    const { email } = await register();
    h.mailer.sent.length = 0;
    const one = new Client(h);
    const r = await login(email, PASSWORD, one);
    expect(r.statusCode).toBe(200);
    expect(r.json().email).toBe(email);
    expect(r.body).not.toContain('password');
    const two = new Client(h);
    await login(email, PASSWORD, two);
    expect(one.cookie).not.toBe(two.cookie);
    await h.app.drainBackground();
    expect(sentTo(email, 'new_signin_notice')).toHaveLength(2);
  });

  it('address case and surrounding spaces do not matter; password case and spaces do', async () => {
    const { email } = await register();
    expect((await login(`  ${email.toUpperCase()} `, PASSWORD)).statusCode).toBe(200);
    expect((await login(email, PASSWORD.toUpperCase())).statusCode).toBe(400);
    expect((await login(email, ` ${PASSWORD}`)).statusCode).toBe(400);
  });

  it('unknown address, no password set and wrong password are identical in status, headers and body', async () => {
    const { email } = await register();
    const { email: codeOnly } = await signIn(h);
    const wrong = await login(email, OTHER_PASSWORD);
    const unknown = await login(uniqueEmail('nobody'), OTHER_PASSWORD);
    const noPassword = await login(codeOnly, OTHER_PASSWORD);
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json().code).toBe('invalid_credentials');
    expect(observable(unknown)).toEqual(observable(wrong));
    expect(observable(noPassword)).toEqual(observable(wrong));
    expect(wrong.headers['set-cookie']).toBeUndefined();
  });

  it('runs a real hash for an unknown address and for one with no password', async () => {
    const { email: codeOnly } = await signIn(h);
    const before = h.app.passwords.stats.verifications;
    await login(uniqueEmail('dummy'), OTHER_PASSWORD);
    expect(h.app.passwords.stats.verifications).toBe(before + 1);
    await login(codeOnly, OTHER_PASSWORD);
    expect(h.app.passwords.stats.verifications).toBe(before + 2);
  });

  it('timing: unknown and wrong-password take about as long, and both far longer than a refusal that hashes nothing', async () => {
    const { email } = await register();
    const median = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
    const time = async (run: () => Promise<unknown>) => {
      const started = performance.now();
      await run();
      return performance.now() - started;
    };
    const known: number[] = [];
    const unknown: number[] = [];
    // Alternating, so a slow moment for the machine lands on both. The address's failures are cleared to keep it below the cap.
    for (let i = 0; i < 7; i += 1) {
      known.push(await time(() => login(email, OTHER_PASSWORD)));
      unknown.push(await time(() => login(uniqueEmail('timing'), OTHER_PASSWORD)));
      await h.admin`DELETE FROM app.login_failures WHERE quota_hash = ${loginQuotaKey(h.config.keys, email)}`;
    }
    const capped = uniqueEmail('capped-timing');
    await fillOverallCap(capped);
    const refusals: number[] = [];
    for (let i = 0; i < 7; i += 1) refusals.push(await time(() => login(capped, OTHER_PASSWORD)));
    const [k, u, c] = [median(known), median(unknown), median(refusals)];
    expect(u / k, `known ${k}ms, unknown ${u}ms`).toBeGreaterThan(0.5);
    expect(u / k, `known ${k}ms, unknown ${u}ms`).toBeLessThan(2);
    expect(u, `refusal ${c}ms, unknown ${u}ms`).toBeGreaterThan(c);
  });

  it('after 10 failures from one client in a day, even the right password from it gets the same answer, and nothing is evaluated', async () => {
    const { email } = await register();
    const attacker = new Client(h);
    const wrong = await login(email, OTHER_PASSWORD, attacker);
    for (let i = 0; i < 9; i += 1) await login(email, OTHER_PASSWORD, attacker);
    expect(await failures(email)).toBe(10);

    aMinuteLater();
    try {
      const before = h.app.passwords.stats.verifications;
      const refused = await login(email, PASSWORD, attacker);
      expect(observable(refused)).toEqual(observable(wrong));
      expect(h.app.passwords.stats.verifications).toBe(before);
      expect(await failures(email)).toBe(10);
    } finally {
      vi.useRealTimers();
    }
    // Another client is unaffected, and failures older than a day stop counting.
    expect((await login(email, PASSWORD)).statusCode).toBe(200);
    await h.admin`UPDATE app.login_failures SET created_at = now() - interval '25 hours' WHERE quota_hash = ${loginQuotaKey(h.config.keys, email)}`;
    aMinuteLater();
    try {
      expect((await login(email, PASSWORD, attacker)).statusCode).toBe(200);
    } finally {
      vi.useRealTimers();
    }
  });

  it('after 100 failures a day from anywhere, a new device gets the same answer even with the right password', async () => {
    const { email } = await register();
    const wrong = await login(email, OTHER_PASSWORD);
    await fillOverallCap(email, 99);
    const before = h.app.passwords.stats.verifications;
    const refused = await login(email, PASSWORD);
    expect(observable(refused)).toEqual(observable(wrong));
    expect(h.app.passwords.stats.verifications).toBe(before);
  });

  it('caps an unknown address the same way, so the cap cannot tell who has an account', async () => {
    const email = uniqueEmail('unknown-cap');
    await fillOverallCap(email);
    const before = h.app.passwords.stats.verifications;
    expect((await login(email, OTHER_PASSWORD)).json().code).toBe('invalid_credentials');
    expect(h.app.passwords.stats.verifications).toBe(before);
  });

  it('holds the overall cap under a parallel burst from many clients', async () => {
    const { email } = await register();
    await fillOverallCap(email, 95);
    const before = h.app.passwords.stats.verifications;
    const results = await Promise.all(Array.from({ length: 16 }, () => login(email, OTHER_PASSWORD)));
    expect(results.every((r) => [400, 429].includes(r.statusCode))).toBe(true);
    expect(await failures(email)).toBeLessThanOrEqual(100);
    expect(h.app.passwords.stats.verifications - before).toBeLessThanOrEqual(5);
  });

  it('spellings of one inbox share the cap', async () => {
    const base = uniqueEmail('tagged');
    const [local, domain] = base.split('@');
    for (let i = 0; i < 10; i += 1) await login(`${local}+${i}@${domain}`, OTHER_PASSWORD);
    expect(await failures(base)).toBe(10);
  });

  it('a success does not clear earlier failures, so its owner signing in cannot refill an attacker\'s allowance', async () => {
    const { email } = await register();
    for (let i = 0; i < 3; i += 1) await login(email, OTHER_PASSWORD);
    expect((await login(email, PASSWORD)).statusCode).toBe(200);
    expect(await failures(email)).toBe(3);
  });

  it('has a per-client route limit', async () => {
    const client = new Client(h);
    let last = 0;
    for (let i = 0; i < 61; i += 1) last = (await login(uniqueEmail('flood'), 'x', client)).statusCode;
    expect(last).toBe(429);
  });

  it('the wrong-password answer is not a 401, which the client treats as a lost session', async () => {
    const { email } = await register();
    expect((await login(email, OTHER_PASSWORD)).statusCode).not.toBe(401);
  });

  it('a hash cannot be checked without the pepper', async () => {
    const { email } = await register();
    const otherConfig = loadConfig(baseEnv({ DATABASE_URL: h.dbUrl('runtime') }));
    const other = await buildApp({ config: { ...h.config, keys: { ...h.config.keys, passwordPepper: otherConfig.keys.passwordPepper } }, sql: h.runtime, mailer: new CapturingMailer() });
    await other.ready();
    const r = await other.inject({
      method: 'POST',
      url: `${API}/auth/login`,
      remoteAddress: '10.99.1.1',
      headers: { origin: 'https://app.test', 'x-anxiocare-csrf': '1' },
      payload: { email, password: PASSWORD },
    });
    expect(r.statusCode).toBe(400);
    await other.close();
  });
});

describe('password hashing under load', () => {
  it('the semaphore never runs more than its limit, and sheds what will not fit', async () => {
    const before = h.app.passwords.stats;
    h.app.passwords.resetPeak();
    const results = await Promise.all(Array.from({ length: 120 }, () => login(uniqueEmail('burst'), OTHER_PASSWORD)));
    const { peak, limit, queueLimit } = h.app.passwords.stats;
    expect(limit).toBeGreaterThanOrEqual(1);
    expect(limit).toBeLessThanOrEqual(4);
    expect(peak).toBeLessThanOrEqual(limit);
    expect(peak).toBeGreaterThan(0);
    const counted = results.reduce<Record<number, number>>((acc, r) => ({ ...acc, [r.statusCode]: (acc[r.statusCode] ?? 0) + 1 }), {});
    expect(Object.keys(counted).sort()).toEqual(['400', '429']);
    expect(counted[400]! + counted[429]!).toBe(120);
    expect(counted[400]!).toBeGreaterThanOrEqual(limit);
    expect(counted[400]!).toBeLessThanOrEqual(limit + queueLimit + 100);
    expect(before.limit).toBe(limit);
    const shed = results.find((r) => r.statusCode === 429)!;
    expect(shed.json().code).toBe('rate_limited');
  });

  it('a request shed for load does not spend its address\'s failure budget', async () => {
    const victim = uniqueEmail('shed');
    const filler = Array.from({ length: 80 }, () => login(uniqueEmail('filler'), OTHER_PASSWORD));
    const mine = Array.from({ length: 5 }, () => login(victim, OTHER_PASSWORD));
    const results = await Promise.all([...filler, ...mine]);
    const answered = results.slice(80).filter((r) => r.statusCode === 400).length;
    expect(await failures(victim)).toBe(answered);
  });
});

describe('rehash when parameters are raised', () => {
  it('upgrades the stored hash after a successful sign-in, and only then', async () => {
    const { email } = await register();
    const original = await hashOf(email);
    expect(original).toContain('m=19456,t=2,p=1');

    const raised = loadConfig(baseEnv({ DATABASE_URL: h.dbUrl('runtime'), PASSWORD_ARGON2_MEMORY_KIB: '20000', PASSWORD_ARGON2_PASSES: '3' }));
    const mailer = new CapturingMailer();
    const app = await buildApp({ config: { ...raised, keys: h.config.keys, passwordHash: raised.passwordHash }, sql: h.runtime, mailer });
    await app.ready();
    const attempt = (password: string, ip: string) => app.inject({
      method: 'POST',
      url: `${API}/auth/login`,
      remoteAddress: ip,
      headers: { origin: 'https://app.test', 'x-anxiocare-csrf': '1' },
      payload: { email, password },
    });

    expect((await attempt(OTHER_PASSWORD, '10.98.1.1')).statusCode).toBe(400);
    await app.drainBackground();
    expect(await hashOf(email)).toBe(original);

    expect((await attempt(PASSWORD, '10.98.1.2')).statusCode).toBe(200);
    await app.drainBackground();
    const upgraded = await hashOf(email);
    expect(upgraded).toContain('m=20000,t=3,p=1');

    // The new hash works, on the old parameters' server too: they live in the string.
    expect((await attempt(PASSWORD, '10.98.1.3')).statusCode).toBe(200);
    expect((await login(email, PASSWORD)).statusCode).toBe(200);
    await app.close();
  });

  it('never rewrites a hash that is already at or above the current parameters', async () => {
    const { email } = await register();
    const original = await hashOf(email);
    await login(email, PASSWORD);
    await h.app.drainBackground();
    expect(await hashOf(email)).toBe(original);
  });

  it('refuses parameters below the OWASP minimum at boot', () => {
    expect(() => loadConfig(baseEnv({ PASSWORD_ARGON2_MEMORY_KIB: '4096' }))).toThrow(/PASSWORD_ARGON2_MEMORY_KIB/);
    expect(() => loadConfig(baseEnv({ PASSWORD_ARGON2_PASSES: '1' }))).toThrow(/PASSWORD_ARGON2_PASSES/);
  });
});

describe('forgot password', () => {
  it('always answers 202 identically; only an existing account gets a code', async () => {
    const { email } = await register();
    h.mailer.sent.length = 0;
    const nobody = uniqueEmail('nobody');
    const a = await new Client(h).post(`${API}/auth/password/forgot`, { email });
    const b = await new Client(h).post(`${API}/auth/password/forgot`, { email: nobody });
    expect(a.statusCode).toBe(202);
    expect(observable(a)).toEqual(observable(b));
    await h.app.drainBackground();
    expect(h.mailer.codeFor(email, 'password_reset')).toMatch(/^\d{6}$/);
    expect(sentTo(nobody)).toEqual([]);
    expect(await userCount(nobody)).toBe(0);
  });

  const forgot = async (email: string) => {
    await new Client(h).post(`${API}/auth/password/forgot`, { email });
    await h.app.drainBackground();
    return h.mailer.codeFor(email, 'password_reset');
  };

  it('reset sets the hash, revokes every session, mails a notice, audits it and starts one new session', async () => {
    const { client: phone, email, id } = await register();
    const laptop = new Client(h);
    await login(email, PASSWORD, laptop);
    expect(await sessionsOf(id)).toBe(2);
    h.mailer.sent.length = 0;

    const code = await forgot(email);
    const client = new Client(h);
    const r = await client.post(`${API}/auth/password/reset`, { email, code, password: OTHER_PASSWORD });
    expect(r.statusCode).toBe(200);
    expect(r.json().email).toBe(email);
    expect(client.cookie).toBeTruthy();

    expect((await phone.get(`${API}/me`)).statusCode).toBe(401);
    expect((await laptop.get(`${API}/me`)).statusCode).toBe(401);
    expect((await client.get(`${API}/me`)).statusCode).toBe(200);
    expect(await sessionsOf(id)).toBe(1);

    await h.app.drainBackground();
    const [notice] = sentTo(email, 'password_changed_notice');
    expect(notice!.code).toBeNull();
    expect((await login(email, PASSWORD)).statusCode).toBe(400);
    expect((await login(email, OTHER_PASSWORD)).statusCode).toBe(200);
    const [audit] = await h.admin<{ n: number }[]>`SELECT count(*)::int AS n FROM app.audit_log WHERE action = 'password_reset'`;
    expect(audit!.n).toBeGreaterThan(0);
  });

  it('a reset ends a lockout from failed sign-ins', async () => {
    const { email } = await register();
    for (let i = 0; i < 10; i += 1) await login(email, OTHER_PASSWORD);
    const code = await forgot(email);
    await new Client(h).post(`${API}/auth/password/reset`, { email, code, password: OTHER_PASSWORD });
    expect(await failures(email)).toBe(0);
    expect((await login(email, OTHER_PASSWORD)).statusCode).toBe(200);
  });

  it('a wrong code changes nothing and says only invalid_code', async () => {
    const { client, email } = await register();
    const before = await hashOf(email);
    const code = await forgot(email);
    const r = await new Client(h).post(`${API}/auth/password/reset`, { email, code: code === '000000' ? '111111' : '000000', password: OTHER_PASSWORD });
    expect(r.statusCode).toBe(400);
    expect(r.json().code).toBe('invalid_code');
    expect(await hashOf(email)).toBe(before);
    expect((await client.get(`${API}/me`)).statusCode).toBe(200);
  });

  it('checks the password rules before spending the code', async () => {
    const { email } = await register();
    const code = await forgot(email);
    const bad = await new Client(h).post(`${API}/auth/password/reset`, { email, code, password: 'password1234' });
    expect(bad.json().code).toBe('validation_failed');
    expect((await new Client(h).post(`${API}/auth/password/reset`, { email, code, password: OTHER_PASSWORD })).statusCode).toBe(200);
  });

  it('a code-only or Google-only account can use it to get a password', async () => {
    const { email } = await signIn(h);
    const code = await forgot(email);
    expect((await new Client(h).post(`${API}/auth/password/reset`, { email, code, password: PASSWORD })).statusCode).toBe(200);
    expect((await login(email, PASSWORD)).statusCode).toBe(200);
  });

  it('is single use', async () => {
    const { email } = await register();
    const code = await forgot(email);
    expect((await new Client(h).post(`${API}/auth/password/reset`, { email, code, password: OTHER_PASSWORD })).statusCode).toBe(200);
    expect((await new Client(h).post(`${API}/auth/password/reset`, { email, code, password: 'a third password here' })).statusCode).toBe(400);
  });

  it('the consent gate still applies after a reset', async () => {
    const { client, email } = await register();
    expect((await client.get(`${API}/assessments`)).statusCode).toBe(403);
    const code = await forgot(email);
    const next = new Client(h);
    const r = await next.post(`${API}/auth/password/reset`, { email, code, password: OTHER_PASSWORD });
    expect(r.json().consentRequired).toBe(true);
    expect((await next.get(`${API}/assessments`)).statusCode).toBe(403);
  });
});

describe('change a password in Settings', () => {
  it('needs the current one; on success keeps this session, ends the others, mails a notice and audits', async () => {
    const { client, email, id } = await register();
    const other = new Client(h);
    await login(email, PASSWORD, other);
    h.mailer.sent.length = 0;
    const r = await client.post(`${API}/me/password`, { currentPassword: PASSWORD, password: OTHER_PASSWORD });
    expect(r.statusCode).toBe(204);
    expect((await client.get(`${API}/me`)).statusCode).toBe(200);
    expect((await other.get(`${API}/me`)).statusCode).toBe(401);
    expect(await sessionsOf(id)).toBe(1);
    await h.app.drainBackground();
    expect(sentTo(email, 'password_changed_notice')).toHaveLength(1);
    expect((await login(email, OTHER_PASSWORD)).statusCode).toBe(200);
    const [audit] = await h.admin<{ n: number }[]>`SELECT count(*)::int AS n FROM app.audit_log WHERE action = 'password_change'`;
    expect(audit!.n).toBeGreaterThan(0);
  });

  it('a wrong current password changes nothing, ends no session, and counts against the failure cap', async () => {
    const { client, email } = await register();
    const before = await hashOf(email);
    const r = await client.post(`${API}/me/password`, { currentPassword: OTHER_PASSWORD, password: 'a third password here' });
    expect(r.statusCode).toBe(400);
    expect(r.json().code).toBe('invalid_credentials');
    expect(await hashOf(email)).toBe(before);
    expect((await client.get(`${API}/me`)).statusCode).toBe(200);
    expect(await failures(email)).toBe(1);
  });

  it('a borrowed phone cannot grind through passwords past the cap', async () => {
    const { client, email } = await register();
    for (let i = 0; i < 10; i += 1) await client.post(`${API}/me/password`, { currentPassword: `guess number ${i}`, password: OTHER_PASSWORD });
    const before = h.app.passwords.stats.verifications;
    const r = await client.post(`${API}/me/password`, { currentPassword: PASSWORD, password: OTHER_PASSWORD });
    expect(r.json().code).toBe('invalid_credentials');
    expect(h.app.passwords.stats.verifications).toBe(before);
    expect(await hashOf(email)).not.toBeNull();
  });

  it('applies the password rules and needs a session', async () => {
    const { client } = await register();
    const bad = await client.post(`${API}/me/password`, { currentPassword: PASSWORD, password: 'password1234' });
    expect(bad.json().code).toBe('validation_failed');
    expect((await new Client(h).post(`${API}/me/password`, { currentPassword: PASSWORD, password: OTHER_PASSWORD })).statusCode).toBe(401);
  });

  it('works before consent', async () => {
    const { client } = await register();
    expect((await client.get(`${API}/assessments`)).statusCode).toBe(403);
    expect((await client.post(`${API}/me/password`, { currentPassword: PASSWORD, password: OTHER_PASSWORD })).statusCode).toBe(204);
  });
});

describe('set a password in Settings', () => {
  const codeFor = async (client: Client, email: string) => {
    const asked = await client.post(`${API}/me/password/set/request`);
    expect(asked.statusCode).toBe(202);
    await h.app.drainBackground();
    return h.mailer.codeFor(email, 'password_set');
  };

  it('a code-only account proves its inbox, then gets a password; other sessions end, a notice goes out, and it is audited', async () => {
    const { client, email, id } = await signIn(h);
    const other = await signIn(h, email);
    h.mailer.sent.length = 0;
    const code = await codeFor(client, email);
    const r = await client.post(`${API}/me/password/set`, { code, password: PASSWORD });
    expect(r.statusCode).toBe(204);
    expect((await client.get(`${API}/me`)).statusCode).toBe(200);
    expect((await other.client.get(`${API}/me`)).statusCode).toBe(401);
    expect(await sessionsOf(id)).toBe(1);
    await h.app.drainBackground();
    expect(sentTo(email, 'password_changed_notice')).toHaveLength(1);
    expect((await login(email, PASSWORD)).statusCode).toBe(200);
    const [audit] = await h.admin<{ n: number }[]>`SELECT count(*)::int AS n FROM app.audit_log WHERE action = 'password_set'`;
    expect(audit!.n).toBeGreaterThan(0);
  });

  it('cannot replace an existing password, so a borrowed phone cannot skip knowing the current one', async () => {
    const { client, email } = await register();
    expect((await client.post(`${API}/me/password/set/request`)).statusCode).toBe(409);
    await h.app.drainBackground();
    expect(sentTo(email, 'password_set')).toEqual([]);
    expect((await client.post(`${API}/me/password/set`, { code: '123456', password: OTHER_PASSWORD })).statusCode).toBe(409);
  });

  it('a wrong code sets nothing', async () => {
    const { client, email } = await signIn(h);
    const code = await codeFor(client, email);
    const r = await client.post(`${API}/me/password/set`, { code: code === '000000' ? '111111' : '000000', password: PASSWORD });
    expect(r.json().code).toBe('invalid_code');
    expect(await hashOf(email)).toBeNull();
  });

  it("another person's session cannot use the code", async () => {
    const a = await signIn(h);
    const b = await signIn(h);
    const code = await codeFor(a.client, a.email);
    expect((await b.client.post(`${API}/me/password/set`, { code, password: PASSWORD })).statusCode).toBe(400);
    expect(await hashOf(b.email)).toBeNull();
    expect((await a.client.post(`${API}/me/password/set`, { code, password: PASSWORD })).statusCode).toBe(204);
  });

  it('needs a session, and works before consent', async () => {
    expect((await new Client(h).post(`${API}/me/password/set/request`)).statusCode).toBe(401);
    const { client, email } = await signIn(h);
    expect((await client.get(`${API}/assessments`)).statusCode).toBe(403);
    const code = await codeFor(client, email);
    expect((await client.post(`${API}/me/password/set`, { code, password: PASSWORD })).statusCode).toBe(204);
  });
});

describe('sign-in methods', () => {
  it('reports what the account has', async () => {
    const { client } = await register();
    expect((await client.get(`${API}/me/sign-in-methods`)).json()).toEqual({ password: true, google: false });
    const { client: codeOnly } = await signIn(h);
    expect((await codeOnly.get(`${API}/me/sign-in-methods`)).json()).toEqual({ password: false, google: false });
    expect((await new Client(h).get(`${API}/me/sign-in-methods`)).statusCode).toBe(401);
  });

  it('the export names the methods and never the hash', async () => {
    const { client, email } = await register();
    await client.post(`${API}/me/consent`, consentPayload);
    const body = (await client.get(`${API}/me/export`)).json();
    expect(body.signInMethods).toEqual({ password: true, google: false });
    const raw = JSON.stringify(body);
    expect(raw).not.toContain('argon2');
    expect(raw).not.toContain((await hashOf(email))!.split('$').at(-1));
  });

  it('GET /me and every other account answer never carries the hash', async () => {
    const { client } = await register();
    expect((await client.get(`${API}/me`)).body).not.toMatch(/argon2|password/);
    expect((await client.post(`${API}/me/consent`, consentPayload)).body).not.toMatch(/argon2|password/);
    expect((await client.get(`${API}/auth/sessions`)).body).not.toMatch(/argon2|password/);
    expect(CONSENT_VERSION).toBeTruthy();
  });
});

describe('code purposes are not interchangeable', () => {
  /** Live codes of every purpose, for one signed-in address. */
  async function allCodes() {
    const { client, email, id } = await signInConsented(h);
    const newEmail = uniqueEmail('moved');
    h.mailer.sent = h.mailer.sent.filter((m) => m.to !== email);
    await new Client(h).post(`${API}/auth/otp/request`, { email });
    await new Client(h).post(`${API}/auth/password/forgot`, { email });
    await client.post(`${API}/me/password/set/request`);
    await client.post(`${API}/me/delete/request`);
    await client.post(`${API}/me/email/request`, { newEmail });
    await h.app.drainBackground();
    const codes = {
      login: h.mailer.codeFor(email, 'login'),
      password_reset: h.mailer.codeFor(email, 'password_reset'),
      password_set: h.mailer.codeFor(email, 'password_set'),
      account_delete: h.mailer.codeFor(email, 'account_delete'),
      email_change_current: h.mailer.codeFor(email, 'email_change_current'),
      email_change: h.mailer.codeFor(newEmail, 'email_change'),
    };
    return { client, email, id, newEmail, codes };
  }
  type Purpose = 'login' | 'register' | 'password_reset' | 'password_set' | 'account_delete' | 'email_change_current' | 'email_change';

  /** Each route, given a code. Every call must come back invalid_code unless the code is its own purpose's. */
  const routes = (s: Awaited<ReturnType<typeof allCodes>>) =>
    ({
      login: (code: string) => new Client(h).post(`${API}/auth/otp/verify`, { email: s.email, code }),
      register: (code: string) => new Client(h).post(`${API}/auth/register/verify`, { email: s.email, code, password: PASSWORD, displayName: 'Asha' }),
      password_reset: (code: string) => new Client(h).post(`${API}/auth/password/reset`, { email: s.email, code, password: PASSWORD }),
      password_set: (code: string) => s.client.post(`${API}/me/password/set`, { code, password: PASSWORD }),
      account_delete: (code: string) => s.client.post(`${API}/me/delete/confirm`, { code }),
      email_change: (code: string) => s.client.post(`${API}/me/email/verify`, { newEmail: s.newEmail, code, currentCode: s.codes.email_change_current }),
      email_change_current: (code: string) => s.client.post(`${API}/me/email/verify`, { newEmail: s.newEmail, code: s.codes.email_change, currentCode: code }),
    }) satisfies Record<Purpose, (code: string) => Promise<unknown>>;

  const purposes: Purpose[] = ['login', 'register', 'password_reset', 'password_set', 'account_delete', 'email_change_current', 'email_change'];
  const codePurposes = ['login', 'password_reset', 'password_set', 'account_delete', 'email_change_current', 'email_change'] as const;

  for (const from of codePurposes) {
    for (const to of purposes) {
      if (from === to) continue;
      it(`a ${from} code is refused by ${to}`, async () => {
        const s = await allCodes();
        // A matching digit string is possible by chance, one time in a million per pair. Re-draw instead of flaking.
        if (s.codes[from] === (s.codes as Record<string, string>)[to]) return;
        const r = await routes(s)[to](s.codes[from]) as { statusCode: number; json: () => { code: string } };
        expect(r.statusCode).toBe(400);
        expect(r.json().code).toBe('invalid_code');
        expect(await hashOf(s.email)).toBeNull();
        expect(await userCount(s.email)).toBe(1);
      });
    }
  }

  it('a register code is refused by sign-in, reset and the rest', async () => {
    const email = uniqueEmail('regcode');
    await new Client(h).post(`${API}/auth/register/request`, { email });
    await h.app.drainBackground();
    const code = h.mailer.codeFor(email, 'register');
    expect((await new Client(h).post(`${API}/auth/otp/verify`, { email, code })).json().code).toBe('invalid_code');
    expect((await new Client(h).post(`${API}/auth/password/reset`, { email, code, password: PASSWORD })).json().code).toBe('invalid_code');
    const { client } = await signIn(h);
    expect((await client.post(`${API}/me/password/set`, { code, password: PASSWORD })).json().code).toBe('invalid_code');
    expect((await client.post(`${API}/me/delete/confirm`, { code })).json().code).toBe('invalid_code');
    expect(await userCount(email)).toBe(0);
    expect((await new Client(h).post(`${API}/auth/register/verify`, { email, code, password: PASSWORD, displayName: 'Asha' })).statusCode).toBe(200);
  });

  it('the database refuses a purpose it does not know, and a subject that does not fit the purpose', async () => {
    const insert = (purpose: string, subject: string | null) => h.admin`
      INSERT INTO app.otp_codes (purpose, email_hash, quota_hash, source_hash, subject_user_id, code_hmac, expires_at)
      VALUES (${purpose}, ${randomBytes(32)}, ${randomBytes(32)}, ${randomBytes(32)}, ${subject}::uuid, ${randomBytes(32)}, now())
    `;
    const { id } = await signIn(h);
    await expect(insert('nonsense', null)).rejects.toThrow();
    await expect(insert('register', id)).rejects.toThrow();
    await expect(insert('password_reset', id)).rejects.toThrow();
    await expect(insert('password_set', null)).rejects.toThrow();
    await expect(insert('register', null)).resolves.toBeDefined();
    await expect(insert('password_set', id)).resolves.toBeDefined();
  });
});

describe('the failed-guess cap', () => {
  const wrong = (code: string) => (code === '000000' ? '111111' : '000000');
  const count = async (email: string) => {
    const [row] = await h.admin<{ n: number }[]>`SELECT count(*)::int AS n FROM app.otp_failures WHERE quota_hash = ${emailQuotaKey(h.config.keys, email)}`;
    return row!.n;
  };
  const askReset = async (email: string) => {
    await new Client(h).post(`${API}/auth/password/forgot`, { email });
    await h.app.drainBackground();
    return h.mailer.codeFor(email, 'password_reset');
  };

  it('stops every purpose at 20 in a rolling day: the right code then gets the same answer, unevaluated', async () => {
    const { email } = await register();
    let code = await askReset(email);
    for (let i = 0; i < 20; i += 1) {
      // Five tries per code, so a fresh code every so often, as an attacker would have to.
      if (i > 0 && i % 5 === 0) {
        h.mailer.sent.length = 0;
        await h.admin`DELETE FROM app.otp_codes WHERE quota_hash = ${emailQuotaKey(h.config.keys, email)} AND created_at < now()`;
        code = await askReset(email);
      }
      const miss = await new Client(h).post(`${API}/auth/password/reset`, { email, code: wrong(code), password: OTHER_PASSWORD });
      expect(miss.json().code).toBe('invalid_code');
    }
    expect(await count(email)).toBe(20);
    await h.admin`DELETE FROM app.otp_codes WHERE quota_hash = ${emailQuotaKey(h.config.keys, email)}`;
    code = await askReset(email);

    const before = await hashOf(email);
    const refused = await new Client(h).post(`${API}/auth/password/reset`, { email, code, password: OTHER_PASSWORD });
    expect(refused.statusCode).toBe(400);
    expect(refused.json().code).toBe('invalid_code');
    expect(await hashOf(email)).toBe(before);
    expect(await count(email)).toBe(20);
    const [row] = await h.admin<{ attempts: number }[]>`SELECT attempts FROM app.otp_codes WHERE quota_hash = ${emailQuotaKey(h.config.keys, email)} AND consumed_at IS NULL`;
    expect(row!.attempts).toBe(0);

    await h.admin`UPDATE app.otp_failures SET created_at = now() - interval '25 hours' WHERE quota_hash = ${emailQuotaKey(h.config.keys, email)}`;
    expect((await new Client(h).post(`${API}/auth/password/reset`, { email, code, password: OTHER_PASSWORD })).statusCode).toBe(200);
  });

  it('is per address: one address at its cap leaves others alone', async () => {
    const { email } = await register();
    const other = await register();
    await h.admin`INSERT INTO app.otp_failures (quota_hash, purpose) SELECT ${emailQuotaKey(h.config.keys, email)}, 'password_reset' FROM generate_series(1, 20)`;
    const code = await askReset(other.email);
    expect((await new Client(h).post(`${API}/auth/password/reset`, { email: other.email, code, password: OTHER_PASSWORD })).statusCode).toBe(200);
  });

  it.each(['login', 'password_reset', 'register'])('sign-in, reset and register codes draw on one budget, since each one hands over an account: spent on %s', async (spent) => {
    // The spec's yearly odds only hold if an attacker cannot simply work two purposes side by side.
    const { email } = await signIn(h);
    await h.admin`INSERT INTO app.otp_failures (quota_hash, purpose) SELECT ${emailQuotaKey(h.config.keys, email)}, ${spent} FROM generate_series(1, 20)`;
    const code = await askReset(email);
    expect((await new Client(h).post(`${API}/auth/password/reset`, { email, code, password: OTHER_PASSWORD })).statusCode).toBe(400);
    const loginCode = await requestCode(h, new Client(h), email);
    expect((await new Client(h).post(`${API}/auth/otp/verify`, { email, code: loginCode })).statusCode).toBe(400);
  });

  it('splitting guesses between two purposes gets no more than 20 in all', async () => {
    const { email } = await register();
    const quota = emailQuotaKey(h.config.keys, email);
    await h.admin`INSERT INTO app.otp_failures (quota_hash, purpose) SELECT ${quota}, 'login' FROM generate_series(1, 10)`;
    await h.admin`INSERT INTO app.otp_failures (quota_hash, purpose) SELECT ${quota}, 'password_reset' FROM generate_series(1, 10)`;
    const code = await askReset(email);
    expect((await new Client(h).post(`${API}/auth/password/reset`, { email, code, password: OTHER_PASSWORD })).statusCode).toBe(400);
  });

  it('signed-in purposes keep a budget each, so anonymous guessing cannot block a person\'s own deletion or password', async () => {
    const { client, email } = await signIn(h);
    const quota = emailQuotaKey(h.config.keys, email);
    await h.admin`INSERT INTO app.otp_failures (quota_hash, purpose) SELECT ${quota}, 'login' FROM generate_series(1, 20)`;
    await client.post(`${API}/me/password/set/request`);
    await h.app.drainBackground();
    expect((await client.post(`${API}/me/password/set`, { code: h.mailer.codeFor(email, 'password_set'), password: PASSWORD })).statusCode).toBe(204);
  });

  it('a capped purpose refuses through the same internal check for every route', async () => {
    const { email, id } = await signIn(h);
    const quota = emailQuotaKey(h.config.keys, email);
    await h.admin`INSERT INTO app.otp_failures (quota_hash, purpose) SELECT ${quota}, 'password_set' FROM generate_series(1, 20)`;
    const target = otpTarget(h.config.keys, 'password_set', email, id);
    expect(await consumeOtp(h.runtime, h.config.keys, target, '123456')).toBe(false);
  });
});

describe('mail wording', () => {
  it('nothing new names the service or its subject', async () => {
    const { otpMail, passwordChangedNotice, googleLinkedNotice, googleUnlinkedNotice } = await import('../src/mail.ts');
    const mails = [
      ...(['register', 'password_reset', 'password_set'] as const).map((p) => otpMail('a@example.com', p, '123456')),
      passwordChangedNotice('a@example.com'),
      googleLinkedNotice('a@example.com'),
      googleUnlinkedNotice('a@example.com'),
    ];
    for (const mail of mails) {
      expect(`${mail.subject} ${mail.text}`, mail.purpose).not.toMatch(/anxi|health|mental|gad|screen|therap|mood|journal|check-in|wellness|care\b/i);
    }
  });

  it('prints a code in two groups and states its lifetime', async () => {
    const { otpMail } = await import('../src/mail.ts');
    expect(otpMail('a@example.com', 'password_reset', '123456').text).toContain('123 456');
    expect(otpMail('a@example.com', 'password_reset', '123456').text).toMatch(/10 minutes/);
  });
});

describe('the password never reaches a log or an error body', () => {
  const MARK = 'LogMarkerPassw0rd horse';

  it('across every endpoint and failure', async () => {
    h.logs.length = 0;
    const email = uniqueEmail('never-logged');
    const client = new Client(h);
    const bodies: string[] = [];
    const send = async (url: string, body: unknown) => {
      const r = await client.post(`${API}${url}`, body);
      bodies.push(r.body);
      return r;
    };
    await send('/auth/register/request', { email });
    await h.app.drainBackground();
    const code = h.mailer.codeFor(email, 'register');
    await send('/auth/register/verify', { email, code: code === '000000' ? '111111' : '000000', password: MARK, displayName: 'Asha' });
    await send('/auth/register/verify', { email, code, password: `${MARK}`.slice(0, 5), displayName: 'Asha' });
    await send('/auth/register/verify', { email, code, password: 12345, displayName: MARK });
    await send('/auth/register/verify', { email, code, password: MARK, extra: MARK, displayName: 'Asha' });
    await send('/auth/register/verify', { email, code, password: MARK, displayName: 'Asha' });
    await send('/auth/login', { email, password: `${MARK}-wrong` });
    await send('/auth/login', { email, password: `${MARK}-wrong`, [MARK]: 1 });
    await send('/auth/login', { password: MARK });
    await send('/auth/login', { email, password: MARK });
    await send('/me/password', { currentPassword: `${MARK}-wrong`, password: `${MARK}-2` });
    await send('/me/password', { currentPassword: MARK, password: 'password1234' });
    await send('/auth/password/forgot', { email });
    await h.app.drainBackground();
    await send('/auth/password/reset', { email, code: '000000', password: MARK });
    // Not even a body that fails to parse.
    const broken = await client.request({
      method: 'POST',
      url: `${API}/auth/login`,
      headers: { 'content-type': 'application/json' },
      payload: `{"email":"${email}","password":"${MARK}"`,
    });
    bodies.push(broken.body);
    const huge = await client.post(`${API}/auth/login`, { email, password: `${MARK}${'x'.repeat(70_000)}` });
    bodies.push(huge.body);
    await h.app.drainBackground();

    const written = h.logs.join('\n');
    expect(written.length).toBeGreaterThan(0);
    for (const secret of [MARK, 'LogMarker', email, code, 'password1234', 'argon2']) {
      expect(written, secret).not.toContain(secret);
    }
    for (const body of bodies) expect(body).not.toContain('LogMarker');
  });

  it('logs nothing from a hashing failure but its class', async () => {
    h.logs.length = 0;
    const email = uniqueEmail('corrupt');
    const { id } = await register(email);
    await h.admin`UPDATE app.users SET password_hash = '$argon2id$v=19$m=19456,t=2,p=1$bad$bad' WHERE id = ${id}::uuid`;
    const r = await login(email, MARK);
    expect([400, 500]).toContain(r.statusCode);
    expect(r.body).not.toContain(MARK);
    expect(h.logs.join('\n')).not.toContain(MARK);
  });
});

describe('data at rest', () => {
  it('stores only hashes for failures and no plaintext address anywhere new', async () => {
    const email = uniqueEmail('atrest');
    await login(email, OTHER_PASSWORD);
    const rows = await h.admin`SELECT * FROM app.login_failures WHERE quota_hash = ${loginQuotaKey(h.config.keys, email)}`;
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]!).sort()).toEqual(['created_at', 'device_id', 'id', 'quota_hash', 'source_hash']);
    expect((rows[0]!.source_hash as Buffer).length).toBe(32);
    expect(JSON.stringify(rows)).not.toContain(email);
    expect(createHash('sha256').update(email).digest().equals(rows[0]!.quota_hash as Buffer)).toBe(false);
  });
});
