import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { OTP_LENGTH, formatOtp } from '@anxiocare/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.ts';
import { DecryptError, emailBlindIndex, open, openText, seal, aad, sealText } from '../src/crypto.ts';
import { emailQuotaKey } from '../src/otp.ts';
import { rateKey, classifyIp } from '../src/client-ip.ts';
import { API, Client, ORIGIN, assessmentPayload, baseEnv, createHarness, journalPayload, requestCode, signIn, signInConsented, uniqueEmail, type Harness } from './helpers.ts';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

const wrong = (code: string) => (code === '0'.repeat(OTP_LENGTH) ? '1'.repeat(OTP_LENGTH) : '0'.repeat(OTP_LENGTH));
const sentTo = (to: string, purpose?: string) => h.mailer.sent.filter((m) => m.to === to && (!purpose || m.purpose === purpose));

async function startEmailChange(client: Client, current: string, newEmail: string) {
  expect((await client.post(`${API}/me/email/request`, { newEmail })).statusCode).toBe(202);
  await h.app.drainBackground();
  return { code: h.mailer.codeFor(newEmail, 'email_change'), currentCode: h.mailer.codeFor(current, 'email_change_current') };
}

describe('1. email change needs both inboxes', () => {
  it('mails a code to each address, each labelled for its box', async () => {
    const { client, email } = await signInConsented(h);
    const newEmail = uniqueEmail('both');
    await startEmailChange(client, email, newEmail);
    expect(sentTo(email, 'email_change_current')[0]!.text).toMatch(/current/i);
    expect(sentTo(newEmail, 'email_change')[0]!.text).toMatch(/new/i);
  });

  it('refuses a session plus the new-address code alone: the shared-phone takeover', async () => {
    const { client, email } = await signInConsented(h);
    const attacker = uniqueEmail('attacker');
    const { code } = await startEmailChange(client, email, attacker);
    const missing = await client.post(`${API}/me/email/verify`, { newEmail: attacker, code });
    expect(missing.statusCode).toBe(400);
    expect(missing.json().code).toBe('validation_failed');
    const guessed = await client.post(`${API}/me/email/verify`, { newEmail: attacker, code, currentCode: wrong(code) });
    expect(guessed.statusCode).toBe(400);
    expect(guessed.json().code).toBe('invalid_code');
    expect((await client.get(`${API}/me`)).json().email).toBe(email);
  });

  it('gives no hint about which code was wrong, and burns neither on a miss', async () => {
    const { client, email } = await signInConsented(h);
    const newEmail = uniqueEmail('oracle');
    const { code, currentCode } = await startEmailChange(client, email, newEmail);
    const strip = (body: string) => { const { requestId: _r, ...rest } = JSON.parse(body); return rest; };
    const a = await client.post(`${API}/me/email/verify`, { newEmail, code: wrong(code), currentCode });
    const b = await client.post(`${API}/me/email/verify`, { newEmail, code, currentCode: wrong(currentCode) });
    expect(a.statusCode).toBe(b.statusCode);
    expect(strip(a.body)).toEqual(strip(b.body));
    expect((await client.post(`${API}/me/email/verify`, { newEmail, code, currentCode })).statusCode).toBe(200);
    expect((await client.get(`${API}/me`)).json().email).toBe(newEmail);
  });

  it('binds the current-address code to the requested new address', async () => {
    const { client, email, id } = await signInConsented(h);
    const first = uniqueEmail('first');
    const { code, currentCode } = await startEmailChange(client, email, first);
    // The route supersedes on each request, so plant a live new-address code directly: the case binding exists for.
    const redirected = uniqueEmail('redirected');
    const { issueOtp, otpTarget } = await import('../src/otp.ts');
    const planted = await issueOtp(h.runtime, h.config.keys, otpTarget(h.config.keys, 'email_change', redirected, id), 'test');
    const r = await client.post(`${API}/me/email/verify`, { newEmail: redirected, code: planted, currentCode });
    expect(r.statusCode).toBe(400);
    expect(r.json().code).toBe('invalid_code');
    expect((await client.get(`${API}/me`)).json().email).toBe(email);
    expect((await client.post(`${API}/me/email/verify`, { newEmail: first, code, currentCode })).statusCode).toBe(200);
  });

  it('a current-address code issued for one new address cannot approve another', async () => {
    const { otpHmac } = await import('../src/crypto.ts');
    const hash = randomBytes(32);
    const base = { purpose: 'email_change_current', emailHash: hash, subjectUserId: randomUUID(), code: '123456' };
    const one = otpHmac(h.config.keys, { ...base, binding: randomBytes(32) });
    const two = otpHmac(h.config.keys, { ...base, binding: randomBytes(32) });
    expect(one.equals(two)).toBe(false);
  });

  it('binds both codes to the user: another session cannot use them', async () => {
    const a = await signInConsented(h);
    const b = await signInConsented(h);
    const newEmail = uniqueEmail('bound');
    const { code, currentCode } = await startEmailChange(a.client, a.email, newEmail);
    expect((await b.client.post(`${API}/me/email/verify`, { newEmail, code, currentCode })).statusCode).toBe(400);
    expect((await a.client.post(`${API}/me/email/verify`, { newEmail, code, currentCode })).statusCode).toBe(200);
  });

  it('the current-address code cannot sign in or delete', async () => {
    const { client, email } = await signInConsented(h);
    const { currentCode } = await startEmailChange(client, email, uniqueEmail('purpose'));
    expect((await new Client(h).post(`${API}/auth/otp/verify`, { email, code: currentCode })).statusCode).toBe(400);
    expect((await client.post(`${API}/me/delete/confirm`, { code: currentCode })).statusCode).toBe(400);
  });

  it('reports a taken address only after both correct codes', async () => {
    const taken = await signIn(h);
    const { client, email } = await signInConsented(h);
    const { code, currentCode } = await startEmailChange(client, email, taken.email);
    const miss = await client.post(`${API}/me/email/verify`, { newEmail: taken.email, code, currentCode: wrong(currentCode) });
    expect(miss.json().code).toBe('invalid_code');
    const hit = await client.post(`${API}/me/email/verify`, { newEmail: taken.email, code, currentCode });
    expect(hit.statusCode).toBe(409);
  });
});

