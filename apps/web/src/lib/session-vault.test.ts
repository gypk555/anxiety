import 'fake-indexeddb/auto';
import { emptySafetyPlan } from '@anxiocare/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ME, mockFetch } from '@/test/render';
import { clearClientData, fetchMe, meKey } from './queries';
import { useSignedIn } from '@/routes/SignIn';
import { loadDevicePlan, saveDevicePlan, wipeVault } from './vault';

const PLAN = { ...emptySafetyPlan(), reasonsToLive: ['Mine'] };
const OTHER = '99999999-9999-4999-8999-999999999999';

afterEach(async () => {
  vi.unstubAllGlobals();
  await wipeVault();
});

const settled = () => vi.waitFor(async () => expect(await loadDevicePlan({ kind: 'account' })).toBeNull());

describe('the device copy follows the session', () => {
  it('sign-out (and account deletion, which uses the same path) removes the account copy and keeps a guest plan', async () => {
    await saveDevicePlan({ kind: 'account', userId: ME.id }, PLAN);
    await saveDevicePlan({ kind: 'guest' }, PLAN);
    clearClientData(new QueryClient());
    await settled();
    expect(await loadDevicePlan({ kind: 'guest' })).not.toBeNull();
  });

  it('another account signing in on this device never sees the first one\'s copy', async () => {
    await saveDevicePlan({ kind: 'account', userId: OTHER }, PLAN);
    mockFetch({ 'GET /me': { body: ME } });
    await fetchMe(new QueryClient());
    await settled();
  });

  it('the same person signing in again keeps their copy', async () => {
    await saveDevicePlan({ kind: 'account', userId: ME.id }, PLAN);
    mockFetch({ 'GET /me': { body: ME } });
    await fetchMe(new QueryClient());
    await new Promise((r) => setTimeout(r, 50));
    expect(await loadDevicePlan({ kind: 'account', userId: ME.id })).not.toBeNull();
  });

  it('a session that ends underneath the person removes it too', async () => {
    await saveDevicePlan({ kind: 'account', userId: ME.id }, PLAN);
    const client = new QueryClient();
    client.setQueryData(meKey, ME);
    mockFetch({});
    await fetchMe(client);
    await settled();
  });

  it('a cold load that finds no session (it expired, or was ended from another device) removes it, and keeps a guest plan', async () => {
    await saveDevicePlan({ kind: 'account', userId: OTHER }, PLAN);
    await saveDevicePlan({ kind: 'guest' }, PLAN);
    mockFetch({});
    expect(await fetchMe(new QueryClient())).toBeNull();
    await settled();
    expect(await loadDevicePlan({ kind: 'guest' })).not.toBeNull();
  });

  it('an in-app sign-in by another account removes the first one\'s copy at once, without waiting for /me', async () => {
    await saveDevicePlan({ kind: 'account', userId: OTHER }, PLAN);
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, createElement(MemoryRouter, null, children));
    const { result } = renderHook(() => useSignedIn('/'), { wrapper });
    result.current(ME);
    await settled();
  });
});
