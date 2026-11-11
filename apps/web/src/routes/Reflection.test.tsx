import { REFLECTION_OPTIONS, REFLECTION_QUESTIONS, questionById, type Reflection } from '@anxiocare/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryClient } from '@/lib/queries';
import { loadReflection, loadReflectionResult, saveReflection, saveReflectionResult, startReflection } from '@/lib/reflection-store';
import { RequireAccount } from '@/shell/Guards';
import { ME, mockFetch, problem, renderRoutes } from '@/test/render';
import { CheckInChoice, CheckInIntro } from './CheckIn';
import { GuestReflectionPage, ReflectionStep, SavedReflectionPage } from './Reflection';

const routes = [
  { path: '/', element: <p>Home</p> },
  { path: '/help', element: <p>Help page</p> },
  { path: '/check-in', element: <CheckInChoice /> },
  { path: '/check-in/gad7', element: <CheckInIntro /> },
  { path: '/reflection/result', element: <GuestReflectionPage /> },
  { path: '/reflection/:step', element: <ReflectionStep /> },
  { path: '/sign-in', element: <p>Sign-in page</p> },
  { path: '*', element: <p>Elsewhere</p> },
  { element: <RequireAccount />, children: [{ path: '/reflections/:id', element: <SavedReflectionPage /> }] },
];

const IDS = ['REF-001', 'REF-021', 'REF-041', 'REF-061', 'REF-081'];
const HELP = REFLECTION_QUESTIONS.find((q) => q.bringsHelp && q.theme === 'worry')!;
const label = (value: number) => REFLECTION_OPTIONS[value]!.label;
const text = (id: string) => questionById(id)!.text;

beforeEach(() => {
  sessionStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  queryClient.clear();
});

/** Answers whatever five questions are on screen, in turn, then the note. */
async function answerFive(user: ReturnType<typeof userEvent.setup>, values: number[], note = '') {
  const asked: string[] = [];
  for (const value of values) {
    const heading = await screen.findByRole('heading', { level: 1, name: (name) => REFLECTION_QUESTIONS.some((q) => q.text === name && !asked.includes(q.id)) });
    asked.push(REFLECTION_QUESTIONS.find((q) => q.text === heading.textContent)!.id);
    await user.click(screen.getByRole('button', { name: label(value) }));
  }
  const box = await screen.findByLabelText('Anything else on your mind? (optional)');
  if (note) await user.type(box, note);
  await user.click(screen.getByRole('button', { name: 'See your reflection' }));
  return asked;
}

describe('the start of a check-in', () => {
  it('asks what you would like to do, and offers the two choices with what each one is', async () => {
    mockFetch({});
    renderRoutes(routes, '/check-in', queryClient);
    expect(await screen.findByRole('heading', { level: 1, name: 'What would you like to do?' })).toBeInTheDocument();
    const gad7 = screen.getByRole('link', { name: /Anxiety check \(GAD-7\)/ });
    expect(gad7).toHaveAttribute('href', '/check-in/gad7');
    expect(gad7).toHaveTextContent('7 questions, the same each time. Gives a score you can track and share with a doctor. About 2 minutes.');
    const reflection = screen.getByRole('button', { name: /Reflection/ });
    expect(reflection).toHaveTextContent("5 questions, different each time, to notice how you're doing. No score. About 2 minutes.");
  });

  it('the GAD-7 choice leads to the same check-in as before', async () => {
    const user = userEvent.setup();
    mockFetch({});
    renderRoutes(routes, '/check-in', queryClient);
    await user.click(await screen.findByRole('link', { name: /Anxiety check \(GAD-7\)/ }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Seven questions about the last two weeks' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Begin' })).toBeInTheDocument();
  });
});

