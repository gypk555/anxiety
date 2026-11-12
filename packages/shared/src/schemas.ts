import { z } from 'zod';
import { GAD7_ITEMS } from './gad7.ts';
import { passwordLength, PASSWORD_MAX, PASSWORD_MIN } from './password-length.ts';
import { profileSchema } from './profile.ts';

/** Bump when the privacy notice changes materially; users are asked to accept again. */
export const CONSENT_VERSION = '2026-11-13';

/**
 * Shown to everyone asked to accept again, so it must be rewritten with every bump: a test fails while
 * `version` differs from CONSENT_VERSION. Plain words, and only what really changed from the last version.
 */
export const CONSENT_CHANGES = {
  version: '2026-11-13',
  summary: [
    'An account now needs a name: what you\'d like us to call you. It can be a nickname. It is encrypted, used to greet you, and put on a report for your doctor only if you choose.',
    'You can change it in Settings at any time, but not remove it. It is deleted with your account.',
    'You can now add a few optional details about you: an avatar, an age range, your gender, what you do, and what tends to cause you stress. Each is picked from a list. They are encrypted, and you can change or remove any of them in Settings at any time.',
    'They are used only to show back to you, in a report for your doctor if you choose to include them, and (for stress) to suggest tools that may help. They are never used to compare you with anyone, and never shared.',
  ],
} as const;
/** Every state-changing API request must carry this header (CSRF defence in depth). */
export const CSRF_HEADER = 'x-anxiocare-csrf';
export const CSRF_HEADER_VALUE = '1';
export const OTP_LENGTH = 6;
/** How a code reads in an email, for example 123 456. Input accepts this form too. */
export const formatOtp = (code: string) => `${code.slice(0, OTP_LENGTH / 2)} ${code.slice(OTP_LENGTH / 2)}`;

const trimmed = (max: number) => z.string().trim().max(max);

export const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());
export const otpCodeSchema = z.string().regex(new RegExp(`^\\d{${OTP_LENGTH}}$`));
export const uuidSchema = z.uuid();

// ── Auth ──────────────────────────────────────────────────────────────
/** Never trimmed: spaces are part of a password. Length as a person counts it, so an emoji is one character. */
export const passwordSchema = z.string().refine((value) => {
  const length = passwordLength(value);
  return length >= PASSWORD_MIN && length <= PASSWORD_MAX;
}, { message: `must be ${PASSWORD_MIN} to ${PASSWORD_MAX} characters` });
/** For checking a password someone already has. Shape only: a rule added later must not lock out an older password. */
const existingPassword = z.string().min(1).max(PASSWORD_MAX * 4);
/** What to call the person. Required: a real name or a nickname, 1 to 60 characters once trimmed. */
export const displayNameSchema = trimmed(60).min(1);

export const otpRequestBody = z.strictObject({ email: emailSchema });
export const otpVerifyBody = z.strictObject({ email: emailSchema, code: otpCodeSchema });
export const registerRequestBody = z.strictObject({ email: emailSchema });
export const registerVerifyBody = z.strictObject({ email: emailSchema, code: otpCodeSchema, password: passwordSchema, displayName: displayNameSchema });
export const loginBody = z.strictObject({ email: emailSchema, password: existingPassword });
export const passwordForgotBody = z.strictObject({ email: emailSchema });
export const passwordResetBody = z.strictObject({ email: emailSchema, code: otpCodeSchema, password: passwordSchema });
export const passwordChangeBody = z.strictObject({ currentPassword: existingPassword, password: passwordSchema });
/** Proving it's you again, before changing how the account signs in. */
export const reauthPasswordBody = z.strictObject({ password: existingPassword });
export const reauthCodeBody = z.strictObject({ code: otpCodeSchema });
/** Where to send the browser to connect Google. The state cookie is set on this same response. */
export const googleConnectResponse = z.object({ url: z.url() });
export const passwordSetBody = z.strictObject({ code: otpCodeSchema, password: passwordSchema });
export const consentBody = z.strictObject({
  version: z.literal(CONSENT_VERSION),
  adultConfirmed: z.literal(true),
  healthDataConsent: z.literal(true),
});
export const emailChangeRequestBody = z.strictObject({ newEmail: emailSchema });
/** `currentCode` was mailed to the address on the account, `code` to the new address. */
export const emailChangeVerifyBody = z.strictObject({ newEmail: emailSchema, currentCode: otpCodeSchema, code: otpCodeSchema });
export const accountDeleteConfirmBody = z.strictObject({ code: otpCodeSchema });
/** The name can be changed, never removed. */
export const profilePatchBody = z.strictObject({ displayName: displayNameSchema });

export const meResponse = z.object({
  id: uuidSchema,
  email: z.string(),
  displayName: z.string().nullable(),
  createdAt: z.iso.datetime(),
  consentRequired: z.boolean(),
  consentVersion: z.string(),
  /** What this person last agreed to. Null means never, which is a different conversation from a re-prompt. */
  acceptedConsentVersion: z.string().nullable(),
  /** Optional details, all from fixed lists. Empty when none are set. */
  profile: profileSchema,
  /** Whether the one-time "About you" screen has been saved or skipped. */
  aboutSeen: z.boolean(),
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

export const signInMethodsResponse = z.object({ password: z.boolean(), google: z.boolean() });
export type SignInMethods = z.infer<typeof signInMethodsResponse>;

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
  /** Whether to offer Google sign-in at all. */
  googleEnabled: z.boolean(),
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
  'invalid_code', 'invalid_credentials', 'rate_limited', 'csrf_failed', 'conflict', 'internal_error', 'reauth_required',
] as const;
