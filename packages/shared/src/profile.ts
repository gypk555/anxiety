import { z } from 'zod';

/**
 * Optional details about the person, all chosen from fixed lists, never typed: less identifying, and nothing
 * unexpected can be carried in them. See docs/superpowers/specs/2026-11-12-profile-details-design.md.
 * Used only to show back to the person, in a report they choose to include it in, and (stress factors) to suggest
 * tools. Never to score, compare or analyse.
 */

interface Choice<Id extends string> { id: Id; label: string }
const ids = <Id extends string>(list: readonly Choice<Id>[]) => list.map((c) => c.id) as [Id, ...Id[]];

/** The emoji are decoration: every avatar is also named, and the emoji is hidden from screen readers. */
export const AVATARS = [
  { id: 'sage', emoji: '🧘', label: 'Calm Sage' },
  { id: 'leaf', emoji: '🌿', label: 'Gentle Leaf' },
  { id: 'spark', emoji: '✨', label: 'Bright Spark' },
  { id: 'ocean', emoji: '🌊', label: 'Ocean Breeze' },
  { id: 'mountain', emoji: '🏔️', label: 'Mountain Peak' },
] as const;

/** A range, never a birth date or an exact age. The app is for adults only, so nothing starts below 18. */
export const AGE_RANGES = [
  { id: '18-24', label: '18 to 24' },
  { id: '25-34', label: '25 to 34' },
  { id: '35-44', label: '35 to 44' },
  { id: '45-59', label: '45 to 59' },
  { id: '60+', label: '60 or over' },
  { id: 'na', label: 'Prefer not to say' },
] as const;

export const GENDERS = [
  { id: 'woman', label: 'Woman' },
  { id: 'man', label: 'Man' },
  { id: 'nonbinary', label: 'Non-binary' },
  { id: 'na', label: 'Prefer not to say' },
] as const;

export const OCCUPATIONS = [
  { id: 'student', label: 'Student' },
  { id: 'employed', label: 'Employed' },
  { id: 'self_employed', label: 'Self-employed' },
  { id: 'homemaker', label: 'Homemaker' },
  { id: 'looking', label: 'Looking for work' },
  { id: 'retired', label: 'Retired' },
  { id: 'other', label: 'Something else' },
  { id: 'na', label: 'Prefer not to say' },
] as const;

export const STRESS_FACTORS = [
  { id: 'work', label: 'Work' },
  { id: 'studies', label: 'Studies and exams' },
  { id: 'money', label: 'Money' },
  { id: 'family', label: 'Family' },
  { id: 'relationships', label: 'Relationships' },
  { id: 'health', label: 'Health' },
  { id: 'sleep', label: 'Sleep' },
  { id: 'screens', label: 'Screen time and news' },
] as const;

export const avatarId = z.enum(ids(AVATARS));
export const ageRangeId = z.enum(ids(AGE_RANGES));
export const genderId = z.enum(ids(GENDERS));
export const occupationId = z.enum(ids(OCCUPATIONS));
export const stressFactorId = z.enum(ids(STRESS_FACTORS));
const stressFactors = z
  .array(stressFactorId)
  .max(STRESS_FACTORS.length)
  .refine((list) => new Set(list).size === list.length, { message: 'each stress factor at most once' });

export type AvatarId = z.infer<typeof avatarId>;
export type StressFactorId = z.infer<typeof stressFactorId>;

/** What is stored, sealed as one blob. A field that isn't set is absent. */
export const profileSchema = z.strictObject({
  avatar: avatarId.optional(),
  ageRange: ageRangeId.optional(),
  gender: genderId.optional(),
  occupation: occupationId.optional(),
  stressFactors: stressFactors.optional(),
});
export type Profile = z.infer<typeof profileSchema>;

/** PATCH /me/profile: any part of it. Null, or an empty list of stress factors, clears that field. */
export const profileDetailsPatchBody = z.strictObject({
  avatar: avatarId.nullable().optional(),
  ageRange: ageRangeId.nullable().optional(),
  gender: genderId.nullable().optional(),
  occupation: occupationId.nullable().optional(),
  stressFactors: stressFactors.nullable().optional(),
});
export type ProfilePatch = z.infer<typeof profileDetailsPatchBody>;

/** Applies a change: null or an empty list removes the field, and a field left out stays as it was. */
export function applyProfilePatch(profile: Profile, patch: ProfilePatch): Profile {
  const next: Record<string, unknown> = { ...profile };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (value === null || (Array.isArray(value) && value.length === 0)) delete next[key];
    else next[key] = value;
  }
  return profileSchema.parse(next);
}

const labelOf = (list: readonly Choice<string>[], id: string) => list.find((c) => c.id === id)?.label ?? id;

/** The profile in words, for the export and the report. Fields that aren't set are left out. */
export function readableProfile(profile: Profile) {
  return {
    ...(profile.avatar ? { avatar: labelOf(AVATARS, profile.avatar) } : {}),
    ...(profile.ageRange ? { ageRange: labelOf(AGE_RANGES, profile.ageRange) } : {}),
    ...(profile.gender ? { gender: labelOf(GENDERS, profile.gender) } : {}),
    ...(profile.occupation ? { occupation: labelOf(OCCUPATIONS, profile.occupation) } : {}),
    ...(profile.stressFactors?.length ? { stressFactors: profile.stressFactors.map((s) => labelOf(STRESS_FACTORS, s)) } : {}),
  };
}

export const avatarFor = (id: AvatarId | undefined) => AVATARS.find((a) => a.id === id);
