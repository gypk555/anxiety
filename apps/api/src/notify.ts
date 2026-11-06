import { createHash } from 'node:crypto';
import { appendFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { Keys } from './crypto.ts';
import type { Sql } from './db.ts';
import { operatorNotice, type Mailer } from './mail.ts';
import { emailOf, type UserRow } from './users.ts';

const BATCH = 200;
const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** Lock screens and shared inboxes show the subject, so it may not name the product or its subject matter. */
const EXPOSING = /anxi|health|mental|gad-?7|screening|therap|counsel|mood|journal|check-in|wellness|helpline|crisis|panic|depress/i;

export const DEFAULT_PER_MINUTE = 60;
export const DEFAULT_MAX_CONSECUTIVE_FAILURES = 10;

export function assertNeutralSubject(subject: string): void {
  if (!subject.trim()) throw new Error('The subject is empty.');
  if (/[\r\n]/.test(subject)) throw new Error('The subject must be one line.');
  if (EXPOSING.test(subject)) throw new Error('The subject names the service or its subject matter, and lock screens show it. Use neutral wording.');
}

/** Named after the notice, so a progress file left by an earlier notice can never skip someone for this one. */
export function defaultProgressPath(dir: string, subject: string, body: string): string {
  const id = createHash('sha256').update(subject).update('\0').update(body).digest('hex').slice(0, 16);
  return join(dir, `.notify-progress-${id}`);
}

/** The ids already reached. A file holding anything else was not written by this tool, so nothing is trusted. */
export async function loadProgress(path: string): Promise<Set<string>> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (err) {
    if ((err as { code?: string }).code === 'ENOENT') return new Set();
    throw err;
  }
  const ids = raw.split('\n').filter(Boolean);
  if (!ids.every((id) => USER_ID.test(id))) throw new Error('That file is not a progress file from this tool. Choose another path.');
  return new Set(ids);
}

/** Everyone not yet reached. Runs in the database, so a dry run decrypts nothing. */
export async function countRecipients(sql: Sql, done: ReadonlySet<string>): Promise<number> {
  const [row] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM app.users WHERE NOT (id = ANY(${[...done]}::uuid[]))`;
  return row?.n ?? 0;
}

export interface NotifyOptions {
  subject: string;
  body: string;
  progressPath: string;
  perMinute?: number;
  maxConsecutiveFailures?: number;
  sleep?: (ms: number) => Promise<void>;
  /** Counts only. Addresses, the notice and provider error text never reach it. */
  log: (line: string) => void;
}

export interface NotifySummary {
  total: number;
  sent: number;
  skipped: number;
  failed: number;
  /** Stopped early, because the provider kept failing. */
  aborted: boolean;
}

/**
 * Mails one notice to every account. Each address is decrypted only to hand it to the mailer, and a page of rows
 * at most is in memory at a time. A person's id goes in the progress file once their mail is accepted, so a re-run
 * skips them. A crash in that moment could mail one person twice, which beats missing someone in a breach.
 */
export async function notifyAll(sql: Sql, keys: Keys, mailer: Mailer, options: NotifyOptions): Promise<NotifySummary> {
  const perMinute = options.perMinute ?? DEFAULT_PER_MINUTE;
  const maxFailures = options.maxConsecutiveFailures ?? DEFAULT_MAX_CONSECUTIVE_FAILURES;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const done = await loadProgress(options.progressPath);
  const summary: NotifySummary = { total: 0, sent: 0, skipped: 0, failed: 0, aborted: false };
  const report = () => options.log(`${summary.sent} sent, ${summary.skipped} skipped, ${summary.failed} failed, of ${summary.total} so far`);

  let after = '00000000-0000-0000-0000-000000000000';
  let consecutive = 0;
  let wait = false;
  pages: for (;;) {
    const rows = await sql<UserRow[]>`SELECT * FROM app.users WHERE id > ${after}::uuid ORDER BY id LIMIT ${BATCH}`;
    if (rows.length === 0) break;
    after = rows.at(-1)!.id;
    for (const user of rows) {
      summary.total += 1;
      if (done.has(user.id)) {
        summary.skipped += 1;
        continue;
      }
      if (wait) await sleep(60_000 / perMinute);
      wait = true;
      try {
        await mailer.send(operatorNotice(emailOf(keys, user), options.subject, options.body));
      } catch {
        // Provider errors quote addresses, so nothing of this one is logged.
        summary.failed += 1;
        consecutive += 1;
        if (consecutive >= maxFailures) {
          summary.aborted = true;
          break pages;
        }
        continue;
      }
      consecutive = 0;
      summary.sent += 1;
      await appendFile(options.progressPath, `${user.id}\n`, { mode: 0o600 });
      if (summary.sent % 100 === 0) report();
    }
  }
  options.log(`${summary.sent} sent, ${summary.skipped} skipped, ${summary.failed} failed, of ${summary.total}${summary.aborted ? ' (stopped early)' : ''}`);
  if (summary.failed === 0 && !summary.aborted) await rm(options.progressPath, { force: true });
  return summary;
}
