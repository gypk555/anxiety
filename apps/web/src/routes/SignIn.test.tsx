import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { queryClient } from '@/lib/queries';
import { ME, META, mockFetch, problem, renderRoutes } from '@/test/render';
import { CreateAccount, CreateAccountCode } from './CreateAccount';
import Consent from './Consent';
import { ForgotPassword, ResetPassword } from './ForgotPassword';
import { SignIn, SignInCode } from './SignIn';

const routes = [
  { path: '/sign-in', element: <SignIn /> },
  { path: '/sign-in/code', element: <SignInCode /> },
];

const accountRoutes = [
  ...routes,
  { path: '/create-account', element: <CreateAccount /> },
  { path: '/create-account/code', element: <CreateAccountCode /> },
  { path: '/forgot-password', element: <ForgotPassword /> },
  { path: '/forgot-password/reset', element: <ResetPassword /> },
  { path: '/consent', element: <Consent /> },
  { path: '/', element: <h1>Home</h1> },
  { path: '/journal', element: <p>Destination</p> },
];

afterEach(() => {
  vi.unstubAllGlobals();
  queryClient.clear();
});

describe('repeated wrong codes', () => {
  const start = async () => {
    mockFetch({ 'POST /auth/otp/request': { status: 202 }, 'POST /auth/otp/verify': problem(400, 'invalid_code') });
    renderRoutes(routes, '/sign-in', queryClient);
    await userEvent.type(await screen.findByLabelText('Email address'), 'a@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Email me a code instead' }));
    return screen.findByLabelText('6-digit code');
  };
  const pause = /sign-in codes for this address can be paused for up to 24 hours/;

  it('the first failure is just the usual message', async () => {
    const box = await start();
    await userEvent.type(box, '000000');
    expect(await screen.findByRole('alert')).toHaveTextContent("That code didn't work");
    expect(screen.queryByText(pause)).not.toBeInTheDocument();
  });

  it('after a second, it explains the pause, what still works, and is based only on what this screen saw', async () => {
    const box = await start();
    await userEvent.type(box, '000000');
    await screen.findByRole('alert');
    await userEvent.type(box, '111111');
    expect(await screen.findByText(pause)).toBeInTheDocument();
    expect(screen.getByText(/Your password and devices already signed in keep working/)).toBeInTheDocument();
  });
});

const PASSWORD = 'river stone quiet morning';
const allStorage = () => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, history: window.history.state });

