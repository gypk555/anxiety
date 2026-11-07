import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig, loadMigrationConfig } from '../src/config.ts';
import { createMailer } from '../src/mail.ts';
import { baseEnv, key } from './helpers.ts';

// Parses as X.509, which is all config validation can check. No private key exists for it.
const CA = `-----BEGIN CERTIFICATE-----
MIIBfTCCASOgAwIBAgIUEYzPnr5Rl1Bv7tS1cWpWGZlRYcwwCgYIKoZIzj0EAwIw
FDESMBAGA1UEAwwJdGVzdC1yb290MB4XDTI2MDEwMTAwMDAwMFoXDTM2MDEwMTAw
MDAwMFowFDESMBAGA1UEAwwJdGVzdC1yb290MFkwEwYHKoZIzj0CAQYIKoZIzj0D
AQcDQgAEw7h6l2u2i7q8bVwqk9Tq0m8w5mQb6d3l3a7l2Y2mX6T7vM1yZ0u0f3kD
ZyHk8m0S0k5i7mN9Q9v8Q2qk6r1H4qNTMFEwHQYDVR0OBBYEFHn8t6qg1iQb6l3O
0G5a7rC1m9kCMB8GA1UdIwQYMBaAFHn8t6qg1iQb6l3O0G5a7rC1m9kCMA8GA1Ud
EwEB/wQFMAMBAf8wCgYIKoZIzj0EAwIDSAAwRQIhAJ6v1m0Yq0n8x5Y2gq0m6m3b
1y3m6j1x5n3w5m8k2q0lAiB2m0n1m3b6l1x7k0m3q9n5m1y5k3x0q7m2n1b5y8k3
Qw==
-----END CERTIFICATE-----`;

const invalid = (env: Record<string, string | undefined>): string[] => {
  try {
    loadConfig(env);
  } catch (err) {
    expect(err).toBeInstanceOf(ConfigError);
    return (err as ConfigError).problems;
  }
  throw new Error('expected the configuration to be refused');
};

const prod = (overrides: Record<string, string | undefined> = {}) =>
  baseEnv({
    NODE_ENV: 'production',
    PUBLIC_ORIGIN: 'https://app.example.com',
    MAIL_TRANSPORT: 'smtp',
    SMTP_HOST: 'smtp.example.com',
    SMTP_USER: 'user',
    SMTP_PASS: 'pass',
    DATABASE_URL: 'postgres://anxiocare_runtime.proj:pw@db.example.com:5432/postgres',
    DATABASE_CA_CERT: CA,
    ...overrides,
  });

describe('config', () => {
  it('names the variable, never its value', () => {
    const secret = 'super-secret-value-that-is-not-base64!';
    const problems = invalid(baseEnv({ OTP_PEPPER: secret }));
    expect(problems.join('\n')).toContain('OTP_PEPPER');
    expect(problems.join('\n')).not.toContain(secret);
  });

  it('requires everything required', () => {
    const problems = invalid({ NODE_ENV: 'test' }).join('\n');
    for (const name of ['PUBLIC_ORIGIN', 'DATABASE_URL', 'ENCRYPTION_KEYS', 'EMAIL_INDEX_KEY', 'OTP_PEPPER', 'AUDIT_KEY', 'MAIL_TRANSPORT', 'MAIL_FROM', 'OPERATOR_NAME', 'GRIEVANCE_EMAIL']) {
      expect(problems).toContain(name);
    }
  });

  it.each([
    ['too short', Buffer.alloc(16, 7).toString('base64')],
    ['all the same byte', Buffer.alloc(32, 7).toString('base64')],
    ['repeating pattern', Buffer.from('abcd'.repeat(8)).toString('base64')],
    ['not base64', 'password'],
  ])('refuses a weak key: %s', (_name, weak) => {
    expect(invalid(baseEnv({ EMAIL_INDEX_KEY: weak })).join()).toContain('EMAIL_INDEX_KEY');
    expect(invalid(baseEnv({ ENCRYPTION_KEYS: `v1:${weak}` })).join()).toContain('ENCRYPTION_KEYS');
  });

  it('refuses the same key used twice', () => {
    const shared = key();
    expect(invalid(baseEnv({ OTP_PEPPER: shared, AUDIT_KEY: shared })).join()).toContain('AUDIT_KEY');
    expect(invalid(baseEnv({ ENCRYPTION_KEYS: `v1:${shared}`, AUDIT_KEY: shared })).join()).toMatch(/ENCRYPTION_KEYS|AUDIT_KEY/);
  });

  it('refuses an active key that is not in the ring, and malformed rings', () => {
    expect(invalid(baseEnv({ ENCRYPTION_ACTIVE_KEY: 'v2' })).join()).toContain('ENCRYPTION_ACTIVE_KEY');
    expect(invalid(baseEnv({ ENCRYPTION_KEYS: 'nonsense' })).join()).toContain('ENCRYPTION_KEYS');
  });

  it('parses a rotation ring', () => {
    const config = loadConfig(baseEnv({ ENCRYPTION_KEYS: `v1:${key()},v2:${key()}`, ENCRYPTION_ACTIVE_KEY: 'v2' }));
    expect(config.keys.ring.activeVersion).toBe('v2');
  });

  it.each(['https://example.com/', 'https://example.com/path', 'example.com', 'ftp://example.com'])(
    'refuses PUBLIC_ORIGIN %s',
    (value) => {
      expect(invalid(baseEnv({ PUBLIC_ORIGIN: value })).join()).toContain('PUBLIC_ORIGIN');
    },
  );

  it('uses the plain cookie name only in development', () => {
    expect(loadConfig(baseEnv({ NODE_ENV: 'development' })).cookie).toEqual({ name: 'session', secure: false });
    expect(loadConfig(baseEnv()).cookie).toEqual({ name: '__Host-session', secure: true });
    expect(loadConfig(prod()).cookie).toEqual({ name: '__Host-session', secure: true });
  });

  it('defaults TRUST_PROXY_HOPS to 1', () => {
    expect(loadConfig(baseEnv()).trustProxyHops).toBe(1);
    expect(loadConfig(baseEnv({ TRUST_PROXY_HOPS: '2' })).trustProxyHops).toBe(2);
  });
});

