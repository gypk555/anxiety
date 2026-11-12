import { CONSENT_VERSION, type Me } from '@anxiocare/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { queryClient } from '@/lib/queries';
import { Help } from '@/routes/Help';
import { RequireAccount } from '@/shell/Guards';
import { ME, META, mockFetch, renderRoutes } from '@/test/render';
import Consent from './Consent';
import { Home } from './Home';
import Name from './Name';
import Settings from './Settings';
import { SignIn, SignInCode } from './SignIn';

const routes = [
  { path: '/', element: <Home /> },
  { path: '/help', element: <Help /> },
  { path: '/name', element: <Name /> },
  { path: '/consent', element: <Consent /> },
  { path: '/settings', element: <Settings /> },
  { path: '/sign-in', element: <SignIn /> },
  { path: '/sign-in/code', element: <SignInCode /> },
  { path: '/privacy', element: <p>Privacy page</p> },
  { path: '/terms', element: <p>Terms page</p> },
  { path: '/tools', element: <p>Tools page</p> },
  { element: <RequireAccount />, children: [{ path: '/trends', element: <p>Trends page</p> }, { path: '/journal/new', element: <p>New record</p> }] },
];

const UNNAMED: Me = { ...ME, displayName: null };

/** An account with no name, until PATCH /me gives it one. */
function unnamedAccount(over: Partial<Me> = {}) {
  let me: Me = { ...UNNAMED, ...over };
  const mocks = mockFetch({
    'GET /me': () => ({ body: me }),
    'PATCH /me': (body) => {
      me = { ...me, displayName: (body as { displayName: string }).displayName };
      return { body: me };
    },
    'POST /me/consent': () => {
      me = { ...me, consentRequired: false, acceptedConsentVersion: CONSENT_VERSION };
      return { body: me };
    },
    'POST /auth/logout': { status: 204 },
    'POST /auth/otp/request': { status: 202 },
    'POST /auth/otp/verify': () => ({ body: me }),
    'GET /meta': { body: META },
    'GET /auth/sessions': { body: { items: [] } },
    'GET /me/sign-in-methods': { body: { password: false, google: true } },
  });
  return mocks;
}

afterEach(() => {
  vi.unstubAllGlobals();
  queryClient.clear();
});

describe('asking an account with no name what to call them', () => {
  it('asks before an account screen, refuses an empty name inline, then goes on to where they were going', async () => {
    const user = userEvent.setup();
    const { calls } = unnamedAccount();
    const { router } = renderRoutes(routes, '/journal/new?step=2', queryClient);
    expect(await screen.findByRole('heading', { level: 1, name: 'What should we call you?' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/name');
    expect(router.state.location.search).toBe('?next=%2Fjournal%2Fnew%3Fstep%3D2');

    const field = screen.getByLabelText('Your name or a nickname');
    expect(field).toBeRequired();
    expect(field).toHaveAttribute('maxlength', '60');
    await user.type(field, '   ');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter your name or a nickname.');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAccessibleDescription(/Enter your name or a nickname\./);
    expect(field).toHaveFocus();
    expect(calls.some((c) => c.key === 'PATCH /me')).toBe(false);

    await user.type(field, '  Meera  ');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('New record')).toBeInTheDocument();
    expect(calls.find((c) => c.key === 'PATCH /me')!.body).toEqual({ displayName: 'Meera' });
  });

  it('asks only once: with a name, the screen goes straight on', async () => {
    mockFetch({ 'GET /me': { body: ME } });
    const { router } = renderRoutes(routes, '/name?next=%2Ftools', queryClient);
    expect(await screen.findByText('Tools page')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/tools');
  });

  it('Home asks too, and comes back to Home', async () => {
    unnamedAccount();
    const { router } = renderRoutes(routes, '/', queryClient);
    await screen.findByRole('heading', { level: 1, name: 'What should we call you?' });
    expect(router.state.location.search).toBe('?next=%2F');
  });

  it('comes after consent, never before it', async () => {
    const user = userEvent.setup();
    unnamedAccount({ consentRequired: true, acceptedConsentVersion: null });
    const { router } = renderRoutes(routes, '/trends', queryClient);
    await screen.findByRole('heading', { name: 'Before we save anything' });
    await user.click(screen.getByRole('checkbox', { name: 'I am 18 or older.' }));
    await user.click(screen.getByRole('checkbox', { name: /I agree to AnxioCare storing/ }));
    await user.click(screen.getByRole('button', { name: 'Agree and continue' }));
    await screen.findByRole('heading', { level: 1, name: 'What should we call you?' });
    expect(router.state.location.search).toBe('?next=%2Ftrends');
  });

  it('the name screen itself sends someone who has not consented to consent first', async () => {
    unnamedAccount({ consentRequired: true, acceptedConsentVersion: null });
    const { router } = renderRoutes(routes, '/name?next=%2Ftrends', queryClient);
    await screen.findByRole('heading', { name: 'Before we save anything' });
    expect(router.state.location.search).toBe('?next=%2Ftrends');
  });

  it('signing in with a code goes to the name screen, keeping next', async () => {
    const user = userEvent.setup();
    mockFetch({ 'POST /auth/otp/request': { status: 202 }, 'POST /auth/otp/verify': { body: UNNAMED }, 'GET /meta': { body: META } });
    const { router } = renderRoutes(routes, '/sign-in?next=%2Ftrends', queryClient);
    await user.type(await screen.findByLabelText('Email address'), 'asha@example.in');
    await user.click(screen.getByRole('button', { name: 'Email me a code instead' }));
    await user.type(await screen.findByLabelText('6-digit code'), '123456');
    await screen.findByRole('heading', { level: 1, name: 'What should we call you?' });
    expect(router.state.location.search).toBe('?next=%2Ftrends');
  });

  it('a guest is never asked', async () => {
    mockFetch({});
    const { router } = renderRoutes(routes, '/name?next=%2Ftrends', queryClient);
    await screen.findByRole('heading', { name: 'Sign in' });
    expect(router.state.location.search).toBe('?next=%2Ftrends');
  });
});

describe('the name screen never stands in the way', () => {
  it('Help opens without it', async () => {
    unnamedAccount();
    renderRoutes(routes, '/help', queryClient);
    expect((await screen.findAllByRole('link', { name: /^Call / }))[0]).toHaveAttribute('href', 'tel:112');
    expect(screen.queryByRole('heading', { name: 'What should we call you?' })).not.toBeInTheDocument();
  });

  it('offers sign out, and Settings for download and delete, without a name', async () => {
    const user = userEvent.setup();
    const { calls } = unnamedAccount();
    const view = renderRoutes(routes, '/name?next=%2Ftrends', queryClient);
    await screen.findByRole('heading', { level: 1, name: 'What should we call you?' });
    expect(screen.getByRole('link', { name: 'Download or delete my data' })).toHaveAttribute('href', '/settings');
    await user.click(screen.getByRole('button', { name: 'Not now, sign me out' }));
    await waitFor(() => expect(view.router.state.location.pathname).toBe('/'));
    expect(calls.some((c) => c.key === 'POST /auth/logout')).toBe(true);
    expect(calls.some((c) => c.key === 'PATCH /me')).toBe(false);
  });

  it('Settings opens without a name, with sign out, download and delete', async () => {
    unnamedAccount();
    const { router } = renderRoutes(routes, '/settings', queryClient);
    const main = await screen.findByRole('region', { name: 'Delete your account' });
    expect(within(main).getByRole('button', { name: 'Delete my account' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Download my data/ })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/settings');
  });
});
