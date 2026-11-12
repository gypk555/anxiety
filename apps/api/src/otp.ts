import { randomBytes } from 'node:crypto';
import { constantTimeEqual, emailBlindIndex, emailQuotaIndex, generateOtp, hmac, loginQuotaIndex, otpHmac, type Keys } from './crypto.ts';
import type { Sql, Db } from './db.ts';
import type { Ctx } from './context.ts';
import { otpMail, type CodePurpose } from './mail.ts';

export type OtpPurpose = CodePurpose;

export const OTP_MAX_ATTEMPTS = 5;
export const OTP_TTL_MINUTES = 10;
/** Sends an hour, per purpose, so spam on sign-in cannot block deletion or an email change. */
export const OTP_MAX_PER_HOUR_PER_SOURCE = 5;
export const OTP_MAX_PER_HOUR = 20;
/**
 * Wrong guesses at live codes in a rolling day, per address, from anywhere. For the sign-in purposes this is what
 * holds the yearly odds of guessing a 6-digit code to about 0.7%: see docs/SECURITY-EXCEPTIONS.md. It is not
 * raised for unknown devices, because every guess it allows is a chance at the account.
 */
export const OTP_MAX_FAILED_GUESSES = 20;
/** The same, per address and client (IPv6 by /64), for the sign-in purposes. One network alone cannot reach the cap above. */
export const OTP_MAX_FAILED_GUESSES_PER_SOURCE = 5;
/** The same, per known device, which the address caps do not apply to. Equal to the address cap, so the odds above hold per device. */
export const OTP_MAX_FAILED_GUESSES_PER_DEVICE = 20;

/**
 * Which purposes spend one budget. These three need no session and each one hands over an account, so a
 * budget each would let an attacker work two side by side and double the odds in docs/SECURITY-EXCEPTIONS.md.
 * A signed-in purpose keeps its own, so anonymous guessing cannot block a person's own deletion or password.
 */
const SIGN_IN_PURPOSES: readonly OtpPurpose[] = ['login', 'register', 'password_reset'];
const guessBudget = (purpose: OtpPurpose): readonly OtpPurpose[] => (SIGN_IN_PURPOSES.includes(purpose) ? SIGN_IN_PURPOSES : [purpose]);

const GOOGLE_DOMAINS = new Set(['gmail.com', 'googlemail.com']);

/**
 * For quota only: every spelling that lands in one inbox spends one budget. It must never decide identity
 * or delivery, because on most providers these really are different mailboxes.
 */
export function canonicalEmailForQuota(email: string): string {
  const lower = email.trim().toLowerCase();
  const at = lower.lastIndexOf('@');
  if (at < 0) return lower;
  const domain = lower.slice(at + 1);
  const local = lower.slice(0, at).split('+', 1)[0]!;
  return GOOGLE_DOMAINS.has(domain) ? `${local.replaceAll('.', '')}@gmail.com` : `${local}@${domain}`;
}

export const emailQuotaKey = (keys: Keys, email: string) => emailQuotaIndex(keys, canonicalEmailForQuota(email));
/** For `login_failures` only: a different HMAC domain from `emailQuotaKey`, so the two tables cannot be joined. */
export const loginQuotaKey = (keys: Keys, email: string) => loginQuotaIndex(keys, canonicalEmailForQuota(email));

export interface OtpTarget {
  purpose: OtpPurpose;
  emailHash: Buffer;
  quotaHash: Buffer;
  /** Null for the purposes that need no session, the signed-in user otherwise. */
  subjectUserId: string | null;
  /** What this code approves, when that is more than the address it was mailed to. Covered by the HMAC. */
  binding: Buffer | null;
}

export function otpTarget(keys: Keys, purpose: OtpPurpose, email: string, subjectUserId: string | null, binding: Buffer | null = null): OtpTarget {
  return { purpose, emailHash: emailBlindIndex(keys, email), quotaHash: emailQuotaKey(keys, email), subjectUserId, binding };
}

const lockAddress = (db: Db, quotaHash: Buffer) => db`SELECT pg_advisory_xact_lock(hashtextextended(${quotaHash.toString('hex')}::text, 0))`;

/**
 * Issues a code unless a quota says no. The lock makes the counts, the invalidation of earlier codes
 * and the insert one atomic step, so parallel requests cannot pass a limit. `clientKey` is stored only
 * inside a keyed hash, and only for as long as the row lives.
 */
