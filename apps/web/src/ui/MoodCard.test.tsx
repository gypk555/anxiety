import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { todayLocal } from '@/lib/mood';
import { mockFetch, renderRoutes } from '@/test/render';
import { MoodCard } from './MoodCard';

afterEach(() => vi.unstubAllGlobals());

const routes = [{ path: '/', element: <MoodCard /> }, { path: '/mood', element: <p>Mood log page</p> }];
const today = todayLocal();
const entry = (rating: number, note = '') => ({ day: today, rating, note, createdAt: '2026-11-11T04:00:00.000Z', updatedAt: '2026-11-11T04:00:00.000Z' });

describe('mood card on Home', () => {
  it('asks how today is, in words on a 1-5 scale, and saves today by the phone\'s own date', async () => {
    const user = userEvent.setup();
    let stored: ReturnType<typeof entry> | null = null;
    const { calls } = mockFetch({
      [`GET /moods?from=${today}&to=${today}`]: () => ({ body: { items: stored ? [stored] : [] } }),
      [`PUT /moods/${today}`]: (body) => {
        stored = entry((body as { rating: number }).rating, (body as { note: string }).note);
        return { body: stored };
      },
    });
    renderRoutes(routes, '/');
    const group = await screen.findByRole('group', { name: 'How are you today?' });
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['Very low', 'Low', 'Okay', 'Good', 'Very good']);
    await user.click(within(group).getByRole('button', { name: 'Okay' }));
    expect(within(group).getByRole('button', { name: 'Okay' })).toHaveAttribute('aria-pressed', 'true');
    await user.type(screen.getByLabelText('A note, if you like'), 'Slept badly');
    await user.click(screen.getByRole('button', { name: 'Save for today' }));
    expect(calls.find((c) => c.key === `PUT /moods/${today}`)?.body).toEqual({ rating: 3, note: 'Slept badly' });
    expect(await screen.findByText(/Today you said/)).toBeInTheDocument();
  });

  it('once logged, shows it and lets the person change it, with no streaks or reminders', async () => {
    const user = userEvent.setup();
    const { calls } = mockFetch({
      [`GET /moods?from=${today}&to=${today}`]: { body: { items: [entry(2, 'Long day')] } },
      [`PUT /moods/${today}`]: (body) => ({ body: entry((body as { rating: number }).rating) }),
    });
    renderRoutes(routes, '/');
    expect(await screen.findByText('Low')).toBeInTheDocument();
    expect(screen.getByText('Long day')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/streak|in a row|missed/i);
    await user.click(screen.getByRole('button', { name: 'Change' }));
    await user.click(screen.getByRole('button', { name: 'Good' }));
    await user.click(screen.getByRole('button', { name: 'Save for today' }));
    expect(calls.filter((c) => c.key === `PUT /moods/${today}`)).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Your mood log' })).toHaveAttribute('href', '/mood');
  });

  it('keeps the choice when saving fails, and says so', async () => {
    const user = userEvent.setup();
    mockFetch({
      [`GET /moods?from=${today}&to=${today}`]: { body: { items: [] } },
      [`PUT /moods/${today}`]: { status: 500, body: { type: 'x', title: 'x', status: 500, code: 'internal_error' } },
    });
    renderRoutes(routes, '/');
    await user.click(await screen.findByRole('button', { name: 'Very low' }));
    await user.click(screen.getByRole('button', { name: 'Save for today' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/went wrong/);
    expect(screen.getByRole('button', { name: 'Very low' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('the save button needs a choice first', async () => {
    mockFetch({ [`GET /moods?from=${today}&to=${today}`]: { body: { items: [] } } });
    renderRoutes(routes, '/');
    expect(await screen.findByRole('button', { name: 'Save for today' })).toBeDisabled();
  });
});

describe('todayLocal', () => {
  it("is the phone's calendar day, not UTC", () => {
    // 23:30 on 11 Nov in India is 18:00 UTC: still the 11th. 00:30 on 12 Nov in India is 19:00 UTC on the 11th.
    const at = new Date(2026, 10, 12, 0, 30);
    expect(todayLocal(at)).toBe('2026-11-12');
  });
});
