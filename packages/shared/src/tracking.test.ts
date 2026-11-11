import { describe, expect, it } from 'vitest';
import {
  addDays,
  MOOD_LEVELS,
  MOOD_MAX_DAYS_BACK,
  MOOD_NOTE_MAX,
  moodBody,
  moodDayAllowedOnServer,
  moodLabel,
  moodRangeQuery,
  SAFETY_PLAN_MAX_ITEMS,
  SAFETY_PLAN_SECTIONS,
  safetyPlanBody,
  safetyPlanResponse,
  emptySafetyPlan,
  isPlanEmpty,
  dayParam,
} from './index.ts';

describe('daily mood log contract', () => {
  it('has five levels in words, from Very low to Very good', () => {
    expect(MOOD_LEVELS.map((l) => [l.value, l.label])).toEqual([
      [1, 'Very low'], [2, 'Low'], [3, 'Okay'], [4, 'Good'], [5, 'Very good'],
    ]);
    expect(moodLabel(3)).toBe('Okay');
  });

  it('takes a rating from 1 to 5 and a note of up to 280 characters, and nothing else', () => {
    expect(moodBody.safeParse({ rating: 1, note: '' }).success).toBe(true);
    expect(moodBody.safeParse({ rating: 5, note: 'x'.repeat(MOOD_NOTE_MAX) }).success).toBe(true);
    expect(moodBody.parse({ rating: 3, note: '  trimmed  ' }).note).toBe('trimmed');
    for (const bad of [
      { rating: 0, note: '' },
      { rating: 6, note: '' },
      { rating: 2.5, note: '' },
      { rating: '3', note: '' },
      { rating: 3, note: 'x'.repeat(MOOD_NOTE_MAX + 1) },
      { rating: 3 },
      { rating: 3, note: '', score: 9 },
    ]) {
      expect(moodBody.safeParse(bad).success, JSON.stringify(bad).slice(0, 60)).toBe(false);
    }
  });

  it('accepts only real calendar days as YYYY-MM-DD', () => {
    expect(dayParam.safeParse('2026-11-11').success).toBe(true);
    for (const bad of ['2026-02-30', '2026-13-01', '26-11-11', '2026-11-11T00:00:00Z', '2026/11/11', '', '2026-1-1']) {
      expect(dayParam.safeParse(bad).success, bad).toBe(false);
    }
  });

  it('adds days across months and years without time zone drift', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-11-11', -366)).toBe('2025-11-10');
  });

  it('the server refuses future days and days more than 366 back, allowing for every time zone', () => {
    // 2026-11-11 at 13:00 UTC: it is already 12 November in Kiribati (UTC+14), and still 11 November everywhere west.
    const now = new Date('2026-11-11T13:00:00Z');
    expect(moodDayAllowedOnServer('2026-11-11', now)).toBe(true);
    expect(moodDayAllowedOnServer('2026-11-12', now)).toBe(true);
    expect(moodDayAllowedOnServer('2026-11-13', now)).toBe(false);
    // In UTC-12 it is 2026-11-11 01:00, so 366 days back is 2025-11-10.
    expect(moodDayAllowedOnServer('2025-11-10', now)).toBe(true);
    expect(moodDayAllowedOnServer('2025-11-09', now)).toBe(false);
    expect(MOOD_MAX_DAYS_BACK).toBe(366);
  });

  it('a range needs to on or after from, spanning at most 400 days', () => {
    expect(moodRangeQuery.safeParse({ from: '2026-01-01', to: '2026-01-01' }).success).toBe(true);
    expect(moodRangeQuery.safeParse({ from: '2025-10-07', to: '2026-11-11' }).success).toBe(true); // 400 days
    expect(moodRangeQuery.safeParse({ from: '2025-10-06', to: '2026-11-11' }).success).toBe(false); // 401
    expect(moodRangeQuery.safeParse({ from: '2026-01-02', to: '2026-01-01' }).success).toBe(false);
    expect(moodRangeQuery.safeParse({ from: '2026-01-01' }).success).toBe(false);
    expect(moodRangeQuery.safeParse({ from: '2026-01-01', to: '2026-01-02', extra: '1' }).success).toBe(false);
  });
});

describe('safety plan contract', () => {
  const contact = { name: 'Didi', phone: '+91 98765 43210' };

  it('follows the Stanley-Brown order, seven sections', () => {
    expect(SAFETY_PLAN_SECTIONS.map((s) => s.key)).toEqual([
      'warningSigns', 'copingStrategies', 'distractions', 'helpContacts', 'professionals', 'saferSurroundings', 'reasonsToLive',
    ]);
    for (const section of SAFETY_PLAN_SECTIONS) {
      expect(section.title.length).toBeGreaterThan(5);
      expect(section.example.length, `${section.key} has an example hint`).toBeGreaterThan(5);
    }
  });

  it('an empty plan is valid, and every section may be left empty', () => {
    expect(safetyPlanBody.parse(emptySafetyPlan())).toEqual(emptySafetyPlan());
    expect(isPlanEmpty(emptySafetyPlan())).toBe(true);
    expect(isPlanEmpty({ ...emptySafetyPlan(), reasonsToLive: ['My daughter'] })).toBe(false);
  });

  it('bounds lists at 10 items of 200 characters, and contacts at 80 for a name and 20 for a phone', () => {
    const plan = emptySafetyPlan();
    expect(safetyPlanBody.safeParse({ ...plan, warningSigns: Array.from({ length: SAFETY_PLAN_MAX_ITEMS }, () => 'x'.repeat(200)) }).success).toBe(true);
    expect(safetyPlanBody.safeParse({ ...plan, helpContacts: [contact], professionals: [{ name: 'Dr Rao', phone: '(080) 2345-6789' }] }).success).toBe(true);
    for (const bad of [
      { ...plan, warningSigns: Array.from({ length: 11 }, () => 'x') },
      { ...plan, warningSigns: ['x'.repeat(201)] },
      { ...plan, warningSigns: ['   '] },
      { ...plan, helpContacts: Array.from({ length: 11 }, () => contact) },
      { ...plan, helpContacts: [{ name: 'x'.repeat(81), phone: '1' }] },
      { ...plan, helpContacts: [{ name: '', phone: '1' }] },
      { ...plan, helpContacts: [{ name: 'A', phone: '1'.repeat(21) }] },
      { ...plan, helpContacts: [{ name: 'A', phone: 'call me' }] },
      { ...plan, helpContacts: [{ name: 'A', phone: '+ ()-' }] },
      { ...plan, helpContacts: [{ name: 'A', phone: '1', email: 'a@example.com' }] },
      { ...plan, extra: [] },
      { ...plan, reasonsToLive: undefined },
    ]) {
      expect(safetyPlanBody.safeParse(bad).success, JSON.stringify(bad).slice(0, 80)).toBe(false);
    }
  });

  it('a contact may have no phone, and then simply gets no call button', () => {
    expect(safetyPlanBody.safeParse({ ...emptySafetyPlan(), helpContacts: [{ name: 'My neighbour', phone: '' }] }).success).toBe(true);
  });

  it('the response adds only the update time', () => {
    const response = { ...emptySafetyPlan(), updatedAt: '2026-11-11T10:00:00.000Z' };
    expect(safetyPlanResponse.parse(response)).toEqual(response);
  });
});
