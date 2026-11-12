import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { queryClient } from '@/lib/queries';
import { loadReflection, saveReflection, saveReflectionResult, startReflection } from '@/lib/reflection-store';
import { todayLocal } from '@/lib/mood';
import { ME, mockFetch, renderRoutes } from '@/test/render';
import Consent from './Consent';
import { Home } from './Home';

const routes = [
  { path: '/', element: <Home /> },
  { path: '/consent', element: <Consent /> },
  { path: '/settings', element: <p>Settings page</p> },
  { path: '/privacy', element: <p>Privacy page</p> },
  { path: '/terms', element: <p>Terms page</p> },
  { path: '/sign-in', element: <p>Sign-in page</p> },
  { path: '/reflection/:step', element: <p>Reflection page</p> },
];

const DAY = 24 * 60 * 60 * 1000;
const assessment = (daysAgo: number) => ({
  id: '22222222-2222-4222-8222-222222222221',
  takenAt: new Date(Date.now() - daysAgo * DAY).toISOString(),
  answers: [2, 2, 1, 1, 2, 1, 1],
  difficulty: 1,
  score: 10,
  severity: 'moderate',
});
const signedIn = (items: ReturnType<typeof assessment>[]) =>
  mockFetch({
    'GET /me': { body: ME },
    'GET /assessments': { body: { items, nextCursor: null } },
    [`GET /moods?from=${todayLocal()}&to=${todayLocal()}`]: { body: { items: [] } },
    'GET /reflections': { body: { items: [], nextCursor: null } },
  });
const headings = () => screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);

afterEach(() => {
  vi.unstubAllGlobals();
  queryClient.clear();
});

