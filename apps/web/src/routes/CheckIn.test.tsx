import { DIFFICULTY_STEM, GAD7_ATTRIBUTION, GAD7_ITEMS, GAD7_OPTIONS, GAD7_STEM, type Assessment } from '@anxiocare/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadCheckin, loadGuestResult } from '@/lib/guest';
import { queryClient } from '@/lib/queries';
import { RequireAccount } from '@/shell/Guards';
import { ME, mockFetch, problem, renderRoutes } from '@/test/render';
import { CheckInIntro, CheckInStep } from './CheckIn';
import { GuestResultPage, SavedResultPage } from './Result';

const routes = [
  { path: '/', element: <p>Home</p> },
  { path: '/help', element: <p>Help page</p> },
  { path: '/check-in', element: <CheckInIntro /> },
  { path: '/check-in/:step', element: <CheckInStep /> },
  { path: '/result', element: <GuestResultPage /> },
  { path: '/sign-in', element: <p>Sign-in page</p> },
  { element: <RequireAccount />, children: [{ path: '/result/:id', element: <SavedResultPage /> }] },
];

afterEach(() => {
  vi.unstubAllGlobals();
  queryClient.clear();
});

const answerAll = async (user: ReturnType<typeof userEvent.setup>, label: string) => {
  for (const item of GAD7_ITEMS) {
    await screen.findByRole('heading', { level: 1, name: item });
    await user.click(screen.getByRole('button', { name: label }));
  }
};

