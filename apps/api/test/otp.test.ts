import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { otpMail } from '../src/mail.ts';
import { API, Client, createHarness, requestCode, signIn, signInConsented, uniqueEmail, type Harness } from './helpers.ts';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

const wrong = (code: string) => (code === '00000000' ? '11111111' : '00000000');
const attemptsFor = async () => (await h.admin`SELECT max(attempts)::int AS n FROM app.otp_codes WHERE attempts > 0`)[0]!.n as number;

describe('OTP request', () => {
  it('answers identically for known and unknown addresses', async () => {
    const known = await signIn(h);
    const client = new Client(h);
    const a = await client.post(`${API}/auth/otp/request`, { email: known.email });
    const b = await client.post(`${API}/auth/otp/request`, { email: uniqueEmail('unknown') });
    expect(a.statusCode).toBe(202);
    expect(b.statusCode).toBe(202);
    expect(a.body).toBe('');
    expect(b.body).toBe('');
    const strip = (headers: Record<string, unknown>) => {
      const { date: _date, 'x-ratelimit-remaining': _r, 'x-ratelimit-reset': _t, ...rest } = headers;
      return rest;
    };
    expect(strip(a.headers)).toEqual(strip(b.headers));
    await h.app.drainBackground();
  });

  it('responds before any delivery work: a stuck mail provider cannot affect timing', async () => {
    let release = () => {};
    const stuck = new Promise<void>((resolve) => {
      release = resolve;
    });
    let delivered = false;
    h.mailer.hook = async () => {
      await stuck;
      delivered = true;
    };
    try {
      const response = await new Client(h).post(`${API}/auth/otp/request`, { email: uniqueEmail('slow') });
      expect(response.statusCode).toBe(202);
      expect(delivered).toBe(false);
    } finally {
      release();
      await h.app.drainBackground();
      h.mailer.hook = async () => {};
    }
    expect(delivered).toBe(true);
  });

  it('does not create an account just because a code was requested', async () => {
    const email = uniqueEmail('nobody');
    await requestCode(h, new Client(h), email);
    const [row] = await h.admin`SELECT count(*)::int AS n FROM app.otp_codes WHERE purpose = 'login'`;
    expect(row!.n).toBeGreaterThan(0);
    const before = (await h.admin`SELECT count(*)::int AS n FROM app.users`)[0]!.n;
    await requestCode(h, new Client(h), uniqueEmail('nobody2'));
    expect((await h.admin`SELECT count(*)::int AS n FROM app.users`)[0]!.n).toBe(before);
  });

  it('stores only an HMAC of the code, generates eight digits, sets a ten-minute expiry', async () => {
    const email = uniqueEmail();
    const code = await requestCode(h, new Client(h), email);
    expect(code).toMatch(/^\d{8}$/);
    const [row] = await h.admin`
      SELECT code_hmac, expires_at, created_at,
        encode(code_hmac, 'escape') LIKE ${'%' + code + '%'} AS contains_code
      FROM app.otp_codes ORDER BY created_at DESC LIMIT 1
    `;
    expect(row!.contains_code).toBe(false);
    expect((row!.code_hmac as Buffer).length).toBe(32);
    expect((row!.expires_at as Date).getTime() - (row!.created_at as Date).getTime()).toBe(10 * 60 * 1000);
  });

  it('limits each address to twenty codes an hour in the database, even under parallel requests', async () => {
    const email = uniqueEmail('limited');
    h.mailer.sent = [];
    await Promise.all(Array.from({ length: 30 }, () => new Client(h).post(`${API}/auth/otp/request`, { email })));
    await h.app.drainBackground();
    expect(h.mailer.sent.filter((m) => m.to === email)).toHaveLength(20);
    // Still answers 202: the limit is invisible from outside.
    const response = await new Client(h).post(`${API}/auth/otp/request`, { email });
    expect(response.statusCode).toBe(202);
    await h.app.drainBackground();
    expect(h.mailer.sent.filter((m) => m.to === email)).toHaveLength(20);
  });

  it('applies a per-IP route limit, which a spoofed forwarded header cannot dodge', async () => {
    const client = new Client(h);
    let last = 0;
    let body = '';
    for (let i = 0; i < 21; i += 1) {
      const r = await client.request({
        method: 'POST',
        url: `${API}/auth/otp/request`,
        payload: { email: uniqueEmail('flood') },
        // The left part is attacker-controlled; hop 1 is what the platform proxy appended.
        headers: { 'x-forwarded-for': `203.0.113.${i}, 198.51.100.7` },
      });
      last = r.statusCode;
      body = r.body;
    }
    expect(last).toBe(429);
    expect(JSON.parse(body)).toMatchObject({ code: 'rate_limited', status: 429 });
    await h.app.drainBackground();
  });

  it('rejects a malformed address without leaking how', async () => {
    const r = await new Client(h).post(`${API}/auth/otp/request`, { email: 'not-an-email' });
    expect(r.statusCode).toBe(400);
    expect(r.json().code).toBe('validation_failed');
    expect(r.body).not.toContain('not-an-email');
  });
});