export async function issueOtp(sql: Sql, keys: Keys, target: OtpTarget, clientKey: string): Promise<string | null> {
  const { purpose, emailHash, quotaHash, subjectUserId } = target;
  const code = generateOtp();
  const codeHmac = otpHmac(keys, { ...target, code });
  const sourceHash = hmac(keys.otpPepper, `otp-source:${quotaHash.toString('hex')}:${clientKey}`);
  const issued = await sql.begin(async (tx) => {
    await lockAddress(tx, quotaHash);
    const [recent] = await tx<{ total: number; source: number }[]>`
      SELECT count(*)::int AS total, count(*) FILTER (WHERE source_hash = ${sourceHash})::int AS source
      FROM app.otp_codes
      WHERE purpose = ${purpose} AND quota_hash = ${quotaHash} AND created_at > now() - interval '1 hour'
    `;
    if (!recent || recent.total >= OTP_MAX_PER_HOUR || recent.source >= OTP_MAX_PER_HOUR_PER_SOURCE) return false;
    await tx`
      UPDATE app.otp_codes SET consumed_at = now()
      WHERE purpose = ${purpose} AND email_hash = ${emailHash}
        AND subject_user_id IS NOT DISTINCT FROM ${subjectUserId}::uuid
        AND consumed_at IS NULL
    `;
    await tx`
      INSERT INTO app.otp_codes (purpose, email_hash, quota_hash, source_hash, subject_user_id, code_hmac, expires_at)
      VALUES (${purpose}, ${emailHash}, ${quotaHash}, ${sourceHash}, ${subjectUserId}::uuid, ${codeHmac},
              now() + make_interval(mins => ${OTP_TTL_MINUTES}::int))
    `;
    return true;
  });
  return issued ? code : null;
}

const NO_MATCH = randomBytes(32);

/**
 * Where a guess came from, for the sign-in purposes. A known device is one whose cookie belongs to this account: it
 * spends only its own budget. Anything else spends its address-and-source budget and the address's overall one.
 */
export interface GuessOrigin {
  clientKey: string;
  deviceId: string | null;
}

/** Only inside a keyed hash, and bound to the address, so one client's rows cannot be followed across addresses. */
const failureSource = (keys: Keys, quotaHash: Buffer, clientKey: string) => hmac(keys.otpPepper, `otp-failure-source:${quotaHash.toString('hex')}:${clientKey}`);
const lockDevice = (db: Db, deviceId: string) => db`SELECT pg_advisory_xact_lock(hashtextextended(${`device:${deviceId}`}::text, 0))`;

/**
 * Checks one or more codes as a single decision: all right consumes all, anything else consumes none and
 * says nothing about which was wrong. Each try costs every code an attempt, so a pair cannot be worked out
 * one code at a time. Per-address locks serialise guesses, so neither limit can be passed in parallel. An
 * address over its failed-guess cap is not evaluated at all, and the caller gives the usual answer.
 */
export async function consumeOtps(sql: Sql, keys: Keys, guesses: readonly { target: OtpTarget; code: string }[], from: GuessOrigin | null = null): Promise<boolean> {
  return sql.begin(async (tx) => {
    const locks = [...new Set(guesses.map((g) => g.target.quotaHash.toString('hex')))].sort();
    for (const hex of locks) await lockAddress(tx, Buffer.from(hex, 'hex'));
    if (from?.deviceId) await lockDevice(tx, from.deviceId);

    for (const { target } of guesses) {
      if (!(await withinBudget(tx, keys, target, from))) return false;
    }

    const results: { target: OtpTarget; id: string | null; matched: boolean }[] = [];
    for (const { target, code } of guesses) {
      const candidate = otpHmac(keys, { ...target, code });
      const [row] = await tx<{ id: string; code_hmac: Buffer }[]>`
        UPDATE app.otp_codes SET attempts = attempts + 1
        WHERE purpose = ${target.purpose} AND email_hash = ${target.emailHash}
          AND subject_user_id IS NOT DISTINCT FROM ${target.subjectUserId}::uuid
          AND consumed_at IS NULL AND expires_at > now() AND attempts < ${OTP_MAX_ATTEMPTS}
        RETURNING id, code_hmac
      `;
      results.push({ target, id: row?.id ?? null, matched: constantTimeEqual(row?.code_hmac ?? NO_MATCH, candidate) && row != null });
    }

    if (results.every((r) => r.matched)) {
      await tx`UPDATE app.otp_codes SET consumed_at = now() WHERE id = ANY(${results.map((r) => r.id!)}::uuid[])`;
      return true;
    }
    // Only a guess at a live code counts: otherwise anyone could spend an address's cap without a code ever being sent.
    for (const { target, id, matched } of results) {
      if (!id || matched) continue;
      const counted = countedBy(keys, target, from);
      await tx`
        INSERT INTO app.otp_failures (quota_hash, purpose, source_hash, device_id)
        VALUES (${target.quotaHash}, ${target.purpose}, ${counted.sourceHash}, ${counted.deviceId}::uuid)
      `;
    }
    return false;
  });
}

