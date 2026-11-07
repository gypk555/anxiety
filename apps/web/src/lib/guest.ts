import { GAD7_ITEMS, assessmentCreateBody, gad7Answer } from '@anxiocare/shared';
import { z } from 'zod';

/**
 * Guest check-in state. sessionStorage only: gone when the tab closes, and never
 * sent anywhere until the person signs in and chooses to save.
 */
const CHECKIN_KEY = 'anxiocare.checkin.v1';
const RESULT_KEY = 'anxiocare.result.v1';

const checkinSchema = z.object({
  clientRequestId: z.uuid(),
  answers: z.array(gad7Answer.nullable()).length(GAD7_ITEMS.length),
  difficulty: gad7Answer.nullable(),
});
export type CheckinProgress = z.infer<typeof checkinSchema>;

const guestResultSchema = z.object({
  clientRequestId: z.uuid(),
  answers: z.array(gad7Answer).length(GAD7_ITEMS.length),
  difficulty: gad7Answer.nullable(),
  takenAt: z.iso.datetime(),
});
export type GuestResult = z.infer<typeof guestResultSchema>;

function read<T>(key: string, schema: z.ZodType<T>): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Storage blocked: the check-in still works until the page is reloaded. */
  }
}

function remove(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* nothing stored */
  }
}

export function newRequestId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // Older WebViews: same format from the same CSPRNG.
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const loadCheckin = () => read(CHECKIN_KEY, checkinSchema);
export const saveCheckin = (progress: CheckinProgress) => write(CHECKIN_KEY, progress);
export const clearCheckin = () => remove(CHECKIN_KEY);

export function startCheckin(): CheckinProgress {
  const progress: CheckinProgress = {
    clientRequestId: newRequestId(),
    answers: GAD7_ITEMS.map(() => null),
    difficulty: null,
  };
  saveCheckin(progress);
  return progress;
}

/** Index of the first unanswered item, or the item count when all are answered. */
export function nextUnanswered(progress: CheckinProgress): number {
  const i = progress.answers.findIndex((a) => a === null);
  return i === -1 ? GAD7_ITEMS.length : i;
}

/** The final difficulty item is only asked when some symptom was reported. */
export const needsDifficulty = (answers: readonly (number | null)[]) => answers.some((a) => a !== null && a > 0);

/** Turns a finished check-in into a result, or null if it isn't finished. */
export function completeCheckin(progress: CheckinProgress, now = new Date()): GuestResult | null {
  const answers = progress.answers;
  if (answers.some((a) => a === null)) return null;
  if (needsDifficulty(answers) && progress.difficulty === null) return null;
  return {
    clientRequestId: progress.clientRequestId,
    answers: answers as number[],
    difficulty: needsDifficulty(answers) ? progress.difficulty : null,
    takenAt: now.toISOString(),
  };
}

export const loadGuestResult = () => read(RESULT_KEY, guestResultSchema);
export const saveGuestResult = (result: GuestResult) => write(RESULT_KEY, result);
export const clearGuestResult = () => remove(RESULT_KEY);

export function clearGuestData(): void {
  clearCheckin();
  clearGuestResult();
}

/** Body for saving a guest result. The server accepts results up to 24 hours old. */
export function guestResultBody(result: GuestResult) {
  return assessmentCreateBody.parse({
    clientRequestId: result.clientRequestId,
    answers: result.answers,
    difficulty: result.difficulty,
    takenAt: result.takenAt,
  });
}