describe('2 and 3. OTP strength and quotas', () => {
  it('uses six digits and shows them grouped in the mail', async () => {
    expect(OTP_LENGTH).toBe(6);
    expect(formatOtp('123456')).toBe('123 456');
    const email = uniqueEmail('six');
    const code = await requestCode(h, new Client(h), email);
    expect(code).toMatch(/^\d{6}$/);
    expect(sentTo(email, 'login').at(-1)!.text).toContain(formatOtp(code));
  });

  it('allows five sends an hour per address and client address', async () => {
    const email = uniqueEmail('pair');
    const same = new Client(h);
    for (let i = 0; i < 7; i += 1) await same.post(`${API}/auth/otp/request`, { email });
    await h.app.drainBackground();
    expect(sentTo(email)).toHaveLength(5);
    // A refused request looks exactly like any other.
    expect((await same.post(`${API}/auth/otp/request`, { email })).statusCode).toBe(202);
    await new Client(h).post(`${API}/auth/otp/request`, { email });
    await h.app.drainBackground();
    expect(sentTo(email)).toHaveLength(6);
  });

  it('allows twenty sends an hour per address overall, even in parallel from many addresses', async () => {
    const email = uniqueEmail('overall');
    await Promise.all(Array.from({ length: 30 }, () => new Client(h).post(`${API}/auth/otp/request`, { email })));
    await h.app.drainBackground();
    expect(sentTo(email)).toHaveLength(20);
  });

  it('keeps quotas per purpose: sign-in spam cannot block deletion or email change', async () => {
    const { client, email } = await signInConsented(h);
    await Promise.all(Array.from({ length: 25 }, () => new Client(h).post(`${API}/auth/otp/request`, { email })));
    await h.app.drainBackground();
    expect(sentTo(email, 'login').length).toBeLessThanOrEqual(21);
    await client.post(`${API}/me/delete/request`);
    const newEmail = uniqueEmail('after-spam');
    await client.post(`${API}/me/email/request`, { newEmail });
    await h.app.drainBackground();
    expect(sentTo(email, 'account_delete')).toHaveLength(1);
    expect(sentTo(email, 'email_change_current')).toHaveLength(1);
    expect(sentTo(newEmail, 'email_change')).toHaveLength(1);
  });

  it('canonicalises for quota only: variants of one inbox share a budget, but mail goes as typed', async () => {
    const tag = randomBytes(4).toString('hex');
    const variants = [`j.doe${tag}+a@gmail.com`, `jdoe${tag}+b@gmail.com`, `j.d.o.e${tag}@googlemail.com`, `JDOE${tag}+c@GMAIL.com`, `jd.oe${tag}@gmail.com`, `jdo.e${tag}+z@googlemail.com`, `jdoe${tag}@gmail.com`];
    const client = new Client(h);
    for (const email of variants) await client.post(`${API}/auth/otp/request`, { email });
    await h.app.drainBackground();
    const delivered = h.mailer.sent.filter((m) => m.to.toLowerCase().includes(tag));
    expect(delivered).toHaveLength(5);
    // Background sends finish in any order. What matters: each went to an address as someone typed it (lowercased,
    // as every address is), never rewritten to the canonical form the quota uses.
    const typed = variants.map((v) => v.toLowerCase());
    for (const mail of delivered) expect(typed).toContain(mail.to);
  });

  it('computes the quota key by the canonical rules, and keeps identity on the normalised address', () => {
    const keys = h.config.keys;
    const same = (a: string, b: string) => emailQuotaKey(keys, a).equals(emailQuotaKey(keys, b));
    expect(same('a.b+x@gmail.com', 'ab@googlemail.com')).toBe(true);
    expect(same('A.B+x@Example.com', 'a.b@example.com')).toBe(true);
    expect(same('a.b@example.com', 'ab@example.com')).toBe(false);
    expect(emailBlindIndex(keys, 'a.b@gmail.com').equals(emailBlindIndex(keys, 'ab@gmail.com'))).toBe(false);
    expect(emailBlindIndex(keys, 'a+x@gmail.com').equals(emailBlindIndex(keys, 'a@gmail.com'))).toBe(false);
  });

  it('caps failed guesses at fifty a rolling day, then answers invalid_code without evaluating', async () => {
    const email = uniqueEmail('capped');
    const quota = emailQuotaKey(h.config.keys, email);
    await h.admin`
      INSERT INTO app.otp_failures (quota_hash, purpose, created_at)
      SELECT ${quota}, 'login', now() - interval '1 hour' FROM generate_series(1, 19)
    `;
    const one = await requestCode(h, new Client(h), email);
    const miss = await new Client(h).post(`${API}/auth/otp/verify`, { email, code: wrong(one) });
    expect(miss.json().code).toBe('invalid_code');
    const refused = await new Client(h).post(`${API}/auth/otp/verify`, { email, code: one });
    expect(refused.statusCode).toBe(400);
    expect(refused.json().code).toBe('invalid_code');
    const strip = (body: string) => { const { requestId: _r, ...rest } = JSON.parse(body); return rest; };
    expect(strip(refused.body)).toEqual(strip(miss.body));
    // Not evaluated: the correct guess neither consumed the code nor counted an attempt.
    const [row] = await h.admin`SELECT attempts, consumed_at FROM app.otp_codes WHERE quota_hash = ${quota} AND consumed_at IS NULL`;
    expect(row!.attempts).toBe(1);
    await h.admin`UPDATE app.otp_failures SET created_at = now() - interval '25 hours' WHERE quota_hash = ${quota}`;
    expect((await new Client(h).post(`${API}/auth/otp/verify`, { email, code: one })).statusCode).toBe(200);
  });

  it('counts real wrong guesses towards the cap, across codes, exactly under parallel load', async () => {
    const email = uniqueEmail('counted');
    const quota = emailQuotaKey(h.config.keys, email);
    await h.admin`
      INSERT INTO app.otp_failures (quota_hash, purpose)
      SELECT ${quota}, 'login' FROM generate_series(1, 17)
    `;
    const code = await requestCode(h, new Client(h), email);
    await Promise.all(Array.from({ length: 10 }, () => new Client(h).post(`${API}/auth/otp/verify`, { email, code: wrong(code) })));
    const [row] = await h.admin`SELECT count(*)::int AS n FROM app.otp_failures WHERE quota_hash = ${quota}`;
    expect(row!.n).toBe(20);
  });

  it('a guess at an address with no live code is not a failed guess, so strangers cannot lock an address out for free', async () => {
    const email = uniqueEmail('nocode');
    const quota = emailQuotaKey(h.config.keys, email);
    for (let i = 0; i < 5; i += 1) await new Client(h).post(`${API}/auth/otp/verify`, { email, code: '0'.repeat(OTP_LENGTH) });
    const [row] = await h.admin`SELECT count(*)::int AS n FROM app.otp_failures WHERE quota_hash = ${quota}`;
    expect(row!.n).toBe(0);
  });

  it('sign-in guessing cannot block confirming a deletion', async () => {
    const { client, email } = await signInConsented(h);
    await h.admin`
      INSERT INTO app.otp_failures (quota_hash, purpose)
      SELECT ${emailQuotaKey(h.config.keys, email)}, 'login' FROM generate_series(1, 60)
    `;
    await client.post(`${API}/me/delete/request`);
    await h.app.drainBackground();
    const r = await client.post(`${API}/me/delete/confirm`, { code: h.mailer.codeFor(email, 'account_delete') });
    expect(r.statusCode).toBe(204);
  });

  it('sends a neutral notice on a later sign-in, naming the device and how to sign out everywhere', async () => {
    const email = uniqueEmail('notice');
    await signIn(h, email);
    await h.app.drainBackground();
    expect(sentTo(email, 'new_signin_notice')).toHaveLength(0);
    await signIn(h, email, { userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36' });
    await h.app.drainBackground();
    const [mail] = sentTo(email, 'new_signin_notice');
    expect(mail!.subject).toBe('New sign-in to your account');
    expect(mail!.text).toContain('Chrome on Android');
    expect(mail!.text).toMatch(/sign out on all devices/i);
    expect(`${mail!.subject} ${mail!.text}`).not.toMatch(/anxi|health|mental|gad|screen|therap|mood|journal|check-in/i);
  });
});

describe('4. ciphertext length', () => {
  const lengthOf = async (table: string, id: string) =>
    (await h.admin.unsafe(`SELECT octet_length(payload_ct)::int AS n FROM app.${table} WHERE id = '${id}'`))[0]!.n as number;

  it('every severity and difficulty produces the same assessment ciphertext length', async () => {
    const { client } = await signInConsented(h);
    const cases: [number[], number | null][] = [
      [[0, 0, 0, 0, 0, 0, 0], null], [[1, 1, 1, 0, 0, 0, 0], 1], [[1, 1, 1, 1, 1, 1, 1], 1], [[2, 2, 2, 2, 2, 1, 1], 1],
      [[3, 3, 3, 3, 2, 2, 2], 3], [[3, 3, 3, 3, 3, 3, 3], 3], [[2, 2, 2, 1, 1, 1, 1], 0], [[1, 1, 1, 1, 0, 0, 0], 2],
    ];
    const seen = new Map<string, number>();
    for (const [answers, difficulty] of cases) {
      const r = await client.post(`${API}/assessments`, { clientRequestId: randomUUID(), answers, difficulty });
      expect(r.statusCode).toBe(201);
      seen.set(r.json().severity as string, await lengthOf('assessments', r.json().id as string));
    }
    expect([...seen.keys()].sort()).toEqual(['mild', 'minimal', 'moderate', 'severe']);
    expect(new Set(seen.values()).size).toBe(1);
  });

  it('journal payloads fall into 4 KB size steps', async () => {
    const { client } = await signInConsented(h);
    const post = async (situation: string) => lengthOf('journal_entries', (await client.post(`${API}/journal`, journalPayload({ situation }))).json().id as string);
    const tiny = await post('a');
    const small = await post('a'.repeat(1500));
    const large = await post('a'.repeat(2000) + '');
    expect(tiny).toBe(small);
    expect(large).toBe(tiny);
    const big = await lengthOf('journal_entries', (await client.post(`${API}/journal`, journalPayload({
      situation: 'a'.repeat(2000), thought: 'b'.repeat(2000), evidenceFor: 'c'.repeat(2000),
    }))).json().id as string);
    expect(big - tiny).toBe(4096);
  });

  it('names and addresses of different lengths encrypt to the same length', async () => {
    const { client, id } = await signInConsented(h, `a${randomBytes(2).toString('hex')}@example.com`);
    const other = await signInConsented(h, `${'long'.repeat(20)}${randomBytes(2).toString('hex')}@example.com`);
    const size = async (uid: string) => (await h.admin`SELECT octet_length(email_ct)::int AS e, octet_length(display_name_ct)::int AS d FROM app.users WHERE id = ${uid}::uuid`)[0]!;
    expect((await size(id)).e).toBe((await size(other.id)).e);
    await client.patch(`${API}/me`, { displayName: 'A' });
    await other.client.patch(`${API}/me`, { displayName: 'A very much longer display name than that' });
    expect((await size(id)).d).toBe((await size(other.id)).d);
  });

  it('unpads what it padded, for any text, and refuses a malformed length', () => {
    const dek = randomBytes(32);
    for (const text of ['', 'x', 'नमस्ते', 'y'.repeat(9000)]) {
      expect(openText(dek, sealText(dek, text, 'journal_entries.payload', 'r', 'u'), 'journal_entries.payload', 'r', 'u')).toBe(text);
    }
    const bad = seal(dek, Buffer.alloc(256, 0xff), aad('users.email', 'r', 'u'));
    expect(() => openText(dek, bad, 'users.email', 'r', 'u')).toThrow(DecryptError);
    const raw = sealText(dek, 'pad me', 'users.email', 'r', 'u');
    expect(open(dek, raw, aad('users.email', 'r', 'u')).length % 512).toBe(0);
  });
});

describe('5. rate limit keys', () => {
  it('keys IPv6 on the /64 and unwraps mapped IPv4', () => {
    expect(rateKey('2001:db8:1:1::1')).toBe(rateKey('2001:0DB8:1:1:ffff:ffff:ffff:ffff'));
    expect(rateKey('2001:db8:1:1::1')).not.toBe(rateKey('2001:db8:1:2::1'));
    expect(rateKey('::ffff:198.51.100.4')).toBe('198.51.100.4');
    expect(rateKey('198.51.100.4')).toBe('198.51.100.4');
    expect(rateKey('fe80::1%en0')).toBe(rateKey('fe80::2'));
  });

  it('an attacker rotating inside one IPv6 /64 hits the route limit', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 25; i += 1) {
      const r = await new Client(h, { ip: `2001:db8:77:77::${(i + 1).toString(16)}` }).post(`${API}/auth/otp/request`, { email: uniqueEmail('six') });
      statuses.push(r.statusCode);
    }
    expect(statuses.filter((s) => s === 429).length).toBe(5);
    expect((await new Client(h, { ip: '2001:db8:77:78::1' }).post(`${API}/auth/otp/request`, { email: uniqueEmail('six') })).statusCode).toBe(202);
    await h.app.drainBackground();
  });

  it('a whole /64 shares one send budget for an address', async () => {
    const email = uniqueEmail('six-budget');
    for (let i = 0; i < 8; i += 1) await new Client(h, { ip: `2001:db8:88:88::${(i + 1).toString(16)}` }).post(`${API}/auth/otp/request`, { email });
    await h.app.drainBackground();
    expect(sentTo(email)).toHaveLength(5);
  });
});

