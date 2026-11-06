import { CONSENT_VERSION, type Me } from '@anxiocare/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearDrafts, emptyDraft, getDraft, NEW_DRAFT, setDraft } from '@/lib/drafts';
import { loadGuestResult, saveGuestResult } from '@/lib/guest';
import { fetchMe, handleApiError, meKey, queryClient, setNavigator } from '@/lib/queries';
import { ApiError } from '@/lib/api';
import { Help } from '@/routes/Help';
import Consent from '@/routes/Consent';
import { SignIn, SignInCode } from '@/routes/SignIn';
import { ME, mockFetch, problem, renderRoutes } from '@/test/render';
import { RequireAccount } from './Guards';

const routes = [
  { path: '/', element: <p>Home page</p> },
  { path: '/help', element: <Help /> },
  { path: '/sign-in', element: <SignIn /> },
  { path: '/sign-in/code', element: <SignInCode /> },
  { path: '/consent', element: <Consent /> },
  { path: '/privacy', element: <p>Privacy page</p> },
  { path: '/terms', element: <p>Terms page</p> },
  {
    element: <RequireAccount />,
    children: [
      { path: '/trends', element: <p>Trends page</p> },
      { path: '/journal/new', element: <p>New record</p> },
    ],
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
  queryClient.clear();
  clearDrafts();
  setNavigator(() => {});
});

const guestResult = () => saveGuestResult({
  clientRequestId: '55555555-5555-4555-8555-555555555555',
  answers: [1, 1, 1, 1, 1, 0, 0],
  difficulty: 1,
  takenAt: new Date().toISOString(),
});