describe('check-in flow', () => {
  it('arrow keys move between the options, wrapping, and Space answers', async () => {
    const user = userEvent.setup();
    mockFetch({});
    renderRoutes(routes, '/check-in', queryClient);
    await user.click(await screen.findByRole('button', { name: 'Begin' }));
    await screen.findByRole('heading', { level: 1, name: GAD7_ITEMS[0] });
    const options = GAD7_OPTIONS.map((o) => screen.getByRole('button', { name: o.label }));
    options[0]!.focus();
    await user.keyboard('{ArrowDown}');
    expect(options[1]).toHaveFocus();
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(options[3]).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(options[0]).toHaveFocus();
    await user.keyboard('{ArrowLeft} ');
    expect(await screen.findByRole('heading', { level: 1, name: GAD7_ITEMS[1] })).toBeInTheDocument();
    expect(JSON.parse(sessionStorage.getItem('anxiocare.checkin.v1')!).answers[0]).toBe(3);
  });

  it('shows every GAD-7 item and option in the exact shared wording', async () => {
    const user = userEvent.setup();
    mockFetch({});
    renderRoutes(routes, '/check-in', queryClient);
    await user.click(await screen.findByRole('button', { name: 'Begin' }));
    for (const item of GAD7_ITEMS) {
      expect(await screen.findByRole('heading', { level: 1, name: item })).toBeInTheDocument();
      expect(screen.getByText(GAD7_STEM)).toBeInTheDocument();
      for (const o of GAD7_OPTIONS) expect(screen.getByRole('button', { name: o.label })).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Several days' }));
    }
    expect(await screen.findByRole('heading', { level: 1, name: DIFFICULTY_STEM })).toBeInTheDocument();
  });

  it('a guest reaches a scored result with no network calls for data, held in sessionStorage', async () => {
    const user = userEvent.setup();
    const { calls } = mockFetch({});
    renderRoutes(routes, '/check-in', queryClient);
    await user.click(await screen.findByRole('button', { name: 'Begin' }));
    await answerAll(user, 'More than half the days');
    await screen.findByRole('heading', { level: 1, name: DIFFICULTY_STEM });
    await user.click(screen.getByRole('button', { name: 'Very difficult' }));

    expect(await screen.findByRole('heading', { level: 1, name: /Moderate range/ })).toHaveTextContent('14 out of 21');
    expect(screen.getByText(/not a diagnosis/)).toBeInTheDocument();
    expect(screen.getByText(GAD7_ATTRIBUTION)).toBeInTheDocument();
    expect(calls.filter((c) => c.key.includes('/assessments'))).toEqual([]);
    expect(loadGuestResult()?.answers).toEqual([2, 2, 2, 2, 2, 2, 2]);
    expect(loadCheckin()).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it('skips the difficulty item when every answer is "Not at all"', async () => {
    const user = userEvent.setup();
    mockFetch({});
    renderRoutes(routes, '/check-in', queryClient);
    await user.click(await screen.findByRole('button', { name: 'Begin' }));
    await answerAll(user, 'Not at all');
    expect(await screen.findByRole('heading', { level: 1, name: /Minimal range/ })).toHaveTextContent('0 out of 21');
    expect(loadGuestResult()?.difficulty).toBeNull();
  });

  it('resumes where you left off, and refuses to skip ahead by URL', async () => {
    const user = userEvent.setup();
    mockFetch({});
    const { router } = renderRoutes(routes, '/check-in', queryClient);
    await user.click(await screen.findByRole('button', { name: 'Begin' }));
    await screen.findByRole('heading', { level: 1, name: GAD7_ITEMS[0] });
    await user.click(screen.getByRole('button', { name: 'Several days' }));
    await screen.findByRole('heading', { level: 1, name: GAD7_ITEMS[1] });

    await router.navigate('/check-in/5');
    await waitFor(() => expect(router.state.location.pathname).toBe('/check-in/2'));
    await screen.findByRole('heading', { level: 1, name: GAD7_ITEMS[1] });

    await router.navigate('/check-in');
    expect(await screen.findByRole('link', { name: 'Continue from question 2' })).toBeInTheDocument();
  });

  it('back returns to the previous question with its answer still selected', async () => {
    const user = userEvent.setup();
    mockFetch({});
    renderRoutes(routes, '/check-in', queryClient);
    await user.click(await screen.findByRole('button', { name: 'Begin' }));
    await screen.findByRole('heading', { level: 1, name: GAD7_ITEMS[0] });
    await user.click(screen.getByRole('button', { name: 'Nearly every day' }));
    await screen.findByRole('heading', { level: 1, name: GAD7_ITEMS[1] });
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await screen.findByRole('heading', { level: 1, name: GAD7_ITEMS[0] });
    expect(screen.getByRole('button', { name: 'Nearly every day' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('a signed-in person saves with the same clientRequestId and lands on the saved result', async () => {
    const user = userEvent.setup();
    const saved: Assessment = {
      id: '22222222-2222-4222-8222-222222222221',
      takenAt: '2026-11-06T04:00:00.000Z',
      answers: [1, 1, 1, 1, 1, 1, 1],
      difficulty: 1,
      score: 7,
      severity: 'mild',
    };
    const { calls } = mockFetch({
      'GET /me': { body: ME },
      'POST /assessments': { status: 201, body: saved },
      [`GET /assessments/${saved.id}`]: { body: saved },
    });
    renderRoutes(routes, '/check-in', queryClient);
    await user.click(await screen.findByRole('button', { name: 'Begin' }));
    await waitFor(() => expect(queryClient.getQueryData(['me'])).toBeTruthy());
    const id = loadCheckin()!.clientRequestId;
    await answerAll(user, 'Several days');
    await screen.findByRole('heading', { level: 1, name: DIFFICULTY_STEM });
    await user.click(screen.getByRole('button', { name: 'Somewhat difficult' }));
    expect(await screen.findByRole('heading', { level: 1, name: /Mild range/ })).toBeInTheDocument();
    const post = calls.find((c) => c.key === 'POST /assessments')!;
    expect(post.body).toMatchObject({ clientRequestId: id, answers: [1, 1, 1, 1, 1, 1, 1], difficulty: 1 });
    expect(loadGuestResult()).toBeNull();
  });

  it('keeps the result in the tab if saving fails, and offers to save it', async () => {
    const user = userEvent.setup();
    mockFetch({ 'GET /me': { body: ME }, 'POST /assessments': problem(500, 'internal_error') });
    renderRoutes(routes, '/check-in', queryClient);
    await user.click(await screen.findByRole('button', { name: 'Begin' }));
    await waitFor(() => expect(queryClient.getQueryData(['me'])).toBeTruthy());
    await answerAll(user, 'Several days');
    await screen.findByRole('heading', { level: 1, name: DIFFICULTY_STEM });
    await user.click(screen.getByRole('button', { name: 'Somewhat difficult' }));
    expect(await screen.findByRole('button', { name: 'Save result' })).toBeInTheDocument();
    expect(loadGuestResult()).not.toBeNull();
  });
});

describe('result by severity', () => {
  const seed = (answers: number[]) =>
    sessionStorage.setItem('anxiocare.result.v1', JSON.stringify({
      clientRequestId: '55555555-5555-4555-8555-555555555555',
      answers,
      difficulty: 3,
      takenAt: new Date().toISOString(),
    }));

  it('severe: helpline call first, and calm guidance on thoughts of self-harm', async () => {
    mockFetch({});
    seed([3, 3, 3, 2, 2, 3, 3]);
    renderRoutes(routes, '/result', queryClient);
    expect(await screen.findByRole('heading', { level: 1, name: /Severe range/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Call 14416' })).toHaveAttribute('href', 'tel:14416');
    expect(screen.getByRole('heading', { name: /thoughts of harming yourself/ })).toBeInTheDocument();
  });

  it('10 and over recommends a professional; below does not', async () => {
    mockFetch({});
    seed([2, 2, 2, 1, 1, 1, 1]);
    const first = renderRoutes(routes, '/result', queryClient);
    expect(await screen.findByText('Talk to a professional')).toBeInTheDocument();
    first.unmount();
    seed([1, 1, 1, 1, 1, 0, 0]);
    renderRoutes(routes, '/result', queryClient);
    await screen.findByRole('heading', { level: 1, name: /Mild range/ });
    expect(screen.queryByText('Talk to a professional')).not.toBeInTheDocument();
  });

  it('offers a guest sign-in to save, returning to the result', async () => {
    mockFetch({});
    seed([1, 1, 1, 1, 1, 0, 0]);
    renderRoutes(routes, '/result', queryClient);
    expect(await screen.findByRole('link', { name: 'Sign in to save' })).toHaveAttribute('href', '/sign-in?next=%2Fresult');
  });

  it('after sign-in, saving posts the original clientRequestId and takenAt', async () => {
    const user = userEvent.setup();
    const takenAt = new Date().toISOString();
    sessionStorage.setItem('anxiocare.result.v1', JSON.stringify({
      clientRequestId: '55555555-5555-4555-8555-555555555555',
      answers: [1, 1, 1, 1, 1, 0, 0],
      difficulty: 1,
      takenAt,
    }));
    const saved = { id: '22222222-2222-4222-8222-222222222221', takenAt, answers: [1, 1, 1, 1, 1, 0, 0], difficulty: 1, score: 5, severity: 'mild' };
    const { calls } = mockFetch({
      'GET /me': { body: ME },
      'POST /assessments': { status: 201, body: saved },
      [`GET /assessments/${saved.id}`]: { body: saved },
    });
    const { router } = renderRoutes(routes, '/result', queryClient);
    await user.click(await screen.findByRole('button', { name: 'Save result' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/result/${saved.id}`));
    expect(calls.find((c) => c.key === 'POST /assessments')!.body).toEqual({
      clientRequestId: '55555555-5555-4555-8555-555555555555',
      answers: [1, 1, 1, 1, 1, 0, 0],
      difficulty: 1,
      takenAt,
    });
    expect(loadGuestResult()).toBeNull();
  });

  it('a result older than the server allows gets a clear message', async () => {
    const user = userEvent.setup();
    seed([1, 1, 1, 1, 1, 0, 0]);
    mockFetch({ 'GET /me': { body: ME }, 'POST /assessments': problem(400, 'validation_failed') });
    renderRoutes(routes, '/result', queryClient);
    await user.click(await screen.findByRole('button', { name: 'Save result' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/more than a day old/);
  });
});
