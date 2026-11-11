import {
  assessmentResponse,
  journalResponse,
  meResponse,
  metaResponse,
  pageOf,
  sessionResponse,
  type Assessment,
  type JournalEntry,
  type Me,
  type Meta,
} from '@anxiocare/shared';
import { MutationCache, QueryCache, QueryClient, useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { ApiError, NetworkError, request } from './api';
import { clearDrafts } from './drafts';
import { clearGuestData } from './guest';
import { discardHeld, holdWork, settleHeld } from './held';
import { withNext } from './next-path';
import { clearAccountCopy, forgetOtherAccounts } from './vault';

/** Registered by the router module, to avoid an import cycle. */
let navigate: (to: string) => void = () => {};
export const setNavigator = (fn: (to: string) => void) => {
  navigate = fn;
};

const currentPath = () => window.location.pathname + window.location.search;

function wipeClientData(client: QueryClient): void {
  client.clear();
  clearGuestData();
  clearDrafts();
  // The encrypted offline copy of an account's safety plan. A guest plan made on purpose stays.
  void clearAccountCopy();
}

/** Everything personal the browser is holding. For a deliberate sign-out and after account deletion. */
export function clearClientData(client: QueryClient = queryClient): void {
  discardHeld();
  wipeClientData(client);
}

/**
 * The session ended without the person choosing to, for example while saving. They may just have written
 * something, so their work is held for them, and they get it back only if they are the one who signs in again.
 */
function sessionEnded(client: QueryClient): void {
  const me = client.getQueryData<Me | null>(meKey);
  if (me) holdWork(me.id);
  wipeClientData(client);
  client.setQueryData(meKey, null);
}

export const reconcileHeld = (me: Me) => settleHeld(me.id);

/**
 * Several requests can fail together, and clearing the cache makes mounted queries fetch again. Only
 * the first may redirect: a later one would see the sign-in URL as "where you were" and lose `next`.
 */
function redirectOnce(to: '/sign-in' | '/consent'): void {
  if (window.location.pathname.startsWith(to)) return;
  navigate(withNext(to, currentPath()));
}

export function handleApiError(error: unknown): void {
  if (!(error instanceof ApiError)) return;
  if (error.status === 401 && error.code !== 'invalid_code') {
    redirectOnce('/sign-in');
    sessionEnded(queryClient);
  } else if (error.status === 403 && error.code === 'consent_required') {
    void queryClient.invalidateQueries({ queryKey: meKey });
    redirectOnce('/consent');
  }
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handleApiError }),
  mutationCache: new MutationCache({ onError: handleApiError }),
  defaultOptions: {
    queries: {
      // In memory only: nothing here is ever persisted.
      networkMode: 'always',
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: false,
      retry: (count, error) => error instanceof NetworkError && count < 1,
    },
    mutations: { networkMode: 'always', retry: false },
  },
});

// ── Keys ──────────────────────────────────────────────────────────────
export const meKey = ['me'] as const;
export const assessmentsKey = ['assessments'] as const;
export const journalKey = ['journal'] as const;
export const sessionsKey = ['sessions'] as const;

// ── Me ────────────────────────────────────────────────────────────────
export async function fetchMe(client: QueryClient = queryClient): Promise<Me | null> {
  try {
    const me = await request('GET', '/me', { schema: meResponse });
    reconcileHeld(me);
    void forgetOtherAccounts(me.id);
    return me;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      // Not signed in is a normal state for a guest. Only a session that has just
      // ended clears what the browser is holding, or a guest would lose their result.
      if (client.getQueryData<Me | null>(meKey)) sessionEnded(client);
      // Even on a cold load: a session that ended elsewhere (expiry, "sign out everywhere", deletion on another device)
      // must not leave that account's safety plan readable offline. A guest's own plan and result are kept.
      else void clearAccountCopy();
      return null;
    }
    throw error;
  }
}

export const useMe = () =>
  useQuery({
    queryKey: meKey,
    queryFn: () => fetchMe(),
    staleTime: 5 * 60_000,
  });

// ── Lists ─────────────────────────────────────────────────────────────
export const assessmentPage = pageOf(assessmentResponse);
export const journalPage = pageOf(journalResponse);
export const sessionList = z.union([z.array(sessionResponse), z.object({ items: z.array(sessionResponse) })]);

export type AssessmentPage = { items: Assessment[]; nextCursor: string | null };
export type JournalPage = { items: JournalEntry[]; nextCursor: string | null };

export const fetchAssessments = (cursor?: string) =>
  request<AssessmentPage>('GET', `/assessments${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, {
    schema: assessmentPage,
  });

export const fetchJournal = (cursor?: string) =>
  request<JournalPage>('GET', `/journal${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, {
    schema: journalPage,
  });

// ── Meta ──────────────────────────────────────────────────────────────

/** How long a deleted account can linger in encrypted backups, in words. The operator confirms the number. */
export const backupWindow = (meta: Meta | undefined) =>
  meta ? `within ${meta.backupRetentionDays} days` : 'within our backup retention period';

export const useMeta = () =>
  useQuery({
    queryKey: ['meta'],
    queryFn: () => request<Meta>('GET', '/meta', { schema: metaResponse }),
    staleTime: 60 * 60_000,
    retry: false,
  });
