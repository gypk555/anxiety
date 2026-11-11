import { allDrafts, clearDrafts, getDraft, setDraft, type Draft } from './drafts';
import {
  clearGuestData,
  loadCheckin,
  loadGuestResult,
  saveCheckin,
  saveGuestResult,
  type CheckinProgress,
  type GuestResult,
} from './guest';
import {
  loadRecentReflections,
  loadReflection,
  loadReflectionResult,
  saveRecentReflections,
  saveReflection,
  saveReflectionResult,
  type ReflectionProgress,
  type ReflectionResult,
} from './reflection-store';

/**
 * What someone was in the middle of when their session ended underneath them. Memory only, by design:
 * this is a module variable, so a reload ends it, and none of it ever touches browser storage. It stays
 * unreachable from any screen while signed out, and is tagged with its owner so that only that person gets it back.
 */
interface Held {
  userId: string;
  drafts: [string, Draft][];
  result: GuestResult | null;
  checkin: CheckinProgress | null;
  reflection: ReflectionProgress | null;
  reflectionResult: ReflectionResult | null;
  /** Question ids of the tab's last reflections, so the next one still asks different ones. */
  recentReflections: string[][];
}

let held: Held | null = null;

export const hasHeldWork = () => held !== null;
export const discardHeld = () => {
  held = null;
};

/** Moves the person's work out of every place the app reads from. */
export function holdWork(userId: string): void {
  held = {
    userId,
    drafts: allDrafts(),
    result: loadGuestResult(),
    checkin: loadCheckin(),
    reflection: loadReflection(),
    reflectionResult: loadReflectionResult(),
    recentReflections: loadRecentReflections(),
  };
  clearDrafts();
  clearGuestData();
}

/** Someone is signed in: the owner gets it back, without overwriting anything newer. Anyone else, and it is gone. */
export function settleHeld(userId: string): void {
  const work = held;
  held = null;
  if (work?.userId !== userId) return;
  for (const [key, draft] of work.drafts) {
    if (!getDraft(key)) setDraft(key, draft);
  }
  if (work.result && !loadGuestResult()) saveGuestResult(work.result);
  if (work.checkin && !loadCheckin()) saveCheckin(work.checkin);
  if (work.reflection && !loadReflection()) saveReflection(work.reflection);
  if (work.reflectionResult && !loadReflectionResult()) saveReflectionResult(work.reflectionResult);
  if (work.recentReflections.length && !loadRecentReflections().length) saveRecentReflections(work.recentReflections);
}