describe('Home', () => {
  it('sends someone whose consent is out of date to the prompt, not to a screen that looks signed out', async () => {
    mockFetch({ 'GET /me': { body: { ...ME, consentRequired: true, acceptedConsentVersion: '2000-01-01' } } });
    const { router } = renderRoutes(routes, '/', queryClient);
    expect(await screen.findByRole('heading', { level: 1, name: "We've updated our privacy notice" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/consent');
    expect(screen.queryByText('Sign in to see saved results')).not.toBeInTheDocument();
  });

  it('sends someone who has never consented to the prompt', async () => {
    mockFetch({ 'GET /me': { body: { ...ME, consentRequired: true, acceptedConsentVersion: null } } });
    renderRoutes(routes, '/', queryClient);
    expect(await screen.findByRole('heading', { level: 1, name: 'Before we save anything' })).toBeInTheDocument();
  });

  it('a guest stays on the first-run screen', async () => {
    mockFetch({});
    renderRoutes(routes, '/', queryClient);
    expect(await screen.findByRole('link', { name: /Anxiety check \(GAD-7\)/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in');
    expect(screen.getByRole('link', { name: 'Create account' })).toHaveAttribute('href', '/create-account');
  });

  it('first run offers both check-ins and breathing', async () => {
    mockFetch({});
    renderRoutes(routes, '/', queryClient);
    expect(await screen.findByRole('link', { name: /Anxiety check \(GAD-7\)/ })).toHaveAttribute('href', '/check-in/gad7');
    expect(screen.getByRole('button', { name: /Reflection/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Overwhelmed\? Breathe first/ })).toHaveAttribute('href', '/tools/breathe');
  });

  it('Reflection on Home picks its questions and starts at the first one', async () => {
    mockFetch({});
    sessionStorage.clear();
    const { router } = renderRoutes(routes, '/', queryClient);
    await userEvent.click(await screen.findByRole('button', { name: /Reflection/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/reflection/1'));
    expect(loadReflection()?.answers).toEqual([null, null, null, null, null]);
    sessionStorage.clear();
  });

  it('not due: leads with the mood question, then tools, check-ins and your space', async () => {
    signedIn([assessment(3)]);
    renderRoutes(routes, '/', queryClient);
    await screen.findByRole('group', { name: 'How are you today?' });
    await screen.findByRole('heading', { name: 'Your check-ins' });
    expect(headings()).toEqual(['How are you today?', 'For right now', 'Your check-ins', 'Your space']);
    expect(screen.getByText('Moderate, 10 out of 21')).toBeInTheDocument();
  });

  it('due: leads with Time for a check-in, offering both kinds', async () => {
    signedIn([assessment(15)]);
    renderRoutes(routes, '/', queryClient);
    expect(await screen.findByRole('heading', { name: 'Time for a check-in' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Anxiety check \(GAD-7\)/ })).toHaveAttribute('href', '/check-in/gad7');
    expect(screen.getByRole('button', { name: /Reflection/ })).toBeInTheDocument();
    expect(screen.getByText(/Last time: Moderate, 10 out of 21/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Your check-ins' })).not.toBeInTheDocument();
    expect(headings()[0]).toBe('Time for a check-in');
  });

  it('no check-in yet counts as due, with first-time wording', async () => {
    signedIn([]);
    renderRoutes(routes, '/', queryClient);
    expect(await screen.findByRole('heading', { name: 'Time for a check-in' })).toBeInTheDocument();
    expect(screen.getByText('Your first check-in')).toBeInTheDocument();
    expect(screen.queryByText(/Last time/)).not.toBeInTheDocument();
  });

  it('the mood card keeps its state when Home learns a check-in is due', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    mockFetch({
      'GET /me': { body: ME },
      'GET /assessments': { body: { items: [assessment(15)], nextCursor: null } },
      [`GET /moods?from=${todayLocal()}&to=${todayLocal()}`]: { body: { items: [] } },
      [`PUT /moods/${todayLocal()}`]: { status: 500, body: { type: 'x', title: 'x', status: 500, code: 'internal_error' } },
    });
    const base = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      if (String(url).includes('/assessments')) await gate;
      return base(url as string, init);
    });
    renderRoutes(routes, '/', queryClient);
    await userEvent.click(within(await screen.findByRole('group', { name: 'How are you today?' })).getByRole('button', { name: 'Low' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/went wrong/);
    release();
    await screen.findByRole('heading', { name: 'Time for a check-in' });
    expect(screen.getByRole('alert')).toHaveTextContent(/went wrong/);
    expect(screen.getByRole('button', { name: 'Low' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('your space links to the safety plan, mood log and doctor report', async () => {
    signedIn([assessment(3)]);
    renderRoutes(routes, '/', queryClient);
    await screen.findByRole('group', { name: 'How are you today?' });
    expect(screen.getByRole('link', { name: 'Safety plan' })).toHaveAttribute('href', '/safety-plan');
    expect(screen.getAllByRole('link', { name: 'Mood log' })).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: 'Mood log' }).every((l) => l.getAttribute('href') === '/mood')).toBe(true);
    expect(screen.getByRole('link', { name: 'Report for your doctor' })).toHaveAttribute('href', '/report');
  });

  it('a reflection left in the tab can be picked up again from Home', async () => {
    mockFetch({});
    sessionStorage.clear();
    saveReflection({ ...startReflection(['REF-001', 'REF-021', 'REF-041', 'REF-061', 'REF-081']), answers: [1, 2, null, null, null] });
    const first = renderRoutes(routes, '/', queryClient);
    expect(await screen.findByRole('link', { name: /Continue your reflection/ })).toHaveAttribute('href', '/reflection/3');
    first.unmount();
    saveReflectionResult({ clientRequestId: crypto.randomUUID(), answers: ['REF-001', 'REF-021', 'REF-041', 'REF-061', 'REF-081'].map((q) => ({ q, a: 1 })), takenAt: new Date().toISOString() });
    renderRoutes(routes, '/', queryClient);
    expect(await screen.findByRole('link', { name: /Your reflection is still here/ })).toHaveAttribute('href', '/reflection/result');
    sessionStorage.clear();
  });
});

describe('suggestions from stress factors', () => {
  const home = (profile: object) => {
    mockFetch({
      'GET /me': { body: { ...ME, profile } },
      'GET /assessments': { body: { items: [assessment(2)], nextCursor: null } },
      [`GET /moods?from=${todayLocal()}&to=${todayLocal()}`]: { body: { items: [] } },
      'GET /reflections': { body: { items: [], nextCursor: null } },
    });
    renderRoutes(routes, '/', queryClient);
  };

  it('suggests tools that fit what the person said, and says why', async () => {
    home({ stressFactors: ['sleep'] });
    const section = await screen.findByRole('region', { name: 'Tools that may help' });
    expect(within(section).getByText(/Because you mentioned sleep/)).toBeInTheDocument();
    expect(within(section).getByRole('link', { name: /Slow-exhale breathing/ })).toHaveAttribute('href', '/tools/breathe');
    expect(within(section).getByRole('link', { name: /Calming sounds/ })).toHaveAttribute('href', '/tools/sounds');
  });

  it('shows nothing extra without stress factors', async () => {
    home({});
    await screen.findByRole('heading', { name: 'For right now' });
    expect(screen.queryByRole('region', { name: 'Tools that may help' })).not.toBeInTheDocument();
  });
});
