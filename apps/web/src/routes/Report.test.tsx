import { addDays, emptySafetyPlan, GAD7_ATTRIBUTION } from '@anxiocare/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { todayLocal } from '@/lib/mood';
import { ME, mockFetch, renderRoutes } from '@/test/render';
import { weeklyAverages } from '@/lib/mood';
import Report from './Report';

afterEach(() => vi.unstubAllGlobals());

const today = todayLocal();
const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();
const at = '2026-11-01T04:00:00.000Z';
const ASSESSMENTS = [
  { id: '22222222-2222-4222-8222-222222222221', takenAt: iso(5), answers: [2, 2, 1, 2, 1, 1, 1], difficulty: 1, score: 10, severity: 'moderate' },
  { id: '22222222-2222-4222-8222-222222222222', takenAt: iso(50), answers: [3, 3, 2, 2, 2, 2, 2], difficulty: 2, score: 16, severity: 'severe' },
];
const MOODS = [
  { day: addDays(today, -2), rating: 2, note: 'SecretMoodNote', createdAt: at, updatedAt: at },
  { day: addDays(today, -1), rating: 4, note: '', createdAt: at, updatedAt: at },
];
const JOURNAL = [{ id: '33333333-3333-4333-8333-333333333331', situation: 'SecretSituation', thought: 'SecretThought', feelings: ['Worried'], intensityBefore: 7, evidenceFor: '', evidenceAgainst: '', balancedThought: '', intensityAfter: null, createdAt: iso(3), updatedAt: iso(3) }];
const PLAN = { ...emptySafetyPlan(), reasonsToLive: ['SecretReason'], updatedAt: at };
const REFLECTIONS = [{ id: '66666666-6666-4666-8666-666666666661', takenAt: iso(4), answers: [{ q: 'REF-001', a: 3 }, { q: 'REF-021', a: 2 }, { q: 'REF-041', a: 0 }, { q: 'REF-061', a: 1 }, { q: 'REF-081', a: 0 }], note: 'SecretReflectionNote' }];

function setup(me: object = ME) {
  const fetchMock = mockFetch({
    'GET /me': { body: me },
    'GET /assessments': { body: { items: ASSESSMENTS, nextCursor: null } },
    [`GET /moods?from=${addDays(today, -399)}&to=${today}`]: { body: { items: MOODS } },
    'GET /journal': { body: { items: JOURNAL, nextCursor: null } },
    'GET /safety-plan': { body: PLAN },
    'GET /reflections': { body: { items: REFLECTIONS, nextCursor: null } },
  });
  renderRoutes([{ path: '/report', element: <Report /> }], '/report');
  return fetchMock;
}

const preview = () => screen.getByRole('region', { name: 'Report preview' });

