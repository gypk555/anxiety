import { GAD7_ITEMS } from './gad7.ts';

/**
 * Every question the app asks, in one catalogue: the GAD-7 and the reflection bank, told apart by type. This file is
 * the single source of truth. Migration 005 seeds `app.questions` with exactly this data, a test checks that they
 * match, and the server refuses to start if the live table differs. See docs/modules/reflections.md.
 *
 * Released wording never changes, because saved answers point here by id and must keep their meaning. To reword a
 * question, add a new id and set the old one `active: false`, in this file and in a new migration, together.
 * Every reflection needs clinician review before launch: docs/CLINICAL-SAFETY.md#reflection-questions.
 */

export type QuestionType = 'gad7' | 'reflection';
/** What each type is called on screen. */
export const QUESTION_TYPES: Readonly<Record<QuestionType, string>> = {
  gad7: 'Anxiety check (GAD-7)',
  reflection: 'Reflection',
};

export type AnswerSet = 'gad7_frequency' | 'reflection_amount';
export type ReflectionTheme = 'worry' | 'body' | 'situations' | 'coping' | 'connection';
/** Strain: a high answer means something weighed on the person. Support: a high answer means something helped. */
export type Polarity = 'strain' | 'support';

export interface ThemeInfo {
  id: ReflectionTheme;
  /** A heading. */
  label: string;
  /** As it reads inside a sentence of the summary. */
  phrase: string;
  polarity: Polarity;
}

/** In the order a reflection asks them: the harder themes first, ending on what helped. */
export const REFLECTION_THEMES: readonly ThemeInfo[] = [
  { id: 'worry', label: 'Worry and thoughts', phrase: 'worry', polarity: 'strain' },
  { id: 'body', label: 'Body and sleep', phrase: 'how your body felt', polarity: 'strain' },
  { id: 'situations', label: 'Things going on around you', phrase: 'things going on around you', polarity: 'strain' },
  { id: 'coping', label: 'What you did for yourself', phrase: 'things you did for yourself', polarity: 'support' },
  { id: 'connection', label: 'People around you', phrase: 'the people around you', polarity: 'support' },
];
export const themeInfo = (theme: ReflectionTheme) => REFLECTION_THEMES.find((t) => t.id === theme)!;

/** Every reflection is answered on this scale, and only this one. */
export const REFLECTION_OPTIONS = [
  { value: 0, label: 'Not at all' },
  { value: 1, label: 'A little' },
  { value: 2, label: 'Quite a bit' },
  { value: 3, label: 'A lot' },
] as const;

interface QuestionBase {
  id: string;
  text: string;
  /** A "Quite a bit" or "A lot" answer brings Get help forward. */
  bringsHelp: boolean;
  /** Retired questions stay, inactive, so old answers can still be read. */
  active: boolean;
}

export interface Gad7Question extends QuestionBase {
  type: 'gad7';
  theme: null;
  /** 1 to 7, the published order. */
  position: number;
  answerSet: 'gad7_frequency';
}

export interface ReflectionQuestion extends QuestionBase {
  type: 'reflection';
  theme: ReflectionTheme;
  position: null;
  answerSet: 'reflection_amount';
  polarity: Polarity;
}

export type Question = Gad7Question | ReflectionQuestion;

/**
 * Saved GAD-7 answers are an array of 7 numbers in the encrypted assessment payload, with no ids: position i is
 * `GAD7-(i+1)`. That stored format is kept as it is. See docs/DATABASE.md#assessments.
 */
export const gad7QuestionId = (index: number) => `GAD7-${index + 1}`;

/** The GAD-7, from gad7.ts, with its published wording and order. */
export const GAD7_QUESTIONS: readonly Gad7Question[] = GAD7_ITEMS.map((text, i) => ({
  id: gad7QuestionId(i),
  type: 'gad7',
  theme: null,
  position: i + 1,
  text,
  answerSet: 'gad7_frequency',
  bringsHelp: false,
  active: true,
}));

const ref = (id: string, theme: ReflectionTheme, text: string, help: 'help' | null = null): ReflectionQuestion => ({
  id,
  type: 'reflection',
  theme,
  position: null,
  text,
  answerSet: 'reflection_amount',
  bringsHelp: help === 'help',
  active: true,
  polarity: themeInfo(theme).polarity,
});

/**
 * The reflection bank: 5 themes of 20. Plain words, about the person's own day or recent weeks, on the "Not at all"
 * to "A lot" scale. Nothing about self-harm, suicide, abuse or substance use, which need a clinical pathway this app
 * doesn't have. No GAD-7 paraphrases, and nothing taken from a licensed scale.
 */
