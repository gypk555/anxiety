import 'fake-indexeddb/auto';
import { EMERGENCY_NUMBER, emptySafetyPlan, HELPLINES, SAFETY_PLAN_SECTIONS, type SafetyPlan } from '@anxiocare/shared';
import { QueryClient } from '@tanstack/react-query';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadDevicePlan, saveDevicePlan, wipeVault } from '@/lib/vault';
import { ME, mockFetch, renderRoutes } from '@/test/render';
import { SafetyPlanEdit, SafetyPlanView } from './SafetyPlan';

const routes = [
  { path: '/safety-plan', element: <SafetyPlanView /> },
  { path: '/safety-plan/edit', element: <SafetyPlanEdit /> },
  { path: '/consent', element: <p>Consent page</p> },
];
const PLAN: SafetyPlan = {
  ...emptySafetyPlan(),
  warningSigns: ['Not sleeping'],
  helpContacts: [{ name: 'Didi', phone: '+91 98765 43210' }, { name: 'Neighbour', phone: '' }],
  professionals: [{ name: 'Dr Rao', phone: '(080) 2345-6789' }],
  reasonsToLive: ['My daughter'],
};
const saved = (plan: SafetyPlan) => ({ ...plan, updatedAt: '2026-11-10T10:00:00.000Z' });
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

afterEach(async () => {
  vi.unstubAllGlobals();
  await wipeVault();
});

describe('safety plan, viewing', () => {
  it('always lists 112 and the helplines, even before anything is written', async () => {
    mockFetch({});
    renderRoutes(routes, '/safety-plan', client());
    expect(await screen.findByRole('link', { name: 'Make your plan' })).toHaveAttribute('href', '/safety-plan/edit');
    expect(screen.getByRole('link', { name: `Call ${EMERGENCY_NUMBER.display}` })).toHaveAttribute('href', `tel:${EMERGENCY_NUMBER.tel}`);
    for (const line of HELPLINES) expect(screen.getByRole('link', { name: `Call ${line.name}, ${line.display}` })).toHaveAttribute('href', `tel:${line.tel}`);
  });

  it('shows a signed-in plan in order, with one-tap call buttons, and keeps an encrypted copy for offline', async () => {
    mockFetch({ 'GET /me': { body: ME }, 'GET /safety-plan': { body: saved(PLAN) } });
    renderRoutes(routes, '/safety-plan', client());
    expect(await screen.findByRole('link', { name: 'Call Didi, +91 98765 43210' })).toHaveAttribute('href', 'tel:+919876543210');
    expect(screen.getByRole('link', { name: 'Call Dr Rao, (080) 2345-6789' })).toHaveAttribute('href', 'tel:08023456789');
    expect(screen.getByText('Neighbour')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Call Neighbour/ })).not.toBeInTheDocument();
    const steps = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent ?? '');
    expect(steps).toContain(`Step 1: ${SAFETY_PLAN_SECTIONS[0]!.title}`);
    expect(steps.indexOf(`Step 1: ${SAFETY_PLAN_SECTIONS[0]!.title}`)).toBeLessThan(steps.indexOf(`Step 7: ${SAFETY_PLAN_SECTIONS[6]!.title}`));
    expect(screen.getByText(/A copy is kept on this device, encrypted, so it opens without a connection/)).toBeInTheDocument();
    await waitFor(async () => expect((await loadDevicePlan({ kind: 'account', userId: ME.id }))?.plan).toEqual(PLAN));
  });

  it('offline, after one load, opens the device copy and says so', async () => {
    await saveDevicePlan({ kind: 'account', userId: ME.id }, PLAN);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).endsWith('/me')) return new Response(JSON.stringify(ME), { status: 200 });
      throw new TypeError('Failed to fetch');
    }));
    renderRoutes(routes, '/safety-plan', client());
    expect(await screen.findByRole('link', { name: 'Call Didi, +91 98765 43210' })).toBeInTheDocument();
    expect(screen.getByText(/You're offline. This is the copy saved on this device/)).toBeInTheDocument();
  });

  it('offline with nobody known, after a reload, still opens the last signed-in copy', async () => {
    await saveDevicePlan({ kind: 'account', userId: ME.id }, PLAN);
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }));
    renderRoutes(routes, '/safety-plan', client());
    expect(await screen.findByText('My daughter')).toBeInTheDocument();
  });

  it('offline with only a guest plan, it can still be changed and deleted, because it lives on this device', async () => {
    await saveDevicePlan({ kind: 'guest' }, PLAN);
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }));
    renderRoutes(routes, '/safety-plan', client());
    expect(await screen.findByRole('button', { name: 'Delete this plan' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Change your plan' })).toBeInTheDocument();
  });

  it("never shows another account's copy", async () => {
    await saveDevicePlan({ kind: 'account', userId: '99999999-9999-4999-8999-999999999999' }, PLAN);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).endsWith('/me')) return new Response(JSON.stringify(ME), { status: 200 });
      throw new TypeError('Failed to fetch');
    }));
    renderRoutes(routes, '/safety-plan', client());
    expect(await screen.findByText(/no safety plan is saved on this device/)).toBeInTheDocument();
    expect(screen.queryByText('My daughter')).not.toBeInTheDocument();
  });
});

