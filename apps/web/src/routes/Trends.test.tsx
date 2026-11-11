import { addDays } from '@anxiocare/shared';
import { QueryClient } from '@tanstack/react-query';
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { todayLocal } from '@/lib/mood';
import { mockFetch, renderRoutes } from '@/test/render';
import Trends from './Trends';

afterEach(() => vi.unstubAllGlobals());
const today = todayLocal();
const at = '2026-11-01T04:00:00.000Z';

describe('Trends', () => {
  it('shows the mood log as its own chart, never on the check-in axis', async () => {
    mockFetch({
      'GET /assessments': { body: { items: [{ id: '22222222-2222-4222-8222-222222222221', takenAt: at, answers: [2, 2, 1, 2, 1, 1, 1], difficulty: 1, score: 10, severity: 'moderate' }], nextCursor: null } },
      [`GET /moods?from=${addDays(today, -29)}&to=${today}`]: { body: { items: [{ day: today, rating: 4, note: '', createdAt: at, updatedAt: at }] } },
    });
    renderRoutes([{ path: '/trends', element: <Trends /> }], '/trends');
    const mood = await screen.findByRole('region', { name: 'Your daily mood log, not a test score' });
    const images = await screen.findAllByRole('img');
    expect(images).toHaveLength(2);
    expect(within(mood).getByRole('img')).not.toHaveTextContent(/Minimal|Severe/);
    expect(within(mood).getByRole('link', { name: 'See and change your mood log' })).toHaveAttribute('href', '/mood');
  });

  it('lists reflections by date with a Reflection label, opening each one, with themes counted but never charted or scored', async () => {
    const recent = new Date(Date.now() - 2 * 86_400_000).toISOString();
    const older = new Date(Date.now() - 3 * 86_400_000).toISOString();
    mockFetch({
      'GET /assessments': { body: { items: [], nextCursor: null } },
      [`GET /moods?from=${addDays(today, -29)}&to=${today}`]: { body: { items: [] } },
      'GET /reflections': {
        body: {
          items: [
            { id: '66666666-6666-4666-8666-666666666661', takenAt: recent, answers: [{ q: 'REF-001', a: 3 }, { q: 'REF-021', a: 2 }, { q: 'REF-041', a: 0 }, { q: 'REF-061', a: 1 }, { q: 'REF-081', a: 0 }] },
            { id: '66666666-6666-4666-8666-666666666662', takenAt: older, answers: [{ q: 'REF-002', a: 2 }, { q: 'REF-022', a: 0 }, { q: 'REF-042', a: 0 }, { q: 'REF-062', a: 0 }, { q: 'REF-082', a: 0 }] },
          ],
          nextCursor: null,
        },
      },
    });
    renderRoutes([{ path: '/trends', element: <Trends /> }], '/trends');
    const section = await screen.findByRole('region', { name: 'Reflections' });
    const links = await within(section).findAllByRole('link', { name: /^Reflection,/ });
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/reflections/66666666-6666-4666-8666-666666666661', '/reflections/66666666-6666-4666-8666-666666666662']);
    expect(within(section).queryByRole('img')).not.toBeInTheDocument();
    const themes = within(section).getByRole('list', { name: 'Themes that came up most in the last 30 days' });
    expect(within(themes).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Worry and thoughts: 2 reflections', 'Body and sleep: 1 reflection']);
    expect(section).toHaveTextContent('A count, not a score');
    expect(section).not.toHaveTextContent(/out of|severity|Minimal|Severe/);
  });

  it('counts themes over the whole 30 days, fetching past the first page, and opens a listed one without another request', async () => {
    const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
    const row = (id: string, takenAt: string, q: string) => ({ id, takenAt, answers: [{ q, a: 3 }, { q: 'REF-021', a: 0 }, { q: 'REF-041', a: 0 }, { q: 'REF-061', a: 0 }, { q: 'REF-081', a: 0 }] });
    mockFetch({
      'GET /assessments': { body: { items: [], nextCursor: null } },
      [`GET /moods?from=${addDays(today, -29)}&to=${today}`]: { body: { items: [] } },
      'GET /reflections': { body: { items: [row('66666666-6666-4666-8666-666666666661', day(1), 'REF-001')], nextCursor: 'next' } },
      'GET /reflections?cursor=next': { body: { items: [row('66666666-6666-4666-8666-666666666662', day(10), 'REF-002'), row('66666666-6666-4666-8666-666666666663', day(40), 'REF-003')], nextCursor: 'later' } },
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderRoutes([{ path: '/trends', element: <Trends /> }], '/trends', client);
    const themes = await screen.findByRole('list', { name: 'Themes that came up most in the last 30 days' });
    await waitFor(() => expect(within(themes).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Worry and thoughts: 2 reflections']));
    expect(client.getQueryData(['reflections', 'one', '66666666-6666-4666-8666-666666666661'])).toMatchObject({ id: '66666666-6666-4666-8666-666666666661' });
  });
});
