import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FakeOidc, FAKE_CLIENT_ID, FAKE_CLIENT_SECRET, type TokenTweaks } from '../scripts/fake-oidc.ts';
import { emailBlindIndex } from '../src/crypto.ts';
import { sealOauthState } from '../src/google.ts';
import { API, Client, consentPayload, createHarness, ORIGIN, signIn, signInConsented, uniqueEmail, type Harness } from './helpers.ts';

const STATE_COOKIE = '__Host-google-oauth';
const SESSION_COOKIE = '__Host-session';
const REJECTED = '/sign-in?error=google';
const PASSWORD = 'river stone quiet morning';

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

let ipCounter = 0;
/** Holds cookies the way a browser does, and makes top-level GET navigations. */
class Browser {
  cookies = new Map<string, string>();
  ip = `10.77.${(++ipCounter >> 8) & 255}.${ipCounter & 255}`;

  async get(url: string, harness: Harness = h) {
    const r = await harness.app.inject({
      method: 'GET',
      url,
      remoteAddress: this.ip,
      headers: this.cookies.size ? { cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ') } : {},
    });
    for (const c of r.cookies as { name: string; value: string; expires?: Date }[]) {
      if (c.value === '' || (c.expires && c.expires.getTime() < Date.now())) this.cookies.delete(c.name);
      else this.cookies.set(c.name, c.value);
    }
    return r;
  }

  async start(next?: string) {
    const r = await this.get(`${API}/auth/google/start${next === undefined ? '' : `?next=${encodeURIComponent(next)}`}`);
    expect(r.statusCode).toBe(302);
    return { response: r, authorizeUrl: r.headers.location as string };
  }

  /** Goes to the provider and back, with `tweaks` applied to what the provider answers. */
  async signIn(tweaks: TokenTweaks, next?: string) {
    const { authorizeUrl } = await this.start(next);
    // These addresses are on example.com, so by default they model a Workspace account, which may start an account here.
    const back = new URL(provider.approve(authorizeUrl, { hd: 'example.com', ...tweaks }));
    return this.get(`${back.pathname}${back.search}`);
  }

  api(url: string) {
    return this.get(`${API}${url}`);
  }
}

const usersWith = async (email: string) => {
  const [row] = await h.admin<{ n: number }[]>`SELECT count(*)::int AS n FROM app.users WHERE email_hash = ${emailBlindIndex(h.config.keys, email)}`;
  return row!.n;
};
const identities = async (id: string) => {
  const [row] = await h.admin<{ n: number }[]>`SELECT count(*)::int AS n FROM app.user_identities WHERE user_id = ${id}::uuid`;
  return row!.n;
};
/**
 * Connect from Settings, for a client that has just signed in by code, which counts as a re-authentication. The connect
 * state names the session, so the trip to the provider and back needs only the state cookie, as in a real browser.
 */
async function connectGoogle(client: Client, tweaks: TokenTweaks) {
  const r = await client.post(`${API}/me/identities/google/connect`);
  expect(r.statusCode).toBe(200);
  const state = (r.cookies as { name: string; value: string }[]).find((c) => c.name === STATE_COOKIE)!.value;
  const browser = new Browser();
  browser.cookies.set(STATE_COOKIE, state);
  const back = new URL(provider.approve(r.json().url as string, tweaks));
  return browser.get(`${back.pathname}${back.search}`);
}
const sentTo = (email: string, purpose: string) => h.mailer.sent.filter((m) => m.to === email && m.purpose === purpose);

function expectRejected(r: { statusCode: number; headers: Record<string, unknown>; body: string }, browser: Browser) {
  expect(r.statusCode).toBe(302);
  expect(r.headers.location).toBe(REJECTED);
  expect(r.body).toBe('');
  expect(browser.cookies.has(SESSION_COOKIE)).toBe(false);
  expect(browser.cookies.has(STATE_COOKIE)).toBe(false);
}

describe('GET /auth/google/start', () => {
  it('redirects to the provider with PKCE S256, state, nonce and only the openid and email scopes', async () => {
    const { authorizeUrl } = await new Browser().start();
    const url = new URL(authorizeUrl);
    expect(url.origin + url.pathname).toBe(`${provider.base}/authorize`);
    const p = url.searchParams;
    expect(p.get('client_id')).toBe(FAKE_CLIENT_ID);
    expect(p.get('response_type')).toBe('code');
    expect(p.get('scope')).toBe('openid email');
    expect(p.get('code_challenge_method')).toBe('S256');
    expect(p.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(p.get('state')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(p.get('nonce')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(authorizeUrl).not.toContain(FAKE_CLIENT_SECRET);
  });

  it('builds the redirect URI from PUBLIC_ORIGIN, whatever the request says', async () => {
    const r = await h.app.inject({ method: 'GET', url: `${API}/auth/google/start`, remoteAddress: '10.76.0.1', headers: { host: 'evil.example', 'x-forwarded-host': 'evil.example' } });
    const redirect = new URL(r.headers.location as string).searchParams.get('redirect_uri');
    expect(redirect).toBe(`${ORIGIN}/api/v1/auth/google/callback`);
  });

  it('keeps state in a short-lived __Host- cookie: HttpOnly, Secure, Lax, encrypted', async () => {
    const { response, authorizeUrl } = await new Browser().start('/journal');
    const raw = ([] as string[]).concat(response.headers['set-cookie'] as string).find((c) => c.startsWith(`${STATE_COOKIE}=`))!;
    expect(raw).toMatch(/; Max-Age=600(;|$)/);
    expect(raw).toMatch(/; Path=\/(;|$)/);
    expect(raw).toMatch(/; HttpOnly/);
    expect(raw).toMatch(/; Secure/);
    expect(raw).toMatch(/; SameSite=Lax/);
    expect(raw).not.toMatch(/Domain=/i);
    const p = new URL(authorizeUrl).searchParams;
    const decoded = decodeURIComponent(raw);
    for (const secret of [p.get('state')!, p.get('nonce')!, '/journal']) expect(decoded).not.toContain(secret);
    expect(response.headers['cache-control']).toContain('no-store');
  });

  it('is a plain redirect with no script, and the CSP is unchanged', async () => {
    const { response } = await new Browser().start();
    const csp = response.headers['content-security-policy'] as string;
    expect(csp).toContain("default-src 'none'");
    expect(csp).not.toContain('google');
    expect(response.body).toBe('');
  });

  it('every request gets fresh values', async () => {
    const one = new URL((await new Browser().start()).authorizeUrl).searchParams;
    const two = new URL((await new Browser().start()).authorizeUrl).searchParams;
    for (const name of ['state', 'nonce', 'code_challenge']) expect(one.get(name)).not.toBe(two.get(name));
  });

  it('has a per-client route limit', async () => {
    const browser = new Browser();
    let last = 0;
    for (let i = 0; i < 31; i += 1) last = (await browser.get(`${API}/auth/google/start`)).statusCode;
    expect(last).toBe(429);
  });
});

describe('a new person', () => {
  it('gets an account, a strict session and the consent gate, with nothing of Google stored but an HMAC', async () => {
    const email = uniqueEmail('google-new');
    const browser = new Browser();
    const r = await browser.signIn({ email }, '/journal');
    expect(r.statusCode).toBe(302);
    expect(r.headers.location).toBe('/consent?next=%2Fjournal');
    const raw = ([] as string[]).concat(r.headers['set-cookie'] as string);
    const session = raw.find((c) => c.startsWith(`${SESSION_COOKIE}=`))!;
    expect(session).toMatch(/SameSite=Strict/);
    expect(browser.cookies.has(STATE_COOKIE)).toBe(false);

    const me = await browser.api('/me');
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ email, displayName: null, consentRequired: true });
    expect((await browser.api('/journal')).statusCode).toBe(403);

    const id = me.json().id as string;
    const [row] = await h.admin<{ subject_hmac: Buffer; provider: string }[]>`SELECT * FROM app.user_identities WHERE user_id = ${id}::uuid`;
    expect(row!.provider).toBe('google');
    const [user] = await h.admin<{ password_hash: string | null; display_name_ct: Buffer | null }[]>`SELECT password_hash, display_name_ct FROM app.users WHERE id = ${id}::uuid`;
    expect(user).toEqual({ password_hash: null, display_name_ct: null });
    expect(row!.subject_hmac.length).toBe(32);
    await h.app.drainBackground();
    expect(sentTo(email, 'new_signin_notice')).toEqual([]);
    expect(sentTo(email, 'google_linked_notice')).toEqual([]);
  });

  it('a mixed-case address from the provider is one account with the same address typed by hand', async () => {
    const lower = uniqueEmail('google-case');
    const browser = new Browser();
    await browser.signIn({ email: lower.toUpperCase() });
    expect((await browser.api('/me')).json().email).toBe(lower);
    expect(await usersWith(lower)).toBe(1);
  });
});

describe('a returning person', () => {
  it('is found by subject, even after their Google address changes, and gets the usual notice', async () => {
    const email = uniqueEmail('google-back');
    const sub = `sub-${email}`;
    const first = new Browser();
    await first.signIn({ email, sub });
    const id = (await first.api('/me')).json().id as string;
    await first.get(`${API}/me`);
    const consent = new Client(h);
    expect(consent).toBeDefined();

    const later = new Browser();
    const r = await later.signIn({ email: uniqueEmail('new-address-at-google'), sub });
    expect(r.statusCode).toBe(302);
    const me = await later.api('/me');
    expect(me.json().id).toBe(id);
    expect(me.json().email).toBe(email);
    await h.app.drainBackground();
    expect(sentTo(email, 'new_signin_notice')).toHaveLength(1);
  });

  it('goes straight to next once consent is done', async () => {
    const email = uniqueEmail('google-next');
    const sub = `sub-${email}`;
    const client = await signInConsented(h, email);
    await connectGoogle(client.client, { email, sub });
    const browser = new Browser();
    const r = await browser.signIn({ email, sub }, '/journal/new?step=2');
    expect(r.headers.location).toBe('/journal/new?step=2');
    expect((await browser.api('/me')).json().id).toBe(client.id);
  });
});

describe('linking', () => {
  it('a verified Google address never links to the existing account at sign-in: it is refused, pointing to Settings', async () => {
    const owner = await signInConsented(h);
    const browser = new Browser();
    const r = await browser.signIn({ email: owner.email });
    expect(r.headers.location).toBe('/sign-in?error=google_link');
    expect(browser.cookies.has(SESSION_COOKIE)).toBe(false);
    expect(await identities(owner.id)).toBe(0);
    await h.app.drainBackground();
    expect(sentTo(owner.email, 'google_linked_notice')).toHaveLength(0);
  });

  it('connecting from Settings links it, keeping the account\'s data, mails a notice and audits it', async () => {
    const owner = await signInConsented(h);
    await owner.client.patch(`${API}/me`, { displayName: 'Asha' });
    const r = await connectGoogle(owner.client, { email: owner.email, sub: `sub-${owner.email}` });
    expect(r.headers.location).toBe('/settings?google=connected');
    const browser = new Browser();
    expect((await browser.signIn({ email: owner.email, sub: `sub-${owner.email}` })).headers.location).toBe('/');
    expect((await browser.api('/me')).json()).toMatchObject({ id: owner.id, displayName: 'Asha', consentRequired: false });
    expect(await identities(owner.id)).toBe(1);
    await h.app.drainBackground();
    const [notice] = sentTo(owner.email, 'google_linked_notice');
    expect(notice!.code).toBeNull();
    const [audit] = await h.admin<{ n: number }[]>`SELECT count(*)::int AS n FROM app.audit_log WHERE action = 'google_link'`;
    expect(audit!.n).toBeGreaterThan(0);
  });

  it('connecting a Google login that belongs to another account is refused', async () => {
    const first = await signIn(h);
    await connectGoogle(first.client, { email: first.email, sub: `taken-${first.email}` });
    const second = await signIn(h);
    expect((await connectGoogle(second.client, { email: second.email, sub: `taken-${first.email}` })).headers.location).toBe('/settings?google=taken');
    expect(await identities(second.id)).toBe(0);
  });

  it('email_verified=false is rejected: no link, no account, no session', async () => {
    const owner = await signInConsented(h);
    const browser = new Browser();
    expectRejected(await browser.signIn({ email: owner.email, email_verified: false }), browser);
    expect(await identities(owner.id)).toBe(0);

    const fresh = uniqueEmail('google-unverified');
    const other = new Browser();
    expectRejected(await other.signIn({ email: fresh, email_verified: false }), other);
    expect(await usersWith(fresh)).toBe(0);
  });

  it.each([['the string "true"', 'true'], ['a number', 1], ['missing', undefined]])('email_verified as %s is rejected', async (_name, value) => {
    const fresh = uniqueEmail('google-odd-verified');
    const browser = new Browser();
    const tweaks: TokenTweaks = value === undefined ? { email: fresh, omit: ['email_verified'] } : { email: fresh, email_verified: value };
    expectRejected(await browser.signIn(tweaks), browser);
    expect(await usersWith(fresh)).toBe(0);
  });

  it('an attacker cannot pre-hijack: asking to register an address leaves nothing to link to', async () => {
    const victim = uniqueEmail('google-prehijack');
    const attacker = new Client(h);
    await attacker.post(`${API}/auth/register/request`, { email: victim });
    await h.app.drainBackground();
    expect(await usersWith(victim)).toBe(0);
    expect((await attacker.post(`${API}/auth/login`, { email: victim, password: PASSWORD })).json().code).toBe('invalid_credentials');

    const browser = new Browser();
    await browser.signIn({ email: victim });
    expect((await browser.api('/me')).json().email).toBe(victim);
    const [user] = await h.admin<{ password_hash: string | null }[]>`SELECT password_hash FROM app.users WHERE email_hash = ${emailBlindIndex(h.config.keys, victim)}`;
    expect(user!.password_hash).toBeNull();
    expect((await attacker.post(`${API}/auth/login`, { email: victim, password: PASSWORD })).json().code).toBe('invalid_credentials');
  });

  it('a second Google login with the same address cannot link to an account that has one: a recycled address gets nothing', async () => {
    const email = uniqueEmail('google-recycled');
    const first = new Browser();
    await first.signIn({ email, sub: `first-${email}` });
    const id = (await first.api('/me')).json().id as string;
    const second = new Browser();
    const r = await second.signIn({ email, sub: `second-${email}` });
    expect(r.headers.location).toBe('/sign-in?error=google_link');
    expect(second.cookies.has(SESSION_COOKIE)).toBe(false);
    expect(await identities(id)).toBe(1);
  });

  it('never stores a name or photo the provider sends', async () => {
    const email = uniqueEmail('google-profile');
    const browser = new Browser();
    await browser.signIn({ email });
    const me = await browser.api('/me');
    expect(me.body).not.toContain('Should Not Be Stored');
    expect(me.json().displayName).toBeNull();
  });
});

describe('state and code', () => {
  const callback = (query: string) => `${API}/auth/google/callback?${query}`;

  it('bad state is rejected', async () => {
    const browser = new Browser();
    const { authorizeUrl } = await browser.start();
    const back = new URL(provider.approve(authorizeUrl, { email: uniqueEmail('bad-state') }));
    back.searchParams.set('state', 'A'.repeat(43));
    const calls = provider.log.length;
    expectRejected(await browser.get(`${back.pathname}${back.search}`), browser);
    expect(provider.log.slice(calls), 'the code is not even exchanged').toEqual([]);
  });

  it('missing state or code, and no cookie at all, are rejected', async () => {
    const browser = new Browser();
    const { authorizeUrl } = await browser.start();
    const back = new URL(provider.approve(authorizeUrl, { email: uniqueEmail('missing') }));
    const state = back.searchParams.get('state')!;
    const code = back.searchParams.get('code')!;
    expectRejected(await browser.get(callback(`code=${code}`)), browser);

    const two = new Browser();
    await two.start();
    expectRejected(await two.get(callback(`state=${state}`)), two);

    const three = new Browser();
    expectRejected(await three.get(callback(`state=${state}&code=${code}`)), three);
  });

  it("another browser's callback URL is useless: login CSRF fails", async () => {
    const attacker = new Browser();
    const { authorizeUrl } = await attacker.start();
    const back = new URL(provider.approve(authorizeUrl, { email: uniqueEmail('login-csrf') }));
    const victim = new Browser();
    await victim.start();
    expectRejected(await victim.get(`${back.pathname}${back.search}`), victim);
  });

  it('a reused state is rejected, even with its cookie replayed and a fresh code', async () => {
    const browser = new Browser();
    const { authorizeUrl } = await browser.start();
    const cookie = browser.cookies.get(STATE_COOKIE)!;
    const email = uniqueEmail('reused');
    const back = new URL(provider.approve(authorizeUrl, { email, hd: 'example.com' }));
    expect((await browser.get(`${back.pathname}${back.search}`)).headers.location).toBe('/consent?next=%2F');

    const replay = new Browser();
    replay.cookies.set(STATE_COOKIE, cookie);
    const again = new URL(provider.approve(authorizeUrl, { email, hd: 'example.com' }));
    expectRejected(await replay.get(`${again.pathname}${again.search}`), replay);
  });

  it('a tampered cookie is rejected', async () => {
    const browser = new Browser();
    const { authorizeUrl } = await browser.start();
    const value = browser.cookies.get(STATE_COOKIE)!;
    browser.cookies.set(STATE_COOKIE, `${value.slice(0, -4)}AAAA`);
    const back = new URL(provider.approve(authorizeUrl, { email: uniqueEmail('tampered') }));
    expectRejected(await browser.get(`${back.pathname}${back.search}`), browser);
  });

  it('an expired cookie is rejected, whatever its Max-Age said', async () => {
    const browser = new Browser();
    const { authorizeUrl } = await browser.start();
    const params = new URL(authorizeUrl).searchParams;
    const back = new URL(provider.approve(authorizeUrl, { email: uniqueEmail('old-cookie') }));
    browser.cookies.set(STATE_COOKIE, sealOauthState(h.config.keys, { mode: 'signin',
      state: params.get('state')!,
      nonce: params.get('nonce')!,
      verifier: 'x'.repeat(43),
      next: '/',
      expiresAt: Date.now() - 1000,
    }));
    expectRejected(await browser.get(`${back.pathname}${back.search}`), browser);
  });

  it('a provider error, such as the person choosing Cancel, is rejected with no detail in the URL', async () => {
    const browser = new Browser();
    const { authorizeUrl } = await browser.start();
    const state = new URL(authorizeUrl).searchParams.get('state')!;
    const r = await browser.get(callback(`error=access_denied&error_description=SECRET-DETAIL&state=${state}`));
    expectRejected(r, browser);
    expect(String(r.headers.location)).not.toContain('SECRET');
  });

  it('keeps a valid next through a rejection, and nothing about why', async () => {
    const browser = new Browser();
    const { authorizeUrl } = await browser.start('/journal');
    const back = new URL(provider.approve(authorizeUrl, { email: uniqueEmail('kept'), email_verified: false }));
    const r = await browser.get(`${back.pathname}${back.search}`);
    expect(r.headers.location).toBe('/sign-in?error=google&next=%2Fjournal');
  });

  it('a wrong PKCE verifier is refused by the provider, and so here', async () => {
    const browser = new Browser();
    const { authorizeUrl } = await browser.start();
    const url = new URL(authorizeUrl);
    url.searchParams.set('code_challenge', 'B'.repeat(43));
    const back = new URL(provider.approve(url.toString(), { email: uniqueEmail('pkce') }));
    expectRejected(await browser.get(`${back.pathname}${back.search}`), browser);
  });
});

describe('the ID token', () => {
  const now = () => Math.floor(Date.now() / 1000);
  const cases: [string, (email: string) => TokenTweaks][] = [
    ['wrong nonce', (email) => ({ email, nonce: 'not-the-nonce' })],
    ['missing nonce', (email) => ({ email, omit: ['nonce'] })],
    ['wrong aud', (email) => ({ email, aud: 'someone-elses-client.apps.googleusercontent.com' })],
    ['aud listing another client too', (email) => ({ email, aud: [FAKE_CLIENT_ID, 'other'] })],
    ['missing aud', (email) => ({ email, omit: ['aud'] })],
    ['wrong azp', (email) => ({ email, azp: 'other-client' })],
    ['wrong iss', (email) => ({ email, iss: 'https://evil.example' })],
    ['real Google iss, on a server pointed elsewhere', (email) => ({ email, iss: 'https://accounts.google.com' })],
    ['missing iss', (email) => ({ email, omit: ['iss'] })],
    ['expired', (email) => ({ email, exp: now() - 3600, iat: now() - 7200 })],
    ['missing exp', (email) => ({ email, omit: ['exp'] })],
    ['issued in the future', (email) => ({ email, iat: now() + 3600, exp: now() + 7200 })],
    ['exp not a number', (email) => ({ email, exp: 'soon' as unknown as number })],
    ['missing sub', (email) => ({ email, omit: ['sub'] })],
    ['empty sub', (email) => ({ email, sub: '' })],
    ['malformed email', () => ({ email: 'not-an-address' })],
    ['signed by a key that is not in the JWKS', (email) => ({ email, signing: 'other-key' })],
    ['alg none', (email) => ({ email, signing: 'none' })],
    ['HS256 keyed with the public key', (email) => ({ email, signing: 'hs256-with-public-key' })],
    ['an unknown kid', (email) => ({ email, signing: 'unknown-kid' })],
    ['claims changed after signing', (email) => ({ email, signing: 'tampered' })],
    ['token endpoint failing', (email) => ({ email, token: 'http-500' })],
    ['token endpoint answering HTML', (email) => ({ email, token: 'not-json' })],
    ['no id_token', (email) => ({ email, token: 'no-id-token' })],
    ['an absurdly large response', (email) => ({ email, token: 'huge' })],
  ];

  it.each(cases)('%s is rejected, and creates nothing', async (name, tweaks) => {
    const email = uniqueEmail(`token-${name.replace(/\W+/g, '-').slice(0, 20)}`);
    const browser = new Browser();
    const r = await browser.signIn(tweaks(email));
    expectRejected(r, browser);
    expect(await usersWith(email)).toBe(0);
    expect(await usersWith('attacker-changed@example.com')).toBe(0);
    expect((await browser.api('/me')).statusCode).toBe(401);
  });

  it('a rejection logs no detail: no token, code, state, subject, address or provider error body', async () => {
    h.logs.length = 0;
    const email = uniqueEmail('logged-google');
    const browser = new Browser();
    const { authorizeUrl } = await browser.start();
    const params = new URL(authorizeUrl).searchParams;
    const back = new URL(provider.approve(authorizeUrl, { email, sub: 'SUBJECT-MARKER', token: 'http-500' }));
    await browser.get(`${back.pathname}${back.search}`);
    const good = new Browser();
    const ok = await good.signIn({ email, sub: 'SUBJECT-MARKER' });
    expect(ok.statusCode).toBe(302);
    const written = h.logs.join('\n');
    for (const secret of [email, 'SUBJECT-MARKER', params.get('state')!, params.get('nonce')!, back.searchParams.get('code')!, FAKE_CLIENT_SECRET, 'FAKE-ACCESS-TOKEN', 'SECRET-IN-ERROR-BODY', 'eyJ']) {
      expect(written, secret).not.toContain(secret);
    }
  });
});

describe('what a rejection logs', () => {
  it('is one word from a fixed vocabulary, and the usual request line', async () => {
    h.logs.length = 0;
    const browser = new Browser();
    await browser.signIn({ email: uniqueEmail('log-word'), nonce: 'not-the-nonce' });
    const lines = h.logs.map((line) => JSON.parse(line) as Record<string, unknown>);
    const rejected = lines.find((line) => line.msg === 'google_signin_rejected')!;
    expect(rejected.reason).toBe('token_nonce');
    expect(Object.keys(rejected).sort()).toEqual(['level', 'msg', 'reason', 'reqId', 'time']);
  });
});

describe('open redirect through next', () => {
  it.each([
    'https://evil.example', '//evil.example', '/\\evil.example', '\\\\evil.example', '/\t/evil.example', '/\n/evil.example', '/.//evil.example',
    'javascript:alert(1)', 'evil.example', '/api/v1/me', '/sign-in', '/consent',
  ])('%j falls back to /', async (next) => {
    const email = uniqueEmail('redirect');
    const owner = await signInConsented(h, email);
    await connectGoogle(owner.client, { email, sub: `sub-${email}` });
    const browser = new Browser();
    const r = await browser.signIn({ email, sub: `sub-${email}` }, next);
    expect(r.statusCode).toBe(302);
    expect(r.headers.location).toBe('/');
  });

  it('a consent redirect carries only a safe next too', async () => {
    const browser = new Browser();
    const r = await browser.signIn({ email: uniqueEmail('redirect-consent') }, '//evil.example');
    expect(r.headers.location).toBe('/consent?next=%2F');
  });
});

describe('disconnecting Google', () => {
  it('needs a recent re-authentication, not a password: a Google-only account proves an email code, then disconnects', async () => {
    const email = uniqueEmail('disconnect-reauth');
    const browser = new Browser();
    await browser.signIn({ email, sub: `sub-${email}` });
    const client = new Client(h);
    client.cookie = browser.cookies.get(SESSION_COOKIE)!;
    const id = (await client.get(`${API}/me`)).json().id as string;
    // A Google sign-in is not a re-authentication.
    const blocked = await client.delete(`${API}/me/identities/google`);
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().code).toBe('reauth_required');
    expect(await identities(id)).toBe(1);

    await client.post(`${API}/me/reauth/code/request`);
    await h.app.drainBackground();
    expect((await client.post(`${API}/me/reauth/code`, { code: h.mailer.codeFor(email, 'reauth') })).statusCode).toBe(204);
    expect((await client.delete(`${API}/me/identities/google`)).statusCode).toBe(204);
    expect(await identities(id)).toBe(0);
    expect((await client.get(`${API}/me/sign-in-methods`)).json()).toEqual({ password: false, google: false });
    await h.app.drainBackground();
    expect(sentTo(email, 'google_unlinked_notice')).toHaveLength(1);
    const [audit] = await h.admin<{ n: number }[]>`SELECT count(*)::int AS n FROM app.audit_log WHERE action = 'google_unlink'`;
    expect(audit!.n).toBeGreaterThan(0);
  });

  it('a wrong re-authentication code does not open the window', async () => {
    const email = uniqueEmail('reauth-wrong');
    const browser = new Browser();
    await browser.signIn({ email, sub: `sub-${email}` });
    const client = new Client(h);
    client.cookie = browser.cookies.get(SESSION_COOKIE)!;
    await client.post(`${API}/me/reauth/code/request`);
    await h.app.drainBackground();
    const right = h.mailer.codeFor(email, 'reauth');
    expect((await client.post(`${API}/me/reauth/code`, { code: right === '000000' ? '111111' : '000000' })).json().code).toBe('invalid_code');
    expect((await client.delete(`${API}/me/identities/google`)).statusCode).toBe(403);
  });

  it('is a 404 with nothing linked, and only ever touches your own', async () => {
    const owner = await signIn(h);
    await connectGoogle(owner.client, { email: owner.email, sub: `sub-${owner.email}` });
    expect(await identities(owner.id)).toBe(1);
    // Signed in by code just now, so recently re-authenticated.
    const stranger = await signIn(h);
    expect((await stranger.client.delete(`${API}/me/identities/google`)).statusCode).toBe(404);
    expect(await identities(owner.id)).toBe(1);
    expect((await new Client(h).delete(`${API}/me/identities/google`)).statusCode).toBe(401);
  });

  it('needs the CSRF header', async () => {
    const owner = await signIn(h);
    const r = await h.app.inject({ method: 'DELETE', url: `${API}/me/identities/google`, remoteAddress: '10.75.0.1', headers: { cookie: `${SESSION_COOKIE}=${owner.client.cookie}`, origin: ORIGIN } });
    expect(r.statusCode).toBe(403);
    expect(r.json().code).toBe('csrf_failed');
  });
});

describe('erasure and export', () => {
  it('erasure removes the identity; a later Google sign-in starts a fresh account', async () => {
    const email = uniqueEmail('erased');
    const sub = `sub-${email}`;
    const browser = new Browser();
    await browser.signIn({ email, sub });
    const client = new Client(h);
    client.cookie = browser.cookies.get(SESSION_COOKIE)!;
    const id = (await client.get(`${API}/me`)).json().id as string;
    await client.post(`${API}/me/delete/request`);
    await h.app.drainBackground();
    expect((await client.post(`${API}/me/delete/confirm`, { code: h.mailer.codeFor(email, 'account_delete') })).statusCode).toBe(204);
    expect(await identities(id)).toBe(0);
    expect(await usersWith(email)).toBe(0);

    const again = new Browser();
    await again.signIn({ email, sub });
    expect((await again.api('/me')).json().id).not.toBe(id);
  });

  it('an unconsented account purged after a day takes its identity with it', async () => {
    const { runPurge } = await import('../src/purge.ts');
    const email = uniqueEmail('purged');
    const browser = new Browser();
    await browser.signIn({ email });
    const id = (await browser.api('/me')).json().id as string;
    await h.admin`UPDATE app.users SET created_at = now() - interval '25 hours' WHERE id = ${id}::uuid`;
    await runPurge(h.runtime);
    expect(await identities(id)).toBe(0);
  });

  it('the export states the method and never the subject', async () => {
    const email = uniqueEmail('export');
    const sub = 'SUBJECT-MUST-NOT-APPEAR';
    const browser = new Browser();
    await browser.signIn({ email, sub });
    const client = new Client(h);
    client.cookie = browser.cookies.get(SESSION_COOKIE)!;
    await client.post(`${API}/me/consent`, consentPayload);
    const r = await client.get(`${API}/me/export`);
    expect(r.json().signInMethods).toEqual({ password: false, google: true });
    expect(r.body).not.toContain(sub);
    const [row] = await h.admin<{ subject_hmac: Buffer }[]>`SELECT subject_hmac FROM app.user_identities WHERE user_id = ${r.json().account.id}::uuid`;
    expect(r.body).not.toContain(row!.subject_hmac.toString('hex'));
    expect(r.body).not.toContain(row!.subject_hmac.toString('base64'));
    expect(JSON.stringify(row!.subject_hmac)).not.toContain(sub);
  });
});

describe('when Google is off', () => {
  let off: Harness;
  beforeAll(async () => {
    off = await createHarness();
  });
  afterAll(async () => {
    await off.close();
  });

  it('/meta says so', async () => {
    expect((await new Client(off).get(`${API}/meta`)).json().googleEnabled).toBe(false);
    expect((await new Client(h).get(`${API}/meta`)).json().googleEnabled).toBe(true);
  });

  it('start and callback go back to sign-in, and nothing is called', async () => {
    const calls = provider.log.length;
    const browser = new Browser();
    expect((await browser.get(`${API}/auth/google/start`, off)).headers.location).toBe(REJECTED);
    expect((await browser.get(`${API}/auth/google/callback?state=x&code=y`, off)).headers.location).toBe(REJECTED);
    expect(browser.cookies.size).toBe(0);
    expect(provider.log.length).toBe(calls);
  });
});

describe('consent', () => {
  it('these routes do not need it', async () => {
    const email = uniqueEmail('google-no-consent');
    const browser = new Browser();
    await browser.signIn({ email });
    expect((await browser.api('/me/sign-in-methods')).statusCode).toBe(200);
    expect((await browser.api('/me/export')).statusCode).toBe(200);
    expect((await browser.api('/journal')).statusCode).toBe(403);
  });
});