describe('client address behind a proxy', () => {
  let cf: Harness;
  beforeAll(async () => {
    cf = await createHarness({ CLIENT_IP_HEADER: 'CF-Connecting-IP', TRUST_PROXY_HOPS: '1' });
  });
  afterAll(async () => {
    await cf.close();
  });
  const remaining = (r: { headers: Record<string, unknown> }) => Number(r.headers['x-ratelimit-remaining']);
  const send = (headers: Record<string, string>, app = cf.app) => app.inject({ method: 'GET', url: `${API}/meta`, remoteAddress: '10.226.0.9', headers });
  const render = (client: string, edge = '172.71.195.88') => ({ 'cf-connecting-ip': client, 'x-forwarded-for': `${client}, ${edge}, 10.226.0.196` });

  it('reads the configured header, so people behind one edge do not share a bucket', async () => {
    const a = await send(render('198.51.100.1'));
    const b = await send(render('198.51.100.2'));
    expect(remaining(b)).toBe(remaining(a));
  });

  it('the hop count alone would share one bucket across everybody behind that edge', async () => {
    const a = await send(render('198.51.100.1'), h.app);
    const b = await send(render('198.51.100.2'), h.app);
    expect(remaining(b)).toBe(remaining(a) - 1);
  });

  it('a client forging X-Forwarded-For cannot change its bucket', async () => {
    const first = await send({ 'cf-connecting-ip': '198.51.100.3', 'x-forwarded-for': '1.1.1.1, 172.71.195.88, 10.226.0.196' });
    const second = await send({ 'cf-connecting-ip': '198.51.100.3', 'x-forwarded-for': '2.2.2.2, 172.71.195.88, 10.226.0.196' });
    expect(remaining(second)).toBe(remaining(first) - 1);
  });

  it('falls back to hop counting when the header is absent or not an address', async () => {
    const a = await send({ 'x-forwarded-for': '1.1.1.1, 198.51.100.44' });
    const b = await send({ 'cf-connecting-ip': 'nonsense', 'x-forwarded-for': '2.2.2.2, 198.51.100.44' });
    expect(remaining(b)).toBe(remaining(a) - 1);
  });

  it('logs each pattern of address headers once, never an address, and ignores health checks', async () => {
    const fresh = await createHarness({ CLIENT_IP_HEADER: 'cf-connecting-ip' });
    try {
      for (const url of ['/healthz', '/readyz']) await fresh.app.inject({ method: 'GET', url, remoteAddress: '10.226.0.9' });
      expect(fresh.logs.join('')).not.toContain('client ip resolved');
      for (let i = 0; i < 3; i += 1) await send(render('198.51.100.77'), fresh.app);
      await fresh.app.inject({ method: 'GET', url: `${API}/meta`, remoteAddress: '10.226.0.9' });
      const lines = fresh.logs.filter((l) => l.includes('client ip resolved'));
      expect(lines).toHaveLength(2);
      expect(lines[0]).toContain('client ip resolved: public IPv4 via header');
      expect(lines[1]).toContain('client ip resolved: private/proxy via hops');
      // Which headers arrived, and the kind of each forwarded entry: what's needed to choose the setting.
      expect(lines[0]).toContain('"clientIpHeaders":[');
      expect(lines[0]).toContain('"cf-connecting-ip"');
      expect(lines[1]).toContain('"clientIpHeaders":[]');
      // A forged, junk header is a new pattern: logged once, as a kind, never echoed.
      await fresh.app.inject({ method: 'GET', url: `${API}/meta`, remoteAddress: '10.226.0.9', headers: { 'x-forwarded-for': 'evil-junk-value' } });
      const junk = fresh.logs.filter((l) => l.includes('client ip resolved')).at(-1)!;
      expect(junk).toContain('"forwardedFor":["not an address"]');
      expect(fresh.logs.join('')).not.toContain('evil-junk-value');
      expect(fresh.logs.join('')).not.toMatch(/198\.51\.100|10\.226/);
    } finally {
      await fresh.close();
    }
  });

  it('classifies addresses without echoing them', () => {
    expect(classifyIp('8.8.8.8')).toBe('public IPv4');
    expect(classifyIp('2606:4700::1')).toBe('public IPv6');
    for (const ip of ['10.1.2.3', '172.16.0.1', '192.168.1.1', '127.0.0.1', '100.64.0.1', '169.254.0.1', '::1', 'fc00::1', 'fe80::1', '::ffff:10.0.0.1']) {
      expect(classifyIp(ip), ip).toBe('private/proxy');
    }
  });

  it('refuses a header name that is not a header name', () => {
    expect(() => loadConfig(baseEnv({ CLIENT_IP_HEADER: 'x y' }))).toThrow(/CLIENT_IP_HEADER/);
    expect(loadConfig(baseEnv({ CLIENT_IP_HEADER: 'CF-Connecting-IP' })).clientIpHeader).toBe('cf-connecting-ip');
    expect(loadConfig(baseEnv()).clientIpHeader).toBeNull();
  });
});

