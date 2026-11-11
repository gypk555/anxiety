import { useEffect, useRef } from 'react';

/** How the question screens behave: the check-in and a reflection share it. */

const ADVANCE_MS = 260;

/** Each option stays a Tab stop, because they're buttons. Arrow keys are a shorter way round the same list. */
export function moveByArrow(e: React.KeyboardEvent<HTMLDivElement>) {
  const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
  if (!step) return;
  const options = [...e.currentTarget.querySelectorAll('button')];
  const index = options.indexOf(document.activeElement as HTMLButtonElement);
  if (index < 0) return;
  e.preventDefault();
  options[(index + step + options.length) % options.length]!.focus();
}

export function useAdvance() {
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (fn: () => void) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(fn, ADVANCE_MS);
  };
}
