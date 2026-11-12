import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { moodsKey, todayLocal } from '@/lib/mood';
import { mockFetch, renderRoutes } from '@/test/render';
import { MoodCard } from './MoodCard';

afterEach(() => vi.unstubAllGlobals());

const routes = [{ path: '/', element: <MoodCard /> }, { path: '/mood', element: <p>Mood log page</p> }];
const today = todayLocal();
const entry = (rating: number, note = '') => ({ day: today, rating, note, createdAt: '2026-11-11T04:00:00.000Z', updatedAt: '2026-11-11T04:00:00.000Z' });

/** A server that remembers the last save, the way the real one does, so a refetch after saving sees it. */
const server = (initial: ReturnType<typeof entry> | null) => {
  let stored = initial;
  return {
    [`GET /moods?from=${today}&to=${today}`]: () => ({ body: { items: stored ? [stored] : [] } }),
    [`PUT /moods/${today}`]: (body: unknown) => {
      const b = body as { rating: number; note: string };
      stored = entry(b.rating, b.note);
      return { body: stored };
    },
  };
};

describe('mood card on Home', () => {
  const card = () => screen.findByRole('group', { name: 'How are you today?' });

  it('one tap saves today, by the phone\'s own date, with no note', async () => {
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
    const group = await card();
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['Very low', 'Low', 'Okay', 'Good', 'Very good']);
    expect(screen.queryByRole('button', { name: 'Save for today' })).not.toBeInTheDocument();
    await user.click(within(group).getByRole('button', { name: 'Okay' }));
    expect(await screen.findByText("You're feeling okay")).toBeInTheDocument();
    expect(screen.getAllByText('Saved for today').length).toBeGreaterThan(0);
    expect(calls.filter((c) => c.key === `PUT /moods/${today}`).map((c) => c.body)).toEqual([{ rating: 3, note: '' }]);
  });

  it('a second tap while saving is ignored', async () => {
    const user = userEvent.setup();
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const { calls } = mockFetch(server(null));
    const base = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      if (init?.method === 'PUT') {
        await gate;
        return base(url as string, init);
      }
      return base(url as string, init);
    });
    renderRoutes(routes, '/');
    const group = await card();
    await user.click(within(group).getByRole('button', { name: 'Low' }));
    await user.click(within(group).getByRole('button', { name: 'Good' }));
    release();
    expect(await screen.findByText("You're feeling low")).toBeInTheDocument();
    expect(calls.filter((c) => c.key === `PUT /moods/${today}`).map((c) => (c.body as { rating: number }).rating)).toEqual([2]);
  });

  it('adds a note after saving, keeping the rating', async () => {
    const user = userEvent.setup();
    const { calls } = mockFetch(server(entry(4)));
    renderRoutes(routes, '/');
    await user.click(await screen.findByRole('button', { name: 'Add a note' }));
    await user.type(screen.getByLabelText('A note, if you like'), 'Slept badly');
    await user.click(screen.getByRole('button', { name: 'Save note' }));
    expect(calls.find((c) => c.key === `PUT /moods/${today}`)?.body).toEqual({ rating: 4, note: 'Slept badly' });
    expect(await screen.findByText('Slept badly')).toBeInTheDocument();
  });

  it('change reopens the scale with the saved choice pressed, keeps the note, with no streaks or reminders', async () => {
    const user = userEvent.setup();
    const { calls } = mockFetch(server(entry(2, 'Long day')));
    renderRoutes(routes, '/');
    expect(await screen.findByText("You're feeling low")).toBeInTheDocument();
    expect(screen.getByText('Long day')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/streak|in a row|missed/i);
    await user.click(screen.getByRole('button', { name: 'Change' }));
    const group = await card();
    expect(within(group).getByRole('button', { name: 'Low' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(group).getByRole('button', { name: 'Good' }));
    expect(await screen.findByText("You're feeling good")).toBeInTheDocument();
    expect(calls.filter((c) => c.key === `PUT /moods/${today}`).map((c) => c.body)).toEqual([{ rating: 4, note: 'Long day' }]);
  });

  it('keeps the choice when saving fails, says so, and lets the person try again', async () => {
    const user = userEvent.setup();
    mockFetch({
      [`GET /moods?from=${today}&to=${today}`]: { body: { items: [] } },
      [`PUT /moods/${today}`]: { status: 500, body: { type: 'x', title: 'x', status: 500, code: 'internal_error' } },
    });
    renderRoutes(routes, '/');
    await user.click(await screen.findByRole('button', { name: 'Very low' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/went wrong/);
    expect(screen.getByRole('button', { name: 'Very low' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Low' })).toBeEnabled();
  });

  it('links to the mood log, before and after saving', async () => {
    mockFetch({ [`GET /moods?from=${today}&to=${today}`]: { body: { items: [] } } });
    const first = renderRoutes(routes, '/');
    expect(await screen.findByRole('link', { name: 'Mood log' })).toHaveAttribute('href', '/mood');
    first.unmount();
    mockFetch({ [`GET /moods?from=${today}&to=${today}`]: { body: { items: [entry(3)] } } });
    renderRoutes(routes, '/');
    expect(await screen.findByRole('link', { name: 'Mood log' })).toHaveAttribute('href', '/mood');
  });

  it('once saved, the mood log link sits up by "Saved for today", before the buttons', async () => {
    mockFetch(server(entry(3)));
    renderRoutes(routes, '/');
    const heading = await screen.findByRole('heading', { name: "You're feeling okay" });
    const link = screen.getByRole('link', { name: 'Mood log' });
    const addNote = screen.getByRole('button', { name: 'Add a note' });
    expect(heading.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    expect(link.compareDocumentPosition(addNote) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('compact Change starts from the saved word', async () => {
    mockFetch(server(entry(4)));
    renderRoutes([{ path: '/', element: <MoodCard compact /> }], '/');
    await userEvent.click(await screen.findByRole('button', { name: 'Change' }));
    expect(within(await card()).getByRole('button', { name: 'Good' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('after one tap, says "Saved for today" in a live region that was already there, and moves focus to the result', async () => {
    mockFetch(server(null));
    renderRoutes(routes, '/');
    const group = await card();
    const live = document.querySelector('[aria-live="polite"]');
    expect(live).not.toBeNull();
    expect(live).toHaveTextContent('');
    await userEvent.click(within(group).getByRole('button', { name: 'Okay' }));
    const heading = await screen.findByRole('heading', { name: "You're feeling okay" });
    expect(document.querySelector('[aria-live="polite"]')).toBe(live);
    expect(live).toHaveTextContent('Saved for today');
    expect(heading).toHaveFocus();
  });

  it('a save that lands after the data was cleared (sign-out, quick exit) does not put the mood back', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    mockFetch(server(null));
    const base = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      if (init?.method === 'PUT') await gate;
      return base(url as string, init);
    });
    const { queryClient: client, unmount } = renderRoutes(routes, '/');
    await userEvent.click(within(await card()).getByRole('button', { name: 'Low' }));
    unmount();
    client.clear();
    release();
    await new Promise((r) => setTimeout(r, 50));
    expect(client.getQueryData([...moodsKey, today, today])).toBeUndefined();
  });

  it('compact, once saved, is one line with a way to change it', async () => {
    mockFetch({ [`GET /moods?from=${today}&to=${today}`]: { body: { items: [entry(4)] } } });
    renderRoutes([{ path: '/', element: <MoodCard compact /> }], '/');
    expect(await screen.findByText('Today you said')).toBeInTheDocument();
    expect(screen.getByText('Good')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add a note' })).not.toBeInTheDocument();
  });
});

describe('todayLocal', () => {
  it("is the phone's calendar day, not UTC", () => {
    // 23:30 on 11 Nov in India is 18:00 UTC: still the 11th. 00:30 on 12 Nov in India is 19:00 UTC on the 11th.
    const at = new Date(2026, 10, 12, 0, 30);
    expect(todayLocal(at)).toBe('2026-11-12');
  });
});