describe('6. erasure honesty', () => {
  it('stores audit times to the day only, so they cannot be joined to session times', async () => {
    const { id } = await signInConsented(h);
    const { auditActor } = await import('../src/crypto.ts');
    const rows = await h.admin`SELECT created_at FROM app.audit_log WHERE actor_hmac = ${auditActor(h.config.keys, id)}`;
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect((row.created_at as Date).toISOString()).toMatch(/T00:00:00\.000Z$/);
    const joined = await h.admin`SELECT 1 FROM app.audit_log l JOIN app.sessions s ON s.created_at = l.created_at WHERE s.user_id = ${id}::uuid`;
    expect(joined).toHaveLength(0);
  });

  it('refuses a precise audit time at the database', async () => {
    await expect(h.admin`INSERT INTO app.audit_log (actor_hmac, action, created_at) VALUES (${randomBytes(32)}, 'login', '2026-01-01T10:11:12Z')`).rejects.toMatchObject({ code: '23514' });
  });

  it('publishes the backup retention, with a seven-day default that config can change', async () => {
    const meta = (await new Client(h).get(`${API}/meta`)).json();
    expect(meta.backupRetentionDays).toBe(7);
    expect(loadConfig(baseEnv({ BACKUP_RETENTION_DAYS: '14' })).disclosure.backupRetentionDays).toBe(14);
    expect(() => loadConfig(baseEnv({ BACKUP_RETENTION_DAYS: '-1' }))).toThrow(/BACKUP_RETENTION_DAYS/);
  });

  it('publishes where data is stored and processed, from config', async () => {
    const meta = (await new Client(h).get(`${API}/meta`)).json();
    expect(meta).toMatchObject({ dataLocation: 'Mumbai, India', serverLocation: 'Singapore', mailProvider: 'our email provider' });
    const c = loadConfig(baseEnv({ DATA_LOCATION: 'Hyderabad, India', SERVER_LOCATION: 'Oregon', MAIL_PROVIDER: 'Postmark' })).disclosure;
    expect(c).toMatchObject({ dataLocation: 'Hyderabad, India', serverLocation: 'Oregon', mailProvider: 'Postmark' });
  });
});