describe('a reflection, as a guest', () => {
  it('asks one question per screen, one from each theme, then the note, then shows a result with no score', async () => {
    const user = userEvent.setup();
    mockFetch({});
    renderRoutes(routes, '/check-in', queryClient);
    await user.click(await screen.findByRole('button', { name: /Reflection/ }));
    expect(await screen.findByRole('progressbar', { name: 'Question 1 of 5' })).toBeInTheDocument();
    const asked = await answerFive(user, [2, 3, 0, 2, 0], 'Exam on Monday');
    expect(asked.map((id) => questionById(id)!.theme)).toEqual(['worry', 'body', 'situations', 'coping', 'connection']);

    expect(await screen.findByRole('heading', { level: 1, name: 'Your reflection' })).toBeInTheDocument();
    expect(screen.getByText('Worry and how your body felt came up today.')).toBeInTheDocument();
    expect(screen.getByText('Things you did for yourself helped.')).toBeInTheDocument();
    expect(screen.getByText('This is a reflection, not a test or a diagnosis.')).toBeInTheDocument();
    expect(screen.queryByText(/out of|score|range|minimal|mild|moderate|severe/i)).not.toBeInTheDocument();
    const answers = screen.getByRole('list', { name: 'Your answers' });
    for (const id of asked) expect(within(answers).getByText(text(id))).toBeInTheDocument();
    expect(screen.getByText('Exam on Monday')).toBeInTheDocument();
    // Matched suggestions: breathing for the body. A guest can't keep a journal, so grounding for worry.
    expect(screen.getByRole('link', { name: 'slow breathing' })).toHaveAttribute('href', '/tools/breathe');
    expect(screen.getByRole('link', { name: 'Sign in to save' })).toHaveAttribute('href', '/sign-in?next=%2Freflection%2Fresult');
    expect(loadReflection()).toBeNull();
    expect(loadReflectionResult()!.answers.map((a) => a.q)).toEqual(asked);
    const stored = Array.from({ length: sessionStorage.length }, (_, i) => sessionStorage.getItem(sessionStorage.key(i)!)).join(' ');
    expect(stored).toContain(asked[0]!);
    expect(stored).not.toContain(text(asked[0]!));
    expect(stored).not.toContain('Exam on Monday');
  });

  it('says something neutral when nothing stands out, and Get help stays where it is', async () => {
    const user = userEvent.setup();
    mockFetch({});
    saveReflection(startReflection(IDS));
    renderRoutes(routes, '/reflection/1', queryClient);
    await answerFive(user, [1, 0, 1, 1, 1]);
    expect(await screen.findByText('Nothing stood out strongly today.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Support is here if you want it' })).not.toBeInTheDocument();
  });

  it('a brings_help question answered "Quite a bit" or more brings Get help forward, calmly', async () => {
    const user = userEvent.setup();
    mockFetch({});
    saveReflection(startReflection([HELP.id, ...IDS.slice(1)]));
    renderRoutes(routes, '/reflection/1', queryClient);
    await answerFive(user, [2, 0, 0, 0, 0]);
    const panel = (await screen.findByRole('heading', { name: 'Support is here if you want it' })).closest('section')!;
    expect(within(panel).getByRole('link', { name: 'Call 14416' })).toHaveAttribute('href', 'tel:14416');
    expect(within(panel).getByRole('link', { name: 'Open your safety plan' })).toHaveAttribute('href', '/safety-plan');
    expect(within(panel).getByRole('link', { name: 'See all helplines' })).toHaveAttribute('href', '/help');
    expect(panel.textContent).not.toMatch(/emergency|danger|urgent|immediately/i);
  });

  it('a second reflection asks different questions from the first', async () => {
    const user = userEvent.setup();
    mockFetch({});
    const { router } = renderRoutes(routes, '/check-in', queryClient);
    await user.click(await screen.findByRole('button', { name: /Reflection/ }));
    const first = await answerFive(user, [1, 1, 1, 1, 1]);
    await screen.findByRole('heading', { level: 1, name: 'Your reflection' });
    await router.navigate('/check-in');
    await user.click(await screen.findByRole('button', { name: /Reflection/ }));
    const second = await answerFive(user, [1, 1, 1, 1, 1]);
    expect(second.filter((id) => first.includes(id))).toEqual([]);
  });

  it('resumes where you left off, and refuses to skip ahead by URL', async () => {
    mockFetch({});
    saveReflection({ ...startReflection(IDS), answers: [1, null, null, null, null] });
    const { router } = renderRoutes(routes, '/reflection/4', queryClient);
    await waitFor(() => expect(router.state.location.pathname).toBe('/reflection/2'));
    expect(await screen.findByRole('heading', { level: 1, name: text(IDS[1]!) })).toBeInTheDocument();
    await router.navigate('/reflection/note');
    await waitFor(() => expect(router.state.location.pathname).toBe('/reflection/2'));
  });

  it('keeps the note to 280 characters', async () => {
    const user = userEvent.setup();
    mockFetch({});
    saveReflection({ ...startReflection(IDS), answers: [1, 1, 1, 1, 1] });
    renderRoutes(routes, '/reflection/note', queryClient);
    const box = await screen.findByLabelText('Anything else on your mind? (optional)');
    expect(box).toHaveAttribute('maxlength', '280');
    await user.type(box, 'abc');
    expect(screen.getByText('277 characters left')).toBeInTheDocument();
  });
});

