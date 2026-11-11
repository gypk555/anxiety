import { z } from 'zod';

/**
 * The daily mood log and the personal safety plan. Both are a person's own words about hard times, so both are sealed
 * on the server like the journal. See docs/modules/mood-log.md and docs/modules/safety-plan.md.
 */

// ── Days ──────────────────────────────────────────────────────────────

/** A calendar day as the person's own phone sees it, `YYYY-MM-DD`. Only real dates. */
export const dayParam = z.iso.date();

const DAY_MS = 86_400_000;
const toUtcMidnight = (day: string) => Date.parse(`${day}T00:00:00Z`);
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Calendar arithmetic on a `YYYY-MM-DD` string, in UTC so that no time zone can shift it. */
export const addDays = (day: string, days: number) => fromUtc(toUtcMidnight(day) + days * DAY_MS);
/** Whole days from `from` to `to`. */
export const daysBetween = (from: string, to: string) => Math.round((toUtcMidnight(to) - toUtcMidnight(from)) / DAY_MS);

// ── Daily mood log ────────────────────────────────────────────────────

/** Words first: the scale never relies on faces or colours alone. */
export const MOOD_LEVELS = [
  { value: 1, label: 'Very low' },
  { value: 2, label: 'Low' },
  { value: 3, label: 'Okay' },
  { value: 4, label: 'Good' },
  { value: 5, label: 'Very good' },
] as const;
export type MoodRating = (typeof MOOD_LEVELS)[number]['value'];
export const moodLabel = (rating: number) => MOOD_LEVELS.find((l) => l.value === rating)?.label ?? '';

export const MOOD_NOTE_MAX = 280;
/** How far back a day can be logged or changed. */
export const MOOD_MAX_DAYS_BACK = 366;
/** The widest range one GET may ask for. */
export const MOOD_RANGE_MAX_DAYS = 400;

export const moodBody = z.strictObject({
  rating: z.number().int().min(1).max(5),
  note: z.string().trim().max(MOOD_NOTE_MAX),
});
export type MoodInput = z.infer<typeof moodBody>;