function countedBy(keys: Keys, target: OtpTarget, from: GuessOrigin | null): { sourceHash: Buffer | null; deviceId: string | null } {
  if (!SIGN_IN_PURPOSES.includes(target.purpose) || !from) return { sourceHash: null, deviceId: null };
  if (from.deviceId) return { sourceHash: null, deviceId: from.deviceId };
  return { sourceHash: failureSource(keys, target.quotaHash, from.clientKey), deviceId: null };
}

/**
 * A signed-in purpose: one budget per address and purpose. A sign-in purpose from a known device: that device's own.
 * Otherwise: the address-and-source budget and the address's overall one, shared by the three sign-in purposes.
 */
async function withinBudget(tx: Db, keys: Keys, target: OtpTarget, from: GuessOrigin | null): Promise<boolean> {
  const counted = countedBy(keys, target, from);
  if (counted.deviceId) {
    const [row] = await tx<{ n: number }[]>`
      SELECT count(*)::int AS n FROM app.otp_failures WHERE device_id = ${counted.deviceId}::uuid AND created_at > now() - interval '24 hours'
    `;
    return !!row && row.n < OTP_MAX_FAILED_GUESSES_PER_DEVICE;
  }
  const [row] = await tx<{ total: number; source: number }[]>`
    SELECT count(*)::int AS total, count(*) FILTER (WHERE source_hash = ${counted.sourceHash})::int AS source
    FROM app.otp_failures
    WHERE quota_hash = ${target.quotaHash} AND purpose = ANY(${guessBudget(target.purpose) as OtpPurpose[]}::text[])
      AND device_id IS NULL AND created_at > now() - interval '24 hours'
  `;
  if (!row || row.total >= OTP_MAX_FAILED_GUESSES) return false;
  return counted.sourceHash === null || row.source < OTP_MAX_FAILED_GUESSES_PER_SOURCE;
}

export const consumeOtp = (sql: Sql, keys: Keys, target: OtpTarget, code: string, from: GuessOrigin | null = null) =>
  consumeOtps(sql, keys, [{ target, code }], from);

/** Issue and mail. Always runs after the response has been sent; never logs the address. */
export async function deliverOtp(
  ctx: Ctx,
  input: { purpose: OtpPurpose; email: string; subjectUserId: string | null; clientKey: string; binding?: Buffer | null },
): Promise<void> {
  const { keys } = ctx.config;
  const code = await issueOtp(ctx.sql, keys, otpTarget(keys, input.purpose, input.email, input.subjectUserId, input.binding ?? null), input.clientKey);
  if (code) await ctx.mailer.send(otpMail(input.email, input.purpose, code));
}

/**
 * Create account. An address with an account gets a notice instead of a code, sent under the same quota, so this
 * route cannot mail-bomb anyone. The code issued in that case is never sent to anyone, and could not create
 * anything even if guessed, because verify refuses an address that already has an account.
 */
/**
 * Create account, step one. The owner chose to say plainly when an address already has an account (decision 015), so
 * this runs before the response. Both kinds of address spend the same send quota first, in the same way: once it is
 * spent, both get the same quiet answer and nothing is mailed, so the answer can't be used to check addresses past it.
 * An existing address gets no mail at all. A new one gets its code, mailed after the response.
 */
export async function startRegistration(ctx: Ctx, input: { email: string; clientKey: string }): Promise<{ outcome: 'exists' } | { outcome: 'quiet' } | { outcome: 'send'; code: string }> {
  const { keys } = ctx.config;
  const target = otpTarget(keys, 'register', input.email, null);
  const code = await issueOtp(ctx.sql, keys, target, input.clientKey);
  if (!code) return { outcome: 'quiet' };
  const [existing] = await ctx.sql`SELECT 1 FROM app.users WHERE email_hash = ${target.emailHash}`;
  return existing ? { outcome: 'exists' } : { outcome: 'send', code };
}

export const registrationMail = (email: string, code: string) => otpMail(email, 'register', code);

/** Forgot password. An address with no account gets nothing, and no row: the response was already sent, so nobody can tell. */
export async function deliverPasswordReset(ctx: Ctx, input: { email: string; clientKey: string }): Promise<void> {
  const { keys } = ctx.config;
  const [existing] = await ctx.sql`SELECT 1 FROM app.users WHERE email_hash = ${emailBlindIndex(keys, input.email)}`;
  if (existing) await deliverOtp(ctx, { purpose: 'password_reset', email: input.email, subjectUserId: null, clientKey: input.clientKey });
}
