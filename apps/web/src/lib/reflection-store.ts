import { z } from 'zod';
import { newRequestId, readSession, removeSession, writeSession } from './session-store';

/**
 * A Reflection in progress, its result before it is saved, and which questions this tab's last few reflections
 * asked. Question ids and numbers go in sessionStorage, like the guest check-in; the wording comes from the shared
 * catalogue. The free-text note is held in memory only, like drafts.ts: a browser restores sessionStorage with a
 * reopened tab, and a note is the person's own words. A reload loses it, by design. Kept free of the catalogue
 * itself, because Home reads this from the first bundle.
 */
const PROGRESS_KEY = 'anxiocare.reflection.v1';
const RESULT_KEY = 'anxiocare.reflection-result.v1';
const RECENT_KEY = 'anxiocare.reflection-recent.v1';

/** Mirrors REFLECTION_LENGTH, REFLECTION_NOTE_MAX and REFLECTION_RECENT_SESSIONS in shared, which a test checks. */
export const STEPS = 5;
const NOTE_MAX = 280;
const RECENT_SESSIONS = 3;

const questionId = z.string().regex(/^REF-\d{3}$/);
const value = z.number().int().min(0).max(3);

const storedProgress = z.object({
  clientRequestId: z.uuid(),
  questionIds: z.array(questionId).length(STEPS),
  answers: z.array(value.nullable()).length(STEPS),
});
export type ReflectionProgress = z.infer<typeof storedProgress> & { note: string };

const storedResult = z.object({
  clientRequestId: z.uuid(),
  answers: z.array(z.object({ q: questionId, a: value })).length(STEPS),
  takenAt: z.iso.datetime(),
});
export type ReflectionResult = z.infer<typeof storedResult> & { note?: string };

/** Notes by clientRequestId. Module memory: never in any browser storage. */
const notes = new Map<string, string>();
const keepNote = (id: string, note: string | undefined) => {
  const text = (note ?? '').slice(0, NOTE_MAX);
  if (text) notes.set(id, text);
  else notes.delete(id);
};

const recentSchema = z.array(z.array(questionId).max(STEPS)).max(RECENT_SESSIONS);

export function loadReflection(): ReflectionProgress | null {
  const stored = readSession(PROGRESS_KEY, storedProgress);
  return stored ? { ...stored, note: notes.get(stored.clientRequestId) ?? '' } : null;
}
export function saveReflection({ note, ...stored }: ReflectionProgress): void {
  keepNote(stored.clientRequestId, note);
  writeSession(PROGRESS_KEY, stored);
}
export function clearReflection(): void {
  const stored = readSession(PROGRESS_KEY, storedProgress);
  // The finished result carries the same id and may still need the note.
  if (stored && readSession(RESULT_KEY, storedResult)?.clientRequestId !== stored.clientRequestId) notes.delete(stored.clientRequestId);
  removeSession(PROGRESS_KEY);
}

export function loadReflectionResult(): ReflectionResult | null {
  const stored = readSession(RESULT_KEY, storedResult);
  if (!stored) return null;
  const note = notes.get(stored.clientRequestId);
  return note ? { ...stored, note } : stored;
}
export function saveReflectionResult({ note, ...stored }: ReflectionResult): void {
  keepNote(stored.clientRequestId, note);
  writeSession(RESULT_KEY, stored);
}
export function clearReflectionResult(): void {
  const stored = readSession(RESULT_KEY, storedResult);
  if (stored) notes.delete(stored.clientRequestId);
  removeSession(RESULT_KEY);
}

/** The question ids of this tab's last few reflections, newest first. */
export const loadRecentReflections = () => readSession(RECENT_KEY, recentSchema) ?? [];
export const saveRecentReflections = (recent: string[][]) => writeSession(RECENT_KEY, recent.slice(0, RECENT_SESSIONS));
export function rememberReflection(questionIds: readonly string[]): void {
  writeSession(RECENT_KEY, [[...questionIds], ...loadRecentReflections()].slice(0, RECENT_SESSIONS));
}

export function clearReflectionData(): void {
  removeSession(PROGRESS_KEY);
  removeSession(RESULT_KEY);
  removeSession(RECENT_KEY);
  notes.clear();
}

export function startReflection(questionIds: readonly string[]): ReflectionProgress {
  const progress: ReflectionProgress = {
    clientRequestId: newRequestId(),
    questionIds: [...questionIds],
    answers: questionIds.map(() => null),
    note: '',
  };
  saveReflection(progress);
  return progress;
}

/** Index of the first unanswered question, or STEPS when all are answered. */
export function nextUnansweredReflection(progress: ReflectionProgress): number {
  const i = progress.answers.findIndex((a) => a === null);
  return i === -1 ? STEPS : i;
}

/** A finished reflection, or null if a question is still unanswered. The note is kept only if there is one. */
export function completeReflection(progress: ReflectionProgress, now = new Date()): ReflectionResult | null {
  if (progress.answers.some((a) => a === null)) return null;
  const note = progress.note.trim();
  return {
    clientRequestId: progress.clientRequestId,
    answers: progress.questionIds.map((q, i) => ({ q, a: progress.answers[i]! })),
    ...(note ? { note } : {}),
    takenAt: now.toISOString(),
  };
}
