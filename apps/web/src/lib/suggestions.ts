import type { StressFactorId } from '@anxiocare/shared';

export interface Suggestion {
  id: string;
  title: string;
  text: string;
  /** Absent for a note that isn't a tool. */
  to?: string;
}

/**
 * Existing tools that fit what the person said tends to stress them. Fixed, plain suggestions only: no scoring,
 * no comparison with anyone, nothing inferred. Clinician review covers this wording (docs/LAUNCH-CHECKLIST.md).
 */
const BY_FACTOR: { when: readonly StressFactorId[]; items: Suggestion[] }[] = [
  {
    when: ['sleep'],
    items: [
      { id: 'breathe', to: '/tools/breathe', title: 'Slow-exhale breathing', text: 'A longer breath out can help your body slow down before sleep.' },
      { id: 'sounds', to: '/tools/sounds', title: 'Calming sounds', text: 'Steady rain or waves, made on your phone, to wind down to.' },
    ],
  },
  {
    when: ['work', 'studies', 'money'],
    items: [
      { id: 'journal', to: '/journal/new', title: 'A thought record', text: 'Write down a worrying thought, and look at it from another side.' },
      { id: 'ground', to: '/tools/ground', title: 'Grounding', text: 'Notice what you can see, hear and touch, and come back to the room you are in.' },
    ],
  },
  {
    when: ['screens'],
    items: [{ id: 'break', title: 'A short break from screens', text: 'A break of a few minutes, with the phone down or the news off, can give your mind a rest.' }],
  },
];

export function suggestionsFor(factors: readonly StressFactorId[] | undefined): Suggestion[] {
  if (!factors?.length) return [];
  return BY_FACTOR.filter((group) => group.when.some((f) => factors.includes(f))).flatMap((group) => group.items);
}