describe('a reflection, signed in', () => {
  const saved = (answers: { q: string; a: number }[], note?: string): Reflection => ({
    id: '66666666-6666-4666-8666-666666666661',
    takenAt: '2026-11-11T04:00:00.000Z',
    answers,
    ...(note ? { note } : {}),
  });

  it('leaves out the questions of the last three saved reflections, saves automatically, and lands on the saved one', async () => {
    const user = userEvent.setup();
    const recent = REFLECTION_QUESTIONS.filter((q) => ['001', '002', '003', '021', '022', '041', '061', '081'].some((n) => q.id.endsWith(n))).map((q) => q.id);
    let posted: { clientRequestId: string; answers: { q: string; a: number }[]; note?: string } | undefined;
    const { calls } = mockFetch({
      'GET /me': { body: ME },
      'GET /reflections?limit=3': { body: { items: [saved(recent.slice(0, 5).map((q) => ({ q, a: 1 }))), { ...saved(recent.slice(3).map((q) => ({ q, a: 1 }))), id: '66666666-6666-4666-8666-666666666662' }], nextCursor: null } },
      'POST /reflections': (body) => {
        posted = body as typeof posted;
        return { status: 201, body: saved(posted!.answers, posted!.note) };
      },
      'GET /reflections': () => ({ body: { items: posted ? [saved(posted.answers, posted.note)] : [], nextCursor: null } }),
    });
    const { router } = renderRoutes(routes, '/check-in', queryClient);
    await waitFor(() => expect(queryClient.getQueryData(['me'])).toBeTruthy());
    await user.click(await screen.findByRole('button', { name: /Reflection/ }));
    const asked = await answerFive(user, [3, 0, 0, 0, 0], 'My note');
    for (const id of recent) expect(asked).not.toContain(id);
    await waitFor(() => expect(router.state.location.pathname).toBe('/reflections/66666666-6666-4666-8666-666666666661'));
    expect(posted).toMatchObject({ answers: asked.map((q, i) => ({ q, a: [3, 0, 0, 0, 0][i] })), note: 'My note' });
    expect(calls.some((c) => c.key === 'POST /reflections')).toBe(true);
    expect(await screen.findByRole('heading', { level: 1, name: 'Your reflection' })).toBeInTheDocument();
    expect(screen.getByText(text(asked[0]!))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete this reflection' })).toBeInTheDocument();
    expect(loadReflectionResult()).toBeNull();
  });

  it('if saving fails, keeps it in the tab and offers to save it', async () => {
    const user = userEvent.setup();
    mockFetch({ 'GET /me': { body: ME }, 'GET /reflections?limit=3': { body: { items: [], nextCursor: null } }, 'POST /reflections': problem(500, 'internal_error') });
    saveReflection(startReflection(IDS));
    renderRoutes(routes, '/reflection/1', queryClient);
    await waitFor(() => expect(queryClient.getQueryData(['me'])).toBeTruthy());
    await answerFive(user, [1, 1, 1, 1, 1]);
    expect(await screen.findByRole('button', { name: 'Save reflection' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/couldn't save this just now/);
    expect(loadReflectionResult()).not.toBeNull();
  });

  it('after signing in, saving a guest reflection posts its original clientRequestId and takenAt', async () => {
    const user = userEvent.setup();
    const takenAt = new Date().toISOString();
    const answers = IDS.map((q) => ({ q, a: 2 }));
    saveReflectionResult({ clientRequestId: '55555555-5555-4555-8555-555555555555', answers, note: 'kept', takenAt });
    const { calls } = mockFetch({
      'GET /me': { body: ME },
      'POST /reflections': { status: 201, body: saved(answers, 'kept') },
      [`GET /reflections/${saved(answers).id}`]: { body: saved(answers, 'kept') },
    });
    const { router } = renderRoutes(routes, '/reflection/result', queryClient);
    await user.click(await screen.findByRole('button', { name: 'Save reflection' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/reflections/66666666-6666-4666-8666-666666666661'));
    expect(calls.find((c) => c.key === 'POST /reflections')!.body).toEqual({ clientRequestId: '55555555-5555-4555-8555-555555555555', answers, note: 'kept', takenAt });
    expect(loadReflectionResult()).toBeNull();
  });

  it('a saved reflection that is not there is a 404 page', async () => {
    mockFetch({ 'GET /me': { body: ME }, 'GET /reflections/66666666-6666-4666-8666-666666666669': problem(404, 'not_found') });
    renderRoutes(routes, '/reflections/66666666-6666-4666-8666-666666666669', queryClient);
    expect(await screen.findByRole('heading', { level: 1, name: "There's nothing at this address" })).toBeInTheDocument();
  });

  it('deleting a saved reflection goes to Trends without asking for the deleted one again', async () => {
    const user = userEvent.setup();
    const one = saved(IDS.map((q) => ({ q, a: 1 })));
    const { calls } = mockFetch({ 'GET /me': { body: ME }, [`GET /reflections/${one.id}`]: { body: one }, [`DELETE /reflections/${one.id}`]: { status: 204 } });
    const { router } = renderRoutes([...routes, { path: '/trends', element: <p>Trends page</p> }], `/reflections/${one.id}`, queryClient);
    await user.click(await screen.findByRole('button', { name: 'Delete this reflection' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete reflection' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/trends'));
    await new Promise((r) => setTimeout(r, 50));
    expect(calls.filter((c) => c.key === `GET /reflections/${one.id}`)).toHaveLength(1);
  });

  it('opening a saved reflection asks for that one only, never pages through the list', async () => {
    const one = saved(IDS.map((q) => ({ q, a: 1 })), 'one note');
    const { calls } = mockFetch({ 'GET /me': { body: ME }, [`GET /reflections/${one.id}`]: { body: one } });
    renderRoutes(routes, `/reflections/${one.id}`, queryClient);
    expect(await screen.findByText('one note')).toBeInTheDocument();
    expect(calls.filter((c) => c.key.startsWith('GET /reflections')).map((c) => c.key)).toEqual([`GET /reflections/${one.id}`]);
  });
});
