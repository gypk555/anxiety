import { z } from 'zod';
import { GAD7_ITEMS } from './gad7.ts';

/** Bump when the privacy notice changes materially; users are asked to accept again. */
export const CONSENT_VERSION = '2026-11-06';

/**
 * Shown to everyone asked to accept again, so it must be rewritten with every bump: a test fails while
 * `version` differs from CONSENT_VERSION. Plain words, and only what really changed from the last version.
 */
export const CONSENT_CHANGES = {
  version: '2026-11-06',
  summary: [
    'We now name Cloudflare, the network our server provider uses to carry traffic, among our service providers.',
    'Clean-up now runs every hour, so records of sign-in codes and accounts that never agreed are removed sooner.',
  ],
} as const;
/** Every state-changing API request must carry this header (CSRF defence in depth). */
export const CSRF_HEADER = 'x-anxiocare-csrf';
export const CSRF_HEADER_VALUE = '1';
export const OTP_LENGTH = 8;
/** How a code reads in an email, for example 1234 5678. Input accepts this form too. */
export const formatOtp = (code: string) => `${code.slice(0, OTP_LENGTH / 2)} ${code.slice(OTP_LENGTH / 2)}`;

const trimmed = (max: number) => z.string().trim().max(max);

export const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());
export const otpCodeSchema = z.string().regex(new RegExp(`^\\d{${OTP_LENGTH}}$`));
export const uuidSchema = z.uuid();

// ── Auth ──────────────────────────────────────────────────────────────
export const otpRequestBody = z.strictObject({ email: emailSchema });
export const otpVerifyBody = z.strictObject({ email: emailSchema, code: otpCodeSchema });
export const consentBody = z.strictObject({
  version: z.literal(CONSENT_VERSION),
  adultConfirmed: z.literal(true),
  healthDataConsent: z.literal(true),
});
export const emailChangeRequestBody = z.strictObject({ newEmail: emailSchema });
/** `currentCode` was mailed to the address on the account, `code` to the new address. */
export const emailChangeVerifyBody = z.strictObject({ newEmail: emailSchema, currentCode: otpCodeSchema, code: otpCodeSchema });
export const accountDeleteConfirmBody = z.strictObject({ code: otpCodeSchema });
export const profilePatchBody = z.strictObject({ displayName: trimmed(60).nullable() });

export const meResponse = z.object({
  id: uuidSchema,
  email: z.string(),
  displayName: z.string().nullable(),
  createdAt: z.iso.datetime(),
  consentRequired: z.boolean(),
  consentVersion: z.string(),
  /** What this person last agreed to. Null means never, which is a different conversation from a re-prompt. */
  acceptedConsentVersion: z.string().nullable(),
});
export type Me = z.infer<typeof meResponse>;

export const sessionResponse = z.object({
  id: uuidSchema,
  deviceLabel: z.string(),
  createdAt: z.iso.datetime(),
  lastSeenAt: z.iso.datetime(),
  current: z.boolean(),
});
export type SessionInfo = z.infer<typeof sessionResponse>;

// ── Assessments ───────────────────────────────────────────────────────
export const gad7Answer = z.number().int().min(0).max(3);
export const assessmentCreateBody = z
  .strictObject({
    /** Client-generated; replaying the same id returns the original row. */
    clientRequestId: uuidSchema,
    answers: z.array(gad7Answer).length(GAD7_ITEMS.length),
    /** Unscored functional item; only asked when some symptom was reported. */
    difficulty: gad7Answer.nullable(),
    /** Set when a result taken before sign-in is being saved. Max 24h old, not in the future. */
    takenAt: z.iso.datetime().optional(),
  })
  .refine((v) => v.answers.every((a) => a === 0) || v.difficulty !== null, {
    path: ['difficulty'],
    message: 'difficulty is required when any symptom is reported',
  });
export type AssessmentCreate = z.infer<typeof assessmentCreateBody>;

export const assessmentResponse = z.object({
  id: uuidSchema,
  takenAt: z.iso.datetime(),
  answers: z.array(gad7Answer),
  difficulty: gad7Answer.nullable(),
  /** Always computed by the server, never accepted from the client. */
  score: z.number().int().min(0).max(21),
  severity: z.enum(['minimal', 'mild', 'moderate', 'severe']),
});
export type Assessment = z.infer<typeof assessmentResponse>;

// ── Journal (CBT thought record) ──────────────────────────────────────
export const journalBody = z.strictObject({
  situation: trimmed(2000).min(1),
  thought: trimmed(2000).min(1),
  feelings: z.array(trimmed(40).min(1)).max(10),
  intensityBefore: z.number().int().min(0).max(10),
  evidenceFor: trimmed(2000),
  evidenceAgainst: trimmed(2000),
  balancedThought: trimmed(2000),
  intensityAfter: z.number().int().min(0).max(10).nullable(),
});
export type JournalInput = z.infer<typeof journalBody>;

export const journalResponse = journalBody.extend({
  id: uuidSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type JournalEntry = z.infer<typeof journalResponse>;

// ── Shared ────────────────────────────────────────────────────────────
export const metaResponse = z.object({
  operatorName: z.string(),
  grievanceEmail: z.string(),
  consentVersion: z.string(),
  /** How long encrypted backups can still hold a deleted account. */
  backupRetentionDays: z.number().int().min(0),
  dataLocation: z.string(),
  serverLocation: z.string(),
  mailProvider: z.string(),
});
export type Meta = z.infer<typeof metaResponse>;

export const pageQuery = z.strictObject({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export const pageOf = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), nextCursor: z.string().nullable() });

/** RFC 9457 problem document returned for every error. */
export const problemResponse = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number(),
  code: z.string(),
  detail: z.string().optional(),
  requestId: z.string().optional(),
  fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
});
export type Problem = z.infer<typeof problemResponse>;
export const ERROR_CODES = [
  'validation_failed', 'unauthenticated', 'consent_required', 'forbidden', 'not_found',
  'invalid_code', 'rate_limited', 'csrf_failed', 'conflict', 'internal_error',
] as const;