describe('sign in with a password', () => {
  const start = async (table: Parameters<typeof mockFetch>[0] = {}, path = '/sign-in') => {
    const mocks = mockFetch({ 'POST /auth/login': { body: ME }, ...table });
    const view = renderRoutes(accountRoutes, path, queryClient);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Email address'), 'Asha@Example.in');
    return { ...mocks, ...view, user };
  };
  const password = () => screen.getByLabelText('Password');

  it('an address with an account gets a notice, not the code page, with sign in, Google and reset, each keeping the email', async () => {
    const mocks = mockFetch({
      'POST /auth/register/request': problem(409, 'account_exists'),
      'GET /meta': { body: { ...META, googleEnabled: true } },
    });
    const view = renderRoutes(accountRoutes, '/create-account?next=%2Fjournal', queryClient);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Your name or a nickname'), 'Asha');
    await user.type(screen.getByLabelText('Email address'), 'Asha@Example.in');
    await user.type(screen.getByLabelText('Password'), PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    const notice = await screen.findByRole('alert');
    expect(notice).toHaveTextContent("There's already an account for this email.");
    await waitFor(() => expect(notice).toHaveFocus());
    expect(view.router.state.location.pathname).toBe('/create-account');
    expect(screen.getByLabelText('Password')).toHaveValue('');
    expect(allStorage()).not.toContain(PASSWORD);
    expect(JSON.stringify(view.router.state.location)).not.toContain(PASSWORD);
    expect(mocks.calls.filter((c) => c.key === 'POST /auth/register/request')).toHaveLength(1);

    const google = within(notice).getByRole('link', { name: 'Continue with Google' });
    expect(google).toHaveAttribute('href', '/api/v1/auth/google/start?next=%2Fjournal');
    expect(within(notice).getByRole('link', { name: 'Reset password' })).toHaveClass('btn');

    await user.click(within(notice).getByRole('link', { name: 'Sign in' }));
    expect(view.router.state.location.pathname).toBe('/sign-in');
    expect(view.router.state.location.search).toBe('?next=%2Fjournal');
    expect(screen.getByLabelText('Email address')).toHaveValue('asha@example.in');
  });

  it('Reset password from the notice goes to forgot password with the email in', async () => {
    mockFetch({ 'POST /auth/register/request': problem(409, 'account_exists') });
    const view = renderRoutes(accountRoutes, '/create-account', queryClient);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Your name or a nickname'), 'Asha');
    await user.type(screen.getByLabelText('Email address'), 'asha@example.in');
    await user.type(screen.getByLabelText('Password'), PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(within(await screen.findByRole('alert')).getByRole('link', { name: 'Reset password' }));
    expect(view.router.state.location.pathname).toBe('/forgot-password');
    expect(await screen.findByLabelText('Email address')).toHaveValue('asha@example.in');
  });

  it('offers Continue with Google up front, for people who would rather not have a password', async () => {
    mockFetch({ 'GET /meta': { body: { ...META, googleEnabled: true } } });
    renderRoutes(accountRoutes, '/create-account?next=%2Fjournal', queryClient);
    expect(await screen.findByRole('link', { name: 'Continue with Google' })).toHaveAttribute('href', '/api/v1/auth/google/start?next=%2Fjournal');
  });

  it('has the attributes password managers need', async () => {
    await start();
    expect(screen.getByLabelText('Email address')).toHaveAttribute('autocomplete', 'username');
    expect(password()).toHaveAttribute('autocomplete', 'current-password');
    expect(password()).toHaveAttribute('type', 'password');
    expect(password()).toHaveAttribute('name', 'password');
  });

  it('sends the address normalised and the password exactly as typed, then goes to next', async () => {
    const { calls, user, router } = await start({}, '/sign-in?next=%2Fjournal');
    await user.type(password(), ` ${PASSWORD} `);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByText('Destination');
    expect(calls.find((c) => c.key === 'POST /auth/login')!.body).toEqual({ email: 'asha@example.in', password: ` ${PASSWORD} ` });
    expect(router.state.location.pathname).toBe('/journal');
  });

  it('a wrong password clears the field, moves focus to it, says what to do, and keeps a guest result', async () => {
    window.sessionStorage.setItem('anxiocare.result.v1', JSON.stringify({ clientRequestId: 'c', answers: [0, 0, 0, 0, 0, 0, 0], difficulty: null, takenAt: new Date().toISOString() }));
    const { user } = await start({ 'POST /auth/login': problem(400, 'invalid_credentials') });
    await user.type(password(), PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("That email and password don't match");
    expect(password()).toHaveValue('');
    expect(password()).toHaveFocus();
    expect(window.sessionStorage.getItem('anxiocare.result.v1')).not.toBeNull();
    window.sessionStorage.clear();
  });

  it('asks for a password when it is empty, and offers the code instead, without calling the server', async () => {
    const { calls, user } = await start();
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/Enter your password/);
    expect(calls.some((c) => c.key === 'POST /auth/login')).toBe(false);
  });

  it('the show and hide toggle changes the field, says so, and is a real button', async () => {
    const { user } = await start();
    const toggle = screen.getByRole('button', { name: 'Show password' });
    expect(toggle).toHaveAttribute('type', 'button');
    await user.click(toggle);
    expect(password()).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('hides the password again when the form is sent, so a password manager or a shoulder sees no text field', async () => {
    const { user } = await start({ 'POST /auth/login': problem(400, 'invalid_credentials') });
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    await user.type(password(), PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByRole('alert');
    expect(password()).toHaveAttribute('type', 'password');
  });

  it('keeps the password out of browser storage, the URL and the mutation cache', async () => {
    const { user, router } = await start();
    await user.type(password(), PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByRole('heading', { name: 'Home' });
    expect(allStorage()).not.toContain(PASSWORD);
    expect(JSON.stringify(router.state.location)).not.toContain(PASSWORD);
    await waitFor(() => expect(JSON.stringify(queryClient.getMutationCache().getAll().map((m) => m.state))).not.toContain(PASSWORD));
  });

  it('links carry next, and paste works because nothing prevents it', async () => {
    const { user } = await start({}, '/sign-in?next=%2Fresult');
    expect(screen.getByRole('link', { name: 'Forgot your password?' })).toHaveAttribute('href', '/forgot-password?next=%2Fresult');
    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/create-account?next=%2Fresult');
    await user.click(password());
    await user.paste(PASSWORD);
    expect(password()).toHaveValue(PASSWORD);
  });

  it.each([
    ['google_link', /already an account with this email address.*Connect Google.*Settings/],
    ['google_new', /Create an account with your email address instead/],
  ])('after a Google sign-in refused as %s, says what to do instead', async (code, text) => {
    mockFetch({ 'GET /meta': { body: META } });
    renderRoutes(accountRoutes, `/sign-in?error=${code}`, queryClient);
    expect(await screen.findByRole('alert')).toHaveTextContent(text);
  });

  it('shows a neutral message after a failed Google sign-in', async () => {
    mockFetch({});
    renderRoutes(accountRoutes, '/sign-in?error=google', queryClient);
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't sign you in with Google");
  });
});

describe('the Google button', () => {
  const withGoogle = (googleEnabled: boolean) => mockFetch({ 'GET /meta': { body: { ...META, googleEnabled } } });

  it('is hidden when Google is off', async () => {
    withGoogle(false);
    renderRoutes(accountRoutes, '/sign-in', queryClient);
    await screen.findByRole('heading', { name: 'Sign in' });
    await waitFor(() => expect(queryClient.getQueryData(['meta'])).toBeDefined());
    expect(screen.queryByRole('link', { name: /Continue with Google/ })).not.toBeInTheDocument();
  });

  it('when on, is a plain link to the API carrying next, with one plain line about what Google learns', async () => {
    withGoogle(true);
    renderRoutes(accountRoutes, '/sign-in?next=%2Fresult', queryClient);
    const link = await screen.findByRole('link', { name: /Continue with Google/ });
    expect(link).toHaveAttribute('href', '/api/v1/auth/google/start?next=%2Fresult');
    expect(screen.getByText(/Google learns that you use this service/)).toBeInTheDocument();
  });

  it('is offered on Create account too', async () => {
    withGoogle(true);
    renderRoutes(accountRoutes, '/create-account?next=%2Fresult', queryClient);
    expect(await screen.findByRole('link', { name: /Continue with Google/ })).toHaveAttribute('href', '/api/v1/auth/google/start?next=%2Fresult');
  });

  it('is hidden if the app cannot tell whether Google is on', async () => {
    mockFetch({ 'GET /meta': problem(500, 'internal_error') });
    renderRoutes(accountRoutes, '/sign-in', queryClient);
    await screen.findByRole('heading', { name: 'Sign in' });
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole('link', { name: /Continue with Google/ })).not.toBeInTheDocument();
  });
});

describe('create account', () => {
  const start = async (path = '/create-account') => {
    const mocks = mockFetch({
      'POST /auth/register/request': { status: 202 },
      'POST /auth/register/verify': { body: { ...ME, consentRequired: true, acceptedConsentVersion: null } },
    });
    const view = renderRoutes(accountRoutes, path, queryClient);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Your name or a nickname'), 'Asha');
    await user.type(screen.getByLabelText('Email address'), 'asha@example.in');
    return { ...mocks, ...view, user };
  };

  it('needs a name or a nickname, says so beside the field, and asks for no code without one', async () => {
    const { user, calls } = await start();
    const name = screen.getByLabelText('Your name or a nickname');
    expect(name).toBeRequired();
    expect(name).toHaveAttribute('maxlength', '60');
    await user.clear(name);
    await user.type(name, '   ');
    await user.type(screen.getByLabelText('Password'), PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter your name or a nickname.');
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveAccessibleDescription(/Enter your name or a nickname\./);
    expect(name).toHaveFocus();
    expect(calls.some((c) => c.key === 'POST /auth/register/request')).toBe(false);

    await user.type(name, ' Asha ');
    expect(name).not.toHaveAttribute('aria-invalid', 'true');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByRole('heading', { name: 'Check your email' });
  });

  it('has the attributes password managers need', async () => {
    await start();
    expect(screen.getByLabelText('Email address')).toHaveAttribute('autocomplete', 'username');
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByLabelText('Your name or a nickname')).toHaveAttribute('autocomplete', 'given-name');
  });

  it('checks the password first, in plain words, and asks for no code until it is fine', async () => {
    const { user, calls } = await start();
    await user.type(screen.getByLabelText('Password'), 'short');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('alert')).toHaveTextContent('at least 10');
    await user.clear(screen.getByLabelText('Password'));
    await user.type(screen.getByLabelText('Password'), 'password1234');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/too common/);
    await user.clear(screen.getByLabelText('Password'));
    await user.type(screen.getByLabelText('Password'), 'asha-is-my-long-name');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/first part of your email/);
    expect(calls.some((c) => c.key === 'POST /auth/register/request')).toBe(false);
  });

  it('sends only the address at first, then the password with the code, and holds it nowhere but memory', async () => {
    const { user, calls, router } = await start('/create-account?next=%2Fresult');
    await user.type(screen.getByLabelText('Password'), PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByRole('heading', { name: 'Check your email' });
    expect(calls.find((c) => c.key === 'POST /auth/register/request')!.body).toEqual({ email: 'asha@example.in' });
    expect(router.state.location.pathname).toBe('/create-account/code');
    expect(allStorage()).not.toContain(PASSWORD);
    expect(JSON.stringify(router.state.location)).not.toContain(PASSWORD);

    await user.type(screen.getByLabelText('6-digit code'), '123456');
    await screen.findByRole('heading', { name: 'Before we save anything' });
    expect(calls.find((c) => c.key === 'POST /auth/register/verify')!.body).toEqual({ email: 'asha@example.in', code: '123456', password: PASSWORD, displayName: 'Asha' });
    expect(router.state.location.search).toBe('?next=%2Fresult');
    expect(allStorage()).not.toContain(PASSWORD);
    expect(JSON.stringify(router.state.location)).not.toContain(PASSWORD);
    await waitFor(() => expect(JSON.stringify(queryClient.getMutationCache().getAll().map((m) => m.state))).not.toContain(PASSWORD));
  });

  it('the code screen no longer talks about an existing account: that is told on the form instead', async () => {
    const { user } = await start();
    await user.type(screen.getByLabelText('Password'), PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByRole('heading', { name: 'Check your email' });
    expect(screen.queryByText(/already have an account/)).not.toBeInTheDocument();
  });

  it('the code screen with nothing held, such as after a reload, goes back to the form', async () => {
    mockFetch({});
    const { router } = renderRoutes(accountRoutes, '/create-account/code', queryClient);
    await screen.findByRole('heading', { name: 'Create an account' });
    expect(router.state.location.pathname).toBe('/create-account');
  });

  it('a password the server refuses goes back to the form with its words, and the password is gone', async () => {
    const mocks = mockFetch({
      'POST /auth/register/request': { status: 202 },
      'POST /auth/register/verify': { status: 400, body: { type: 'about:blank', title: 'x', status: 400, code: 'validation_failed', fieldErrors: { password: ['Pick another one.'] } } },
    });
    renderRoutes(accountRoutes, '/create-account', queryClient);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Your name or a nickname'), 'Asha');
    await user.type(screen.getByLabelText('Email address'), 'asha@example.in');
    await user.type(screen.getByLabelText('Password'), PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.type(await screen.findByLabelText('6-digit code'), '123456');
    // The code screen may flash a general message first; the form then comes back with the server's own words.
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Pick another one.'));
    expect(screen.getByRole('heading', { name: 'Create an account' })).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toHaveValue('');
    expect(screen.getByLabelText('Email address')).toHaveValue('asha@example.in');
    expect(mocks.calls.length).toBeGreaterThan(0);
  });

  it('a wrong code keeps the screen usable and the password held', async () => {
    const mocks = mockFetch({ 'POST /auth/register/request': { status: 202 }, 'POST /auth/register/verify': problem(400, 'invalid_code') });
    renderRoutes(accountRoutes, '/create-account', queryClient);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Your name or a nickname'), 'Asha');
    await user.type(screen.getByLabelText('Email address'), 'asha@example.in');
    await user.type(screen.getByLabelText('Password'), PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    const box = await screen.findByLabelText('6-digit code');
    await user.type(box, '000000');
    expect(await screen.findByRole('alert')).toHaveTextContent("didn't work");
    await user.type(box, '111111');
    await waitFor(() => expect(mocks.calls.filter((c) => c.key === 'POST /auth/register/verify')).toHaveLength(2));
    expect((mocks.calls.filter((c) => c.key === 'POST /auth/register/verify')[1]!.body as { password: string }).password).toBe(PASSWORD);
  });
});

describe('forgot password', () => {
  const start = async (path = '/forgot-password') => {
    const mocks = mockFetch({ 'POST /auth/password/forgot': { status: 202 }, 'POST /auth/password/reset': { body: ME } });
    const view = renderRoutes(accountRoutes, path, queryClient);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Email address'), 'asha@example.in');
    await user.click(screen.getByRole('button', { name: 'Email me a code' }));
    await screen.findByRole('heading', { name: 'Choose a new password' });
    return { ...mocks, ...view, user };
  };

  it('asks for a code and a new password together, with a username field for password managers', async () => {
    const { calls } = await start();
    expect(calls.find((c) => c.key === 'POST /auth/password/forgot')!.body).toEqual({ email: 'asha@example.in' });
    expect(screen.getByLabelText('New password')).toHaveAttribute('autocomplete', 'new-password');
    const username = document.querySelector('input[autocomplete="username"]');
    expect(username).toHaveValue('asha@example.in');
    expect(username).toHaveAttribute('hidden');
  });

  it('says the same whether or not an account exists', async () => {
    await start();
    expect(screen.getByText(/If there's an account for/)).toBeInTheDocument();
  });

  it('does not send a code on its own: the password is typed after it', async () => {
    const { calls, user } = await start();
    await user.type(screen.getByLabelText('6-digit code'), '123456');
    expect(calls.some((c) => c.key === 'POST /auth/password/reset')).toBe(false);
  });

  it('sets the password, and goes on to next', async () => {
    const { calls, user, router } = await start('/forgot-password?next=%2Fjournal');
    await user.type(screen.getByLabelText('6-digit code'), '123456');
    await user.type(screen.getByLabelText('New password'), PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Set new password' }));
    await screen.findByText('Destination');
    expect(calls.find((c) => c.key === 'POST /auth/password/reset')!.body).toEqual({ email: 'asha@example.in', code: '123456', password: PASSWORD });
    expect(router.state.location.pathname).toBe('/journal');
    expect(allStorage()).not.toContain(PASSWORD);
  });

  it('checks the password rules first, in plain words', async () => {
    const { calls, user } = await start();
    await user.type(screen.getByLabelText('6-digit code'), '123456');
    await user.type(screen.getByLabelText('New password'), 'short');
    await user.click(screen.getByRole('button', { name: 'Set new password' }));
    expect(screen.getByRole('alert')).toHaveTextContent('at least 10');
    expect(calls.some((c) => c.key === 'POST /auth/password/reset')).toBe(false);
  });

  it('the reset screen with no address, such as after a reload, goes back', async () => {
    mockFetch({});
    renderRoutes(accountRoutes, '/forgot-password/reset', queryClient);
    expect(await screen.findByRole('heading', { name: 'Forgot your password?' })).toBeInTheDocument();
  });
});
