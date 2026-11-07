// npm run doctor: checks a full production environment without starting the server. Sends no mail, changes nothing.
// Reads the process environment, plus --env-file=<path>. Each failure says how to fix it, and no secret value is printed.
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { ConfigError, loadConfig, type Config } from '../src/config.ts';
import { assertRuntimeRole, createSql, RuntimeRoleError } from '../src/db.ts';
import { printChecks, type Check } from '../src/db-checks.ts';
import { smtpTransport } from '../src/mail.ts';
import { describeConnectionError } from '../src/setup.ts';

const FIXES: Record<string, string> = {
  PUBLIC_ORIGIN: 'Use the exact https origin the app is served from, with no path or trailing slash.',
  DATABASE_URL: 'Use the anxiocare_runtime connection string from npm run db:setup, never an admin role.',
  DATABASE_MIGRATION_URL: 'Use your admin connection string, different from DATABASE_URL.',
  DATABASE_CA_CERT: 'Paste the DATABASE_CA_CERT value that npm run db:setup printed.',
  ENCRYPTION_KEYS: 'Use the value from your secrets file. Do not generate a new one once data exists.',
  ENCRYPTION_ACTIVE_KEY: 'Name a version present in ENCRYPTION_KEYS, normally v1.',
  EMAIL_INDEX_KEY: 'Use the value from your secrets file, or npm run generate-secrets -w @anxiocare/api. It cannot be rotated once accounts exist.',
  OTP_PEPPER: 'Use the value from your secrets file, or npm run generate-secrets -w @anxiocare/api.',
  AUDIT_KEY: 'Use the value from your secrets file, or npm run generate-secrets -w @anxiocare/api.',
  PASSWORD_PEPPER: 'Use the value from your secrets file, or npm run generate-secrets -w @anxiocare/api. Changing it later invalidates every password.',
  PASSWORD_ARGON2_MEMORY_KIB: 'Remove it to use the default, or raise it. It cannot go below the OWASP minimum.',
  PASSWORD_ARGON2_PASSES: 'Remove it to use the default, or raise it. It cannot go below the OWASP minimum.',
  GOOGLE_CLIENT_ID: 'Set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or neither to leave Google off.',
  GOOGLE_CLIENT_SECRET: 'Set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or neither to leave Google off.',
  GOOGLE_OIDC_BASE_URL: 'Remove it. It exists only for tests, to reach a fake provider.',
  DEV_ORIGINS: 'Remove it. It exists only for development.',
  MAIL_TRANSPORT: 'Set it to smtp.',
  MAIL_FROM: 'Use a neutral sender that does not name the service or its subject, for example no-reply@mail.yourdomain.example.',
  SMTP_HOST: "Use your mail provider's SMTP host.",
  SMTP_USER: "Set SMTP_USER and SMTP_PASS from your mail provider's SMTP credentials.",
  OPERATOR_NAME: 'Set your legal name or organisation. It appears in the privacy notice.',
  GRIEVANCE_EMAIL: 'Set the address that handles privacy complaints. It appears in the privacy notice.',
};

function loadEnv(): Record<string, string | undefined> {
  const flag = process.argv.find((arg) => arg.startsWith('--env-file='));
  const fromFile = flag ? parseEnv(readFileSync(flag.slice('--env-file='.length), 'utf8')) : {};
  // What this checks is production, whatever this machine happens to be set to.
  return { ...process.env, ...fromFile, NODE_ENV: 'production' };
}

function configCheck(env: Record<string, string | undefined>): { check: Check; config: Config | null } {
  try {
    return { check: { name: 'Config', ok: true, detail: 'every setting is valid for production' }, config: loadConfig(env) };
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err;
    const names = err.problems.map((problem) => problem.split(':', 1)[0]!);
    const fixes = [...new Set(names.map((name) => `${name}: ${FIXES[name] ?? 'See .env.example for what this setting does.'}`))];
    return {
      check: { name: 'Config', ok: false, detail: `\n        ${err.problems.join('\n        ')}`, fix: `\n        ${fixes.join('\n        ')}` },
      config: null,
    };
  }
}

