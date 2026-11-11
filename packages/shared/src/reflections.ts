import { z } from 'zod';
import {
  REFLECTION_QUESTIONS,
  REFLECTION_THEMES,
  reflectionQuestion,
  themeInfo,
  type ReflectionQuestion,
  type ReflectionTheme,
} from './questions.ts';

/**
 * A Reflection: 5 questions from the bank, one per theme, different each time, never scored. Saved answers hold
 * question ids and numbers only, never question text. See docs/modules/reflections.md.
 */

export const REFLECTION_LENGTH = 5;
export const REFLECTION_NOTE_MAX = 280;
/** Questions from this many of the person's last reflections are left out of the next one. */
export const REFLECTION_RECENT_SESSIONS = 3;
/** A "Quite a bit" or more: what the summary counts as having come up, or as having helped. */
export const REFLECTION_NOTABLE = 2;

// ── Picking ───────────────────────────────────────────────────────────

/** A uniform integer in [0, max), from the platform's CSPRNG, without modulo bias. */
export function secureRandomInt(max: number): number {
  if (!Number.isInteger(max) || max < 1 || max > 2 ** 32) throw new RangeError('max out of range');
  const limit = 2 ** 32 - (2 ** 32 % max);
  const buffer = new Uint32Array(1);
  for (;;) {
    globalThis.crypto.getRandomValues(buffer);
    if (buffer[0]! < limit) return buffer[0]! % max;
  }
}

/**
 * One active question from each theme, in theme order, leaving out any asked recently. If a theme had nothing left
 * once recent ones were removed, it falls back to all of that theme's active questions rather than skip the theme.
 */
export function pickReflection(
  recentIds: Iterable<string> = [],
  randomInt: (max: number) => number = secureRandomInt,
  bank: readonly ReflectionQuestion[] = REFLECTION_QUESTIONS,
): ReflectionQuestion[] {
  const recent = new Set(recentIds);
  return REFLECTION_THEMES.map(({ id: theme }) => {
    const active = bank.filter((q) => q.theme === theme && q.active);
    const fresh = active.filter((q) => !recent.has(q.id));
    const pool = fresh.length > 0 ? fresh : active;
    if (pool.length === 0) throw new Error(`no active reflection questions for ${theme}`);
    return pool[randomInt(pool.length)]!;
  });
}

// ── Contract ──────────────────────────────────────────────────────────

const reflectionId = z.string().regex(/^REF-\d{3}$/, 'must be a reflection question id');
const reflectionValue = z.number().int().min(0).max(3);

export const reflectionAnswer = z.strictObject({ q: reflectionId, a: reflectionValue });
export type ReflectionAnswer = z.infer<typeof reflectionAnswer>;

const answerList = z
  .array(reflectionAnswer)
  .length(REFLECTION_LENGTH)
  .refine((answers) => new Set(answers.map((x) => x.q)).size === answers.length, { message: 'must be different questions' });

export const reflectionCreateBody = z.strictObject({
  /** Client-generated; replaying the same id returns the original row. */
  clientRequestId: z.uuid(),
  answers: answerList,
  note: z.string().trim().max(REFLECTION_NOTE_MAX).optional(),
  /** Set when a reflection made before sign-in is being saved. Max 24h old, not in the future. */
  takenAt: z.iso.datetime().optional(),
});
export type ReflectionCreate = z.infer<typeof reflectionCreateBody>;

export const reflectionResponse = z.object({
  id: z.uuid(),
  takenAt: z.iso.datetime(),
  answers: z.array(reflectionAnswer),
  note: z.string().optional(),
});
export type Reflection = z.infer<typeof reflectionResponse>;

// ── Summary ───────────────────────────────────────────────────────────

export interface ReflectionSummary {
  /** Strain themes answered "Quite a bit" or more, in theme order. */
  strainThemes: ReflectionTheme[];
  /** Support themes answered "Quite a bit" or more: what helped. */
  supportThemes: ReflectionTheme[];
  /** A question marked brings_help was answered "Quite a bit" or more. */
  bringsHelp: boolean;
  /** Plain sentences for the result. No number, no severity word. */
  lines: string[];
}

const listOf = (words: string[]) => (words.length <= 1 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`);
const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Reads each answer the right way round: high on a support question is good, and is never counted as strain. */
export function summarizeReflection(answers: readonly ReflectionAnswer[]): ReflectionSummary {
  const strain = new Set<ReflectionTheme>();
  const support = new Set<ReflectionTheme>();
  let bringsHelp = false;
  for (const { q, a } of answers) {
    const question = reflectionQuestion(q);
    if (!question || a < REFLECTION_NOTABLE) continue;
    (question.polarity === 'strain' ? strain : support).add(question.theme);
    if (question.bringsHelp) bringsHelp = true;
  }
  const inOrder = (set: Set<ReflectionTheme>) => REFLECTION_THEMES.map((t) => t.id).filter((id) => set.has(id));
  const strainThemes = inOrder(strain);
  const supportThemes = inOrder(support);
  const lines: string[] = [];
  if (strainThemes.length) lines.push(`${sentence(listOf(strainThemes.map((t) => themeInfo(t).phrase)))} came up today.`);
  if (supportThemes.length) lines.push(`${sentence(listOf(supportThemes.map((t) => themeInfo(t).phrase)))} helped.`);
  if (lines.length === 0) lines.push('Nothing stood out strongly today.');
  return { strainThemes, supportThemes, bringsHelp, lines };
}
