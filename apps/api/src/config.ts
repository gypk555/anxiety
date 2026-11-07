import { X509Certificate } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { KeyRing, type Keys } from './crypto.ts';
import { ARGON2_FLOOR, ARGON2_MAX_MEMORY_KIB, ARGON2_MAX_RUNNING, type Argon2Params } from './passwords.ts';

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

export const isSecretKey = (value: string) => decodeKey(value) !== null;
export const isMasterKeyList = (value: string) => parseMasterKeys(value) !== null;

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
    /** Requests a minute for one signed-in account, across all its devices. */
    USER_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(10).max(6000).default(60),
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
    PASSWORD_PEPPER: key,
    // Can only be raised: existing hashes keep their own parameters, and are upgraded at the next sign-in. At most
    // 64 MiB, because up to ARGON2_MAX_RUNNING hashes run at once: 192 MiB at the ceiling, on a 512 MB instance.
    PASSWORD_ARGON2_MEMORY_KIB: blankIsUnset(
      z.coerce
        .number()
        .int()
        .min(ARGON2_FLOOR.memory, `must be at least ${ARGON2_FLOOR.memory}, OWASP's minimum`)
        .max(ARGON2_MAX_MEMORY_KIB, `must be at most ${ARGON2_MAX_MEMORY_KIB}, so ${ARGON2_MAX_RUNNING} hashes at once fit in a 512 MB instance`)
        .default(ARGON2_FLOOR.memory),
    ),
    PASSWORD_ARGON2_PASSES: blankIsUnset(z.coerce.number().int().min(ARGON2_FLOOR.passes, `must be at least ${ARGON2_FLOOR.passes}, OWASP's minimum`).max(16).default(ARGON2_FLOOR.passes)),

    GOOGLE_CLIENT_ID: blankIsUnset(z.string().trim().min(1).optional()),
    GOOGLE_CLIENT_SECRET: blankIsUnset(z.string().min(1).optional()),
    // Development and tests only, so they can run a fake provider. Refused in production.
    GOOGLE_OIDC_BASE_URL: blankIsUnset(z.string().url().optional()),

    // Pasted into a hosting dashboard, a value can pick up spaces or capitals. Forgive those for the two named
    // transports only; a file: path keeps its case.
    MAIL_TRANSPORT: z.preprocess((v) => {
      if (typeof v !== 'string') return v;
      const trimmed = v.trim();
      return /^(smtp|brevo)$/i.test(trimmed) ? trimmed.toLowerCase() : trimmed;
    }, z.string().regex(/^(smtp|brevo|file:.+)$/, 'must be smtp, brevo or file:<path>')),
    MAIL_FROM: z.string().min(3),
    MAIL_FROM_NAME: blankIsUnset(z.string().trim().regex(/^[^"<>\r\n]{1,60}$/, 'must be a short plain name').optional()),
    MAIL_PROVIDER: blankIsUnset(z.string().trim().min(1).max(100).default('our email provider')),
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    SMTP_USER: z.string().min(1).optional(),
    SMTP_PASS: z.string().min(1).optional(),
    // Brevo's transactional email API, over HTTPS. For hosts that block outbound SMTP, such as Render's free plan.
    BREVO_API_KEY: blankIsUnset(z.string().trim().min(40, 'does not look like a Brevo API key').regex(/^[\x21-\x7e]+$/, 'must be one token').optional()),
    // Tests only, to reach a fake Brevo. Refused in production.
    BREVO_API_BASE_URL: blankIsUnset(z.string().url().optional()),
    BREVO_TIMEOUT_MS: blankIsUnset(z.coerce.number().int().min(100).max(60_000).default(15_000)),

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
      ['PASSWORD_PEPPER', env.PASSWORD_PEPPER],
      ...[...(master?.values() ?? [])].map((k, i) => [`ENCRYPTION_KEYS[${i}]`, k.toString('base64')]),
    ] as const) {
      if (seen.has(value)) issue(name.startsWith('ENCRYPTION') ? 'ENCRYPTION_KEYS' : name, 'must not reuse another key');
      seen.add(value);
    }

    if (env.MAIL_TRANSPORT === 'smtp' && !env.SMTP_HOST) issue('SMTP_HOST', 'is required for the smtp transport');
    if (env.MAIL_TRANSPORT === 'brevo' && !env.BREVO_API_KEY) issue('BREVO_API_KEY', 'is required for the brevo transport');
    if (env.DATABASE_CA_CERT && normaliseCaCert(env.DATABASE_CA_CERT) === null) {
      issue('DATABASE_CA_CERT', 'must be a PEM certificate, or base64 of one');
    }

    if (!env.GOOGLE_CLIENT_ID !== !env.GOOGLE_CLIENT_SECRET) {
      issue(env.GOOGLE_CLIENT_ID ? 'GOOGLE_CLIENT_SECRET' : 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together, or both left out');
    }

    if (env.NODE_ENV !== 'production') return;

    if (env.GOOGLE_OIDC_BASE_URL) issue('GOOGLE_OIDC_BASE_URL', 'is not allowed in production: sign-in must go to Google itself');

    if (!env.PUBLIC_ORIGIN.startsWith('https://')) issue('PUBLIC_ORIGIN', 'must be https in production');
    if (env.DEV_ORIGINS) issue('DEV_ORIGINS', 'is not allowed in production');
    if (env.MAIL_TRANSPORT !== 'smtp' && env.MAIL_TRANSPORT !== 'brevo') issue('MAIL_TRANSPORT', 'dev mail transports are refused in production');
    if (env.MAIL_TRANSPORT === 'smtp' && (!env.SMTP_USER || !env.SMTP_PASS)) issue('SMTP_USER', 'SMTP credentials are required in production');
    if (env.BREVO_API_BASE_URL) issue('BREVO_API_BASE_URL', 'is not allowed in production: mail must go to Brevo itself');
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
  | { kind: 'brevo'; from: string; fromName: string; fromAddress: string; apiKey: string; baseUrl: string; timeoutMs: number }
  | { kind: 'file'; from: string; path: string };

export interface Config {
  env: 'development' | 'test' | 'production';
  host: string;
  port: number;
  publicOrigin: string;
  allowedOrigins: ReadonlySet<string>;
  trustProxyHops: number;
  userRateLimitPerMinute: number;
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
  passwordHash: Argon2Params;
  /** Null when Google sign-in is off. */
  google: GoogleConfig | null;
}

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  jwksUrl: string;
  /** What an ID token's `iss` may say. */
  issuers: readonly string[];
  /** Derived from PUBLIC_ORIGIN, never from a request. */
  redirectUri: string;
}

const API_CALLBACK = '/api/v1/auth/google/callback';

function googleConfig(e: { GOOGLE_CLIENT_ID?: string | undefined; GOOGLE_CLIENT_SECRET?: string | undefined; GOOGLE_OIDC_BASE_URL?: string | undefined; PUBLIC_ORIGIN: string }): GoogleConfig | null {
  if (!e.GOOGLE_CLIENT_ID || !e.GOOGLE_CLIENT_SECRET) return null;
  const base = e.GOOGLE_OIDC_BASE_URL?.replace(/\/+$/, '');
  return {
    clientId: e.GOOGLE_CLIENT_ID,
    clientSecret: e.GOOGLE_CLIENT_SECRET,
    authorizeUrl: base ? `${base}/authorize` : 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: base ? `${base}/token` : 'https://oauth2.googleapis.com/token',
    jwksUrl: base ? `${base}/jwks` : 'https://www.googleapis.com/oauth2/v3/certs',
    issuers: base ? [base] : ['https://accounts.google.com', 'accounts.google.com'],
    redirectUri: `${e.PUBLIC_ORIGIN}${API_CALLBACK}`,
  };
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
    e.MAIL_TRANSPORT === 'brevo'
      ? {
          kind: 'brevo',
          from,
          fromName: sender.name,
          fromAddress: sender.address,
          apiKey: e.BREVO_API_KEY!,
          baseUrl: (e.BREVO_API_BASE_URL ?? 'https://api.brevo.com').replace(/\/+$/, ''),
          timeoutMs: e.BREVO_TIMEOUT_MS,
        }
      : e.MAIL_TRANSPORT === 'smtp'
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
    userRateLimitPerMinute: e.USER_RATE_LIMIT_PER_MINUTE,
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
      passwordPepper: decodeKey(e.PASSWORD_PEPPER)!,
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
    passwordHash: { memory: e.PASSWORD_ARGON2_MEMORY_KIB, passes: e.PASSWORD_ARGON2_PASSES, parallelism: ARGON2_FLOOR.parallelism },
    google: googleConfig(e),
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
