import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { queryClient } from '@/lib/queries';
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
];

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
    expect(await screen.findByRole('link', { name: 'Start the check-in' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in to see saved results' })).toBeInTheDocument();
  });
});
