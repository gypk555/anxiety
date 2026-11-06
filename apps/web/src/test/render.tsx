import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router';
import { vi } from 'vitest';

/** Renders routes on a memory router. Shares the app's query client when one is passed. */
export function renderRoutes(routes: RouteObject[], path: string, client?: QueryClient) {
  const queryClient = client ?? new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...utils, router, queryClient };
}

export interface MockResponse {
  status?: number;
  body?: unknown;
}

/** Stubs fetch from a table of "METHOD /path" to response; records every call. */
export function mockFetch(table: Record<string, MockResponse | ((body: unknown) => MockResponse)>) {
  const calls: { key: string; body: unknown; headers: Record<string, string> }[] = [];
  const fn = vi.fn(async (url: string, init: RequestInit = {}) => {
    const key = `${init.method ?? 'GET'} ${String(url).replace('/api/v1', '')}`;
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ key, body, headers: init.headers as Record<string, string> });
    const entry = table[key];
    if (!entry) return new Response(JSON.stringify({ type: 'x', title: 'Unauthenticated', status: 401, code: 'unauthenticated' }), { status: 401 });
    const res = typeof entry === 'function' ? entry(body) : entry;
    const status = res.status ?? 200;
    return new Response(status === 204 || status === 202 ? null : JSON.stringify(res.body ?? {}), { status });
  });
  vi.stubGlobal('fetch', fn);
  return { fn, calls };
}

export const ME = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'asha@example.in',
  displayName: 'Asha',
  createdAt: '2026-08-01T04:00:00.000Z',
  consentRequired: false,
  consentVersion: '2026-11-06',
  acceptedConsentVersion: '2026-11-06' as string | null,
};

export const problem = (status: number, code: string) => ({
  status,
  body: { type: 'about:blank', title: code, status, code },
});
