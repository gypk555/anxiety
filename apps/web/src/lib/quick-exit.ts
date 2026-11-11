import type { QueryClient } from '@tanstack/react-query';
import { clearDrafts } from './drafts';
import { clearGuestData } from './guest';
import { discardHeld } from './held';
import { queryClient } from './queries';

/**
 * For someone who must hide the app at once. Synchronous from start to end: nothing here waits on the network, a
 * modal, the service worker or a promise, and sign-out is deliberately not attempted. It can't remove earlier history
 * entries; Help says so in "About quick exit". See docs/modules/quick-exit.md.
 */
export const QUICK_EXIT_URL = 'https://www.google.com/search?q=weather+today';
const ESCAPES = 3;
const WINDOW_MS = 1500;

let exiting = false;
/** Read by beforeunload handlers, so no "Leave site?" prompt can hold the page on screen. */
export const isExiting = () => exiting;
export const resetQuickExitForTests = () => {
  exiting = false;
};

const extraCleanups = new Set<() => void>();
/** Something else to drop on exit, such as the React root. Must be synchronous and must not throw. */
export const onQuickExit = (fn: () => void) => {
  extraCleanups.add(fn);
  return () => void extraCleanups.delete(fn);
};

const attempt = (fn: () => void) => {
  try {
    fn();
  } catch {
    /* Keep going: every later step still has to run. */
  }
};

export function quickExit({ go = (url: string) => window.location.replace(url), client = queryClient }: { go?: (url: string) => void; client?: QueryClient } = {}): void {
  exiting = true;
  // 1. Before anything else: the current entry becomes a neutral page, so Back doesn't land on this one.
  attempt(() => go(QUICK_EXIT_URL));
  // 2. Gone from the screen at once, even while the new page loads or if it can't load at all.
  attempt(() => {
    const root = document.getElementById('root');
    if (root) root.hidden = true;
    for (const dialog of document.querySelectorAll('dialog[open]')) (dialog as HTMLDialogElement).close();
  });
  // 3. In-memory state, and any form text the browser could restore.
  attempt(() => client.clear());
  attempt(clearDrafts);
  attempt(discardHeld);
  attempt(clearGuestData);
  attempt(() => {
    for (const field of document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea')) {
      if (field instanceof HTMLInputElement && ['checkbox', 'radio', 'button', 'submit', 'reset', 'hidden'].includes(field.type)) continue;
      field.value = '';
    }
  });
  for (const fn of extraCleanups) attempt(fn);
}

const NOT_TYPING = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'image']);

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLInputElement) return !NOT_TYPING.has(target.type);
  return target.isContentEditable;
}

/** Escape three times within 1.5 seconds, unless the person is typing in a field. Any other key starts the count again. */
export function escapeExitListener(exit: () => void = () => quickExit(), now: () => number = () => performance.now()) {
  let presses: number[] = [];
  return (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || event.isComposing || isTyping(event.target)) {
      presses = [];
      return;
    }
    const t = now();
    presses = [...presses.filter((p) => t - p <= WINDOW_MS), t].slice(-ESCAPES);
    if (presses.length === ESCAPES) {
      presses = [];
      exit();
    }
  };
}

/** Listens on the window in the capture phase, so an open dialog's own Escape handling can't swallow the presses. */
export function installEscapeExit(exit: () => void = () => quickExit()): () => void {
  const listener = escapeExitListener(exit);
  window.addEventListener('keydown', listener, { capture: true });
  return () => window.removeEventListener('keydown', listener, { capture: true });
}
