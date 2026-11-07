// Mails one notice to every account, for a personal data breach. See docs/OPERATIONS.md#how-to-reach-people.
//
//   npm run notify-all -w @anxiocare/api -- --subject "Important notice about your account" --body-file notice.txt
//       Prints the recipient count and sends nothing. This is the default.
//   ... --send [--per-minute 60] [--progress-file path]
//       Sends. Safe to re-run with the same notice: it skips anyone already reached, using a local progress
//       file of user ids, and removes that file once everyone has been reached.
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { ConfigError, loadConfig } from '../src/config.ts';
import { createSql } from '../src/db.ts';
import { createMailer } from '../src/mail.ts';
import { assertNeutralSubject, countRecipients, DEFAULT_PER_MINUTE, defaultProgressPath, loadProgress, notifyAll } from '../src/notify.ts';

const USAGE = 'Usage: notify-all --subject <one line> --body-file <path> [--dry-run | --send] [--per-minute <n>] [--progress-file <path>]';

function refuse(reason: string): never {
  console.error(reason);
  process.exit(2);
}

let args;
try {
  args = parseArgs({
    options: {
      subject: { type: 'string' },
      'body-file': { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      send: { type: 'boolean', default: false },
      'per-minute': { type: 'string' },
      'progress-file': { type: 'string' },
      help: { type: 'boolean', default: false },
    },
    strict: true,
  }).values;
} catch {
  refuse(USAGE);
}

if (args.help) {
  console.log(USAGE);
  process.exit(0);
}
if (args.send && args['dry-run']) refuse('Choose one of --dry-run and --send.');
if (!args.subject || !args['body-file']) refuse(USAGE);

const subject = args.subject;
let body = '';
try {
  body = readFileSync(args['body-file'], 'utf8');
} catch {
  refuse('The body file could not be read.');
}
if (!body.trim()) refuse('The body file is empty.');
try {
  assertNeutralSubject(subject);
} catch (err) {
  refuse((err as Error).message);
}
const perMinute = Number(args['per-minute'] ?? DEFAULT_PER_MINUTE);
if (!Number.isFinite(perMinute) || perMinute <= 0) refuse('--per-minute must be a positive number.');

try {
  const config = loadConfig();
  const sql = createSql(config.databaseUrl, { caCert: config.databaseCaCert, max: 1 });
  const progressPath = args['progress-file'] ?? defaultProgressPath(process.cwd(), subject, body);
  try {
    if (!args.send) {
      console.log(`Recipients: ${await countRecipients(sql, await loadProgress(progressPath))}`);
    } else {
      const summary = await notifyAll(sql, config.keys, createMailer(config), { subject, body, progressPath, perMinute, log: (line) => console.log(line) });
      if (summary.failed > 0 || summary.aborted) {
        console.error('Not everyone was reached. Run the same command again to try the rest.');
        process.exitCode = 1;
      }
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
} catch (err) {
  // Never a message: database and mail errors can quote values.
  console.error(err instanceof ConfigError ? err.message : `notify-all failed (${err instanceof Error ? err.name : 'unknown'})`);
  process.exit(1);
}
