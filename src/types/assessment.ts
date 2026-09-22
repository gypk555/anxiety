export type GenderOption = 'Male' | 'Female' | 'Non-Binary' | 'Prefer not to say';

export interface UserProfile {
  name: string;
  age: number | '';
  gender: GenderOption;
  occupation: string;
  stressDrivers: string[];
  avatarId: string;
  createdAt: string;
}

export type SymptomCategory = 'Cognitive' | 'Emotional' | 'Physical' | 'Behavioral';

export interface QuestionOption {
  label: string;
  score: number;
}

export interface Question {
  id: number;
  text: string;
  category: SymptomCategory;
  explanation: string;
  isExtendedOnly?: boolean;
}

export type AnxietyLevel = 'Minimal' | 'Mild' | 'Moderate' | 'Severe';

export interface SeverityInfo {
  level: AnxietyLevel;
  rangeText: string;
  color: string;
  bgColor: string;
  borderColor: string;
  summary: string;
  recommendations: string[];
}

export interface CategoryBreakdown {
  category: SymptomCategory;
  score: number;
  maxScore: number;
  percentage: number;
}

export interface ScoreResult {
  id: string;
  timestamp: string;
  totalScore: number;
  maxPossibleScore: number;
  level: AnxietyLevel;
  categoryBreakdown: CategoryBreakdown[];
  answers: Record<number, number>;
  userProfile: UserProfile;
  assessmentType: 'GAD7' | 'Extended';
  demographicInsight: string;
}

export interface CopingTool {
  id: string;
  title: string;
  description: string;
  category: 'Breathing' | 'Grounding' | 'Soundscape' | 'CBT Journal';
  duration: string;
  recommendedFor: AnxietyLevel[];
}
