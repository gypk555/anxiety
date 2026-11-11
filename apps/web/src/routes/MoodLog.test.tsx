import { addDays } from '@anxiocare/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { earliestMoodDay, todayLocal } from '@/lib/mood';
import { mockFetch, renderRoutes } from '@/test/render';
import MoodLog from './MoodLog';

afterEach(() => vi.unstubAllGlobals());

const today = todayLocal();
const yesterday = addDays(today, -1);
const at = '2026-11-01T04:00:00.000Z';
const entry = (day: string, rating: number, note = '') => ({ day, rating, note, createdAt: at, updatedAt: at });
const range = `GET /moods?from=${addDays(today, -365)}&to=${today}`;

describe('mood log page', () => {
  it('lists logged days newest first, in words, with the chart and its table', async () => {
    mockFetch({ [range]: { body: { items: [entry(addDays(today, -3), 2, 'Hard week'), entry(yesterday, 4)] } } });
    renderRoutes([{ path: '/mood', element: <MoodLog /> }], '/mood');
    expect(await screen.findByRole('heading', { level: 1, name: 'Your mood log' })).toBeInTheDocument();
    const list = await screen.findByRole('list', { name: 'Days you logged' });
    const items = within(list).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Good');
    expect(items[1]).toHaveTextContent('Low');
    expect(items[1]).toHaveTextContent('Hard week');
    expect(screen.getByRole('heading', { name: 'Your daily mood log, not a test score' })).toBeInTheDocument();
  });

  it('changes a past day, which updates that day, not today', async () => {
    const user = userEvent.setup();
    const { calls } = mockFetch({
      [range]: { body: { items: [entry(yesterday, 4)] } },
      [`PUT /moods/${yesterday}`]: (body) => ({ body: entry(yesterday, (body as { rating: number }).rating) }),
    });
    renderRoutes([{ path: '/mood', element: <MoodLog /> }], '/mood');
    await user.click(await screen.findByRole('button', { name: /^Change/ }));
    const sheet = screen.getByRole('dialog');
    await user.click(within(sheet).getByRole('button', { name: 'Very low' }));
    await user.click(within(sheet).getByRole('button', { name: 'Save' }));
    expect(calls.find((c) => c.key === `PUT /moods/${yesterday}`)?.body).toEqual({ rating: 1, note: '' });
  });

  it('deletes a day after asking', async () => {
    const user = userEvent.setup();
    const { calls } = mockFetch({ [range]: { body: { items: [entry(yesterday, 4)] } }, [`DELETE /moods/${yesterday}`]: { status: 204 } });
    renderRoutes([{ path: '/mood', element: <MoodLog /> }], '/mood');
    await user.click(await screen.findByRole('button', { name: /^Change/ }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete this day' }));
    expect(calls.some((c) => c.key === `DELETE /moods/${yesterday}`)).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Yes, delete it' }));
    expect(calls.some((c) => c.key === `DELETE /moods/${yesterday}`)).toBe(true);
  });

  it('can log a day that was missed, but never a future day or more than 366 days back', async () => {
    const user = userEvent.setup();
    mockFetch({ [range]: { body: { items: [] } } });
    renderRoutes([{ path: '/mood', element: <MoodLog /> }], '/mood');
    await user.click(await screen.findByRole('button', { name: 'Log another day' }));
    const date = within(screen.getByRole('dialog')).getByLabelText('Which day');
    expect(date).toHaveAttribute('max', today);
    expect(date).toHaveAttribute('min', earliestMoodDay(today));
    await user.clear(date);
    await user.type(date, addDays(today, 1));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Okay' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }));
    expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent(/today or a day in the past year/);
  });

  it('an empty log invites, and never scolds', async () => {
    mockFetch({ [range]: { body: { items: [] } } });
    renderRoutes([{ path: '/mood', element: <MoodLog /> }], '/mood');
    expect(await screen.findByText(/Nothing logged yet/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/streak|missed|in a row/i);
  });
});
