import { X509Certificate } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { KeyRing, type Keys } from './crypto.ts';

const KEY_BYTES = 32;

function decodeKey(value: string): Buffer | null {
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value || bytes.length !== KEY_BYTES) return null;
  // Random 32-byte keys have about 30 distinct values. Anything far below that is a typed-in or placeholder key.
  if (new Set(bytes).size < 16) return null;
  return bytes;
}

const key = z.string().refine((v) => decodeKey(v) !== null, { message: `must be ${KEY_BYTES} random bytes in base64` });

const postgresUrl = z.string().refine(
  (v) => {
    try {
      return ['postgres:', 'postgresql:'].includes(new URL(v).protocol);
    } catch {
      return false;
    }
  },
  { message: 'must be a postgres:// URL' },
);

const origin = z.string().refine(
  (v) => {
    try {
      const url = new URL(v);
      return url.origin === v && (url.protocol === 'https:' || url.protocol === 'http:');
    } catch {
      return false;
    }
  },
  { message: 'must be an exact origin, for example https://example.com (no path or trailing slash)' },
);

function parseMasterKeys(value: string): Map<string, Buffer> | null {
  const keys = new Map<string, Buffer>();
  for (const part of value.split(',')) {
    const at = part.indexOf(':');
    if (at <= 0) return null;
    const id = part.slice(0, at).trim();
    const bytes = decodeKey(part.slice(at + 1).trim());
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(id) || !bytes || keys.has(id)) return null;
    keys.set(id, bytes);
  }
  return keys.size > 0 ? keys : null;
}

function normaliseCaCert(value: string): string | null {
  const pem = value.includes('BEGIN CERTIFICATE')
    ? value.replaceAll('\\n', '\n')
    : Buffer.from(value, 'base64').toString('utf8');
  try {
    new X509Certificate(pem);
    return pem;
  } catch {
    return null;
  }
}

export const DEFAULT_SENDER_NAME = 'Account Team';
const REVEALING_SENDER = /anxi|mental|health|therap|depress|wellness|wellbeing|psych|counsel|stress|panic/i;

/** The name comes from MAIL_FROM_NAME, then MAIL_FROM's own display name, then a neutral default. */
function parseSender(from: string, nameOverride: string | undefined) {
  const parts = /^(.*)<(.*)>\s*$/.exec(from);
  const address = (parts ? parts[2]! : from).trim();
  const name = nameOverride || parts?.[1]!.trim() || DEFAULT_SENDER_NAME;
  return { name, address };
}

