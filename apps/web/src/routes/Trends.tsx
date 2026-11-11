import { severityFor, type Assessment } from '@anxiocare/shared';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { errorMessage, request } from '@/lib/api';
import { formatDate } from '@/lib/dates';
import { assessmentsKey, fetchAssessments } from '@/lib/queries';
import { PageTitle } from '@/ui/PageTitle';
import { ConfirmSheet } from '@/ui/Sheet';
import { ErrorState, PageSkeleton } from '@/ui/States';
import { TrendChart } from '@/ui/TrendChart';
import { addDays } from '@anxiocare/shared';
import { useQuery } from '@tanstack/react-query';
import { fetchMoods, moodsKey, todayLocal } from '@/lib/mood';
import { MoodChart } from '@/ui/MoodChart';
import { REFLECTION_THEMES, summarizeReflection, type Reflection, type ReflectionTheme } from '@anxiocare/shared';
import { fetchLastMonth, fetchReflections, oneReflectionKey, reflectionsKey } from '@/lib/reflection';

export default function Trends() {
  const client = useQueryClient();
  const list = useInfiniteQuery({
    queryKey: [...assessmentsKey, 'all'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => fetchAssessments(pageParam),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const [pending, setPending] = useState<Assessment | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => request('DELETE', `/assessments/${encodeURIComponent(id)}`),
    onSuccess: () => {
      setPending(null);
      void client.invalidateQueries({ queryKey: assessmentsKey });
    },
  });

  const items = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);
  const points = useMemo(
    () => [...items].sort((a, b) => a.takenAt.localeCompare(b.takenAt)).map(({ id, takenAt, score }) => ({ id, takenAt, score })),
    [items],
  );

  return (
    <div className="flex flex-col gap-4">
      <PageTitle className="pt-2 text-2xl" title="Trends">Your <span className="whitespace-nowrap">check-ins</span> over time</PageTitle>

      {list.isPending && <PageSkeleton />}
      {list.isError && <ErrorState error={list.error} onRetry={() => void list.refetch()} />}

      {list.isSuccess && items.length === 0 && (
        <section className="flex flex-col gap-3">
          <p className="text-ink-soft">Nothing to show yet. After your first saved check-in, your scores appear here, so you can see how things change and show a doctor if you want to.</p>
          <Link className="btn btn-primary" to="/check-in">Start the check-in</Link>
        </section>
      )}

      {items.length > 0 && (
        <>
          <TrendChart points={points} />
          <Link className="link self-start py-2 text-sm" to="/report">Make a report for your doctor</Link>
          {items.length === 1 && <p className="text-sm text-ink-soft">One check-in so far. The line starts with your next one.</p>}
          <section aria-labelledby="history" className="flex flex-col">
            <h2 id="history" className="text-xl">History</h2>
            <ul className="mt-1 flex flex-col">
              {items.map((a, i) => (
                <li key={a.id}>
                  {i > 0 && <hr className="stitch-rule" />}
                  <div className="flex items-center gap-1">
                    <Link to={`/result/${a.id}`} className="flex-1 py-3 no-underline">
                      <span className="block font-medium">{severityFor(a.score).label}, {a.score} out of 21</span>
                      <span className="block text-sm text-ink-soft">{formatDate(a.takenAt)}</span>
                    </Link>
                    <button type="button" aria-label={`Delete check-in from ${formatDate(a.takenAt)}`} className="-mr-2 grid size-11 place-items-center rounded-full text-ink-soft" onClick={() => setPending(a)}>
                      <Trash2 aria-hidden="true" className="size-5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
          {list.hasNextPage && (
            <button type="button" className="btn btn-quiet" disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
              {list.isFetchingNextPage ? 'Loading' : 'Show older check-ins'}
            </button>
          )}
        </>
      )}

      <hr className="stitch-rule" />
      <MoodSection />
      <ReflectionsSection />

      <ConfirmSheet
        open={pending !== null}
        onClose={() => setPending(null)}
        onConfirm={() => pending && remove.mutate(pending.id)}
        busy={remove.isPending}
        error={remove.error ? errorMessage(remove.error) : null}
        title="Delete this check-in?"
        confirmLabel="Delete check-in"
        cancelLabel="Keep check-in"
      >
        {pending ? `Your check-in from ${formatDate(pending.takenAt)} will be removed. This can't be undone.` : ''}
      </ConfirmSheet>
    </div>
  );
}

/** The last 30 days of the mood log: a separate chart, a separate axis of words, never combined with GAD-7. */
function MoodSection() {
  const today = todayLocal();
  const from = addDays(today, -29);
  const moods = useQuery({ queryKey: [...moodsKey, from, today], queryFn: () => fetchMoods(from, today) });
  if (moods.isPending) return null;
  if (moods.isError) return <ErrorState error={moods.error} onRetry={() => void moods.refetch()} title="Your mood log didn't load" />;
  return (
    <MoodChart entries={moods.data} from={from} to={today} footer={<Link className="link self-start py-2 text-sm" to="/mood">See and change your mood log</Link>} />
  );
}

/** How many of these reflections each strain theme came up in. A count of answers, never a score. */
function themesThatCameUp(reflections: readonly Reflection[]) {
  const counts = new Map<ReflectionTheme, number>();
  for (const r of reflections) for (const theme of summarizeReflection(r.answers).strainThemes) counts.set(theme, (counts.get(theme) ?? 0) + 1);
  return REFLECTION_THEMES.filter((t) => counts.has(t.id))
    .map((t) => ({ theme: t, count: counts.get(t.id)! }))
    .sort((a, b) => b.count - a.count);
}

/** Reflections by date. No chart, because there's nothing to plot: they're not scored. */
function ReflectionsSection() {
  const client = useQueryClient();
  const list = useInfiniteQuery({
    queryKey: [...reflectionsKey, 'all'],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const page = await fetchReflections(pageParam);
      // Each row opens on its own page with no further request.
      for (const r of page.items) client.setQueryData(oneReflectionKey(r.id), r);
      return page;
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);
  // The count covers the whole 30 days, whatever has been loaded below.
  const month = useQuery({ queryKey: [...reflectionsKey, 'month'], queryFn: () => fetchLastMonth() });
  if (list.isPending) return null;
  if (list.isError) return <ErrorState error={list.error} onRetry={() => void list.refetch()} title="Your reflections didn't load" />;
  if (items.length === 0) return null;
  const themes = themesThatCameUp(month.data?.items ?? []);

  return (
    <>
      <hr className="stitch-rule" />
      <section aria-labelledby="reflections" className="flex flex-col gap-2">
        <h2 id="reflections" className="text-xl">Reflections</h2>
        <p className="text-sm text-ink-soft">Reflections aren't scored, so they're not on a chart.</p>
        {themes.length > 0 && (
          <div className="patch flex flex-col gap-2">
            <h3 id="themes" className="text-base font-semibold">Themes that came up most in the last 30 days</h3>
            <ul aria-labelledby="themes" className="flex flex-col gap-1">
              {themes.map(({ theme, count }) => (
                <li key={theme.id}>{theme.label}: {count} {count === 1 ? 'reflection' : 'reflections'}</li>
              ))}
            </ul>
            <p className="text-sm text-ink-soft">A count, not a score: how many reflections had an answer of "Quite a bit" or more on each.{month.data?.complete === false ? ' From your most recent reflections only.' : ''}</p>
          </div>
        )}
        <ul className="mt-1 flex flex-col">
          {items.map((r, i) => (
            <li key={r.id}>
              {i > 0 && <hr className="stitch-rule" />}
              <Link to={`/reflections/${r.id}`} className="block py-3 no-underline">
                <span className="block font-medium">Reflection<span className="sr-only">,</span></span>
                <span className="block text-sm text-ink-soft">{formatDate(r.takenAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
        {list.hasNextPage && (
          <button type="button" className="btn btn-quiet" disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
            {list.isFetchingNextPage ? 'Loading' : 'Show older reflections'}
          </button>
        )}
      </section>
    </>
  );
}
