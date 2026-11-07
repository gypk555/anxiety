import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { assertNeutralSubject, countRecipients, defaultProgressPath, loadProgress, notifyAll } from '../src/notify.ts';
import { createHarness, key, signIn, signInConsented, type Harness } from './helpers.ts';

const API_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const UUID_LINE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const secrets = {
  ENCRYPTION_KEYS: `v1:${key()}`,
  ENCRYPTION_ACTIVE_KEY: 'v1',
  EMAIL_INDEX_KEY: key(),
  OTP_PEPPER: key(),
  AUDIT_KEY: key(),
  PASSWORD_PEPPER: key(),
};

let h: Harness;
let dir: string;
let progressPath: string;
const lines: string[] = [];
const log = (line: string) => void lines.push(line);
const noSleep = async () => {};
const notices = () => h.mailer.sent.filter((m) => m.purpose === 'operator_notice');

beforeAll(async () => {
  h = await createHarness(secrets);
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'notify-'));
  progressPath = join(dir, 'progress');
  lines.length = 0;
  h.mailer.sent = [];
  h.mailer.hook = async () => {};
  await h.admin`DELETE FROM app.users`;
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const base = () => ({ subject: 'Important notice about your account', body: 'Plain words about what happened.\n', progressPath, perMinute: 6000, sleep: noSleep, log });

describe('notifyAll', () => {
  it('mails every account once, decrypted, consented or not, with the subject and body given', async () => {
    const a = await signInConsented(h);
    const b = await signIn(h);
    const summary = await notifyAll(h.runtime, h.config.keys, h.mailer, base());
    expect(summary).toEqual({ total: 2, sent: 2, skipped: 0, failed: 0, aborted: false });
    expect(notices().map((m) => m.to).sort()).toEqual([a.email, b.email].sort());
    for (const mail of notices()) {
      expect(mail.subject).toBe('Important notice about your account');
      expect(mail.text).toBe('Plain words about what happened.\n');
      expect(mail.code).toBeNull();
    }
  });

  it('logs counts, and never an address, a subject or the body', async () => {
    const { email } = await signIn(h);
    h.mailer.hook = async () => {
      throw new Error(`550 rejected <${email}>`);
    };
    await notifyAll(h.runtime, h.config.keys, h.mailer, base());
    const all = lines.join('\n');
    expect(all).toMatch(/0 sent.*1 failed/);
    expect(all).not.toContain(email);
    expect(all).not.toContain('Plain words');
    expect(all).not.toContain('Important notice');
    expect(all).not.toContain('550');
  });

  it('throttles to the rate asked for', async () => {
    await signIn(h);
    await signIn(h);
    await signIn(h);
    const waits: number[] = [];
    await notifyAll(h.runtime, h.config.keys, h.mailer, { ...base(), perMinute: 30, sleep: async (ms) => void waits.push(ms) });
    expect(waits).toEqual([2000, 2000]);
  });

  it('removes its progress file when everyone has been reached', async () => {
    await signIn(h);
    await notifyAll(h.runtime, h.config.keys, h.mailer, base());
    expect(existsSync(progressPath)).toBe(false);
  });

  it('after a failure keeps a progress file of user ids only, and a re-run mails only those not yet reached', async () => {
    const people = [await signIn(h), await signIn(h), await signIn(h)];
    const failing = people[1]!.email;
    h.mailer.hook = async (m) => {
      if (m.to === failing) throw new Error('temporary');
    };
    const first = await notifyAll(h.runtime, h.config.keys, h.mailer, base());
    expect(first).toEqual({ total: 3, sent: 2, skipped: 0, failed: 1, aborted: false });

    const kept = readFileSync(progressPath, 'utf8').trim().split('\n');
    expect(kept).toHaveLength(2);
    for (const line of kept) expect(line).toMatch(UUID_LINE);
    expect(readFileSync(progressPath, 'utf8')).not.toContain('@');
    expect(statSync(progressPath).mode & 0o777).toBe(0o600);
    expect(await countRecipients(h.runtime, await loadProgress(progressPath))).toBe(1);

    h.mailer.sent = [];
    h.mailer.hook = async () => {};
    const second = await notifyAll(h.runtime, h.config.keys, h.mailer, base());
    expect(second).toEqual({ total: 3, sent: 1, skipped: 2, failed: 0, aborted: false });
    expect(notices().map((m) => m.to)).toEqual([failing]);
    expect(existsSync(progressPath)).toBe(false);
  });

  it('stops when the provider keeps failing, rather than burn through every address', async () => {
    for (let i = 0; i < 8; i += 1) await signIn(h);
    let tries = 0;
    h.mailer.hook = async () => {
      tries += 1;
      throw new Error('provider down');
    };
    const summary = await notifyAll(h.runtime, h.config.keys, h.mailer, { ...base(), maxConsecutiveFailures: 3 });
    expect(tries).toBe(3);
    expect(summary).toMatchObject({ sent: 0, failed: 3, aborted: true });
  });

  it('refuses a progress file that is not a list of user ids', async () => {
    writeFileSync(progressPath, 'someone@example.com\n');
    await expect(loadProgress(progressPath)).rejects.toThrow(/not a progress file/);
  });

  it('a different notice gets a different progress file, so an old run cannot skip anyone', () => {
    const one = defaultProgressPath(dir, 'Subject', 'Body one');
    expect(defaultProgressPath(dir, 'Subject', 'Body one')).toBe(one);
    expect(defaultProgressPath(dir, 'Subject', 'Body two')).not.toBe(one);
    expect(one).not.toContain('Subject');
  });

  it('refuses a subject that would expose the subject matter on a lock screen', () => {
    for (const subject of ['Your AnxioCare account', 'Your mental health data', 'Anxiety app incident', 'line\nbreak', '  ']) {
      expect(() => assertNeutralSubject(subject), subject).toThrow();
    }
    expect(() => assertNeutralSubject('Important notice about your account')).not.toThrow();
  });
});

