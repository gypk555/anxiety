import { readFileSync, mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config.ts';
import { emailBlindIndex } from '../src/crypto.ts';
import { createMailer, otpMail } from '../src/mail.ts';
import { OTP_SWEEP_INTERVAL_MS, PURGE_INTERVAL_MS, purgeOtpCodes, runPurge, schedulePurge } from '../src/purge.ts';
import { API, baseEnv, Client, createHarness, requestCode, signIn, signInConsented, uniqueEmail, type Harness } from './helpers.ts';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

const count = async (table: string, where = 'TRUE') =>
  (await h.admin.unsafe(`SELECT count(*)::int AS n FROM app.${table} WHERE ${where}`))[0]!.n as number;

describe('purge', () => {
  it('removes idle-expired and absolute-expired sessions, keeps live ones', async () => {
    const idle = await signIn(h);
    const absolute = await signIn(h);
    const live = await signIn(h);
    await h.admin`UPDATE app.sessions SET last_seen_at = now() - interval '31 days' WHERE user_id = ${idle.id}::uuid`;
    await h.admin`UPDATE app.sessions SET absolute_expires_at = now() - interval '1 second' WHERE user_id = ${absolute.id}::uuid`;
    await runPurge(h.runtime);
    expect(await count('sessions', `user_id = '${idle.id}'`)).toBe(0);
    expect(await count('sessions', `user_id = '${absolute.id}'`)).toBe(0);
    expect(await count('sessions', `user_id = '${live.id}'`)).toBe(1);
  });

  it('removes dead OTP rows, but keeps those still counted by the hourly limit', async () => {
    const email = uniqueEmail();
    await requestCode(h, new Client(h), email);
    await requestCode(h, new Client(h), email);
    const before = await count('otp_codes');
    await runPurge(h.runtime);
    // Superseded a moment ago: dead, but must survive or the limit could be reset by the purge.
    expect(await count('otp_codes')).toBe(before);

    await h.admin`UPDATE app.otp_codes SET created_at = now() - interval '2 hours'`;
    await h.admin`UPDATE app.otp_codes SET expires_at = now() - interval '1 hour'`;
    await runPurge(h.runtime);
    expect(await count('otp_codes')).toBe(0);
  });

  it('removes login failures after the day they count for, expired device tokens, and spent Google states once expired', async () => {
    const quota = Buffer.from('purge-login-failures');
    await h.admin`INSERT INTO app.login_failures (quota_hash, source_hash, created_at) VALUES (${quota}, '\\x01', now() - interval '25 hours'), (${quota}, '\\x01', now() - interval '23 hours')`;
    const { id } = await signIn(h);
    await h.admin`UPDATE app.device_tokens SET expires_at = now() - interval '1 minute' WHERE user_id = ${id}::uuid`;
    await h.admin`INSERT INTO app.oauth_state_uses (state_hash, expires_at) VALUES ('\\x01', now() - interval '1 minute'), ('\\x02', now() + interval '1 minute')`;
    await runPurge(h.runtime);
    expect(await count('login_failures', `quota_hash = '\\x${quota.toString('hex')}'`)).toBe(1);
    expect(await count('oauth_state_uses')).toBe(1);
    expect(await count('device_tokens', `user_id = '${id}'`)).toBe(0);
  });

  it('keeps a live OTP', async () => {
    const email = uniqueEmail();
    const code = await requestCode(h, new Client(h), email);
    await h.admin`UPDATE app.otp_codes SET created_at = now() - interval '9 minutes'`;
    await runPurge(h.runtime);
    expect((await new Client(h).post(`${API}/auth/otp/verify`, { email, code })).statusCode).toBe(200);
  });

  it('removes accounts that never consented after 24h, with everything attached; others stay', async () => {
    const stale = await signIn(h);
    const fresh = await signIn(h);
    const consented = await signInConsented(h);
    await h.admin`UPDATE app.users SET created_at = now() - interval '25 hours' WHERE id IN (${stale.id}::uuid, ${consented.id}::uuid)`;
    const result = await runPurge(h.runtime);
    expect(result.unconsentedUsers).toBe(1);
    expect(await count('users', `id = '${stale.id}'`)).toBe(0);
    expect(await count('sessions', `user_id = '${stale.id}'`)).toBe(0);
    expect(await count('users', `id = '${fresh.id}'`)).toBe(1);
    expect(await count('users', `id = '${consented.id}'`)).toBe(1);
  });

  it('keeps an account whose consent is merely out of date', async () => {
    const { id } = await signInConsented(h);
    await h.admin`UPDATE app.users SET created_at = now() - interval '400 days', consent_version = '2000-01-01' WHERE id = ${id}::uuid`;
    await runPurge(h.runtime);
    expect(await count('users', `id = '${id}'`)).toBe(1);
  });

  it('removes audit rows older than a year, runs as the runtime role, and can read nothing back', async () => {
    await signIn(h);
    await h.admin`UPDATE app.audit_log SET created_at = created_at - interval '366 days'`;
    await signIn(h);
    const result = await runPurge(h.runtime);
    expect(result.auditRows).toBeGreaterThan(0);
    expect(await count('audit_log', `created_at < now() - interval '1 year'`)).toBe(0);
    expect(await count('audit_log')).toBeGreaterThan(0);
  });

  it('is idempotent', async () => {
    await runPurge(h.runtime);
    expect(await runPurge(h.runtime)).toEqual({ sessions: 0, otpCodes: 0, unconsentedUsers: 0, auditRows: 0 });
  });
});

describe('retention timing', () => {
  it('runs the whole purge hourly, not daily', () => {
    expect(PURGE_INTERVAL_MS).toBe(60 * 60 * 1000);
  });

  it('sweeps dead codes often enough that a row is gone about an hour after it was sent', () => {
    expect(OTP_SWEEP_INTERVAL_MS).toBeLessThanOrEqual(5 * 60 * 1000);
  });

  it('schedules both on those intervals, and cancelling stops them', async () => {
    vi.useFakeTimers();
    try {
      const purge = vi.fn(async () => ({ sessions: 0, otpCodes: 0, unconsentedUsers: 0, auditRows: 0 }));
      const sweep = vi.fn(async () => 0);
      const log = { info: vi.fn(), error: vi.fn() };
      const cancel = schedulePurge(h.runtime, log, { purge, sweep });
      expect(purge).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(purge).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(PURGE_INTERVAL_MS);
      expect(purge).toHaveBeenCalledTimes(2);
      expect(sweep.mock.calls.length).toBeGreaterThanOrEqual(11);
      cancel();
      const [purges, sweeps] = [purge.mock.calls.length, sweep.mock.calls.length];
      await vi.advanceTimersByTimeAsync(3 * PURGE_INTERVAL_MS);
      expect([purge.mock.calls.length, sweep.mock.calls.length]).toEqual([purges, sweeps]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('logs a failed sweep or purge without crashing', async () => {
    vi.useFakeTimers();
    try {
      const log = { info: vi.fn(), error: vi.fn() };
      const cancel = schedulePurge(h.runtime, log, { purge: async () => { throw new Error('down'); }, sweep: async () => { throw new Error('down'); } });
      await vi.advanceTimersByTimeAsync(OTP_SWEEP_INTERVAL_MS + 60_000);
      cancel();
      expect(log.error.mock.calls.map((c) => c[1])).toEqual(expect.arrayContaining(['purge_failed', 'otp_sweep_failed']));
    } finally {
      vi.useRealTimers();
    }
  });

  it('a consumed code and an expired code are gone at the first sweep after the hourly limit stops counting them', async () => {
    const consumedEmail = uniqueEmail('consumed');
    await signIn(h, consumedEmail);
    const expiredEmail = uniqueEmail('expired');
    await requestCode(h, new Client(h), expiredEmail);
    const liveEmail = uniqueEmail('recent');
    await requestCode(h, new Client(h), liveEmail);
    const hashes = (email: string) => emailBlindIndex(h.config.keys, email);
    await h.admin`UPDATE app.otp_codes SET created_at = now() - interval '61 minutes', expires_at = now() - interval '51 minutes' WHERE email_hash IN (${hashes(consumedEmail)}, ${hashes(expiredEmail)})`;
    expect(await purgeOtpCodes(h.runtime)).toBeGreaterThanOrEqual(2);
    const left = await h.admin`SELECT count(*)::int AS n FROM app.otp_codes WHERE email_hash IN (${hashes(consumedEmail)}, ${hashes(expiredEmail)})`;
    expect(left[0]!.n).toBe(0);
    const kept = await h.admin`SELECT count(*)::int AS n FROM app.otp_codes WHERE email_hash = ${hashes(liveEmail)}`;
    expect(kept[0]!.n).toBe(1);
  });

  it('removes an unconsented account just past 24 hours and keeps one just under', async () => {
    const past = await signIn(h);
    const under = await signIn(h);
    await h.admin`UPDATE app.users SET created_at = now() - interval '24 hours 1 minute' WHERE id = ${past.id}::uuid`;
    await h.admin`UPDATE app.users SET created_at = now() - interval '23 hours 59 minutes' WHERE id = ${under.id}::uuid`;
    await runPurge(h.runtime);
    expect(await count('users', `id = '${past.id}'`)).toBe(0);
    expect(await count('users', `id = '${under.id}'`)).toBe(1);
  });
});

describe('file mail transport', () => {
  it('echoes codes to the console in development only, without the address', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'outbox-')), 'outbox.jsonl');
    const lines: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
      lines.push(args.join(' '));
    };
    try {
      await createMailer(loadConfig(baseEnv({ NODE_ENV: 'development', MAIL_TRANSPORT: `file:${path}` }))).send(otpMail('dev@example.com', 'login', '333333'));
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain('333333');
      expect(lines[0]).not.toContain('dev@example.com');
      lines.length = 0;
      await createMailer(loadConfig(baseEnv({ MAIL_TRANSPORT: `file:${path}` }))).send(otpMail('t@example.com', 'login', '444444'));
      expect(lines).toEqual([]);
    } finally {
      console.log = original;
    }
  });

  it('appends one JSON object per line, readable only by the owner', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'outbox-')), 'nested', 'outbox.jsonl');
    const mailer = createMailer(loadConfig(baseEnv({ MAIL_TRANSPORT: `file:${path}` })));
    await mailer.send(otpMail('one@example.com', 'login', '111111'));
    await mailer.send(otpMail('two@example.com', 'account_delete', '222222'));
    const lines = readFileSync(path, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    expect(lines[0]).toMatchObject({ to: 'one@example.com', purpose: 'login', code: '111111', subject: 'Your sign-in code' });
    expect(lines[1]).toMatchObject({ to: 'two@example.com', purpose: 'account_delete', code: '222222' });
    expect(lines[0].text).toContain('111 111');
    expect(typeof lines[0].at).toBe('string');
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });
});
