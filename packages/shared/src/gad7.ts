/**
 * GAD-7 (Spitzer, Kroenke, Williams, Löwe. Arch Intern Med. 2006;166(10):1092-1097).
 * Item and option wording is the published instrument. Do not reword it: edits
 * invalidate the screening properties. Reproduction needs no permission.
 */
export const GAD7_ATTRIBUTION =
  'GAD-7 developed by Drs. Robert L. Spitzer, Janet B.W. Williams, Kurt Kroenke and colleagues, with an educational grant from Pfizer Inc. No permission required to reproduce.';

export const GAD7_STEM = 'Over the last 2 weeks, how often have you been bothered by the following problem?';

export const GAD7_ITEMS = [
  'Feeling nervous, anxious or on edge',
  'Not being able to stop or control worrying',
  'Worrying too much about different things',
  'Trouble relaxing',
  'Being so restless that it is hard to sit still',
  'Becoming easily annoyed or irritable',
  'Feeling afraid as if something awful might happen',
] as const;

export const GAD7_OPTIONS = [
  { value: 0, label: 'Not at all' },
  { value: 1, label: 'Several days' },
  { value: 2, label: 'More than half the days' },
  { value: 3, label: 'Nearly every day' },
] as const;

export const DIFFICULTY_STEM =
  'How difficult have these problems made it for you to do your work, take care of things at home, or get along with other people?';

export const DIFFICULTY_OPTIONS = [
  { value: 0, label: 'Not difficult at all' },
  { value: 1, label: 'Somewhat difficult' },
  { value: 2, label: 'Very difficult' },
  { value: 3, label: 'Extremely difficult' },
] as const;

export const GAD7_MAX_SCORE = 21;
export const GAD7_RETAKE_INTERVAL_DAYS = 14;
/** Published screening cut point: 10 or above warrants further evaluation. */
export const GAD7_REFERRAL_CUTOFF = 10;

export type Severity = 'minimal' | 'mild' | 'moderate' | 'severe';

export interface SeverityBand {
  severity: Severity;
  label: string;
  min: number;
  max: number;
  /** Plain-language, non-diagnostic meaning. */
  meaning: string;
  recommendProfessional: boolean;
}

export const SEVERITY_BANDS: readonly SeverityBand[] = [
  {
    severity: 'minimal',
    label: 'Minimal',
    min: 0,
    max: 4,
    meaning: 'Your answers suggest few anxiety symptoms over the last two weeks.',
    recommendProfessional: false,
  },
  {
    severity: 'mild',
    label: 'Mild',
    min: 5,
    max: 9,
    meaning: 'Your answers suggest some anxiety symptoms. Many people notice this during stressful periods.',
    recommendProfessional: false,
  },
  {
    severity: 'moderate',
    label: 'Moderate',
    min: 10,
    max: 14,
    meaning: 'Your answers suggest anxiety symptoms that may be affecting daily life. Talking to a professional is a good next step.',
    recommendProfessional: true,
  },
  {
    severity: 'severe',
    label: 'Severe',
    min: 15,
    max: 21,
    meaning: 'Your answers suggest a high level of anxiety symptoms. Please consider speaking with a doctor or mental health professional soon.',
    recommendProfessional: true,
  },
];

export function scoreGad7(answers: readonly number[]): number {
  if (answers.length !== GAD7_ITEMS.length) {
    throw new RangeError(`GAD-7 needs ${GAD7_ITEMS.length} answers, got ${answers.length}`);
  }
  return answers.reduce((total, answer) => {
    if (!Number.isInteger(answer) || answer < 0 || answer > 3) {
      throw new RangeError(`Invalid GAD-7 answer: ${answer}`);
    }
    return total + answer;
  }, 0);
}

export function severityFor(score: number): SeverityBand {
  const band = SEVERITY_BANDS.find((b) => score >= b.min && score <= b.max);
  if (!band) throw new RangeError(`GAD-7 score out of range: ${score}`);
  return band;
}