export const moodResponse = moodBody.extend({
  day: dayParam,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type MoodEntry = z.infer<typeof moodResponse>;
export const moodList = z.object({ items: z.array(moodResponse) });

export const moodRangeQuery = z
  .strictObject({ from: dayParam, to: dayParam })
  .refine((q) => q.to >= q.from, { path: ['to'], message: 'must be on or after from' })
  .refine((q) => daysBetween(q.from, q.to) <= MOOD_RANGE_MAX_DAYS, { path: ['from'], message: `spans more than ${MOOD_RANGE_MAX_DAYS} days` });

/**
 * The server can't know the person's time zone, so it allows the widest honest window: no later than today in the
 * earliest zone (UTC+14), and no more than 366 days before today in the latest zone (UTC-12). The phone applies the
 * exact rule in its own zone.
 */
export function moodDayAllowedOnServer(day: string, now: Date = new Date()): boolean {
  const latest = fromUtc(now.getTime() + 14 * 3_600_000);
  const earliest = addDays(fromUtc(now.getTime() - 12 * 3_600_000), -MOOD_MAX_DAYS_BACK);
  return day >= earliest && day <= latest;
}

// ── Personal safety plan (after the Stanley-Brown safety plan) ────────

export const SAFETY_PLAN_MAX_ITEMS = 10;
export const SAFETY_PLAN_ITEM_MAX = 200;
export const CONTACT_NAME_MAX = 80;
export const CONTACT_PHONE_MAX = 20;

const planItem = z.string().trim().min(1).max(SAFETY_PLAN_ITEM_MAX);
const planList = z.array(planItem).max(SAFETY_PLAN_MAX_ITEMS);

/** Someone else's number is their personal data: sealed with the plan, never logged. Empty means no call button. */
export const planContact = z.strictObject({
  name: z.string().trim().min(1).max(CONTACT_NAME_MAX),
  phone: z
    .string()
    .trim()
    .max(CONTACT_PHONE_MAX)
    .regex(/^[0-9 +()-]*$/, 'use digits, spaces, + ( ) and - only')
    .refine((p) => p === '' || /\d/.test(p), 'needs at least one digit'),
});
export type PlanContact = z.infer<typeof planContact>;
const contactList = z.array(planContact).max(SAFETY_PLAN_MAX_ITEMS);

export const safetyPlanBody = z.strictObject({
  warningSigns: planList,
  copingStrategies: planList,
  distractions: planList,
  helpContacts: contactList,
  professionals: contactList,
  saferSurroundings: planList,
  reasonsToLive: planList,
});
export type SafetyPlan = z.infer<typeof safetyPlanBody>;
export const safetyPlanResponse = safetyPlanBody.extend({ updatedAt: z.iso.datetime() });
export type SafetyPlanSaved = z.infer<typeof safetyPlanResponse>;

export type PlanListKey = 'warningSigns' | 'copingStrategies' | 'distractions' | 'saferSurroundings' | 'reasonsToLive';
export type PlanContactKey = 'helpContacts' | 'professionals';

export interface PlanSection {
  key: PlanListKey | PlanContactKey;
  kind: 'list' | 'contacts';
  /** The heading, in the person's own voice. */
  title: string;
  /** A gentle question under the heading. */
  prompt: string;
  /** Shown as a hint, never saved as a value. */
  example: string;
}

/**
 * Wording needs clinician review before launch: docs/CLINICAL-SAFETY.md#safety-plan-wording. Gentle, optional, and
 * nothing here is ever filled in for the person except the helplines, which come from HELPLINES.
 */
export const SAFETY_PLAN_SECTIONS: readonly PlanSection[] = [
  {
    key: 'warningSigns',
    kind: 'list',
    title: 'Warning signs that a hard time may be starting',
    prompt: 'Thoughts, feelings or things you do that tell you it is getting harder.',
    example: 'Not sleeping, staying in my room all day',
  },
  {
    key: 'copingStrategies',
    kind: 'list',
    title: 'Things I can do on my own to calm down',
    prompt: 'Small things that have helped before, even a little.',
    example: 'Slow breathing, a cold glass of water, a short walk',
  },
  {
    key: 'distractions',
    kind: 'list',
    title: 'People and places that help me take my mind off things',
    prompt: 'Somewhere to go, or someone to be with, without having to talk about it.',
    example: 'Chai with a friend, the park near home',
  },
  {
    key: 'helpContacts',
    kind: 'contacts',
    title: 'People I can ask for help',
    prompt: 'People you trust to call when it gets hard.',
    example: 'My sister, a friend from college',
  },
  {
    key: 'professionals',
    kind: 'contacts',
    title: 'Professionals and helplines',
    prompt: 'Your own doctor or therapist, if you have one. The helplines below are always here.',
    example: 'My doctor at the clinic',
  },
  {
    key: 'saferSurroundings',
    kind: 'list',
    title: 'Making my surroundings safer',
    prompt: 'Ways to put distance between you and anything you could use to hurt yourself.',
    example: 'Ask someone I trust to keep my medicines for now',
  },
  {
    key: 'reasonsToLive',
    kind: 'list',
    title: 'What matters most to me, and reasons to keep going',
    prompt: 'People, hopes, or things you love.',
    example: 'My family, my dog, seeing the monsoon again',
  },
];

export const emptySafetyPlan = (): SafetyPlan => ({
  warningSigns: [],
  copingStrategies: [],
  distractions: [],
  helpContacts: [],
  professionals: [],
  saferSurroundings: [],
  reasonsToLive: [],
});

export const isPlanEmpty = (plan: SafetyPlan) => SAFETY_PLAN_SECTIONS.every((s) => plan[s.key].length === 0);
