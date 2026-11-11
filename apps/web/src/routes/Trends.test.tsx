import { addDays } from '@anxiocare/shared';
import { screen, within } from '@testing-library/react';
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
});