describe('7. limiter order', () => {
  it('an anonymous flood gets 429, not an endless 401', async () => {
    const anon = new Client(h, { ip: '198.51.100.50' });
    const counts: Record<number, number> = {};
    for (let i = 0; i < 605; i += 1) {
      const r = await anon.get(`${API}/me`);
      counts[r.statusCode] = (counts[r.statusCode] ?? 0) + 1;
    }
    expect(counts[429]).toBe(5);
  });

  it('a fake-cookie flood stops reaching the database at the limit', async () => {
    const name = h.config.cookie.name;
    const statuses = new Set<number>();
    for (let i = 0; i < 605; i += 1) {
      const r = await h.app.inject({ method: 'GET', url: `${API}/me`, remoteAddress: '198.51.100.99', headers: { cookie: `${name}=${randomBytes(32).toString('base64url')}` } });
      statuses.add(r.statusCode);
    }
    expect(statuses).toEqual(new Set([401, 429]));
  });

  it('a route limit applies before authentication', async () => {
    const anon = new Client(h, { ip: '198.51.100.51' });
    const counts: Record<number, number> = {};
    for (let i = 0; i < 25; i += 1) {
      const r = await anon.post(`${API}/me/delete/confirm`, { code: '0'.repeat(OTP_LENGTH) });
      counts[r.statusCode] = (counts[r.statusCode] ?? 0) + 1;
    }
    expect(counts).toEqual({ 401: 20, 429: 5 });
  });
});