/** A setting left blank in a hosting dashboard arrives as an empty string. It means "not set", so the default applies. */
const blankIsUnset = <T extends z.ZodType>(schema: T) => z.preprocess((v) => (v === '' ? undefined : v), schema);

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']),
    HOST: z.string().min(1).default('0.0.0.0'),
    PORT: z.coerce.number().int().min(1).max(65535).default(8787),
    PUBLIC_ORIGIN: origin,
    DEV_ORIGINS: z.string().optional(),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(1),
    CLIENT_IP_HEADER: blankIsUnset(z.string().regex(/^[A-Za-z0-9-]+$/, 'must be one HTTP header name').optional()),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'silent']).default('info'),
    WEB_DIST: z.string().min(1).optional(),

    DATABASE_URL: postgresUrl,
    DATABASE_MIGRATION_URL: postgresUrl.optional(),
    DATABASE_CA_CERT: z.string().min(1).optional(),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),

    ENCRYPTION_KEYS: z.string().refine((v) => parseMasterKeys(v) !== null, {
      message: `must be a comma-separated list of <version>:<base64 of ${KEY_BYTES} random bytes>`,
    }),
    ENCRYPTION_ACTIVE_KEY: z.string().min(1),
    EMAIL_INDEX_KEY: key,
    OTP_PEPPER: key,
    AUDIT_KEY: key,

    MAIL_TRANSPORT: z.string().regex(/^(smtp|file:.+)$/, 'must be smtp or file:<path>'),
    MAIL_FROM: z.string().min(3),
    MAIL_FROM_NAME: blankIsUnset(z.string().trim().regex(/^[^"<>\r\n]{1,60}$/, 'must be a short plain name').optional()),
    MAIL_PROVIDER: blankIsUnset(z.string().trim().min(1).max(100).default('our email provider')),
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    SMTP_USER: z.string().min(1).optional(),
    SMTP_PASS: z.string().min(1).optional(),

    OPERATOR_NAME: z.string().trim().min(1).max(200),
    GRIEVANCE_EMAIL: z.email(),
    BACKUP_RETENTION_DAYS: blankIsUnset(z.coerce.number().int().min(0).max(365).default(7)),
    DATA_LOCATION: blankIsUnset(z.string().trim().min(1).max(100).default('Mumbai, India')),
    SERVER_LOCATION: blankIsUnset(z.string().trim().min(1).max(100).default('Singapore')),
  })
  .superRefine((env, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });

    const master = parseMasterKeys(env.ENCRYPTION_KEYS);
    if (master && !master.has(env.ENCRYPTION_ACTIVE_KEY)) {
      issue('ENCRYPTION_ACTIVE_KEY', 'must name a version present in ENCRYPTION_KEYS');
    }

    // One key per job: reusing a key would let one compromise or one primitive reach another.
    const seen = new Set<string>();
    for (const [name, value] of [
      ['EMAIL_INDEX_KEY', env.EMAIL_INDEX_KEY],
      ['OTP_PEPPER', env.OTP_PEPPER],
      ['AUDIT_KEY', env.AUDIT_KEY],
      ...[...(master?.values() ?? [])].map((k, i) => [`ENCRYPTION_KEYS[${i}]`, k.toString('base64')]),
    ] as const) {
      if (seen.has(value)) issue(name.startsWith('ENCRYPTION') ? 'ENCRYPTION_KEYS' : name, 'must not reuse another key');
      seen.add(value);
    }

    if (env.MAIL_TRANSPORT === 'smtp' && !env.SMTP_HOST) issue('SMTP_HOST', 'is required for the smtp transport');
    if (env.DATABASE_CA_CERT && normaliseCaCert(env.DATABASE_CA_CERT) === null) {
      issue('DATABASE_CA_CERT', 'must be a PEM certificate, or base64 of one');
    }

    if (env.NODE_ENV !== 'production') return;

    if (!env.PUBLIC_ORIGIN.startsWith('https://')) issue('PUBLIC_ORIGIN', 'must be https in production');
    if (env.DEV_ORIGINS) issue('DEV_ORIGINS', 'is not allowed in production');
    if (env.MAIL_TRANSPORT !== 'smtp') issue('MAIL_TRANSPORT', 'dev mail transports are refused in production');
    if (!env.SMTP_USER || !env.SMTP_PASS) issue('SMTP_USER', 'SMTP credentials are required in production');
    if (!env.DATABASE_CA_CERT) issue('DATABASE_CA_CERT', 'is required in production (TLS verify-full)');
    if (new URL(env.DATABASE_URL).searchParams.get('sslmode') === 'disable') {
      issue('DATABASE_URL', 'must not disable TLS in production');
    }
    const runtimeUser = decodeURIComponent(new URL(env.DATABASE_URL).username);
    if (/^(postgres|supabase_admin)(\.|$)/.test(runtimeUser)) {
      issue('DATABASE_URL', 'must use the least-privilege runtime role, not an admin role');
    }
    if (env.DATABASE_MIGRATION_URL && env.DATABASE_MIGRATION_URL === env.DATABASE_URL) {
      issue('DATABASE_URL', 'must be a different role from DATABASE_MIGRATION_URL');
    }
    // Lock screens and shared inboxes show the sender, name and address both. They must stay neutral too.
    const sender = parseSender(env.MAIL_FROM, env.MAIL_FROM_NAME);
    if (REVEALING_SENDER.test(`${sender.name} ${sender.address}`)) {
      issue('MAIL_FROM', 'the sender name and address must not reveal the nature of the service');
    }
  });

export type MailConfig =
  | { kind: 'smtp'; from: string; host: string; port: number; user?: string; pass?: string }
  | { kind: 'file'; from: string; path: string };

export interface Config {
  env: 'development' | 'test' | 'production';
  host: string;
  port: number;
  publicOrigin: string;
  allowedOrigins: ReadonlySet<string>;
  trustProxyHops: number;
  /** Lower-case name of a header holding the client address, or null to count proxy hops. */
  clientIpHeader: string | null;
  logLevel: string;
  webDist: string;
  databaseUrl: string;
  databaseCaCert: string | null;
  databasePoolMax: number;
  keys: Keys;
  mail: MailConfig;
  operatorName: string;
  grievanceEmail: string;
  /** Shown in the privacy notice. Owner-confirmed facts, so they live in config and not in copy. */
  disclosure: { backupRetentionDays: number; dataLocation: string; serverLocation: string; mailProvider: string };
  cookie: { name: string; secure: boolean };
}

