import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, Outlet } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearDrafts, getDraft, NEW_DRAFT } from '@/lib/drafts';
import { queryClient } from '@/lib/queries';
import { mockFetch, problem, renderRoutes } from '@/test/render';
import { JournalNew } from './JournalForm';

const routes = [
  {
    element: (
      <>
        <Link to="/help">Get help</Link>
        <Link to="/journal/new">Back to draft</Link>
        <Outlet />
      </>
    ),
    children: [
      { path: '/help', element: <p>Help page</p> },
      { path: '/journal', element: <p>Journal list</p> },
      { path: '/journal/new', element: <JournalNew /> },
      { path: '/journal/:id', element: <p>Entry page</p> },
    ],
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
  queryClient.clear();
  clearDrafts();
});

const ENTRY = {
  id: '33333333-3333-4333-8333-333333333331',
  situation: 'At work',
  thought: 'I will fail',
  feelings: [],
  intensityBefore: 5,
  evidenceFor: '',
  evidenceAgainst: '',
  balancedThought: '',
  intensityAfter: null,
  createdAt: '2026-11-03T16:00:00.000Z',
  updatedAt: '2026-11-03T16:00:00.000Z',
};

describe('thought record form', () => {
  it('asks for the required parts kindly before moving on', async () => {
    const user = userEvent.setup();
    mockFetch({});
    renderRoutes(routes, '/journal/new', queryClient);
    await user.click(await screen.findByRole('button', { name: 'Next' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/a few words/);
    expect(screen.getByRole('textbox', { name: 'What happened?' })).toHaveAttribute('aria-invalid', 'true');
  });

  it('keeps the draft in memory while navigating away and back, and never in storage', async () => {
    const user = userEvent.setup();
    mockFetch({});
    renderRoutes(routes, '/journal/new', queryClient);
    await user.type(await screen.findByRole('textbox', { name: 'What happened?' }), 'At work');
    await user.click(screen.getByRole('link', { name: 'Get help' }));
    await screen.findByText('Help page');
    await user.click(screen.getByRole('link', { name: 'Back to draft' }));
    expect(await screen.findByRole('textbox', { name: 'What happened?' })).toHaveValue('At work');
    expect(sessionStorage.length).toBe(0);
    expect(localStorage.length).toBe(0);
  });

  it('warns before discarding, in the app, and only then drops the draft', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm');
    mockFetch({});
    const { router } = renderRoutes(routes, '/journal/new', queryClient);
    await user.type(await screen.findByRole('textbox', { name: 'What happened?' }), 'At work');
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByRole('heading', { name: 'Discard this thought record?' })).toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Keep writing' }));
    expect(getDraft(NEW_DRAFT)?.values.situation).toBe('At work');

    await user.click(screen.getByRole('button', { name: 'Close' }));
    await user.click(screen.getByRole('button', { name: 'Discard draft' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/journal'));
    expect(getDraft(NEW_DRAFT)).toBeUndefined();
  });

  it('leaves without asking when nothing was written', async () => {
    const user = userEvent.setup();
    mockFetch({});
    const { router } = renderRoutes(routes, '/journal/new', queryClient);
    await user.click(await screen.findByRole('button', { name: 'Close' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/journal'));
  });

  it('walks all five steps and saves the shared body shape', async () => {
    const user = userEvent.setup();
    const { calls } = mockFetch({ 'POST /journal': { status: 201, body: ENTRY } });
    const { router } = renderRoutes(routes, '/journal/new', queryClient);
    await user.type(await screen.findByRole('textbox', { name: 'What happened?' }), 'At work');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.type(await screen.findByRole('textbox', { name: 'What went through your mind?' }), 'I will fail');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(await screen.findByRole('button', { name: 'Anxious' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(await screen.findByRole('button', { name: 'Next' }));
    await user.click(await screen.findByRole('button', { name: 'Save thought record' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/journal/${ENTRY.id}`));
    expect(calls.find((c) => c.key === 'POST /journal')!.body).toEqual({
      situation: 'At work',
      thought: 'I will fail',
      feelings: ['Anxious'],
      intensityBefore: 5,
      evidenceFor: '',
      evidenceAgainst: '',
      balancedThought: '',
      intensityAfter: null,
    });
    expect(getDraft(NEW_DRAFT)).toBeUndefined();
  });

  it('keeps the draft and says so when saving fails', async () => {
    const user = userEvent.setup();
    mockFetch({ 'POST /journal': problem(500, 'internal_error') });
    renderRoutes(routes, '/journal/new', queryClient);
    await user.type(await screen.findByRole('textbox', { name: 'What happened?' }), 'At work');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.type(await screen.findByRole('textbox', { name: 'What went through your mind?' }), 'I will fail');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(await screen.findByRole('button', { name: 'Next' }));
    await user.click(await screen.findByRole('button', { name: 'Next' }));
    await user.click(await screen.findByRole('button', { name: 'Save thought record' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/draft is safe/);
    expect(getDraft(NEW_DRAFT)?.values.thought).toBe('I will fail');
  });
});
