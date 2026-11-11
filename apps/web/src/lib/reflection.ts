import {
  pageOf,
  pickReflection,
  REFLECTION_RECENT_SESSIONS,
  reflectionCreateBody,
  reflectionResponse,
  type Me,
  type Reflection,
} from '@anxiocare/shared';
import type { QueryClient } from '@tanstack/react-query';
import { isNotFound, request } from './api';
import { meKey } from './queries';
import { loadRecentReflections, startReflection, type ReflectionProgress, type ReflectionResult } from './reflection-store';

/** The bank ships in this chunk, so a Reflection works offline and for guests with no request for questions. */

export const reflectionsKey = ['reflections'] as const;
export type ReflectionPage = { items: Reflection[]; nextCursor: string | null };
const reflectionPage = pageOf(reflectionResponse);

export const fetchReflections = (cursor?: string, limit?: number) => {
  const params = new URLSearchParams();
  if (limit) params.set('limit', String(limit));
  if (cursor) params.set('cursor', cursor);
  const query = params.toString();
  return request<ReflectionPage>('GET', `/reflections${query ? `?${query}` : ''}`, { schema: reflectionPage });
};

/** One saved reflection, or null if there is none with this id for this person. */
export async function fetchReflection(id: string): Promise<Reflection | null> {
  try {
    return await request<Reflection>('GET', `/reflections/${encodeURIComponent(id)}`, { schema: reflectionResponse });
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

/** The cache entry the saved-reflection page reads, so a row already in a list opens with no request. */
export const oneReflectionKey = (id: string) => [...reflectionsKey, 'one', id] as const;

const MONTH_MS = 30 * 86_400_000;
/** Enough pages to cover the last 30 days, at most this many. */
const MONTH_MAX_PAGES = 10;

/** Reflections of the last 30 days, newest first. `complete` is false only if the bound was reached first. */
export async function fetchLastMonth(now = Date.now()): Promise<{ items: Reflection[]; complete: boolean }> {
  const items: Reflection[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < MONTH_MAX_PAGES; i += 1) {
    const page = await fetchReflections(cursor);
    const recent = page.items.filter((r) => now - new Date(r.takenAt).getTime() <= MONTH_MS);
    items.push(...recent);
    if (!page.nextCursor || recent.length < page.items.length) return { items, complete: true };
    cursor = page.nextCursor;
  }
  return { items, complete: false };
}

/** Replaying the same clientRequestId returns the original row, so a retry is always safe. */
export const saveReflection = (result: ReflectionResult) =>
  request<Reflection>('POST', '/reflections', {
    body: reflectionCreateBody.parse({ clientRequestId: result.clientRequestId, answers: result.answers, note: result.note, takenAt: result.takenAt }),
    schema: reflectionResponse,
  });

export const deleteReflection = (id: string) => request('DELETE', `/reflections/${encodeURIComponent(id)}`);

/**
 * Questions asked in the person's last three reflections: this tab's, and for an account its saved ones too. If the
 * saved ones can't be fetched (offline, say), the tab's alone will do: the reflection must still start.
 */
export async function recentQuestionIds(client: QueryClient): Promise<string[]> {
  const ids = new Set(loadRecentReflections().flat());
  const me = client.getQueryData<Me | null>(meKey);
  if (me && !me.consentRequired) {
    try {
      const page = await client.fetchQuery({
        queryKey: [...reflectionsKey, 'recent'],
        queryFn: () => fetchReflections(undefined, REFLECTION_RECENT_SESSIONS),
        staleTime: 0,
      });
      for (const r of page.items) for (const a of r.answers) ids.add(a.q);
    } catch {
      /* Offline or failing: go on with what this tab knows. */
    }
  }
  return [...ids];
}

export async function beginReflection(client: QueryClient): Promise<ReflectionProgress> {
  const recent = await recentQuestionIds(client);
  return startReflection(pickReflection(recent).map((q) => q.id));
}
