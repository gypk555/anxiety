import { describe, expect, it } from 'vitest';
import { AGE_RANGES, AVATARS, GENDERS, OCCUPATIONS, profileDetailsPatchBody, profileSchema, readableProfile, STRESS_FACTORS } from './profile.ts';
import { meResponse } from './schemas.ts';

describe('profile choices', () => {
  it('are the fixed lists from the spec, each with a text label', () => {
    expect(AVATARS.map((a) => a.id)).toEqual(['sage', 'leaf', 'spark', 'ocean', 'mountain']);
    expect(AVATARS.map((a) => a.label)).toEqual(['Calm Sage', 'Gentle Leaf', 'Bright Spark', 'Ocean Breeze', 'Mountain Peak']);
    expect(AGE_RANGES.map((a) => a.id)).toEqual(['18-24', '25-34', '35-44', '45-59', '60+', 'na']);
    expect(GENDERS.map((a) => a.id)).toEqual(['woman', 'man', 'nonbinary', 'na']);
    expect(OCCUPATIONS.map((a) => a.id)).toEqual(['student', 'employed', 'self_employed', 'homemaker', 'looking', 'retired', 'other', 'na']);
    expect(STRESS_FACTORS.map((a) => a.id)).toEqual(['work', 'studies', 'money', 'family', 'relationships', 'health', 'sleep', 'screens']);
    for (const list of [AVATARS, AGE_RANGES, GENDERS, OCCUPATIONS, STRESS_FACTORS]) for (const c of list) expect(c.label.length).toBeGreaterThan(0);
    // Nothing under 18: the app is for adults only.
    expect(AGE_RANGES.some((a) => /^1[0-7]/.test(a.id))).toBe(false);
  });
});

describe('the stored profile', () => {
  it('is every field optional, from the lists only, with no unknown keys', () => {
    expect(profileSchema.parse({})).toEqual({});
    expect(profileSchema.parse({ avatar: 'leaf', ageRange: '25-34', gender: 'na', occupation: 'self_employed', stressFactors: ['sleep', 'work'] }))
      .toEqual({ avatar: 'leaf', ageRange: '25-34', gender: 'na', occupation: 'self_employed', stressFactors: ['sleep', 'work'] });
    for (const bad of [{ avatar: 'cat' }, { ageRange: '17' }, { ageRange: 30 }, { gender: 'other' }, { occupation: 'doctor' }, { stressFactors: ['exams'] }, { stressFactors: 'work' }, { birthDate: '2000-01-01' }]) {
      expect(profileSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it('holds each stress factor once, at most eight', () => {
    expect(profileSchema.safeParse({ stressFactors: ['work', 'work'] }).success).toBe(false);
    expect(profileSchema.safeParse({ stressFactors: STRESS_FACTORS.map((s) => s.id) }).success).toBe(true);
  });
});

describe('changing the profile', () => {
  it('takes part of it, and null clears a field', () => {
    expect(profileDetailsPatchBody.parse({ gender: null })).toEqual({ gender: null });
    expect(profileDetailsPatchBody.parse({ avatar: 'ocean', stressFactors: [] })).toEqual({ avatar: 'ocean', stressFactors: [] });
    expect(profileDetailsPatchBody.safeParse({ avatar: 'cat' }).success).toBe(false);
    expect(profileDetailsPatchBody.safeParse({ displayName: 'Asha' }).success).toBe(false);
    expect(profileDetailsPatchBody.safeParse({ stressFactors: ['work', 'work'] }).success).toBe(false);
  });
});

describe('the profile in words', () => {
  it('resolves each value to its label, and leaves out what is not set', () => {
    expect(readableProfile({ avatar: 'spark', ageRange: '60+', stressFactors: ['screens', 'money'] })).toEqual({
      avatar: 'Bright Spark',
      ageRange: '60 or over',
      stressFactors: ['Screen time and news', 'Money'],
    });
    expect(readableProfile({})).toEqual({});
  });
});

describe('the account', () => {
  it('says what profile is set and whether About you was seen', () => {
    const me = { id: 'a0000000-0000-4000-8000-000000000000', email: 'a@example.com', displayName: 'Asha', createdAt: '2026-11-06T00:00:00.000Z', consentRequired: false, consentVersion: 'x', acceptedConsentVersion: 'x' };
    expect(meResponse.safeParse({ ...me, profile: {}, aboutSeen: false }).success).toBe(true);
    expect(meResponse.safeParse({ ...me, profile: { avatar: 'sage' }, aboutSeen: true }).success).toBe(true);
    expect(meResponse.safeParse(me).success).toBe(false);
  });
});
