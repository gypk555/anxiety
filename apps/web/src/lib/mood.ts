import { addDays, MOOD_MAX_DAYS_BACK, moodLabel, moodList, moodResponse, type MoodEntry, type MoodInput } from '@anxiocare/shared';
import { request } from './api';
import { formatDate } from './dates';

/** The calendar day on this phone, in its own time zone. The server stores exactly this. */
export function todayLocal(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export const earliestMoodDay = (today: string = todayLocal()) => addDays(today, -MOOD_MAX_DAYS_BACK);
export const moodDayAllowed = (day: string, today: string = todayLocal()) => day <= today && day >= earliestMoodDay(today);

export const moodsKey = ['moods'] as const;

export const fetchMoods = async (from: string, to: string) =>
  (await request('GET', `/moods?from=${from}&to=${to}`, { schema: moodList })).items;

export const saveMood = (day: string, body: MoodInput) =>
  request<MoodEntry>('PUT', `/moods/${encodeURIComponent(day)}`, { body, schema: moodResponse });

export const deleteMood = (day: string) => request('DELETE', `/moods/${encodeURIComponent(day)}`);

/** `YYYY-MM-DD` as a date for people, without letting the time zone move it to another day. */
export const dayAsDate = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
};

/** Weeks start on Monday. The average is to one decimal place. */
export function weeklyAverages(entries: readonly MoodEntry[]) {
  const weeks = new Map<string, number[]>();
  for (const e of entries) {
    const weekday = new Date(`${e.day}T00:00:00Z`).getUTCDay();
    const start = addDays(e.day, -((weekday + 6) % 7));
    weeks.set(start, [...(weeks.get(start) ?? []), e.rating]);
  }
  return [...weeks.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, ratings]) => ({ weekStart, days: ratings.length, average: Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 }));
}

export function moodSummary(entries: readonly MoodEntry[]): string {
  if (entries.length === 0) return 'No days logged in this period.';
  const last = entries[entries.length - 1]!;
  const count = `${entries.length} ${entries.length === 1 ? 'day' : 'days'} logged.`;
  return `${count} The most recent, on ${formatDate(dayAsDate(last.day))}, was ${moodLabel(last.rating)}.`;
}
