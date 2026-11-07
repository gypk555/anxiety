// See attacks.attack.ts.
import { afterAll, beforeAll, expect, it } from 'vitest';
import { API, Client, createHarness, uniqueEmail, type Harness } from '../helpers.ts';
let h: Harness;
beforeAll(async () => { h = await createHarness(); });
afterAll(async () => { await h.close(); });
const PW = 'river stone quiet morning';
async function register(email: string) {
  const c = new Client(h);
  await c.post(`${API}/auth/register/request`, { email }); await h.app.drainBackground();
  const r = await c.post(`${API}/auth/register/verify`, { email, code: h.mailer.codeFor(email, 'register'), password: PW });
  expect(r.statusCode).toBe(200); return c;
}
it('timing interleaved', async () => {
  const withPw = uniqueEmail('tp'); await register(withPw);
  const noPw = uniqueEmail('np'); { const cl = new Client(h); await cl.post(`${API}/auth/otp/request`, { email: noPw }); await h.app.drainBackground(); await cl.post(`${API}/auth/otp/verify`, { email: noPw, code: h.mailer.codeFor(noPw) }); }
  const t: Record<string, number[]> = { pw: [], nopw: [], unk: [] };
  for (let i = 0; i < 9; i++) for (const [k, e] of [['pw', withPw], ['nopw', noPw], ['unk', uniqueEmail('u')]] as const) {
    const s = performance.now(); await new Client(h).post(`${API}/auth/login`, { email: e, password: `nope nope ${i}zz` }); t[k]!.push(performance.now() - s);
  }
  for (const k in t) { const a = t[k]!.sort((x, y) => x - y); console.log('TIMING', k, a[4]!.toFixed(1)); }
});
it('full lockout: codes and passwords', async () => {
  const email = uniqueEmail('full'); await register(email);
  // 20 wrong code guesses across live login codes
  let guesses = 0;
  for (let round = 0; round < 4; round++) {
    const a = new Client(h); await a.post(`${API}/auth/otp/request`, { email }); await h.app.drainBackground();
    const real = h.mailer.codeFor(email);
    for (let i = 0; i < 5; i++) { const g = String((Number(real) + 1 + i) % 1e6).padStart(6, '0'); await new Client(h).post(`${API}/auth/otp/verify`, { email, code: g }); guesses++; }
  }
  for (let i = 0; i < 10; i++) await new Client(h).post(`${API}/auth/login`, { email, password: `wrong password ${i}xx` });
  const o = new Client(h);
  const pw = await o.post(`${API}/auth/login`, { email, password: PW });
  await o.post(`${API}/auth/otp/request`, { email }); await h.app.drainBackground();
  const code = await o.post(`${API}/auth/otp/verify`, { email, code: h.mailer.codeFor(email) });
  await o.post(`${API}/auth/password/forgot`, { email }); await h.app.drainBackground();
  const rs = await o.post(`${API}/auth/password/reset`, { email, code: h.mailer.codeFor(email, 'password_reset'), password: 'fresh new long phrase' });
  console.log('LOCKOUT owner: password', pw.statusCode, 'code', code.statusCode, 'reset', rs.statusCode, 'attacker requests', guesses + 10 + 4);
});
it('argon2 queue saturation', async () => {
  const email = uniqueEmail('sat'); await register(email);
  const flood = Array.from({ length: 40 }, (_, i) => new Client(h).post(`${API}/auth/login`, { email: uniqueEmail('f'), password: `flood flood ${i}` }));
  const owner = new Client(h).post(`${API}/auth/login`, { email, password: PW });
  const rs = await Promise.all(flood); const o = await owner;
  console.log('SAT flood codes', rs.map((r) => r.statusCode).join(','), 'owner', o.statusCode);
});