describe('routing guards', () => {
  it('sends a guest to sign-in, remembering where they were going', async () => {
    mockFetch({});
    const { router } = renderRoutes(routes, '/journal/new?step=2', queryClient);
    await screen.findByRole('heading', { name: 'Sign in with your email' });
    expect(router.state.location.search).toBe('?next=%2Fjournal%2Fnew%3Fstep%3D2');
  });

  it('lets a consented account through', async () => {
    mockFetch({ 'GET /me': { body: ME } });
    renderRoutes(routes, '/trends', queryClient);
    expect(await screen.findByText('Trends page')).toBeInTheDocument();
  });

  it('sends an account that has not consented to the consent screen, then on to the destination', async () => {
    const user = userEvent.setup();
    let consented = false;
    const { calls } = mockFetch({
      'GET /me': () => ({ body: { ...ME, consentRequired: !consented, acceptedConsentVersion: consented ? CONSENT_VERSION : null } }),
      'POST /me/consent': () => {
        consented = true;
        return { status: 204 };
      },
    });
    const { router } = renderRoutes(routes, '/trends', queryClient);
    await screen.findByRole('heading', { name: 'Before we save anything' });
    expect(router.state.location.pathname).toBe('/consent');

    const boxes = screen.getAllByRole('checkbox');
    for (const box of boxes) expect(box).not.toBeChecked(); // never pre-ticked

    await user.click(screen.getByRole('button', { name: 'Agree and continue' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/tick both boxes/);
    expect(calls.some((c) => c.key === 'POST /me/consent')).toBe(false);

    await user.click(boxes[0]!);
    await user.click(boxes[1]!);
    await user.click(screen.getByRole('button', { name: 'Agree and continue' }));
    expect(await screen.findByText('Trends page')).toBeInTheDocument();
    expect(calls.find((c) => c.key === 'POST /me/consent')!.body).toEqual({
      version: CONSENT_VERSION,
      adultConfirmed: true,
      healthDataConsent: true,
    });
  });

  it('shows an offline state rather than a sign-in screen when /me cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }));
    renderRoutes(routes, '/trends', queryClient);
    expect(await screen.findByRole('alert', {}, { timeout: 4000 })).toHaveTextContent(/offline/);
    expect(screen.getByRole('link', { name: 'Go to Help' })).toBeInTheDocument();
  });

  it('Help needs no login: tel links first, without calling the API', async () => {
    const { calls } = mockFetch({});
    renderRoutes(routes, '/help', queryClient);
    const links = await screen.findAllByRole('link', { name: /^Call / });
    expect(links[0]).toHaveAttribute('href', 'tel:112');
    expect(links[1]).toHaveAttribute('href', 'tel:14416');
    expect(screen.getByRole('link', { name: /WhatsApp/ })).toHaveAttribute('href', 'https://wa.me/919999666555');
    expect(screen.getByRole('heading', { name: /thoughts of harming yourself/ })).toBeInTheDocument();
    expect(calls).toEqual([]);
  });
});

describe('sign-in', () => {
  it('walks email, code and consent, keeping the destination', async () => {
    const user = userEvent.setup();
    const { calls } = mockFetch({
      'POST /auth/otp/request': { status: 202 },
      'POST /auth/otp/verify': { body: { ...ME, consentRequired: true, acceptedConsentVersion: null } },
    });
    const { router } = renderRoutes(routes, '/sign-in?next=%2Ftrends', queryClient);
    await user.type(await screen.findByLabelText('Email address'), 'Asha@Example.in');
    await user.click(screen.getByRole('button', { name: 'Email me a code' }));
    await screen.findByRole('heading', { name: 'Check your email' });
    expect(calls.find((c) => c.key === 'POST /auth/otp/request')!.body).toEqual({ email: 'asha@example.in' });
    expect(screen.getByRole('button', { name: /Send a new code in \d+s/ })).toBeDisabled();

    await user.type(screen.getByLabelText('8-digit code'), '12345678');
    await screen.findByRole('heading', { name: 'Before we save anything' });
    expect(router.state.location.search).toBe('?next=%2Ftrends');
  });

  it('rejects a malformed email without calling the server', async () => {
    const user = userEvent.setup();
    const { calls } = mockFetch({});
    renderRoutes(routes, '/sign-in', queryClient);
    await user.type(await screen.findByLabelText('Email address'), 'not-an-email');
    await user.click(screen.getByRole('button', { name: 'Email me a code' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/doesn't look like an email/);
    expect(calls.some((c) => c.key === 'POST /auth/otp/request')).toBe(false);
  });

  it('explains a wrong code, clears the boxes, and keeps the guest result', async () => {
    const user = userEvent.setup();
    guestResult();
    mockFetch({ 'POST /auth/otp/request': { status: 202 }, 'POST /auth/otp/verify': problem(400, 'invalid_code') });
    renderRoutes(routes, '/sign-in', queryClient);
    await user.type(await screen.findByLabelText('Email address'), 'a@example.in');
    await user.click(screen.getByRole('button', { name: 'Email me a code' }));
    await user.type(await screen.findByLabelText('8-digit code'), '00000000');
    expect(await screen.findByRole('alert')).toHaveTextContent(/didn't work/);
    expect(screen.getByLabelText('8-digit code')).toHaveValue('');
    expect(loadGuestResult()).not.toBeNull();
  });

  it('goes straight back to email entry if the code screen has no email', async () => {
    mockFetch({});
    renderRoutes(routes, '/sign-in/code', queryClient);
    expect(await screen.findByRole('heading', { name: 'Sign in with your email' })).toBeInTheDocument();
  });
});

describe('ending a session', () => {
  it('a 401 on a data route clears the cache, guest data and drafts, and goes to sign-in with the return path', async () => {
    const navigate = vi.fn();
    setNavigator(navigate);
    queryClient.setQueryData(['assessments', 'all'], { secret: true });
    queryClient.setQueryData(meKey, ME as Me);
    guestResult();
    setDraft(NEW_DRAFT, { values: emptyDraft(), dirty: true });

    handleApiError(new ApiError(401, 'unauthenticated', null));

    expect(queryClient.getQueryData(['assessments', 'all'])).toBeUndefined();
    expect(queryClient.getQueryData(meKey)).toBeNull();
    expect(loadGuestResult()).toBeNull();
    expect(getDraft(NEW_DRAFT)).toBeUndefined();
    expect(navigate.mock.calls[0]![0]).toMatch(/^\/sign-in\?next=/);
  });

  it('a second 401 arriving on the sign-in screen does not overwrite the return path', () => {
    const navigate = vi.fn();
    setNavigator(navigate);
    window.history.pushState(null, '', '/sign-in?next=%2Ftrends');
    handleApiError(new ApiError(401, 'unauthenticated', null));
    expect(navigate).not.toHaveBeenCalled();
    window.history.pushState(null, '', '/');
  });

  it('a wrong-code 401 is not treated as a lost session', () => {
    const navigate = vi.fn();
    setNavigator(navigate);
    guestResult();
    handleApiError(new ApiError(401, 'invalid_code', null));
    expect(navigate).not.toHaveBeenCalled();
    expect(loadGuestResult()).not.toBeNull();
  });

  it('a guest getting a 401 from /me keeps their result', async () => {
    mockFetch({});
    guestResult();
    await expect(fetchMe()).resolves.toBeNull();
    expect(loadGuestResult()).not.toBeNull();
  });

  it('/me turning 401 for someone who was signed in clears everything', async () => {
    mockFetch({});
    queryClient.setQueryData(meKey, ME as Me);
    queryClient.setQueryData(['journal'], { secret: true });
    guestResult();
    await expect(fetchMe()).resolves.toBeNull();
    expect(loadGuestResult()).toBeNull();
    expect(queryClient.getQueryData(['journal'])).toBeUndefined();
  });

  it('consent_required on a data route goes to the consent screen', async () => {
    const navigate = vi.fn();
    setNavigator(navigate);
    handleApiError(new ApiError(403, 'consent_required', null));
    await waitFor(() => expect(navigate.mock.calls[0]![0]).toMatch(/^\/consent\?next=/));
  });
});

