import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto';
import { closeSync, constants, existsSync, fchmodSync, fstatSync, openSync, readFileSync, writeSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { isSecretKey, isMasterKeyList } from './config.ts';
import { createSql, RUNTIME_ROLE, type Sql } from './db.ts';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

export interface SetupFile {
  adminUrl: string;
  caCert: string;
  secretsFile: string;
}

/** The message for a person. Never holds the connection string or anything from the server's reply. */
export class SetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SetupError';
  }
}

export function readSetupFile(path = process.env.ANXIOCARE_SETUP_FILE ?? resolve(REPO, '.env.setup')): SetupFile {
  if (!existsSync(path)) {
    throw new SetupError(`There is no ${path}. Copy .env.setup.example to .env.setup and fill it in. It stays on your machine, and git ignores it.`);
  }
  const values = parseEnv(readFileSync(path, 'utf8'));
  const adminUrl = values.ADMIN_DATABASE_URL;
  if (!adminUrl || !/^postgres(ql)?:\/\//.test(adminUrl)) throw new SetupError('ADMIN_DATABASE_URL in .env.setup must be a postgres:// connection string.');
  const caPath = values.DATABASE_CA_PATH;
  if (!caPath) throw new SetupError('DATABASE_CA_PATH in .env.setup must name the CA certificate file you downloaded for this database.');
  const resolved = resolve(dirname(path), caPath);
  if (!existsSync(resolved)) throw new SetupError(`DATABASE_CA_PATH points at ${resolved}, which does not exist.`);
  return { adminUrl, caCert: readFileSync(resolved, 'utf8'), secretsFile: resolve(dirname(path), values.SECRETS_FILE ?? '.env.secrets') };
}

const TLS_CODES = /CERT|SELF_SIGNED|UNABLE_TO_VERIFY|ALTNAME|TLS|SSL/i;

/** Connection failures in words. Goes by the error's code only: driver messages can quote the host or the user. */
export function describeConnectionError(err: unknown): string {
  const code = String((err as { code?: unknown }).code ?? '');
  if (TLS_CODES.test(code)) return `TLS check failed (${code}): the server offered no TLS, or its certificate does not match DATABASE_CA_PATH and the host.`;
  if (code === '28P01' || code === '28000') return `Could not connect: the server refused these credentials (${code}).`;
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return `Could not connect: the host name did not resolve (${code}).`;
  if (code === '3D000') return 'Could not connect: that database does not exist (3D000).';
  return `Could not connect to the database${code ? ` (${code})` : ''}. Check the host, the port and that your network can reach it.`;
}

const key = () => randomBytes(32).toString('base64');

/** Supabase's pooler names users `<role>.<project-ref>`, so the runtime role takes the admin user's suffix. */
export function runtimeUrlFrom(adminUrl: string, password: string): string {
  const url = new URL(adminUrl);
  const admin = decodeURIComponent(url.username);
  const dot = admin.indexOf('.');
  url.username = dot >= 0 ? `${RUNTIME_ROLE}${admin.slice(dot)}` : RUNTIME_ROLE;
  url.password = password;
  return url.toString();
}

const GENERATED: Record<string, { make: () => string; valid: (value: string) => boolean }> = {
  ENCRYPTION_KEYS: { make: () => `v1:${key()}`, valid: isMasterKeyList },
  ENCRYPTION_ACTIVE_KEY: { make: () => 'v1', valid: (v) => v.length > 0 },
  EMAIL_INDEX_KEY: { make: key, valid: isSecretKey },
  OTP_PEPPER: { make: key, valid: isSecretKey },
  AUDIT_KEY: { make: key, valid: isSecretKey },
  PASSWORD_PEPPER: { make: key, valid: isSecretKey },
};

export interface GeneratedSecrets {
  values: Record<string, string>;
  created: string[];
}

/**
 * Generates app secrets once. An existing file is never rewritten: any value in it stays as it is, and only a name
 * that is missing is appended, such as a secret added by a later version. A malformed value stops everything,
 * because replacing it could make data unreadable for good.
 */
export function ensureSecrets(path: string, adminUrl: string): GeneratedSecrets {
  // One open call for the whole job: created owner-only if missing, appended to and never truncated if present,
  // and never followed through a symlink. Reading and writing both go through this handle, so nothing can swap the
  // file in between. An empty file counts as new.
  const fd = openSync(path, constants.O_RDWR | constants.O_CREAT | constants.O_APPEND | constants.O_NOFOLLOW, 0o600);
  try {
    return writeSecrets(fd, fstatSync(fd).size > 0, path, adminUrl);
  } finally {
    closeSync(fd);
  }
}

function writeSecrets(fd: number, existed: boolean, path: string, adminUrl: string): GeneratedSecrets {
  // Owner only, before anything is read or written: a file made by hand, or copied, may be readable by others.
  fchmodSync(fd, 0o600);
  const content = existed ? readFileSync(fd, 'utf8') : '';
  const current = existed ? parseEnv(content) : {};
  for (const [name, rule] of Object.entries(GENERATED)) {
    const value = current[name];
    if (value !== undefined && !rule.valid(value)) throw new SetupError(`${name} in ${path} is not valid. It was left as it is: fix it by hand, or restore it from your secret store.`);
  }
  if (current.DATABASE_URL !== undefined && !URL.canParse(current.DATABASE_URL)) throw new SetupError(`DATABASE_URL in ${path} is not valid. It was left as it is.`);

  const added: Record<string, string> = {};
  for (const [name, rule] of Object.entries(GENERATED)) if (current[name] === undefined) added[name] = rule.make();
  if (current.DATABASE_URL === undefined) added.DATABASE_URL = runtimeUrlFrom(adminUrl, randomBytes(32).toString('hex'));

  const created = Object.keys(added);
  const lines = created.map((name) => `${name}=${added[name]}`).join('\n');
  if (!existed) {
    writeSync(fd, `# Generated by npm run db:setup. Secret: keep a copy in a separate secret store. Losing ENCRYPTION_KEYS loses all user data.\n# Git ignores this file. Never commit or paste it.\n${lines}\n`);
  } else if (created.length > 0) {
    const separator = content === '' || content.endsWith('\n') ? '' : '\n';
    writeSync(fd, `${separator}${lines}\n`);
  }
  return { values: { ...current, ...added } as Record<string, string>, created };
}

/**
 * A SCRAM verifier, computed here, so the plain password never reaches the server, or any statement log it keeps.
 * Format per PostgreSQL's pg_authid: SCRAM-SHA-256$<iterations>:<salt>$<StoredKey>:<ServerKey>.
 */
export function scramVerifier(password: string, iterations = 4096): string {
  const salt = randomBytes(16);
  const salted = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  const clientKey = createHmac('sha256', salted).update('Client Key').digest();
  const storedKey = createHash('sha256').update(clientKey).digest();
  const serverKey = createHmac('sha256', salted).update('Server Key').digest();
  return `SCRAM-SHA-256$${iterations}:${salt.toString('base64')}$${storedKey.toString('base64')}:${serverKey.toString('base64')}`;
}

/**
 * Creates or updates the runtime role. It sets only what a non-superuser admin may set, as Supabase's `postgres` is:
 * an existing role with broader attributes is left for db:verify to report, rather than failing here on ALTER.
 */
export async function ensureRuntimeRole(
  sql: Sql,
  password: string,
  passwordWorks: () => Promise<boolean> = async () => false,
): Promise<'created' | 'updated' | 'unchanged'> {
  const verifier = scramVerifier(password);
  if (!/^[A-Za-z0-9+/=:$-]+$/.test(verifier)) throw new SetupError('Could not build the role password.');
  const [existing] = await sql`SELECT 1 FROM pg_roles WHERE rolname = ${RUNTIME_ROLE}`;
  const base = 'LOGIN NOINHERIT CONNECTION LIMIT 40';
  if (!existing) {
    await sql.unsafe(`CREATE ROLE ${RUNTIME_ROLE} ${base} PASSWORD '${verifier}'`);
    return 'created';
  }
  // A password that already works is left alone. Setting it again stores a new SCRAM salt, and a connection pooler
  // that cached the old verifier (Supabase's does) then refuses the running app with 28P01 until it refreshes.
  if (await passwordWorks()) {
    await sql.unsafe(`ALTER ROLE ${RUNTIME_ROLE} ${base}`);
    return 'unchanged';
  }
  await sql.unsafe(`ALTER ROLE ${RUNTIME_ROLE} ${base} PASSWORD '${verifier}'`);
  return 'updated';
}

/** True if this URL logs in, with TLS verified against `caCert`. Any failure, of any kind, is false. */
export async function canLogIn(url: string, caCert: string): Promise<boolean> {
  const sql = createSql(url, { caCert, max: 1 });
  try {
    await sql`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await sql.end({ timeout: 1 }).catch(() => {});
  }
}