describe('8. per-user storage caps', () => {
  const seed = (table: 'journal_entries' | 'assessments', userId: string, n: number) =>
    h.admin.unsafe(table === 'journal_entries'
      ? `INSERT INTO app.journal_entries (id, user_id, payload_ct) SELECT gen_random_uuid(), '${userId}', '\\x00' FROM generate_series(1, ${n})`
      : `INSERT INTO app.assessments (id, user_id, client_request_id, taken_at, payload_ct) SELECT gen_random_uuid(), '${userId}', gen_random_uuid(), now(), '\\x00' FROM generate_series(1, ${n})`);

  it('allows 2000 journal entries, then answers 409 with useful words, and lets deletion make room', async () => {
    const { client, id } = await signInConsented(h);
    await seed('journal_entries', id, 1999);
    const last = await client.post(`${API}/journal`, journalPayload());
    expect(last.statusCode).toBe(201);
    const over = await client.post(`${API}/journal`, journalPayload());
    expect(over.statusCode).toBe(409);
    expect(over.json().code).toBe('conflict');
    expect(over.json().detail).toMatch(/2,000.*delete/is);
    expect((await client.delete(`${API}/journal/${last.json().id}`)).statusCode).toBe(204);
    expect((await client.post(`${API}/journal`, journalPayload())).statusCode).toBe(201);
  });

  it('holds the journal cap exactly under parallel writes', async () => {
    const { client, id } = await signInConsented(h);
    await seed('journal_entries', id, 1997);
    const results = await Promise.all(Array.from({ length: 8 }, () => client.post(`${API}/journal`, journalPayload())));
    expect(results.filter((r) => r.statusCode === 201)).toHaveLength(3);
    expect(results.filter((r) => r.statusCode === 409)).toHaveLength(5);
  });

  it('allows 1000 assessments, then 409, while a replay of an existing one still succeeds', async () => {
    const { client, id } = await signInConsented(h);
    await seed('assessments', id, 999);
    const body = assessmentPayload();
    const created = await client.post(`${API}/assessments`, body);
    expect(created.statusCode).toBe(201);
    const over = await client.post(`${API}/assessments`, assessmentPayload());
    expect(over.statusCode).toBe(409);
    expect(over.json().detail).toMatch(/1,000.*delete/is);
    expect((await client.post(`${API}/assessments`, body)).statusCode).toBe(200);
  });
});

