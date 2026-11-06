import { CONSENT_CHANGES, CONSENT_VERSION } from '@anxiocare/shared';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { queryClient } from '@/lib/queries';
import { ME, mockFetch, renderRoutes } from '@/test/render';
import Consent from './Consent';

const routes = [
  { path: '/', element: <p>Home page</p> },
  { path: '/consent', element: <Consent /> },
  { path: '/settings', element: <p>Settings page</p> },
  { path: '/tools', element: <p>Tools page</p> },
  { path: '/privacy', element: <p>Privacy page</p> },
  { path: '/terms', element: <p>Terms page</p> },
  { path: '/sign-in', element: <p>Sign-in page</p> },
];
const STALE = { ...ME, consentRequired: true, acceptedConsentVersion: '2000-01-01' };
const NEVER = { ...ME, consentRequired: true, acceptedConsentVersion: null };

afterEach(() => {
  vi.unstubAllGlobals();
  queryClient.clear();
});

describe('first-time consent', () => {
  it('says the new account is deleted after 24 hours if they do not accept, and nothing about existing data', async () => {
    mockFetch({ 'GET /me': { body: NEVER } });
    renderRoutes(routes, '/consent', queryClient);
    expect(await screen.findByRole('heading', { level: 1, name: 'Before we save anything' })).toBeInTheDocument();
    expect(screen.getByText(/this new account.*is deleted after 24 hours/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'What changed' })).not.toBeInTheDocument();
    expect(screen.queryByText(/kept/i)).not.toBeInTheDocument();
  });

  it('offers sign out, and a way to Settings for download and delete, without accepting', async () => {
    mockFetch({ 'GET /me': { body: NEVER } });
    renderRoutes(routes, '/consent', queryClient);
    expect(await screen.findByRole('button', { name: 'Not now, sign me out' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Download or delete my data' })).toHaveAttribute('href', '/settings');
    expect(screen.getByRole('link', { name: 'Use the tools without agreeing' })).toHaveAttribute('href', '/tools');
  });
});

describe('re-prompt', () => {
  it('states what changed, and that existing data is kept and reachable', async () => {
    mockFetch({ 'GET /me': { body: STALE } });
    renderRoutes(routes, '/consent', queryClient);
    expect(await screen.findByRole('heading', { level: 1, name: "We've updated our privacy notice" })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'What changed' })).toBeInTheDocument();
    for (const line of CONSENT_CHANGES.summary) expect(screen.getByText(line)).toBeInTheDocument();
    expect(screen.getByText(/Everything you've saved is still here/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Download or delete my data' })).toHaveAttribute('href', '/settings');
    expect(screen.getByRole('button', { name: 'Not now, sign me out' })).toBeInTheDocument();
  });

  it('never tells someone with an existing account that it will be removed', async () => {
    mockFetch({ 'GET /me': { body: STALE } });
    renderRoutes(routes, '/consent', queryClient);
    await screen.findByRole('heading', { name: 'What changed' });
    expect(screen.queryByText(/24 hours/)).not.toBeInTheDocument();
    expect(screen.queryByText(/nothing is kept/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/new account/i)).not.toBeInTheDocument();
    expect(screen.getByText(/your account and data stay as they are/)).toBeInTheDocument();
  });

  it('accepting posts the current version and carries on to the destination', async () => {
    const fetchMock = mockFetch({
      'GET /me': () => ({ body: fetchMock.calls.some((c) => c.key === 'POST /me/consent') ? { ...ME, acceptedConsentVersion: CONSENT_VERSION } : STALE }),
      'POST /me/consent': { body: ME },
    });
    renderRoutes(routes, '/consent?next=%2Ftools', queryClient);
    await userEvent.click(await screen.findByRole('checkbox', { name: 'I am 18 or older.' }));
    await userEvent.click(screen.getByRole('checkbox', { name: /I agree to AnxioCare storing/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Agree and continue' }));
    expect(await screen.findByText('Tools page')).toBeInTheDocument();
    expect(fetchMock.calls.find((c) => c.key === 'POST /me/consent')!.body).toMatchObject({ version: CONSENT_VERSION });
  });
});

describe('when who you are cannot be loaded', () => {
  it('shows an error with a retry, rather than guess which words are true', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }));
    renderRoutes(routes, '/consent', queryClient);
    expect(await screen.findByRole('button', { name: /Try again/ }, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Agree and continue' })).not.toBeInTheDocument();
  });
});