describe('OTP verify', () => {
  it('fails the same way for a wrong code and an address with no code', async () => {
    const email = uniqueEmail();
    const client = new Client(h);
    const code = await requestCode(h, client, email);
    const a = await client.post(`${API}/auth/otp/verify`, { email, code: wrong(code) });
    const b = await client.post(`${API}/auth/otp/verify`, { email: uniqueEmail('none'), code: '12345678' });
    expect(a.statusCode).toBe(400);
    expect(b.statusCode).toBe(400);
    expect(a.json().code).toBe('invalid_code');
    expect(b.json().code).toBe('invalid_code');
  });

  it('is single use', async () => {
    const email = uniqueEmail();
    const client = new Client(h);
    const code = await requestCode(h, client, email);
    expect((await client.post(`${API}/auth/otp/verify`, { email, code })).statusCode).toBe(200);
    expect((await new Client(h).post(`${API}/auth/otp/verify`, { email, code })).statusCode).toBe(400);
  });

  it('lets only one of many parallel correct submissions win', async () => {
    const email = uniqueEmail();
    const code = await requestCode(h, new Client(h), email);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => new Client(h).post(`${API}/auth/otp/verify`, { email, code })),
    );
    expect(results.filter((r) => r.statusCode === 200)).toHaveLength(1);
  });

  it('rejects an expired code', async () => {
    const email = uniqueEmail();
    const client = new Client(h);
    const code = await requestCode(h, client, email);
    await h.admin`UPDATE app.otp_codes SET expires_at = now() - interval '1 second', created_at = now() - interval '11 minutes' WHERE consumed_at IS NULL AND purpose = 'login'`;
    expect((await client.post(`${API}/auth/otp/verify`, { email, code })).statusCode).toBe(400);
  });

  it('invalidates the earlier code when a new one is issued', async () => {
    const email = uniqueEmail();
    const client = new Client(h);
    const first = await requestCode(h, client, email);
    const second = await requestCode(h, client, email);
    if (first !== second) {
      expect((await client.post(`${API}/auth/otp/verify`, { email, code: first })).statusCode).toBe(400);
    }
    expect((await client.post(`${API}/auth/otp/verify`, { email, code: second })).statusCode).toBe(200);
  });

  it('blocks even the right code after five wrong attempts', async () => {
    const email = uniqueEmail();
    const client = new Client(h);
    const code = await requestCode(h, client, email);
    for (let i = 0; i < 5; i += 1) {
      expect((await client.post(`${API}/auth/otp/verify`, { email, code: wrong(code) })).statusCode).toBe(400);
    }
    expect((await client.post(`${API}/auth/otp/verify`, { email, code })).statusCode).toBe(400);
  });

  it('never counts past five attempts under parallel guessing, and the right code cannot slip in afterwards', async () => {
    const email = uniqueEmail('parallel');
    const code = await requestCode(h, new Client(h), email);
    await h.admin`UPDATE app.otp_codes SET attempts = 0 WHERE attempts > 0`;
    const results = await Promise.all(
      Array.from({ length: 25 }, () => new Client(h).post(`${API}/auth/otp/verify`, { email, code: wrong(code) })),
    );
    expect(results.every((r) => r.statusCode === 400)).toBe(true);
    expect(await attemptsFor()).toBe(5);
    expect((await new Client(h).post(`${API}/auth/otp/verify`, { email, code })).statusCode).toBe(400);
  });

  it('treats a parallel guess at the fifth slot atomically: attempts column never exceeds five', async () => {
    const email = uniqueEmail('parallel2');
    const code = await requestCode(h, new Client(h), email);
    await h.admin`UPDATE app.otp_codes SET attempts = 4 WHERE consumed_at IS NULL AND purpose = 'login' AND created_at = (SELECT max(created_at) FROM app.otp_codes)`;
    const guesses = await Promise.all(
      Array.from({ length: 10 }, () => new Client(h).post(`${API}/auth/otp/verify`, { email, code })),
    );
    expect(guesses.filter((r) => r.statusCode === 200).length).toBeLessThanOrEqual(1);
    const [row] = await h.admin`SELECT max(attempts)::int AS n FROM app.otp_codes`;
    expect(row!.n).toBeLessThanOrEqual(5);
  });

  it('handles a first-login race with the unique index: both succeed against one account', async () => {
    const { findOrCreateUser } = await import('../src/users.ts');
    const { emailBlindIndex } = await import('../src/crypto.ts');
    const email = uniqueEmail('race');
    const hash = emailBlindIndex(h.config.keys, email);
    const users = await Promise.all(
      Array.from({ length: 8 }, () => findOrCreateUser(h.runtime, h.config.keys, email, hash)),
    );
    expect(new Set(users.map((u) => u.id)).size).toBe(1);
    const { toMe } = await import('../src/users.ts');
    // Every racer ends up with the winner's row, so its key and ciphertext agree.
    expect(toMe(h.config.keys, users[3]!).email).toBe(email);
  });
});

