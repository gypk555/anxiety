import { Writable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { API, assessmentPayload, CapturingMailer, Client, createHarness, journalPayload, ORIGIN, signInConsented, uniqueEmail, type Harness } from './helpers.ts';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

const parsed = () => h.logs.map((line) => JSON.parse(line) as Record<string, unknown>);

describe('logs', () => {
  it('contain no email, cookie, code, IP, query string, user agent, ids or body content', async () => {
    h.logs.length = 0;
    const email = uniqueEmail('never-logged');
    const ip = '10.77.66.55';
    const userAgent = 'LogMarkerAgent/1.0';
    const client = new Client(h, { ip, userAgent });
    await client.post(`${API}/auth/otp/request`, { email });
    await h.app.drainBackground();
    const code = h.mailer.codeFor(email);
    const verify = await client.post(`${API}/auth/otp/verify`, { email, code });
    const userId = verify.json().id as string;
    const cookie = client.cookie!;
    await client.post(`${API}/me/consent`, { version: verify.json().consentVersion, adultConfirmed: true, healthDataConsent: true });
    await client.patch(`${API}/me`, { displayName: 'LogMarkerName' });
    const entry = (await client.post(`${API}/journal`, journalPayload({ thought: 'LogMarkerThought' }))).json();
    await client.post(`${API}/assessments`, assessmentPayload());
    await client.get(`${API}/journal?limit=2&cursor=LogMarkerCursor`); // 400
    await client.get(`${API}/journal/${entry.id}?LogMarkerQuery=1`);
    await client.post(`${API}/auth/otp/verify`, { email, code: '000000' }); // failure path
    await client.post(`${API}/auth/otp/request`, { email: 'bad-LogMarkerEmail' });
    await client.get('/nothing/here?LogMarkerQuery=1');
    await client.request({ method: 'POST', url: `${API}/auth/otp/request`, payload: '{bad LogMarkerJson', headers: { 'content-type': 'application/json' } });
    await client.get(`${API}/me/export`);

    const all = h.logs.join('\n');
    expect(h.logs.length).toBeGreaterThan(5);
    for (const secret of [email, 'never-logged', cookie, code, ip, userAgent, userId, entry.id, 'LogMarker', 'cookie', 'set-cookie', 'authorization', 'x-forwarded']) {
      expect([secret, all.includes(secret)]).toEqual([secret, false]);
    }
  });

  it('request lines have exactly the allow-listed fields, with the route template', async () => {
    h.logs.length = 0;
    const { client } = await signInConsented(h);
    const entry = (await client.post(`${API}/journal`, journalPayload())).json();
    await client.get(`${API}/journal/${entry.id}`);
    const lines = parsed().filter((l) => l.msg === 'request');
    for (const line of lines) {
      expect(Object.keys(line).sort()).toEqual(['durationMs', 'level', 'method', 'msg', 'reqId', 'route', 'status', 'time']);
    }
    const hit = lines.find((l) => l.route === '/api/v1/journal/:id');
    expect(hit).toMatchObject({ method: 'GET', status: 200 });
  });

  it('an unknown route logs no path', async () => {
    h.logs.length = 0;
    await h.app.inject({ method: 'POST', url: '/secret-path-here', headers: { origin: ORIGIN, 'x-anxiocare-csrf': '1' } });
    expect(h.logs.join('\n')).not.toContain('secret-path-here');
  });

  it('a mail failure is logged without the address or the provider message', async () => {
    const email = uniqueEmail('undeliverable');
    h.logs.length = 0;
    h.mailer.hook = async (message) => {
      const err = new Error(`550 mailbox ${message.to} rejected`) as Error & { code: string; response: string; rejected: string[] };
      err.code = 'EENVELOPE';
      err.response = `550 ${message.to}`;
      err.rejected = [message.to];
      throw err;
    };
    try {
      const r = await new Client(h).post(`${API}/auth/otp/request`, { email });
      expect(r.statusCode).toBe(202);
      await h.app.drainBackground();
    } finally {
      h.mailer.hook = async () => {};
    }
    const failure = parsed().find((l) => l.msg === 'background_task_failed');
    expect(failure).toBeTruthy();
    expect(failure).toMatchObject({ task: 'otp_delivery', err: { type: 'Error', code: 'EENVELOPE' } });
    expect(h.logs.join('\n')).not.toContain(email);
    expect(h.logs.join('\n')).not.toContain('undeliverable');
  });

  it('a database error is logged without its message, and answered opaquely', async () => {
    const lines: string[] = [];
    const failure = () => {
      const err = new Error('duplicate key value (email)=(leak@example.com)') as Error & { code: string };
      err.code = '23505';
      return Promise.reject(err);
    };
    const sql = Object.assign(failure, { begin: failure });
    const app = await buildApp({
      config: h.config,
      sql: sql as never,
      mailer: new CapturingMailer(),
      logStream: new Writable({
        write(chunk, _enc, cb) {
          lines.push(String(chunk));
          cb();
        },
      }),
    });
    const r = await app.inject({
      method: 'POST',
      url: `${API}/auth/otp/verify`,
      payload: { email: 'a@example.com', code: '123456' },
      headers: { origin: ORIGIN, 'x-anxiocare-csrf': '1' },
    });
    await app.close();
    expect(r.statusCode).toBe(500);
    expect(r.json().code).toBe('internal_error');
    expect(r.body).not.toContain('leak');
    expect(lines.join('\n')).not.toContain('leak@example.com');
    expect(lines.some((l) => l.includes('request_failed') && l.includes('23505'))).toBe(true);
  });

  it('does not print codes to the console outside development', async () => {
    const seen: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
      seen.push(args.join(' '));
    };
    try {
      await new Client(h).post(`${API}/auth/otp/request`, { email: uniqueEmail() });
      await h.app.drainBackground();
    } finally {
      console.log = original;
    }
    expect(seen).toEqual([]);
  });
});