describe('production config', () => {
  it('accepts a complete setup', () => {
    const config = loadConfig(prod());
    expect(config.env).toBe('production');
    expect(config.databaseCaCert).toContain('BEGIN CERTIFICATE');
  });

  it('accepts the CA as base64', () => {
    const config = loadConfig(prod({ DATABASE_CA_CERT: Buffer.from(CA).toString('base64') }));
    expect(config.databaseCaCert).toContain('BEGIN CERTIFICATE');
  });

  it.each(['file:/tmp/outbox.jsonl', 'file:./x'])('refuses the dev mail transport %s', (MAIL_TRANSPORT) => {
    expect(invalid(prod({ MAIL_TRANSPORT })).join()).toContain('MAIL_TRANSPORT');
  });

  it('createMailer refuses file mail in production as a second check', () => {
    const config = { ...loadConfig(baseEnv()), env: 'production' as const };
    expect(() => createMailer(config)).toThrow(/refused/);
  });

  it('refuses a missing or invalid CA', () => {
    expect(invalid(prod({ DATABASE_CA_CERT: undefined })).join()).toContain('DATABASE_CA_CERT');
    expect(invalid(prod({ DATABASE_CA_CERT: 'not a cert' })).join()).toContain('DATABASE_CA_CERT');
  });

  it('refuses weak keys', () => {
    expect(invalid(prod({ OTP_PEPPER: Buffer.alloc(32).toString('base64') })).join()).toContain('OTP_PEPPER');
  });

  it('refuses plain http, dev origins, missing SMTP credentials', () => {
    expect(invalid(prod({ PUBLIC_ORIGIN: 'http://app.example.com' })).join()).toContain('PUBLIC_ORIGIN');
    expect(invalid(prod({ DEV_ORIGINS: 'http://localhost:5173' })).join()).toContain('DEV_ORIGINS');
    expect(invalid(prod({ SMTP_PASS: undefined })).join()).toContain('SMTP_USER');
  });

  it('refuses an admin role, or the migration role, at runtime', () => {
    expect(invalid(prod({ DATABASE_URL: 'postgres://postgres.proj:pw@db.example.com/postgres' })).join()).toContain('DATABASE_URL');
    const same = 'postgres://anxiocare_runtime:pw@db.example.com/postgres';
    expect(invalid(prod({ DATABASE_URL: same, DATABASE_MIGRATION_URL: same })).join()).toContain('DATABASE_URL');
    expect(invalid(prod({ DATABASE_URL: `${same}?sslmode=disable` })).join()).toContain('DATABASE_URL');
  });

  it('refuses a sender name that gives the subject matter away', () => {
    expect(invalid(prod({ MAIL_FROM: 'AnxioCare <no-reply@example.com>' })).join()).toContain('MAIL_FROM');
    expect(loadConfig(prod({ MAIL_FROM: 'Account Team <no-reply@example.com>' })).mail.from).toContain('Account Team');
  });
});

describe('migration config', () => {
  it('needs only the migration URL, and a CA in production', () => {
    expect(loadMigrationConfig({ DATABASE_MIGRATION_URL: 'postgres://m:p@h/d' }).url).toContain('postgres://');
    expect(() => loadMigrationConfig({})).toThrow(ConfigError);
    expect(() => loadMigrationConfig({ NODE_ENV: 'production', DATABASE_MIGRATION_URL: 'postgres://m:p@h/d' })).toThrow(/DATABASE_CA_CERT/);
  });
});

