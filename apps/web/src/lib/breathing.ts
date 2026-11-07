export type PhaseKind = 'in' | 'hold' | 'out' | 'rest';

export interface Phase {
  kind: PhaseKind;
  seconds: number;
}

export interface BreathPattern {
  id: string;
  name: string;
  summary: string;
  phases: readonly Phase[];
}

export const BREATH_PATTERNS: readonly BreathPattern[] = [
  {
    id: 'slow',
    name: 'Slow exhale',
    summary: 'In for 4, out for 6',
    phases: [
      { kind: 'in', seconds: 4 },
      { kind: 'out', seconds: 6 },
    ],
  },
  {
    id: 'box',
    name: 'Box',
    summary: 'In, hold, out, hold, for 4 each',
    phases: [
      { kind: 'in', seconds: 4 },
      { kind: 'hold', seconds: 4 },
      { kind: 'out', seconds: 4 },
      { kind: 'rest', seconds: 4 },
    ],
  },
  {
    id: '478',
    name: '4-7-8',
    summary: 'In for 4, hold for 7, out for 8',
    phases: [
      { kind: 'in', seconds: 4 },
      { kind: 'hold', seconds: 7 },
      { kind: 'out', seconds: 8 },
    ],
  },
];

export const PHASE_WORD: Record<PhaseKind, string> = {
  in: 'Breathe in',
  hold: 'Hold',
  out: 'Breathe out',
  rest: 'Hold',
};

export const cycleSeconds = (pattern: BreathPattern) => pattern.phases.reduce((t, p) => t + p.seconds, 0);

/** Where we are at a given elapsed time. Pure, so drift and throttled timers can't desync the words from the rings. */
export function phaseAt(pattern: BreathPattern, elapsedMs: number) {
  const cycleMs = cycleSeconds(pattern) * 1000;
  const cycle = Math.floor(elapsedMs / cycleMs);
  let t = elapsedMs - cycle * cycleMs;
  for (let index = 0; index < pattern.phases.length; index++) {
    const phase = pattern.phases[index]!;
    const ms = phase.seconds * 1000;
    if (t < ms) {
      return { index, cycle, phase, secondsLeft: Math.ceil((ms - t) / 1000) };
    }
    t -= ms;
  }
  const first = pattern.phases[0]!;
  return { index: 0, cycle: cycle + 1, phase: first, secondsLeft: first.seconds };
}

/** Number of whole cycles that best fills the chosen length, so a session ends after a full exhale. */
export const cyclesForMinutes = (pattern: BreathPattern, minutes: number) =>
  Math.max(1, Math.round((minutes * 60) / cycleSeconds(pattern)));

/** After a breath in, the lungs stay full through "hold"; after a breath out they stay empty through "rest". */
export const isExpanded = (kind: PhaseKind) => kind === 'in' || kind === 'hold';
