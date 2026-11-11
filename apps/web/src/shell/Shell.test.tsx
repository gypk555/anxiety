import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Outlet } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderRoutes, mockFetch } from '@/test/render';
import { RouteError } from './RouteError';
import { Shell } from './Shell';
import * as exit from '@/lib/quick-exit';
import { Sheet } from '@/ui/Sheet';

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
          { path: '/sheet', element: <><h1>With a sheet</h1><Sheet open onClose={() => {}} title="A sheet">Inside</Sheet></> },
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

  it('has a quick exit next to "Get help" on every screen, including mid check-in, reachable by keyboard', async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(exit, 'quickExit').mockImplementation(() => {});
    mockFetch({});
    renderRoutes(routes, '/check-in/1');
    const button = await screen.findByRole('button', { name: 'Quick exit' });
    const header = screen.getByRole('banner');
    expect(header).toContainElement(button);
    expect(within(header).getByRole('link', { name: 'Get help' })).toBeVisible();
    button.focus();
    await user.keyboard('{Enter}');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('a quick exit is inside every open sheet too, because a modal makes the header unreachable', async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(exit, 'quickExit').mockImplementation(() => {});
    mockFetch({});
    renderRoutes(routes, '/sheet');
    const dialog = await screen.findByRole('dialog', { name: 'A sheet' });
    await user.click(within(dialog).getByRole('button', { name: 'Quick exit' }));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('Escape three times exits from anywhere in the app', async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(exit, 'quickExit').mockImplementation(() => {});
    mockFetch({});
    renderRoutes(routes, '/');
    await screen.findByRole('heading', { name: 'Home' });
    await user.keyboard('{Escape}{Escape}{Escape}');
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
