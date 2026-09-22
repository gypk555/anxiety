import type { Question, QuestionOption, SeverityInfo, AnxietyLevel, UserProfile } from '../types/assessment';

export const GAD7_OPTIONS: QuestionOption[] = [
  { label: 'Not at all', score: 0 },
  { label: 'Several days', score: 1 },
  { label: 'More than half the days', score: 2 },
  { label: 'Nearly every day', score: 3 },
];

export const ASSESSMENT_QUESTIONS: Question[] = [
  // GAD-7 Standard Questions
  {
    id: 1,
    text: 'Feeling nervous, anxious, or on edge over the past 2 weeks?',
    category: 'Emotional',
    explanation: 'Measures baseline physiological arousal, emotional sensitivity, and feelings of hyper-vigilance.',
  },
  {
    id: 2,
    text: 'Not being able to stop or control worrying thoughts?',
    category: 'Cognitive',
    explanation: 'Assesses intrusive thoughts, cognitive perseveration, and mental rumination cycles.',
  },
  {
    id: 3,
    text: 'Worrying too much about different things or worst-case scenarios?',
    category: 'Cognitive',
    explanation: 'Evaluates generalized apprehension, catastrophic thinking, and excessive anticipatory dread.',
  },
  {
    id: 4,
    text: 'Trouble relaxing or unwinding during downtime?',
    category: 'Behavioral',
    explanation: 'Measures physical restlessness, inability to disengage from task-oriented states, and persistent tension.',
  },
  {
    id: 5,
    text: 'Being so restless that it is hard to sit still?',
    category: 'Physical',
    explanation: 'Evaluates motor agitation, somatic restlessness, and psychomotor hyperactivity.',
  },
  {
    id: 6,
    text: 'Becoming easily annoyed, impatient, or irritable?',
    category: 'Emotional',
    explanation: 'Assesses emotional reactivity, lowered stress tolerance thresholds, and interpersonal friction.',
  },
  {
    id: 7,
    text: 'Feeling afraid as if something awful might happen?',
    category: 'Cognitive',
    explanation: 'Evaluates existential anxiety, sense of impending crisis, and heightened fight-or-flight response.',
  },

  // Extended Clinical & Somatic Questions (8 - 14)
  {
    id: 8,
    text: 'Experiencing muscle tension, jaw clenching, or unexplained aches?',
    category: 'Physical',
    explanation: 'Measures somatic muscle contraction and stress-induced physical strain.',
    isExtendedOnly: true,
  },
  {
    id: 9,
    text: 'Difficulty falling or staying asleep due to racing thoughts?',
    category: 'Physical',
    explanation: 'Assesses sleep disturbance, insomnia, and nocturnal cognitive hyper-arousal.',
    isExtendedOnly: true,
  },
  {
    id: 10,
    text: 'Feeling sudden heart racing, shortness of breath, or chest tightness?',
    category: 'Physical',
    explanation: 'Evaluates autonomic nervous system spikes and panic-like somatic sensations.',
    isExtendedOnly: true,
  },
  {
    id: 11,
    text: 'Avoiding social situations, meetings, or public tasks out of dread?',
    category: 'Behavioral',
    explanation: 'Measures avoidance coping mechanisms and social inhibition.',
    isExtendedOnly: true,
  },
  {
    id: 12,
    text: 'Trouble focusing on work/studies because your mind wanders to worries?',
    category: 'Cognitive',
    explanation: 'Evaluates cognitive disruption, working memory overload, and attentional bias.',
    isExtendedOnly: true,
  },
  {
    id: 13,
    text: 'Feeling overwhelmed by daily routine responsibilities or choices?',
    category: 'Emotional',
    explanation: 'Measures cognitive overload, decision fatigue, and emotional burnout risk.',
    isExtendedOnly: true,
  },
  {
    id: 14,
    text: 'Experiencing digestive discomfort, stomach knots, or nausea when stressed?',
    category: 'Physical',
    explanation: 'Assesses gut-brain axis somatic stress reactivity.',
    isExtendedOnly: true,
  },
];

export const STRESS_DRIVER_OPTIONS = [
  'Workplace Deadlines & Heavy Workload',
  'Financial Concerns & Budgeting',
  'Sleep Disturbance & Fatigue',
  'Social & Relationship Dynamics',
  'Health & Physical Well-being',
  'Career & Academic Uncertainty',
  'Information Overload & Screen Time',
];

export const AVATAR_OPTIONS = [
  { id: '1', emoji: '🧘', name: 'Calm Sage' },
  { id: '2', emoji: '🌿', name: 'Gentle Leaf' },
  { id: '3', emoji: '✨', name: 'Bright Spark' },
  { id: '4', emoji: '🌊', name: 'Ocean Breeze' },
  { id: '5', emoji: '🏔️', name: 'Mountain Peak' },
];

