import { GAD7_REFERRAL_CUTOFF, severityFor, type Severity } from '@anxiocare/shared';
import type { Suggestion } from './suggestions';

/**
 * Words for a GAD-7 result: an encouraging message for each range, things that often help, and a calm note on how
 * the score compares with the person's own previous check-in.
 *
 * Rules (docs/CLINICAL-SAFETY.md): no diagnosis, no promise of recovery, no "you're fine" (the GAD-7 doesn't ask
 * about low mood or self-harm), no praise or celebration for a lower score, no blame for a higher one, never a
 * comparison with anyone else. Tips link only to tools that work for guests too. Clinician review covers this copy.
 */
export interface ResultGuidance {
  title: string;
  message: string;
  tips: Suggestion[];
}

const BREATHE: Suggestion = {
  id: 'breathe',
  to: '/tools/breathe',
  title: 'Slow your breathing',
  text: 'Breathing out slowly for a few minutes helps your body settle.',
};
const GROUND: Suggestion = {
  id: 'ground',
  to: '/tools/ground',
  title: 'Come back to the present',
  text: 'When worries race, name what you can see, hear and touch around you.',
};
const SOUNDS: Suggestion = {
  id: 'sounds',
  to: '/tools/sounds',
  title: 'Wind down with calm sounds',
  text: 'Rain or waves can make it easier to rest at the end of the day.',
};
const ROUTINE: Suggestion = {
  id: 'routine',
  title: 'Look after the basics',
  text: 'Sleeping and waking at similar times, regular meals and a short walk each day all ease stress.',
};
const TALK: Suggestion = {
  id: 'talk',
  title: 'Talk to someone you trust',
  text: "Telling a friend or family member what's on your mind can make it feel lighter.",
};
const SMALL_STEPS: Suggestion = {
  id: 'small-steps',
  title: 'One small step at a time',
  text: "Pick one small thing you can do today, rather than waiting until you feel ready.",
};
const SAFETY_PLAN: Suggestion = {
  id: 'safety-plan',
  to: '/safety-plan',
  title: 'Make a plan for hard moments',
  text: 'Write down what helps and who you can call, so it is ready when you need it.',
};

export const RESULT_GUIDANCE: Record<Severity, ResultGuidance> = {
  minimal: {
    title: "Anxiety isn't getting in your way much right now",
    message:
      "That's good to know. Notice what is keeping you steady, such as rest, people you trust or time for yourself, and keep making room for it. Everyone has harder days, so come back whenever you need to.",
    tips: [
      ROUTINE,
      { ...BREATHE, title: 'Learn a calming skill now', text: 'Practising slow breathing on a calm day makes it easier to use on a hard one.' },
    ],
  },
  mild: {
    title: "Some anxiety is showing up, and that's common",
    message:
      'Many people feel this way during busy or stressful times, like exams, work pressure or changes at home. Small, regular steps often make a real difference, and checking in was one of them.',
    tips: [BREATHE, GROUND, ROUTINE, TALK],
  },
  moderate: {
    title: 'Anxiety seems to be affecting your daily life',
    message:
      "That can be tiring, and it isn't a sign of weakness. This is a good time to talk to a doctor or counsellor. Anxiety like this often gets better with the right support, and reaching out early makes it easier.",
    tips: [GROUND, BREATHE, SMALL_STEPS, TALK],
  },
  severe: {
    title: "You're carrying a lot right now",
    message:
      "Your answers suggest anxiety is having a big effect on you. Please speak to a doctor or mental health professional soon, ideally this week. You don't have to wait until things get worse to ask for help. Anxiety like this can get better with support.",
    tips: [BREATHE, SAFETY_PLAN, TALK, SOUNDS],
  },
};

export function guidanceFor(score: number): ResultGuidance {
  return RESULT_GUIDANCE[severityFor(score).severity];
}

/**
 * The smallest change worth calling a change: 4 points, the minimal clinically important difference reported for the
 * GAD-7 (Toussaint et al., J Affect Disord 2020;265:395-401). Smaller moves are ordinary ups and downs.
 * Reviewer: confirm this threshold.
 */
export const MEANINGFUL_CHANGE = 4;

export interface Previous {
  score: number;
  takenAt: string;
}

export type Change =
  | { kind: 'lower'; title: string; message: string; note?: string }
  | { kind: 'higher'; title: string; message: string; note?: string }
  | { kind: 'same'; title: string; message: string };

/** How this score compares with the person's own previous check-in. `date` is the previous one, already formatted. */
export function compareWithPrevious(score: number, previous: Previous, date: string): Change {
  const diff = score - previous.score;
  const from = `${previous.score} on ${date}`;
  if (diff <= -MEANINGFUL_CHANGE) {
    return {
      kind: 'lower',
      title: 'Lower than last time',
      message: `Your score has come down from ${from} to ${score} now. That's a real change. Think about what may have helped, such as support, rest or something you tried, and keep it going.`,
      ...(score >= GAD7_REFERRAL_CUTOFF && {
        note: 'Anxiety is still affecting you, so talking to a doctor or counsellor is still a good next step.',
      }),
    };
  }
  if (diff >= MEANINGFUL_CHANGE) {
    const crossed = score >= GAD7_REFERRAL_CUTOFF && previous.score < GAD7_REFERRAL_CUTOFF;
    return {
      kind: 'higher',
      title: 'Higher than last time',
      message: `Your score has gone up from ${from} to ${score} now. That isn't a failure. It usually means things have been harder lately, perhaps more pressure, less sleep or something difficult happening. Be kind to yourself, and try the steps below.`,
      ...(crossed
        ? { note: 'It has now reached the point where talking to a doctor or counsellor is a good next step.' }
        : score >= GAD7_REFERRAL_CUTOFF && { note: "Please don't wait to talk to a doctor or counsellor about how you're feeling." }),
    };
  }
  return {
    kind: 'same',
    title: 'About the same as last time',
    message: `Your score was ${from}, and it's ${score} now. Small changes like this are usually ordinary ups and downs.`,
  };
}