describe('scripts/notify-all.ts', () => {
  const run = (args: string[], cwd = dir) => {
    const outbox = join(dir, 'outbox.jsonl');
    const result = spawnSync(process.execPath, [join(API_ROOT, 'scripts/notify-all.ts'), ...args], {
      cwd,
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH,
        NODE_ENV: 'test',
        PUBLIC_ORIGIN: 'https://app.test',
        DATABASE_URL: h.dbUrl('runtime'),
        MAIL_TRANSPORT: `file:${outbox}`,
        MAIL_FROM: 'Accounts <no-reply@example.com>',
        OPERATOR_NAME: 'Test Operator',
        GRIEVANCE_EMAIL: 'grievance@example.com',
        WEB_DIST: '/nonexistent/web-dist',
        ...secrets,
      },
    });
    const sent = existsSync(outbox) ? readFileSync(outbox, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as { to: string; subject: string; text: string }) : [];
    return { ...result, sent };
  };
  const notice = () => {
    const path = join(dir, 'body.txt');
    writeFileSync(path, 'What happened, in plain words.\n');
    return ['--subject', 'Important notice about your account', '--body-file', path];
  };

  it('by default prints only the recipient count, and sends nothing', async () => {
    await signIn(h);
    await signIn(h);
    const r = run(notice());
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.trim()).toBe('Recipients: 2');
    expect(r.stderr).toBe('');
    expect(r.sent).toEqual([]);
  });

  it('--dry-run is the same, and with --send it refuses', async () => {
    await signIn(h);
    const dry = run([...notice(), '--dry-run']);
    expect(dry.stdout.trim()).toBe('Recipients: 1');
    expect(dry.sent).toEqual([]);
    const both = run([...notice(), '--dry-run', '--send']);
    expect(both.status).toBe(2);
    expect(both.sent).toEqual([]);
  });

  it('--send mails everyone, reports counts without addresses, and leaves no progress file', async () => {
    const { email } = await signIn(h);
    const r = run([...notice(), '--send', '--per-minute', '6000']);
    expect(r.status, r.stderr).toBe(0);
    expect(r.sent.map((m) => m.to)).toEqual([email]);
    expect(r.sent[0]!.text).toBe('What happened, in plain words.\n');
    expect(r.stdout).toMatch(/1 sent, 0 skipped, 0 failed, of 1/);
    expect(r.stdout + r.stderr).not.toContain(email);
    expect(run(['--help'], dir).status).toBe(0);
    expect(spawnSync('ls', ['-A', dir], { encoding: 'utf8' }).stdout).not.toContain('.notify-progress');
  });

  it('refuses missing arguments, an unreadable body, an empty body and an unsafe subject, sending nothing', async () => {
    await signIn(h);
    const [flagS, subject, flagB, body] = notice() as [string, string, string, string];
    expect(run(['--send', flagB, body]).status).toBe(2);
    expect(run(['--send', flagS, subject]).status).toBe(2);
    expect(run(['--send', flagS, subject, flagB, join(dir, 'nope.txt')]).status).toBe(2);
    const empty = join(dir, 'empty.txt');
    writeFileSync(empty, ' \n');
    expect(run(['--send', flagS, subject, flagB, empty]).status).toBe(2);
    expect(run(['--send', flagS, 'Your mental health data', flagB, body]).status).toBe(2);
    expect(run([flagS, subject, flagB, body, '--bogus']).status).toBe(2);
    expect(run([flagS, subject, flagB, body, '--send']).status).toBe(0);
  });
});