describe('doctor report', () => {
  it('previews GAD-7 scores, a chart and weekly mood averages by default, and leaves private writing out', async () => {
    setup();
    const table = await screen.findByRole('table', { name: 'GAD-7 check-ins' });
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Date', 'Score', 'Range', 'Day-to-day difficulty']);
    expect(within(table).getByText('Somewhat difficult')).toBeInTheDocument();
    expect(within(preview()).getAllByRole('img').length).toBeGreaterThanOrEqual(1);
    expect(await within(preview()).findByRole('table', { name: 'Daily mood, weekly averages' })).toBeInTheDocument();
    expect(preview()).not.toHaveTextContent('SecretMoodNote');
    expect(preview()).not.toHaveTextContent('SecretSituation');
    expect(preview()).not.toHaveTextContent('SecretReason');
    expect(preview()).not.toHaveTextContent(ME.displayName!);
    expect(preview()).not.toHaveTextContent('replay a conversation');
    expect(screen.getByRole('checkbox', { name: 'Reflections' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Reflection notes' })).not.toBeChecked();
    expect(preview()).toHaveTextContent('Self-reported. A screening, not a diagnosis');
    expect(preview()).toHaveTextContent(GAD7_ATTRIBUTION);
    expect(preview()).toHaveTextContent(/Made on/);
  });

  it('turning sections on and off changes what the report holds', async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByRole('table', { name: 'GAD-7 check-ins' });
    await user.click(screen.getByRole('checkbox', { name: 'Mood notes' }));
    expect(await within(preview()).findByText('SecretMoodNote')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Journal entries' }));
    expect(await within(preview()).findByText('SecretSituation')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Safety plan' }));
    expect(await within(preview()).findByText('SecretReason')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'GAD-7 scores' }));
    expect(within(preview()).queryByRole('table', { name: 'GAD-7 check-ins' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Put my name at the top' }));
    expect(within(preview()).getByText(`For ${ME.displayName}`)).toBeInTheDocument();
  });

  it('a Reflections section lists each date, question and answer, and the note only with its own option on', async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByRole('table', { name: 'GAD-7 check-ins' });
    await user.click(screen.getByRole('checkbox', { name: 'Reflections' }));
    const table = await within(preview()).findByRole('table', { name: /^Reflection on / });
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Question', 'Answer']);
    expect(within(table).getByText('How much did you replay a conversation in your head today?')).toBeInTheDocument();
    expect(within(table).getAllByText('A lot')).toHaveLength(1);
    expect(preview()).toHaveTextContent('Not scored, and not part of the GAD-7');
    expect(preview()).not.toHaveTextContent('SecretReflectionNote');
    await user.click(screen.getByRole('checkbox', { name: 'Reflection notes' }));
    expect(await within(preview()).findByText('SecretReflectionNote')).toBeInTheDocument();
  });

  it('the period limits what is included', async () => {
    const user = userEvent.setup();
    setup();
    const table = await screen.findByRole('table', { name: 'GAD-7 check-ins' });
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    await user.click(screen.getByRole('radio', { name: 'Last month' }));
    await waitFor(() => expect(within(screen.getByRole('table', { name: 'GAD-7 check-ins' })).getAllByRole('row')).toHaveLength(2));
  });

  it('prints through the browser, with no server PDF', async () => {
    const user = userEvent.setup();
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    const { calls } = setup();
    await screen.findByRole('table', { name: 'GAD-7 check-ins' });
    await user.click(screen.getByRole('button', { name: 'Save as PDF or print' }));
    expect(print).toHaveBeenCalled();
    expect(calls.every((c) => c.key.startsWith('GET '))).toBe(true);
  });

  it('weekly averages group days into weeks starting Monday', () => {
    const rows = weeklyAverages([
      { day: '2026-11-02', rating: 2, note: '', createdAt: at, updatedAt: at }, // Monday
      { day: '2026-11-08', rating: 4, note: '', createdAt: at, updatedAt: at }, // Sunday, same week
      { day: '2026-11-09', rating: 5, note: '', createdAt: at, updatedAt: at }, // next Monday
    ]);
    expect(rows).toEqual([
      { weekStart: '2026-11-02', days: 2, average: 3 },
      { weekStart: '2026-11-09', days: 1, average: 5 },
    ]);
  });

  it('has an About me section, off by default, with only the details that are set, in words', async () => {
    setup({ ...ME, profile: { avatar: 'leaf', ageRange: '35-44', occupation: 'self_employed', stressFactors: ['work', 'sleep'] } });
    await screen.findByRole('table', { name: 'GAD-7 check-ins' });
    const box = screen.getByRole('checkbox', { name: 'About me' });
    expect(box).not.toBeChecked();
    expect(within(preview()).queryByRole('heading', { name: 'About me' })).not.toBeInTheDocument();
    await userEvent.click(box);
    const section = within(preview()).getByRole('region', { name: 'About me' });
    expect(section).toHaveTextContent('Age range35 to 44');
    expect(section).toHaveTextContent('OccupationSelf-employed');
    expect(section).toHaveTextContent('Things that cause stressWork, Sleep');
    expect(section).not.toHaveTextContent(/Gender/);
    // The avatar is decoration, never part of a report.
    expect(section).not.toHaveTextContent(/Gentle Leaf|🌿/);
  });

  it('says so when no details are set', async () => {
    setup({ ...ME, profile: {} });
    await screen.findByRole('table', { name: 'GAD-7 check-ins' });
    await userEvent.click(screen.getByRole('checkbox', { name: 'About me' }));
    expect(within(preview()).getByRole('region', { name: 'About me' })).toHaveTextContent(/No details added/);
  });
});
