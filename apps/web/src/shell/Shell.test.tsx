import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Outlet } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderRoutes, mockFetch } from '@/test/render';
import { RouteError } from './RouteError';
import { Shell } from './Shell';

const refresh = vi.fn();
let needRefresh = false;
vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [needRefresh, () => {}],
    offlineReady: [false, () => {}],
    updateServiceWorker: refresh,
  }),
}));

function Boom(): never {
  throw new Error('error loading dynamically imported module: /assets/Trends.js');
}

const routes = [
  {
    element: <Shell />,
    children: [
      {
        errorElement: <RouteError />,
        element: <Outlet />,
        children: [
          { path: '/', element: <h1>Home</h1> },
          { path: '/help', element: <h1>Help screen</h1> },
          { path: '/check-in/1', element: <h1>Question</h1>, handle: { focus: true } },
          { path: '/broken', element: <Boom /> },
        ],
      },
    ],
  },
];

afterEach(() => {
  needRefresh = false;
  vi.unstubAllGlobals();
});

describe('shell', () => {
  it('shows "Get help" on every screen, including mid check-in where the tabs are gone', async () => {
    mockFetch({});
    renderRoutes(routes, '/check-in/1');
    expect(await screen.findByRole('link', { name: 'Get help' })).toHaveAttribute('href', '/help');
    expect(screen.queryByRole('link', { name: 'Journal' })).not.toBeInTheDocument();
  });

  it('a screen whose chunk failed keeps "Get help", and Help opens without any reload', async () => {
    const user = userEvent.setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch({});
    renderRoutes(routes, '/broken');
    expect(await screen.findByRole('heading', { level: 1, name: "This screen didn't load" })).toBeInTheDocument();
    await user.click(within(screen.getByRole('main')).getByRole('link', { name: 'Go to Help' }));
    expect(await screen.findByRole('heading', { name: 'Help screen' })).toBeInTheDocument();
  });

  it('offers a new version quietly, and refreshes only when asked', async () => {
    const user = userEvent.setup();
    needRefresh = true;
    mockFetch({});
    renderRoutes(routes, '/');
    expect(await screen.findByText('New version available')).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(refresh).toHaveBeenCalledWith(true);
  });

  it('announces being offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    mockFetch({});
    renderRoutes(routes, '/');
    expect(await screen.findByRole('status')).toHaveTextContent(/offline/);
  });
});