describe('OTP purposes', () => {
  const mailFor = (to: string, purpose: 'email_change' | 'account_delete') => h.mailer.codeFor(to, purpose);

  it('a login code cannot confirm account deletion', async () => {
    const { client, email } = await signIn(h);
    const loginCode = await requestCode(h, new Client(h), email);
    const r = await client.post(`${API}/me/delete/confirm`, { code: loginCode });
    expect(r.statusCode).toBe(400);
    expect(r.json().code).toBe('invalid_code');
    // And the code is untouched for its real purpose.
    expect((await new Client(h).post(`${API}/auth/otp/verify`, { email, code: loginCode })).statusCode).toBe(200);
  });

  it('a delete code cannot sign in', async () => {
    const { client, email } = await signIn(h);
    await client.post(`${API}/me/delete/request`);
    await h.app.drainBackground();
    const code = mailFor(email, 'account_delete');
    expect((await new Client(h).post(`${API}/auth/otp/verify`, { email, code })).statusCode).toBe(400);
  });

  it('an email-change code cannot sign in to the new address or delete the account', async () => {
    const { client, email } = await signInConsented(h);
    const newEmail = uniqueEmail('new');
    await client.post(`${API}/me/email/request`, { newEmail });
    await h.app.drainBackground();
    const code = mailFor(newEmail, 'email_change');
    expect((await new Client(h).post(`${API}/auth/otp/verify`, { email: newEmail, code })).statusCode).toBe(400);
    expect((await client.post(`${API}/me/delete/confirm`, { code })).statusCode).toBe(400);
    const me = await client.get(`${API}/me`);
    expect(me.json().email).toBe(email);
  });

  it('a login code for the new address cannot complete an email change', async () => {
    const { client, email } = await signInConsented(h);
    const newEmail = uniqueEmail('new');
    const code = await requestCode(h, new Client(h), newEmail);
    expect((await client.post(`${API}/me/email/verify`, { newEmail, currentCode: code, code })).statusCode).toBe(400);
    expect((await client.get(`${API}/me`)).json().email).toBe(email);
  });

  it('an email-change code is bound to its target address', async () => {
    const { client, email } = await signInConsented(h);
    const target = uniqueEmail('target');
    await client.post(`${API}/me/email/request`, { newEmail: target });
    await h.app.drainBackground();
    const code = mailFor(target, 'email_change');
    const currentCode = h.mailer.codeFor(email, 'email_change_current');
    const r = await client.post(`${API}/me/email/verify`, { newEmail: uniqueEmail('other'), currentCode, code });
    expect(r.statusCode).toBe(400);
    expect((await client.post(`${API}/me/email/verify`, { newEmail: target, currentCode, code })).statusCode).toBe(200);
  });

  it("an email-change code is bound to the requesting user: another account cannot use it", async () => {
    const a = await signInConsented(h);
    const b = await signInConsented(h);
    const target = uniqueEmail('target');
    await a.client.post(`${API}/me/email/request`, { newEmail: target });
    await h.app.drainBackground();
    const code = mailFor(target, 'email_change');
    const currentCode = h.mailer.codeFor(a.email, 'email_change_current');
    expect((await b.client.post(`${API}/me/email/verify`, { newEmail: target, currentCode, code })).statusCode).toBe(400);
  });

  it("a delete code is bound to the user: another session cannot use it", async () => {
    const a = await signIn(h);
    const b = await signIn(h);
    await a.client.post(`${API}/me/delete/request`);
    await h.app.drainBackground();
    const code = mailFor(a.email, 'account_delete');
    expect((await b.client.post(`${API}/me/delete/confirm`, { code })).statusCode).toBe(400);
    expect((await a.client.get(`${API}/me`)).statusCode).toBe(200);
  });

  it('issuing a code for one purpose leaves other purposes alone', async () => {
    const { client, email } = await signIn(h);
    const loginCode = await requestCode(h, new Client(h), email);
    await client.post(`${API}/me/delete/request`);
    await h.app.drainBackground();
    expect((await new Client(h).post(`${API}/auth/otp/verify`, { email, code: loginCode })).statusCode).toBe(200);
  });
});