describe('9. nothing names the service', () => {
  it('the export filename is neutral', async () => {
    const { client } = await signInConsented(h);
    const r = await client.get(`${API}/me/export`);
    expect(r.headers['content-disposition']).toMatch(/^attachment; filename="account-data-\d{4}-\d{2}-\d{2}\.json"$/);
  });

  const prod = (over: Record<string, string>) => baseEnv({
    NODE_ENV: 'production', PUBLIC_ORIGIN: 'https://app.example.com', MAIL_TRANSPORT: 'smtp', SMTP_HOST: 'smtp.example.com', SMTP_USER: 'u', SMTP_PASS: 'p',
    DATABASE_URL: 'postgres://anxiocare_runtime.p:pw@db.example.com:5432/postgres',
    DATABASE_CA_CERT: readFileSync(new URL('./fixtures/ca.pem', import.meta.url), 'utf8'),
    ...over,
  });

  it('defaults the sender to a neutral name, and lets the owner override it', () => {
    expect(loadConfig(baseEnv({ MAIL_FROM: 'no-reply@example.com' })).mail.from).toBe('Account Team <no-reply@example.com>');
    expect(loadConfig(baseEnv({ MAIL_FROM: 'Accounts <no-reply@example.com>' })).mail.from).toBe('Accounts <no-reply@example.com>');
    expect(loadConfig(baseEnv({ MAIL_FROM: 'Accounts <no-reply@example.com>', MAIL_FROM_NAME: 'Support' })).mail.from).toBe('Support <no-reply@example.com>');
  });

  it('treats an optional setting left blank in a dashboard as not set', () => {
    const c = loadConfig(baseEnv({ MAIL_FROM: 'no-reply@example.com', MAIL_FROM_NAME: '', MAIL_PROVIDER: '', CLIENT_IP_HEADER: '', DATA_LOCATION: '', SERVER_LOCATION: '', BACKUP_RETENTION_DAYS: '' }));
    expect(c.mail.from).toBe('Account Team <no-reply@example.com>');
    expect(c.clientIpHeader).toBeNull();
    expect(c.disclosure).toEqual({ backupRetentionDays: 7, dataLocation: 'Mumbai, India', serverLocation: 'Singapore', mailProvider: 'our email provider' });
  });

  it('production refuses a sender name or address that reveals the subject', () => {
    expect(() => loadConfig(prod({ MAIL_FROM_NAME: 'Anxiety Help', MAIL_FROM: 'no-reply@example.com' }))).toThrow(/MAIL_FROM/);
    expect(() => loadConfig(prod({ MAIL_FROM: 'no-reply@anxiocare.example' }))).toThrow(/MAIL_FROM/);
    expect(() => loadConfig(prod({ MAIL_FROM: 'Wellness Team <no-reply@example.com>' }))).toThrow(/MAIL_FROM/);
    expect(loadConfig(prod({ MAIL_FROM: 'no-reply@example.com' })).mail.from).toBe('Account Team <no-reply@example.com>');
  });

  it('no subject or body in any message names health or the service', async () => {
    const { otpMail, emailChangedNotice, newSignInNotice } = await import('../src/mail.ts');
    const mails = [
      ...(['login', 'email_change', 'email_change_current', 'account_delete'] as const).map((p) => otpMail('a@example.com', p, '123456')),
      emailChangedNotice('a@example.com'),
      newSignInNotice('a@example.com', 'Safari on iPhone'),
    ];
    for (const mail of mails) {
      expect(`${mail.subject} ${mail.text}`, mail.purpose).not.toMatch(/anxi|health|mental|gad|screen|therap|mood|journal|check-in|wellness|care\b/i);
    }
  });
});