describe('Google sign-in config', () => {
  const both = { GOOGLE_CLIENT_ID: 'id.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'secret-value' };

  it('is off by default', () => {
    expect(loadConfig(prod()).google).toBeNull();
    expect(loadConfig(baseEnv()).google).toBeNull();
  });

  it('uses Google itself in production, with the redirect from PUBLIC_ORIGIN', () => {
    const { google } = loadConfig(prod(both));
    expect(google).toMatchObject({
      clientId: both.GOOGLE_CLIENT_ID,
      authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      jwksUrl: 'https://www.googleapis.com/oauth2/v3/certs',
      redirectUri: 'https://app.example.com/api/v1/auth/google/callback',
    });
    expect(google!.issuers).toEqual(['https://accounts.google.com', 'accounts.google.com']);
  });

  it.each([
    ['only the id', { GOOGLE_CLIENT_ID: both.GOOGLE_CLIENT_ID }, 'GOOGLE_CLIENT_SECRET'],
    ['only the secret', { GOOGLE_CLIENT_SECRET: both.GOOGLE_CLIENT_SECRET }, 'GOOGLE_CLIENT_ID'],
    ['the id, with a blank secret', { GOOGLE_CLIENT_ID: both.GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET: '' }, 'GOOGLE_CLIENT_SECRET'],
  ])('production refuses half-set config: %s', (_name, env, named) => {
    const problems = invalid(prod(env));
    expect(problems.join('\n')).toContain(named);
    expect(problems.join('\n')).not.toContain(both.GOOGLE_CLIENT_SECRET);
  });

  it('half-set is refused outside production too', () => {
    expect(invalid(baseEnv({ GOOGLE_CLIENT_ID: both.GOOGLE_CLIENT_ID })).join('\n')).toContain('GOOGLE_CLIENT_SECRET');
  });

  it('two blank settings, as a hosting dashboard sends them, mean off', () => {
    expect(loadConfig(prod({ GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', GOOGLE_OIDC_BASE_URL: '' })).google).toBeNull();
  });

  it('production refuses an endpoint override, with or without Google on', () => {
    expect(invalid(prod({ ...both, GOOGLE_OIDC_BASE_URL: 'https://fake.example' })).join('\n')).toContain('GOOGLE_OIDC_BASE_URL');
    expect(invalid(prod({ GOOGLE_OIDC_BASE_URL: 'https://fake.example' })).join('\n')).toContain('GOOGLE_OIDC_BASE_URL');
  });

  it('outside production an override points every endpoint and the issuer at it', () => {
    const { google } = loadConfig(baseEnv({ ...both, GOOGLE_OIDC_BASE_URL: 'http://127.0.0.1:9/' }));
    expect(google).toMatchObject({ authorizeUrl: 'http://127.0.0.1:9/authorize', tokenUrl: 'http://127.0.0.1:9/token', jwksUrl: 'http://127.0.0.1:9/jwks', issuers: ['http://127.0.0.1:9'] });
  });

  it('refuses an override that is not a URL', () => {
    expect(invalid(baseEnv({ GOOGLE_OIDC_BASE_URL: 'not a url' })).join('\n')).toContain('GOOGLE_OIDC_BASE_URL');
  });
});

describe('password config', () => {
  it('needs PASSWORD_PEPPER, as a real random key that nothing else reuses', () => {
    expect(invalid(prod({ PASSWORD_PEPPER: undefined })).join('\n')).toContain('PASSWORD_PEPPER');
    expect(invalid(prod({ PASSWORD_PEPPER: 'short' })).join('\n')).toContain('PASSWORD_PEPPER');
    expect(invalid(prod({ PASSWORD_PEPPER: Buffer.alloc(32, 'a').toString('base64') })).join('\n')).toContain('PASSWORD_PEPPER');
    const shared = key();
    expect(invalid(prod({ PASSWORD_PEPPER: shared, OTP_PEPPER: shared })).join('\n')).toContain('PASSWORD_PEPPER');
  });

  it('never prints the pepper', () => {
    const value = Buffer.alloc(32, 'a').toString('base64');
    expect(invalid(prod({ PASSWORD_PEPPER: value })).join('\n')).not.toContain(value);
  });

  it('defaults to the OWASP minimum, and can be raised', () => {
    expect(loadConfig(prod()).passwordHash).toEqual({ memory: 19456, passes: 2, parallelism: 1 });
    expect(loadConfig(prod({ PASSWORD_ARGON2_MEMORY_KIB: '32768', PASSWORD_ARGON2_PASSES: '3' })).passwordHash).toEqual({ memory: 32768, passes: 3, parallelism: 1 });
    expect(loadConfig(prod({ PASSWORD_ARGON2_MEMORY_KIB: '', PASSWORD_ARGON2_PASSES: '' })).passwordHash.memory).toBe(19456);
  });
});
