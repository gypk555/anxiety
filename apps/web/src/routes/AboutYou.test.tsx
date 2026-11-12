import { type Me } from '@anxiocare/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { queryClient } from '@/lib/queries';
import { RequireAccount } from '@/shell/Guards';
import { ME, META, mockFetch, renderRoutes } from '@/test/render';
import AboutYou from './AboutYou';
import Name from './Name';
import { SignIn, SignInCode } from './SignIn';

const routes = [
  { path: '/about-you', element: <AboutYou /> },
  { path: '/name', element: <Name /> },
  { path: '/consent', element: <p>Consent page</p> },
  { path: '/sign-in', element: <SignIn /> },
  { path: '/sign-in/code', element: <SignInCode /> },
  { path: '/', element: <p>Home page</p> },
  { element: <RequireAccount />, children: [{ path: '/trends', element: <p>Trends page</p> }] },
];

const UNSEEN: Me = { ...ME, aboutSeen: false };

function account(start: Me) {
  let me = start;
  return mockFetch({
    'GET /me': () => ({ body: me }),
    'GET /meta': { body: META },
    'PATCH /me': (body) => {
      me = { ...me, ...(body as object) };
      return { body: me };
    },
    'PATCH /me/profile': (body) => {
      const kept = Object.entries(body as object).filter(([, v]) => v !== null && !(Array.isArray(v) && v.length === 0));
      me = { ...me, profile: Object.fromEntries(kept) as Me['profile'] };
      return { body: me };
    },
    'POST /me/about-seen': () => {
      me = { ...me, aboutSeen: true };
      return { body: me };
    },
    'POST /auth/otp/request': { status: 202 },
    'POST /auth/otp/verify': () => ({ body: me }),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  queryClient.clear();
});

describe('About you', () => {
  it('is all optional, with big choices, and Save keeps what was chosen and goes on', async () => {
    const user = userEvent.setup();
    const { calls } = account(UNSEEN);
    renderRoutes(routes, '/about-you?next=%2Ftrends', queryClient);
    expect(await screen.findByRole('heading', { level: 1, name: 'About you' })).toBeInTheDocument();
    expect(screen.getByText(/All optional\. It helps you choose what to put in a report for your doctor, and suggests tools that fit\. It's never used to compare you with anyone\./)).toBeInTheDocument();

    const avatars = screen.getByRole('radiogroup', { name: 'Avatar' });
    expect(within(avatars).getByRole('radio', { name: 'Your initial' })).toBeChecked();
    await user.click(within(avatars).getByRole('radio', { name: 'Gentle Leaf' }));
    await user.click(within(screen.getByRole('radiogroup', { name: 'Age range' })).getByRole('radio', { name: '25 to 34' }));
    await user.click(within(screen.getByRole('radiogroup', { name: 'What you do' })).getByRole('radio', { name: 'Student' }));
    const stress = screen.getByRole('group', { name: 'What tends to cause you stress?' });
    await user.click(within(stress).getByRole('checkbox', { name: 'Sleep' }));
    await user.click(within(stress).getByRole('checkbox', { name: 'Money' }));

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Trends page')).toBeInTheDocument();
    expect(calls.find((c) => c.key === 'PATCH /me/profile')!.body).toEqual({ avatar: 'leaf', ageRange: '25-34', gender: null, occupation: 'student', stressFactors: ['money', 'sleep'] });
    expect(calls.some((c) => c.key === 'POST /me/about-seen')).toBe(true);
  });

  it('the emoji are decoration: hidden from screen readers', async () => {
    account(UNSEEN);
    renderRoutes(routes, '/about-you', queryClient);
    const leaf = await screen.findByRole('radio', { name: 'Gentle Leaf' });
    expect(leaf.closest('label')!.querySelector('[aria-hidden="true"]')).toHaveTextContent('🌿');
  });

  it('Skip for now sends nothing about the person, and is remembered', async () => {
    const user = userEvent.setup();
    const { calls } = account(UNSEEN);
    renderRoutes(routes, '/about-you?next=%2Ftrends', queryClient);
    await user.click(await screen.findByRole('button', { name: 'Skip for now' }));
    expect(await screen.findByText('Trends page')).toBeInTheDocument();
    expect(calls.some((c) => c.key === 'PATCH /me/profile')).toBe(false);
    expect(calls.filter((c) => c.key === 'POST /me/about-seen')).toHaveLength(1);
  });

  it('is never asked again once seen', async () => {
    account(ME);
    const { router } = renderRoutes(routes, '/about-you?next=%2Ftrends', queryClient);
    expect(await screen.findByText('Trends page')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/trends');
  });

  it('comes right after the name, once', async () => {
    const user = userEvent.setup();
    account({ ...UNSEEN, displayName: null });
    const { router } = renderRoutes(routes, '/trends', queryClient);
    await user.type(await screen.findByLabelText('Your name or a nickname'), 'Asha');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByRole('heading', { level: 1, name: 'About you' });
    expect(router.state.location.search).toBe('?next=%2Ftrends');
  });

  it('is offered after signing in, to an account that has not seen it', async () => {
    const user = userEvent.setup();
    let signedIn = false;
    mockFetch({
      'GET /me': () => (signedIn ? { body: UNSEEN } : { status: 401, body: { code: 'unauthenticated' } }),
      'POST /auth/otp/request': { status: 202 },
      'POST /auth/otp/verify': () => {
        signedIn = true;
        return { body: UNSEEN };
      },
    });
    const { router } = renderRoutes(routes, '/sign-in?next=%2Ftrends', queryClient);
    await user.type(await screen.findByLabelText('Email address'), 'asha@example.in');
    await user.click(screen.getByRole('button', { name: 'Email me a code instead' }));
    await user.type(await screen.findByLabelText('6-digit code'), '123456');
    await screen.findByRole('heading', { level: 1, name: 'About you' });
    expect(router.state.location.search).toBe('?next=%2Ftrends');
  });

  it('is never a gate: account screens open without it', async () => {
    account(UNSEEN);
    const { router } = renderRoutes(routes, '/trends', queryClient);
    expect(await screen.findByText('Trends page')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/trends');
  });

  it('waits for consent and the name, and a guest is never asked', async () => {
    account({ ...UNSEEN, displayName: null });
    const first = renderRoutes(routes, '/about-you?next=%2Ftrends', queryClient);
    await screen.findByRole('heading', { level: 1, name: 'What should we call you?' });
    first.unmount();
    queryClient.clear();
    mockFetch({});
    const guest = renderRoutes(routes, '/about-you', queryClient);
    await screen.findByRole('heading', { name: 'Sign in' });
    await waitFor(() => expect(guest.router.state.location.pathname).toBe('/sign-in'));
  });
});