async function databaseCheck(config: Config): Promise<Check> {
  const name = 'Database';
  const sql = createSql(config.databaseUrl, { caCert: config.databaseCaCert, max: 1 });
  try {
    await sql`SELECT 1`;
    await assertRuntimeRole(sql);
    await sql`SELECT 1 FROM app.users LIMIT 0`;
    await sql`SELECT 1 FROM app.user_identities LIMIT 0`;
    return { name, ok: true, detail: 'connected over verified TLS as a least-privilege role, and migrated' };
  } catch (err) {
    if (err instanceof RuntimeRoleError) return { name, ok: false, detail: 'this role is too privileged', fix: 'Use the anxiocare_runtime connection string from npm run db:setup.' };
    const code = String((err as { code?: unknown }).code ?? '');
    if (code === '42P01' || code === '3F000') return { name, ok: false, detail: 'the tables are not there', fix: 'Run npm run db:setup, or npm run migrate.' };
    if (code === '42501') return { name, ok: false, detail: 'this role cannot read the tables', fix: 'Run npm run db:setup, which grants the runtime role what it needs.' };
    return { name, ok: false, detail: describeConnectionError(err), fix: 'Check DATABASE_URL and DATABASE_CA_CERT. npm run db:setup writes both for you.' };
  } finally {
    await sql.end({ timeout: 1 }).catch(() => {});
  }
}

async function smtpCheck(config: Config): Promise<Check> {
  const name = 'SMTP';
  if (config.mail.kind !== 'smtp') return { name, ok: false, detail: 'not using smtp', fix: 'Set MAIL_TRANSPORT=smtp.' };
  const transport = smtpTransport(config.mail);
  try {
    await transport.verify();
    return { name, ok: true, detail: 'connected over TLS and signed in. Nothing was sent' };
  } catch (err) {
    // The code only: a server's reply can quote the user name.
    const code = String((err as { code?: unknown }).code ?? 'unknown');
    const auth = code === 'EAUTH';
    return {
      name,
      ok: false,
      detail: auth ? 'the server refused these credentials (EAUTH)' : `could not connect over TLS (${code})`,
      fix: auth ? "Check SMTP_USER and SMTP_PASS against your mail provider's SMTP settings." : 'Check SMTP_HOST and SMTP_PORT. 587 uses STARTTLS, 465 implicit TLS.',
    };
  } finally {
    transport.close();
  }
}

function googleCheck(config: Config): Check {
  const name = 'Google';
  if (!config.google) return { name, ok: true, detail: 'off: the button is hidden' };
  if (!/^[A-Za-z0-9-]+\.apps\.googleusercontent\.com$/.test(config.google.clientId)) {
    return { name, ok: false, detail: "GOOGLE_CLIENT_ID does not look like one of Google's", fix: 'It ends in .apps.googleusercontent.com. Copy it from the Google Cloud console, under Credentials.' };
  }
  return { name, ok: true, detail: `on. Register this exact redirect URI on the OAuth client: ${config.google.redirectUri}` };
}

function originCheck(config: Config): Check {
  const name = 'Public origin';
  const host = new URL(config.publicOrigin).hostname;
  if (host === 'localhost' || host === '127.0.0.1' || /(^|\.)example(\.|$)/.test(host)) {
    return { name, ok: false, detail: 'this is a placeholder or a local address', fix: 'Set PUBLIC_ORIGIN to where the app is really served, such as https://your-service.onrender.com.' };
  }
  return { name, ok: true, detail: config.publicOrigin };
}

const { check, config } = configCheck(loadEnv());
const checks: Check[] = [check];
if (config) {
  checks.push(await databaseCheck(config), await smtpCheck(config), googleCheck(config), originCheck(config));
} else {
  console.log('Database, SMTP, Google and the public origin are checked once the config is valid.\n');
}
const ok = printChecks(checks);
process.exit(ok ? 0 : 1);