describe('10. cursors', () => {
  it('answers 400 to dates outside the range any row can have, not 500', async () => {
    const { client } = await signInConsented(h);
    const cursor = (at: string) => Buffer.from(JSON.stringify([at, randomUUID()])).toString('base64url');
    for (const at of ['0000-01-01T00:00:00Z', '0001-01-01T00:00:00Z', '1999-12-31T23:59:59Z', '2101-01-01T00:00:00Z', '9999-12-31T23:59:59Z']) {
      for (const path of ['assessments', 'journal']) {
        const r = await client.get(`${API}/${path}?cursor=${cursor(at)}`);
        expect(r.statusCode, `${path} ${at}`).toBe(400);
        expect(r.json().code).toBe('validation_failed');
      }
    }
    expect((await client.get(`${API}/journal?cursor=${cursor('2026-01-01T00:00:00Z')}`)).statusCode).toBe(200);
  });
});

describe('deploy config', () => {
  const blueprint = readFileSync(new URL('../../../render.yaml', import.meta.url), 'utf8');

  it('installs without lifecycle scripts', () => {
    expect(blueprint).toMatch(/buildCommand: npm ci --include=dev --ignore-scripts && npm run build/);
  });

  it('deploys only after checks pass, with the field Render documents', () => {
    expect(blueprint).toMatch(/^\s+autoDeployTrigger: checksPass$/m);
    expect(blueprint).not.toMatch(/^\s+autoDeploy:/m);
  });

  it('reads the client address from the header Cloudflare overwrites', () => {
    expect(blueprint).toMatch(/- key: CLIENT_IP_HEADER\n\s+value: cf-connecting-ip/);
  });

  it('starts the server without the migration credential in its environment', () => {
    expect(blueprint).toMatch(/startCommand: env -u DATABASE_MIGRATION_URL npm start/);
  });

  it('keeps the icons in the repository, not generated at deploy', () => {
    for (const name of ['icon-192.png', 'icon-512.png', 'maskable-512.png', 'apple-touch-180.png']) {
      expect(readFileSync(new URL(`../../web/public/icons/${name}`, import.meta.url)).length, name).toBeGreaterThan(100);
    }
    expect(blueprint).not.toMatch(/npm run icons|gen-icons/);
  });
});

export { ORIGIN };