export const REFLECTION_QUESTIONS: readonly ReflectionQuestion[] = [
  // Worry and thoughts
  ref('REF-001', 'worry', 'How much did you replay a conversation in your head today?'),
  ref('REF-002', 'worry', 'How much did your thoughts feel like they were racing today?'),
  ref('REF-003', 'worry', 'How much did you think about what others might think of you lately?'),
  ref('REF-004', 'worry', 'How much did you find it hard to keep your mind on one thing today?'),
  ref('REF-005', 'worry', 'How much did thoughts about the future weigh on you lately?'),
  ref('REF-006', 'worry', 'How much did your head feel too full to think clearly today?'),
  ref('REF-007', 'worry', 'How much did small choices feel hard for you to make today?'),
  ref('REF-008', 'worry', 'How much did you blame yourself when things went wrong lately?'),
  ref('REF-009', 'worry', 'How much did you doubt yourself today?'),
  ref('REF-010', 'worry', 'How much did you feel hopeless about things lately?', 'help'),
  ref('REF-011', 'worry', 'How much did everything feel like too much for you today?', 'help'),
  ref('REF-012', 'worry', 'How much did you feel you could not cope with things today?', 'help'),
  ref('REF-013', 'worry', 'How much did you put something off because thinking about it felt heavy today?'),
  ref('REF-014', 'worry', 'How much did you feel you had to check things again and again lately?'),
  ref('REF-015', 'worry', 'How much did you feel you had to get everything just right today?'),
  ref('REF-016', 'worry', 'How much did you forget things more than usual lately?'),
  ref('REF-017', 'worry', 'How much did you feel stuck in your own thoughts today?'),
  ref('REF-018', 'worry', 'How much did you feel you were not good enough lately?'),
  ref('REF-019', 'worry', 'How much did you feel guilty for resting or taking time for yourself lately?'),
  ref('REF-020', 'worry', 'How much did you feel numb or empty inside lately?', 'help'),

  // Body and sleep
  ref('REF-021', 'body', 'How much did you find it hard to fall asleep lately?'),
  ref('REF-022', 'body', 'How much did you wake in the night and find it hard to sleep again lately?'),
  ref('REF-023', 'body', "How much did you feel tired even after a night's sleep lately?"),
  ref('REF-024', 'body', 'How much tightness did you notice in your shoulders, neck or jaw today?'),
  ref('REF-025', 'body', 'How much did you notice your heartbeat more than usual today?'),
  ref('REF-026', 'body', 'How much did your breathing feel tight or shallow today?'),
  ref('REF-027', 'body', 'How much did headaches bother you lately?'),
  ref('REF-028', 'body', 'How much did your stomach feel upset or uneasy today?'),
  ref('REF-029', 'body', 'How much did you feel less hungry than usual lately?'),
  ref('REF-030', 'body', 'How much did you eat more than usual to comfort yourself lately?'),
  ref('REF-031', 'body', 'How much did you notice yourself sighing or holding your breath today?'),
  ref('REF-032', 'body', 'How much did your sleep times move away from your usual routine lately?'),
  ref('REF-033', 'body', 'How much did you catch yourself clenching your teeth or fists today?'),
  ref('REF-034', 'body', 'How much did aches and pains bother you lately?'),
  ref('REF-035', 'body', 'How much did sitting for long hours leave your body stiff today?'),
  ref('REF-036', 'body', 'How much did you feel low on energy today?'),
  ref('REF-037', 'body', 'How much did you sleep more than you wanted to lately?'),
  ref('REF-038', 'body', 'How much did screens keep you awake later than you wanted lately?'),
  ref('REF-039', 'body', 'How much did you feel worn out, as if you had nothing left, lately?', 'help'),
  ref('REF-040', 'body', 'How much did you find it hard to get out of bed and face the day lately?', 'help'),

  // Things going on around you
  ref('REF-041', 'situations', 'How much did work or study pressure weigh on you today?'),
  ref('REF-042', 'situations', 'How much did deadlines or exams play on your mind lately?'),
  ref('REF-043', 'situations', 'How much did things at home feel tense for you lately?'),
  ref('REF-044', 'situations', 'How much did expectations from family weigh on you lately?'),
  ref('REF-045', 'situations', 'How much did money troubles play on your mind lately?'),
  ref('REF-046', 'situations', 'How much did your own health play on your mind lately?'),
  ref('REF-047', 'situations', 'How much did the health of someone close to you weigh on you lately?'),
  ref('REF-048', 'situations', 'How much did the news or social media unsettle you today?'),
  ref('REF-049', 'situations', 'How much did crowded or busy places feel hard for you lately?'),
  ref('REF-050', 'situations', 'How much did meeting new people feel hard for you lately?'),
  ref('REF-051', 'situations', 'How much did speaking up in a group feel hard for you lately?'),
  ref('REF-052', 'situations', 'How much did travel or your daily commute wear you down lately?'),
  ref('REF-053', 'situations', 'How much did a disagreement with someone stay on your mind today?'),
  ref('REF-054', 'situations', 'How much did you feel left out by people around you lately?'),
  ref('REF-055', 'situations', 'How much did questions from relatives about your future weigh on you lately?'),
  ref('REF-056', 'situations', 'How much did comparing marks, jobs or salaries weigh on you lately?'),
  ref('REF-057', 'situations', 'How much did housework or caring for others leave you stretched today?'),
  ref('REF-058', 'situations', 'How much did a lack of privacy or space of your own bother you lately?'),
  ref('REF-059', 'situations', 'How much did you feel trapped by your situation lately?', 'help'),
  ref('REF-060', 'situations', 'How much did a problem feel too big to manage on your own lately?', 'help'),

  // What you did for yourself
  ref('REF-061', 'coping', 'How much did taking a few slow breaths help you today?'),
  ref('REF-062', 'coping', 'How much did a walk or moving your body help you today?'),
  ref('REF-063', 'coping', 'How much did music help you feel steadier today?'),
  ref('REF-064', 'coping', 'How much did fresh air or sunlight help you today?'),
  ref('REF-065', 'coping', 'How much were you able to take short breaks when you needed them today?'),
  ref('REF-066', 'coping', 'How much did prayer, meditation or quiet time help you lately?'),
  ref('REF-067', 'coping', 'How much did writing down your thoughts help you lately?'),
  ref('REF-068', 'coping', 'How much did finishing one small task help you feel settled today?'),
  ref('REF-069', 'coping', 'How much were you able to be kind to yourself today?'),
  ref('REF-070', 'coping', 'How much did a hobby or something you enjoy lift you today?'),
  ref('REF-071', 'coping', 'How much did keeping a regular sleep time help you lately?'),
  ref('REF-072', 'coping', 'How much did a warm drink or a proper meal help you feel steady today?'),
  ref('REF-073', 'coping', 'How much were you able to notice a thought and let it pass today?'),
  ref('REF-074', 'coping', 'How much did breaking a big job into small steps help you lately?'),
  ref('REF-075', 'coping', 'How much did a break from the news or your phone help you lately?'),
  ref('REF-076', 'coping', 'How much were you able to say no to something that was too much lately?'),
  ref('REF-077', 'coping', 'How much did a familiar routine help you get through today?'),
  ref('REF-078', 'coping', 'How much did stepping away from a hard moment help you settle today?'),
  ref('REF-079', 'coping', 'How much did time with a pet, plants or nature help you lately?'),
  ref('REF-080', 'coping', 'How much did remembering what you have got through before help you today?'),

  // People around you
  ref('REF-081', 'connection', 'How much did talking to someone help you today?'),
  ref('REF-082', 'connection', 'How much did you feel listened to by someone lately?'),
  ref('REF-083', 'connection', 'How much did you feel you could be yourself with someone today?'),
  ref('REF-084', 'connection', 'How much did a message or call from someone lift you lately?'),
  ref('REF-085', 'connection', 'How much did time with family help you feel supported lately?'),
  ref('REF-086', 'connection', 'How much did a friend help you feel less alone lately?'),
  ref('REF-087', 'connection', 'How much did you feel there was someone you could turn to lately?'),
  ref('REF-088', 'connection', 'How much did helping someone else make you feel good today?'),
  ref('REF-089', 'connection', 'How much did sharing a meal or chai with someone help you today?'),
  ref('REF-090', 'connection', 'How much did you feel part of a group or community lately?'),
  ref('REF-091', 'connection', 'How much did a kind word from someone help you today?'),
  ref('REF-092', 'connection', 'How much did you feel understood by the people around you lately?'),
  ref('REF-093', 'connection', 'How much were you able to ask for help when you needed it lately?'),
  ref('REF-094', 'connection', 'How much did a neighbour, colleague or classmate brighten things for you today?'),
  ref('REF-095', 'connection', 'How much did you feel close to someone lately?'),
  ref('REF-096', 'connection', 'How much did a place of worship or a community space help you feel at home lately?'),
  ref('REF-097', 'connection', 'How much did you feel respected by the people around you lately?'),
  ref('REF-098', 'connection', 'How much did talking a problem through with someone make it clearer for you today?'),
  ref('REF-099', 'connection', 'How much did you feel cared for by someone today?'),
  ref('REF-100', 'connection', 'How much did time with children or elders at home lift you lately?'),
];

/** The whole catalogue, as migration 005 seeds it. */
export const QUESTIONS: readonly Question[] = [...GAD7_QUESTIONS, ...REFLECTION_QUESTIONS];

const BY_ID: ReadonlyMap<string, Question> = new Map(QUESTIONS.map((q) => [q.id, q]));
export const questionById = (id: string): Question | undefined => BY_ID.get(id);
export const reflectionQuestion = (id: string): ReflectionQuestion | undefined => {
  const q = BY_ID.get(id);
  return q?.type === 'reflection' ? q : undefined;
};