export class ConfigError extends Error {
  readonly problems: string[];

  constructor(problems: string[]) {
    super(`Invalid configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'ConfigError';
    this.problems = problems;
  }
}

/** Reports variable names and rules only: values are secrets and never appear in the error. */
function describe(error: z.ZodError): string[] {
  return error.issues.map((i) => `${i.path.join('.')}: ${i.code === 'invalid_type' ? 'is required' : i.message}`);
}

const defaultWebDist = () => resolve(dirname(fileURLToPath(import.meta.url)), '../../web/dist');

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) throw new ConfigError(describe(parsed.error));
  const e = parsed.data;

  const sender = parseSender(e.MAIL_FROM, e.MAIL_FROM_NAME);
  const from = `${sender.name} <${sender.address}>`;
  const mail: MailConfig =
    e.MAIL_TRANSPORT === 'smtp'
      ? {
          kind: 'smtp',
          from,
          host: e.SMTP_HOST!,
          port: e.SMTP_PORT,
          ...(e.SMTP_USER ? { user: e.SMTP_USER } : {}),
          ...(e.SMTP_PASS ? { pass: e.SMTP_PASS } : {}),
        }
      : { kind: 'file', from, path: e.MAIL_TRANSPORT.slice('file:'.length) };

  const devOrigins = (e.DEV_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean);

  return {
    env: e.NODE_ENV,
    host: e.HOST,
    port: e.PORT,
    publicOrigin: e.PUBLIC_ORIGIN,
    allowedOrigins: new Set([e.PUBLIC_ORIGIN, ...devOrigins]),
    trustProxyHops: e.TRUST_PROXY_HOPS,
    clientIpHeader: e.CLIENT_IP_HEADER?.toLowerCase() ?? null,
    logLevel: e.LOG_LEVEL,
    webDist: e.WEB_DIST ? resolve(e.WEB_DIST) : defaultWebDist(),
    databaseUrl: e.DATABASE_URL,
    databaseCaCert: e.DATABASE_CA_CERT ? normaliseCaCert(e.DATABASE_CA_CERT) : null,
    databasePoolMax: e.DATABASE_POOL_MAX,
    keys: {
      ring: new KeyRing(parseMasterKeys(e.ENCRYPTION_KEYS)!, e.ENCRYPTION_ACTIVE_KEY),
      emailIndexKey: decodeKey(e.EMAIL_INDEX_KEY)!,
      otpPepper: decodeKey(e.OTP_PEPPER)!,
      auditKey: decodeKey(e.AUDIT_KEY)!,
    },
    mail,
    operatorName: e.OPERATOR_NAME,
    grievanceEmail: e.GRIEVANCE_EMAIL,
    disclosure: {
      backupRetentionDays: e.BACKUP_RETENTION_DAYS,
      dataLocation: e.DATA_LOCATION,
      serverLocation: e.SERVER_LOCATION,
      mailProvider: e.MAIL_PROVIDER,
    },
    // __Host- requires Secure, so the plain name is only for development on localhost.
    cookie: e.NODE_ENV === 'development' ? { name: 'session', secure: false } : { name: '__Host-session', secure: true },
  };
}

const migrationEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_MIGRATION_URL: postgresUrl,
  DATABASE_CA_CERT: z.string().min(1).optional(),
});

/** The migration runner must not need the application's encryption keys. */
export function loadMigrationConfig(env: Record<string, string | undefined> = process.env) {
  const parsed = migrationEnvSchema.safeParse(env);
  if (!parsed.success) throw new ConfigError(describe(parsed.error));
  const ca = parsed.data.DATABASE_CA_CERT ? normaliseCaCert(parsed.data.DATABASE_CA_CERT) : null;
  if (parsed.data.DATABASE_CA_CERT && !ca) throw new ConfigError(['DATABASE_CA_CERT: must be a PEM certificate, or base64 of one']);
  if (parsed.data.NODE_ENV === 'production' && !ca) {
    throw new ConfigError(['DATABASE_CA_CERT: is required in production (TLS verify-full)']);
  }
  return { url: parsed.data.DATABASE_MIGRATION_URL, caCert: ca };
}