describe('safety plan, writing', () => {
  it('shows each example as a hint, never as a value, and every section can be left empty', async () => {
    mockFetch({});
    renderRoutes(routes, '/safety-plan/edit', client());
    expect(await screen.findByText(`For example: ${SAFETY_PLAN_SECTIONS[0]!.example}`)).toBeInTheDocument();
    for (const box of screen.getAllByRole('textbox')) expect(box).toHaveValue('');
  });

  it('a guest is told in one line that it stays on this device, encrypted, and can save it there', async () => {
    const user = userEvent.setup();
    mockFetch({});
    const { router } = renderRoutes(routes, '/safety-plan/edit', client());
    expect(await screen.findByText(/kept only on this device, encrypted/)).toBeInTheDocument();
    const signs = screen.getByRole('group', { name: SAFETY_PLAN_SECTIONS[0]!.title });
    await user.type(within(signs).getByRole('textbox', { name: 'Item 1' }), 'Not sleeping');
    const people = screen.getByRole('group', { name: SAFETY_PLAN_SECTIONS[3]!.title });
    await user.click(within(people).getByRole('button', { name: 'Add a person' }));
    await user.type(within(people).getByRole('textbox', { name: 'Name 1' }), 'Didi');
    await user.type(within(people).getByRole('textbox', { name: 'Phone 1' }), '+91 98765 43210');
    await user.click(screen.getByRole('button', { name: 'Save your plan' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/safety-plan'));
    const stored = await loadDevicePlan({ kind: 'guest' });
    expect(stored?.plan.warningSigns).toEqual(['Not sleeping']);
    expect(stored?.plan.helpContacts).toEqual([{ name: 'Didi', phone: '+91 98765 43210' }]);
    expect(localStorage.length + sessionStorage.length).toBe(0);
  });

  it('refuses a phone number with letters in it, in kind words', async () => {
    const user = userEvent.setup();
    mockFetch({});
    renderRoutes(routes, '/safety-plan/edit', client());
    const people = await screen.findByRole('group', { name: SAFETY_PLAN_SECTIONS[3]!.title });
    await user.click(within(people).getByRole('button', { name: 'Add a person' }));
    await user.type(within(people).getByRole('textbox', { name: 'Name 1' }), 'Didi');
    await user.type(within(people).getByRole('textbox', { name: 'Phone 1' }), 'call her');
    await user.click(screen.getByRole('button', { name: 'Save your plan' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/digits/);
    expect(await loadDevicePlan({ kind: 'guest' })).toBeNull();
  });

  it('a signed-in person saves to the account', async () => {
    const user = userEvent.setup();
    const { calls } = mockFetch({
      'GET /me': { body: ME },
      'GET /safety-plan': { status: 404, body: { type: 'x', title: 'x', status: 404, code: 'not_found' } },
      'PUT /safety-plan': (body) => ({ body: saved(body as SafetyPlan) }),
    });
    renderRoutes(routes, '/safety-plan/edit', client());
    const reasons = await screen.findByRole('group', { name: SAFETY_PLAN_SECTIONS[6]!.title });
    await user.type(within(reasons).getByRole('textbox', { name: 'Item 1' }), 'My daughter');
    await user.click(screen.getByRole('button', { name: 'Save your plan' }));
    await waitFor(() => expect(calls.find((c) => c.key === 'PUT /safety-plan')?.body).toEqual({ ...emptySafetyPlan(), reasonsToLive: ['My daughter'] }));
  });

  it('after signing in, offers to move a guest plan to the account, then removes the device copy', async () => {
    const user = userEvent.setup();
    await saveDevicePlan({ kind: 'guest' }, PLAN);
    const { calls } = mockFetch({
      'GET /me': { body: ME },
      'GET /safety-plan': { status: 404, body: { type: 'x', title: 'x', status: 404, code: 'not_found' } },
      'PUT /safety-plan': (body) => ({ body: saved(body as SafetyPlan) }),
    });
    renderRoutes(routes, '/safety-plan', client());
    await user.click(await screen.findByRole('button', { name: 'Move it to your account' }));
    await waitFor(() => expect(calls.find((c) => c.key === 'PUT /safety-plan')?.body).toEqual(PLAN));
    await waitFor(async () => expect(await loadDevicePlan({ kind: 'guest' })).toBeNull());
  });

  it('a guest can delete the device copy at any time', async () => {
    const user = userEvent.setup();
    await saveDevicePlan({ kind: 'guest' }, PLAN);
    mockFetch({});
    renderRoutes(routes, '/safety-plan', client());
    await user.click(await screen.findByRole('button', { name: 'Delete this plan' }));
    await user.click(screen.getByRole('button', { name: 'Yes, delete it' }));
    await waitFor(async () => expect(await loadDevicePlan({ kind: 'guest' })).toBeNull());
    expect(await screen.findByRole('link', { name: 'Make your plan' })).toBeInTheDocument();
  });
});