export function calculateSeverity(score: number, maxScore: number = 21): SeverityInfo {
  // Normalize if max score is different (e.g. 42 for extended)
  const normalizedScore = maxScore === 21 ? score : Math.round((score / maxScore) * 21);

  if (normalizedScore <= 4) {
    return {
      level: 'Minimal',
      rangeText: 'Score 0 - 4 (Minimal Anxiety)',
      color: '#10b981', // Emerald
      bgColor: 'rgba(16, 185, 129, 0.12)',
      borderColor: 'rgba(16, 185, 129, 0.3)',
      summary: 'Your anxiety level appears minimal and well-managed. You demonstrate healthy emotional resilience and calm cognitive processing.',
      recommendations: [
        'Maintain your current healthy routines and sleep hygiene.',
        'Engage in daily 5-minute mindfulness or gratitude reflection.',
        'Use light physical activity like morning walking to sustain positive mood baseline.'
      ],
    };
  } else if (normalizedScore <= 9) {
    return {
      level: 'Mild',
      rangeText: 'Score 5 - 9 (Mild Anxiety)',
      color: '#06b6d4', // Cyan
      bgColor: 'rgba(6, 182, 212, 0.12)',
      borderColor: 'rgba(6, 182, 212, 0.3)',
      summary: 'You are experiencing mild anxiety symptoms. While manageable, these may occasionally cause noticeable tension or mental fatigue.',
      recommendations: [
        'Practice the 4-7-8 visual breathing exercise twice daily to regulate your nervous system.',
        'Schedule structured "worry time" (15 mins) to write thoughts down and clear your head.',
        'Limit caffeine and late-night blue light exposure before sleep.'
      ],
    };
  } else if (normalizedScore <= 14) {
    return {
      level: 'Moderate',
      rangeText: 'Score 10 - 14 (Moderate Anxiety)',
      color: '#f59e0b', // Amber
      bgColor: 'rgba(245, 158, 11, 0.12)',
      borderColor: 'rgba(245, 158, 11, 0.3)',
      summary: 'Your scores reflect moderate anxiety levels. You may frequently experience intrusive worry, physical tension, or difficulty relaxing.',
      recommendations: [
        'Incorporate daily guided grounding exercises (e.g., 5-4-3-2-1 technique in our toolkit).',
        'Break complex tasks into small, manageable action steps to reduce cognitive overwhelm.',
        'Consider speaking with a wellness coach or mental health professional for personalized guidance.'
      ],
    };
  } else {
    return {
      level: 'Severe',
      rangeText: 'Score 15 - 21+ (Severe Anxiety)',
      color: '#f43f5e', // Rose
      bgColor: 'rgba(244, 63, 94, 0.12)',
      borderColor: 'rgba(244, 63, 94, 0.3)',
      summary: 'Your score indicates severe anxiety symptoms that may significantly impact your daily comfort, focus, and overall well-being.',
      recommendations: [
        'Strongly recommended: Consult a healthcare professional or clinical psychologist.',
        'Utilize immediate grounding and calming soundscapes during acute tension spikes.',
        'Reach out to a trusted loved one or support network—you do not have to navigate this alone.'
      ],
    };
  }
}

export function generateDemographicInsight(user: UserProfile, level: AnxietyLevel): string {
  const ageGroup = typeof user.age === 'number' ? (user.age < 25 ? 'Young Adults (18-24)' : user.age < 40 ? 'Professionals (25-39)' : 'Experienced Adults (40+)') : 'General demographic';
  const occupationStr = user.occupation || 'Professionals';
  
  if (level === 'Minimal') {
    return `Compared to national wellness baselines for ${occupationStr} in the ${ageGroup} category, your score shows exceptional stress resilience.`;
  } else if (level === 'Mild') {
    return `For ${occupationStr} in the ${ageGroup} demographic, mild anxiety is common during periods of increased workload. Proactive stress management now prevents escalation.`;
  } else if (level === 'Moderate') {
    return `Data shows that individuals working in ${occupationStr} frequently report elevated tension when balancing ${user.stressDrivers.slice(0, 2).join(' & ') || 'daily responsibilities'}. Focused micro-breaks can significantly lower somatic arousal.`;
  } else {
    return `High cognitive load in ${occupationStr} roles paired with factors like ${user.stressDrivers[0] || 'work stress'} frequently triggers severe nervous system fatigue. Immediate restorative rest and professional care are advised.`;
  }
}
