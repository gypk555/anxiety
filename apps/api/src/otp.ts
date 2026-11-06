import { randomBytes } from 'node:crypto';
import { constantTimeEqual, emailBlindIndex, emailQuotaIndex, generateOtp, hmac, otpHmac, type Keys } from './crypto.ts';
import type { Sql, Db } from './db.ts';
import type { Ctx } from './context.ts';
import { otpMail, type CodePurpose } from './mail.ts';

export type OtpPurpose = CodePurpose;

export const OTP_MAX_ATTEMPTS = 5;
export const OTP_TTL_MINUTES = 10;
/** Sends an hour, per purpose, so spam on sign-in cannot block deletion or an email change. */
export const OTP_MAX_PER_HOUR_PER_SOURCE = 5;
export const OTP_MAX_PER_HOUR = 20;
/** Wrong guesses at live codes in a rolling day, per address and purpose. */
export const OTP_MAX_FAILED_GUESSES = 50;

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

export interface OtpTarget {
  purpose: OtpPurpose;
  emailHash: Buffer;
  quotaHash: Buffer;
  /** Null for login, the signed-in user otherwise. */
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
 * Checks one or more codes as a single decision: all right consumes all, anything else consumes none and
 * says nothing about which was wrong. Each try costs every code an attempt, so a pair cannot be worked out
 * one code at a time. Per-address locks serialise guesses, so neither limit can be passed in parallel. An
 * address over its failed-guess cap is not evaluated at all, and the caller gives the usual answer.
 */
export async function consumeOtps(sql: Sql, keys: Keys, guesses: readonly { target: OtpTarget; code: string }[]): Promise<boolean> {
  return sql.begin(async (tx) => {
    const locks = [...new Set(guesses.map((g) => g.target.quotaHash.toString('hex')))].sort();
    for (const hex of locks) await lockAddress(tx, Buffer.from(hex, 'hex'));

    for (const { target } of guesses) {
      const [failed] = await tx<{ n: number }[]>`
        SELECT count(*)::int AS n FROM app.otp_failures
        WHERE quota_hash = ${target.quotaHash} AND purpose = ${target.purpose} AND created_at > now() - interval '24 hours'
      `;
      if (!failed || failed.n >= OTP_MAX_FAILED_GUESSES) return false;
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
      if (id && !matched) await tx`INSERT INTO app.otp_failures (quota_hash, purpose) VALUES (${target.quotaHash}, ${target.purpose})`;
    }
    return false;
  });
}

export const consumeOtp = (sql: Sql, keys: Keys, target: OtpTarget, code: string) => consumeOtps(sql, keys, [{ target, code }]);

/** Issue and mail. Always runs after the response has been sent; never logs the address. */
export async function deliverOtp(
  ctx: Ctx,
  input: { purpose: OtpPurpose; email: string; subjectUserId: string | null; clientKey: string; binding?: Buffer | null },
): Promise<void> {
  const { keys } = ctx.config;
  const code = await issueOtp(ctx.sql, keys, otpTarget(keys, input.purpose, input.email, input.subjectUserId, input.binding ?? null), input.clientKey);
  if (code) await ctx.mailer.send(otpMail(input.email, input.purpose, code));
}