describe('Email change', () => {
  it('changes the address, moves the blind index, signs out other devices and tells the old address', async () => {
    const { client, email } = await signInConsented(h);
    const other = new Client(h);
    await requestCode(h, other, email);
    await other.post(`${API}/auth/otp/verify`, { email, code: h.mailer.codeFor(email) });
    expect((await other.get(`${API}/me`)).statusCode).toBe(200);

    const newEmail = uniqueEmail('moved');
    expect((await client.post(`${API}/me/email/request`, { newEmail })).statusCode).toBe(202);
    await h.app.drainBackground();
    const r = await client.post(`${API}/me/email/verify`, {
      newEmail,
      currentCode: h.mailer.codeFor(email, 'email_change_current'),
      code: h.mailer.codeFor(newEmail, 'email_change'),
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().email).toBe(newEmail);
    await h.app.drainBackground();

    expect((await other.get(`${API}/me`)).statusCode).toBe(401);
    expect(h.mailer.sent.some((m) => m.to === email && m.purpose === 'email_changed_notice')).toBe(true);

    // Signing in with the new address reaches the same account; the old address starts a new one.
    const again = await signIn(h, newEmail);
    expect(again.id).toBe((await client.get(`${API}/me`)).json().id);
  });

  it('reports a taken address only to someone holding the code for it', async () => {
    const taken = await signIn(h);
    const { client, email } = await signInConsented(h);
    const request = await client.post(`${API}/me/email/request`, { newEmail: taken.email });
    expect(request.statusCode).toBe(202);
    // Wrong code: same generic failure, nothing about the address.
    expect((await client.post(`${API}/me/email/verify`, { newEmail: taken.email, currentCode: '00000000', code: '00000000' })).json().code).toBe('invalid_code');
    await h.app.drainBackground();
    const code = h.mailer.codeFor(taken.email, 'email_change');
    const currentCode = h.mailer.codeFor(email, 'email_change_current');
    const r = await client.post(`${API}/me/email/verify`, { newEmail: taken.email, currentCode, code });
    expect(r.statusCode).toBe(409);
    expect(r.json().code).toBe('conflict');
    // Nothing moved: both accounts keep their own address.
    expect((await taken.client.get(`${API}/me`)).json().email).toBe(taken.email);
  });
});

describe('Mail content', () => {
  it('is neutral: code in the body only, nothing about the product or health', () => {
    for (const purpose of ['login', 'email_change', 'account_delete'] as const) {
      const mail = otpMail('a@example.com', purpose, '12345678');
      expect(mail.subject).not.toContain('1234');
      expect(mail.text).toContain('1234 5678');
      expect(`${mail.subject} ${mail.text}`).not.toMatch(/anxi|health|mental|gad|screen|therap|mood|journal/i);
    }
    expect(otpMail('a@example.com', 'login', '12345678').subject).toBe('Your sign-in code');
  });
});
