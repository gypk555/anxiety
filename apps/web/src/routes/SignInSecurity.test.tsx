import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { queryClient } from '@/lib/queries';
import { ME, META, mockFetch, problem, renderRoutes } from '@/test/render';
import Settings from './Settings';

const PASSWORD = 'river stone quiet morning';
const NEW_PASSWORD = 'mango season on the terrace';

afterEach(() => {
  vi.unstubAllGlobals();
  queryClient.clear();
});

const open = async (methods: { password: boolean; google: boolean }, table: Parameters<typeof mockFetch>[0] = {}, googleEnabled = true) => {
  const mocks = mockFetch({
    'GET /me': { body: ME },
    'GET /meta': { body: { ...META, googleEnabled } },
    'GET /auth/sessions': { body: { items: [] } },
    'GET /me/sign-in-methods': { body: methods },
    ...table,
  });
  renderRoutes([{ path: '/settings', element: <Settings /> }], '/settings', queryClient);
  const user = userEvent.setup();
  await screen.findByRole('heading', { name: 'Sign-in and security' });
  await screen.findByText(/Email codes/);
  return { ...mocks, user };
};

describe('Sign-in and security', () => {
  it('lists the ways this account can sign in', async () => {
    await open({ password: true, google: true });
    expect(await screen.findByText('Password: set')).toBeInTheDocument();
    expect(screen.getByText('Google: connected')).toBeInTheDocument();
    expect(screen.getByText(/Email codes: always available/)).toBeInTheDocument();
  });

  it('with Google off and not connected, does not mention it', async () => {
    await open({ password: true, google: false }, {}, false);
    await screen.findByText('Password: set');
    expect(screen.queryByText(/^Google:/)).not.toBeInTheDocument();
  });

  it('changes a password with the current one, with the right attributes, and says what happened', async () => {
    const { user, calls } = await open({ password: true, google: false }, { 'POST /me/password': { status: 204 } });
    await user.click(await screen.findByRole('button', { name: 'Change password' }));
    const dialog = await screen.findByRole('dialog');
    const current = within(dialog).getByLabelText('Current password');
    const next = within(dialog).getByLabelText('New password');
    expect(current).toHaveAttribute('autocomplete', 'current-password');
    expect(next).toHaveAttribute('autocomplete', 'new-password');
    await user.type(current, PASSWORD);
    await user.type(next, NEW_PASSWORD);
    await user.click(within(dialog).getByRole('button', { name: 'Change password' }));
    await screen.findByText('Password changed. Other devices were signed out.');
    expect(calls.find((c) => c.key === 'POST /me/password')!.body).toEqual({ currentPassword: PASSWORD, password: NEW_PASSWORD });
    await waitFor(() => expect(JSON.stringify(queryClient.getMutationCache().getAll().map((m) => m.state))).not.toContain(PASSWORD));
  });

  it('a wrong current password stays signed in and says so', async () => {
    const { user } = await open({ password: true, google: false }, { 'POST /me/password': problem(400, 'invalid_credentials') });
    await user.click(await screen.findByRole('button', { name: 'Change password' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Current password'), 'wrong password here');
    await user.type(within(dialog).getByLabelText('New password'), NEW_PASSWORD);
    await user.click(within(dialog).getByRole('button', { name: 'Change password' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent("current password isn't right");
    expect(within(dialog).getByLabelText('Current password')).toHaveValue('');
  });

  it('checks the new password in plain words before sending', async () => {
    const { user, calls } = await open({ password: true, google: false });
    await user.click(await screen.findByRole('button', { name: 'Change password' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Current password'), PASSWORD);
    await user.type(within(dialog).getByLabelText('New password'), 'short');
    await user.click(within(dialog).getByRole('button', { name: 'Change password' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('at least 10');
    expect(calls.some((c) => c.key === 'POST /me/password')).toBe(false);
  });

  it('an account with no password adds one through an emailed code', async () => {
    const { user, calls } = await open({ password: false, google: true }, { 'POST /me/password/set/request': { status: 202 }, 'POST /me/password/set': { status: 204 } });
    await user.click(await screen.findByRole('button', { name: 'Add a password' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Email me a code' }));
    const code = await within(dialog).findByLabelText('6-digit code');
    await user.type(code, '123456');
    const next = within(dialog).getByLabelText('New password');
    expect(next).toHaveAttribute('autocomplete', 'new-password');
    await user.type(next, NEW_PASSWORD);
    await user.click(within(dialog).getByRole('button', { name: 'Save password' }));
    await screen.findByText('Password added. Other devices were signed out.');
    expect(calls.find((c) => c.key === 'POST /me/password/set')!.body).toEqual({ code: '123456', password: NEW_PASSWORD });
  });

  it('with no password, disconnecting Google is still offered, and asks for an email code to confirm it is you', async () => {
    let deletes = 0;
    const { user, calls } = await open({ password: false, google: true }, {
      'DELETE /me/identities/google': () => (++deletes === 1 ? problem(403, 'reauth_required') : { status: 204 }),
      'POST /me/reauth/code/request': { status: 202 },
      'POST /me/reauth/code': { status: 204 },
    });
    await user.click(await screen.findByRole('button', { name: 'Disconnect Google' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Disconnect' }));
    const confirm = await screen.findByRole('dialog', { name: "Confirm it's you" });
    expect(within(confirm).queryByLabelText('Your password')).not.toBeInTheDocument();
    await user.click(within(confirm).getByRole('button', { name: 'Email me a code' }));
    await user.type(await within(confirm).findByLabelText(/digit code/), '123456');
    await user.click(within(confirm).getByRole('button', { name: 'Confirm' }));
    await screen.findByText('Google disconnected. Sign in with your password or an email code from now on.');
    expect(calls.find((c) => c.key === 'POST /me/reauth/code')!.body).toEqual({ code: '123456' });
    expect(calls.filter((c) => c.key === 'DELETE /me/identities/google')).toHaveLength(2);
  });

  it('connects Google after confirming the password, then goes to the address the server gives', async () => {
    const assign = vi.fn();
    const real = window.location;
    Object.defineProperty(window, 'location', { configurable: true, value: { ...real, assign, search: '', pathname: '/settings' } });
    try {
      let connects = 0;
      const { user, calls } = await open({ password: true, google: false }, {
        'POST /me/identities/google/connect': () => (++connects === 1 ? problem(403, 'reauth_required') : { body: { url: 'https://accounts.example/authorize?x=1' } }),
        'POST /me/reauth/password': { status: 204 },
      });
      await user.click(await screen.findByRole('button', { name: 'Connect Google' }));
      const confirm = await screen.findByRole('dialog', { name: "Confirm it's you" });
      const field = within(confirm).getByLabelText('Your password');
      expect(field).toHaveAttribute('autocomplete', 'current-password');
      await user.type(field, PASSWORD);
      await user.click(within(confirm).getByRole('button', { name: 'Confirm' }));
      await waitFor(() => expect(assign).toHaveBeenCalledWith('https://accounts.example/authorize?x=1'));
      expect(calls.find((c) => c.key === 'POST /me/reauth/password')!.body).toEqual({ password: PASSWORD });
      await waitFor(() => expect(JSON.stringify(queryClient.getMutationCache().getAll().map((m) => m.state))).not.toContain(PASSWORD));
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: real });
    }
  });

  it('a wrong password does not connect anything, and says so', async () => {
    const { user, calls } = await open({ password: true, google: false }, {
      'POST /me/identities/google/connect': problem(403, 'reauth_required'),
      'POST /me/reauth/password': problem(400, 'invalid_credentials'),
    });
    await user.click(await screen.findByRole('button', { name: 'Connect Google' }));
    const confirm = await screen.findByRole('dialog', { name: "Confirm it's you" });
    await user.type(within(confirm).getByLabelText('Your password'), 'not the password');
    await user.click(within(confirm).getByRole('button', { name: 'Confirm' }));
    expect(await within(confirm).findByRole('alert')).toHaveTextContent("That password isn't right");
    expect(calls.filter((c) => c.key === 'POST /me/identities/google/connect')).toHaveLength(1);
  });

  it.each([
    ['connected', 'status', 'Google connected'],
    ['taken', 'alert', 'already connected to a different account'],
    ['failed', 'alert', "couldn't connect Google"],
  ])('back from Google with google=%s says so', async (outcome, role, text) => {
    mockFetch({
      'GET /me': { body: ME },
      'GET /meta': { body: { ...META, googleEnabled: true } },
      'GET /auth/sessions': { body: { items: [] } },
      'GET /me/sign-in-methods': { body: { password: true, google: outcome === 'connected' } },
    });
    renderRoutes([{ path: '/settings', element: <Settings /> }], `/settings?google=${outcome}`, queryClient);
    const shown = await screen.findByText(new RegExp(text));
    expect(shown).toHaveAttribute('role', role);
  });

  it('with a password, disconnecting Google asks first', async () => {
    const { user, calls } = await open({ password: true, google: true }, { 'DELETE /me/identities/google': { status: 204 } });
    await user.click(await screen.findByRole('button', { name: 'Disconnect Google' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Disconnect' }));
    await waitFor(() => expect(calls.some((c) => c.key === 'DELETE /me/identities/google')).toBe(true));
  });
});
