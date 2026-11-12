// The second security review's attack scripts (2026-11-07), kept as written: they print outcomes rather than assert.
// The assertions live in ../security-regressions.test.ts. Run: npx vitest run --config test/attacks/vitest.config.ts --reporter=verbose
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FakeOidc, FAKE_CLIENT_ID, FAKE_CLIENT_SECRET, type TokenTweaks } from '../../scripts/fake-oidc.ts';
import { API, Client, createHarness, uniqueEmail, type Harness } from '../helpers.ts';

let h: Harness; let provider: FakeOidc;
beforeAll(async () => {
  provider = await new FakeOidc().start();
  h = await createHarness({ GOOGLE_CLIENT_ID: FAKE_CLIENT_ID, GOOGLE_CLIENT_SECRET: FAKE_CLIENT_SECRET, GOOGLE_OIDC_BASE_URL: provider.base });
});
afterAll(async () => { await h.close(); await provider.stop(); });

let ipc = 0;
class Browser {
  cookies = new Map<string, string>(); ip = `10.88.${(++ipc >> 8) & 255}.${ipc & 255}`;
  async get(url: string) {
    const r = await h.app.inject({ method: 'GET', url, remoteAddress: this.ip, headers: this.cookies.size ? { cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ') } : {} });
    for (const c of r.cookies as { name: string; value: string }[]) { if (c.value === '' ) this.cookies.delete(c.name); else this.cookies.set(c.name, c.value); }
    return r;
  }
  async google(tweaks: TokenTweaks) {
    const s = await this.get(`${API}/auth/google/start`);
    const back = new URL(provider.approve(s.headers.location as string, tweaks));
    return this.get(`${back.pathname}${back.search}`);
  }
}
const PW = 'river stone quiet morning';
async function register(email: string, password = PW) {
  const c = new Client(h);
  await c.post(`${API}/auth/register/request`, { email }); await h.app.drainBackground();
  const r = await c.post(`${API}/auth/register/verify`, { email, code: h.mailer.codeFor(email, 'register'), password, displayName: 'Asha' });
  expect(r.statusCode).toBe(200); return { c, id: r.json().id };
}

describe('google', () => {
  it('a Google account with the victim address but a different subject takes over an existing password account', async () => {
    const email = uniqueEmail('victim');
    const { id } = await register(email);
    const b = new Browser();
    const r = await b.google({ email, sub: 'attacker-sub-1' });
    console.log('callback', r.statusCode, r.headers.location);
    const me = await b.get(`${API}/me`);
    console.log('ATO /me', me.statusCode, me.json().id === id, me.json().email);
    // victim resets password: does Google link survive?
    const v = new Client(h);
    await v.post(`${API}/auth/password/forgot`, { email }); await h.app.drainBackground();
    const rr = await v.post(`${API}/auth/password/reset`, { email, code: h.mailer.codeFor(email, 'password_reset'), password: 'another quiet morning walk' });
    console.log('reset', rr.statusCode);
    const b2 = new Browser();
    await b2.google({ email: 'attacker-new@example.org', sub: 'attacker-sub-1' });
    const me2 = await b2.get(`${API}/me`);
    console.log('after reset, attacker google again', me2.statusCode, me2.statusCode === 200 && me2.json().id === id);
  });
});

describe('lockout', () => {
  it('10 wrong passwords lock the owner out with the right one', async () => {
    const email = uniqueEmail('lock'); await register(email);
    for (let i = 0; i < 10; i++) { const a = new Client(h); await a.post(`${API}/auth/login`, { email, password: `wrong password ${i}xx` }); }
    const r = await new Client(h).post(`${API}/auth/login`, { email, password: PW });
    console.log('owner correct password after 10 failures', r.statusCode, r.json().code ?? r.json().title);
  });
});

describe('race', () => {
  it('change password racing a reset', async () => {
    let wins = 0; const N = 6;
    for (let t = 0; t < N; t++) {
      const email = uniqueEmail('race'); const { c: attacker } = await register(email);
      const v = new Client(h);
      await v.post(`${API}/auth/password/forgot`, { email }); await h.app.drainBackground();
      const code = h.mailer.codeFor(email, 'password_reset');
      const before = h.app.passwords.stats.verifications;
      const change = attacker.post(`${API}/me/password`, { currentPassword: PW, password: 'attacker owns this now' });
      while (h.app.passwords.stats.verifications === before) await new Promise((r) => setImmediate(r));
      const reset = await v.post(`${API}/auth/password/reset`, { email, code, password: 'victim new secret phrase' });
      const ch = await change;
      const vme = await v.get(`${API}/me`);
      const al = await new Client(h).post(`${API}/auth/login`, { email, password: 'attacker owns this now' });
      console.log(`try ${t}: reset ${reset.statusCode} change ${ch.statusCode} victimSession ${vme.statusCode} attackerLogin ${al.statusCode}`);
      if (al.statusCode === 200) wins++;
    }
    console.log('attacker wins', wins, '/', N);
  });
});

describe('timing', () => {
  it('login timing by account kind', async () => {
    const withPw = uniqueEmail('tp'); await register(withPw);
    const c = new Client(h); await c.post(`${API}/auth/otp/request`, { email: uniqueEmail('x') });
    const noPwEmail = uniqueEmail('np'); { const cl = new Client(h); await cl.post(`${API}/auth/otp/request`, { email: noPwEmail }); await h.app.drainBackground(); await cl.post(`${API}/auth/otp/verify`, { email: noPwEmail, code: h.mailer.codeFor(noPwEmail) }); }
    const time = async (email: string) => { const ts: number[] = []; for (let i = 0; i < 8; i++) { const s = performance.now(); await new Client(h).post(`${API}/auth/login`, { email, password: `nope nope ${i}zz` }); ts.push(performance.now() - s); } ts.sort((a,b)=>a-b); return ts[4]!.toFixed(1); };
    console.log('median ms: password', await time(withPw), 'nopw', await time(noPwEmail), 'unknown', await time(uniqueEmail('unk')));
  });
});
