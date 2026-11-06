import { journalResponse, type JournalEntry } from '@anxiocare/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { errorMessage, isNotFound, request } from '@/lib/api';
import { formatDate } from '@/lib/dates';
import { getDraft, hasDirtyDraft, NEW_DRAFT } from '@/lib/drafts';
import { fetchJournal, journalKey } from '@/lib/queries';
import { NotFound } from '@/shell/RouteError';
import { PageTitle } from '@/ui/PageTitle';
import { ConfirmSheet } from '@/ui/Sheet';
import { ErrorState, PageSkeleton } from '@/ui/States';

export function JournalList() {
  const list = useInfiniteQuery({
    queryKey: journalKey,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => fetchJournal(pageParam),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const entries = list.data?.pages.flatMap((p) => p.items) ?? [];
  const draft = hasDirtyDraft(NEW_DRAFT) ? getDraft(NEW_DRAFT) : undefined;

  return (
    <div className="flex flex-col gap-4">
      <PageTitle className="pt-2 text-2xl" title="Journal">Your thought records</PageTitle>
      <Link className="btn btn-primary" to="/journal/new">{draft ? 'Continue your draft' : 'Write a thought record'}</Link>

      {list.isPending && <PageSkeleton />}
      {list.isError && <ErrorState error={list.error} onRetry={() => void list.refetch()} />}

      {list.isSuccess && entries.length === 0 && (
        <section className="flex flex-col gap-2 pt-2">
          <h2 className="text-xl">Nothing here yet</h2>
          <p className="text-ink-soft">
            When a worry keeps going round, it can help to write it down and look at it from another side. Five short steps, skip what you like. Stored encrypted, and only you can read it.
          </p>
        </section>
      )}

      {entries.length > 0 && (
        <ul className="flex flex-col">
          {entries.map((entry, i) => (
            <li key={entry.id}>
              {i > 0 && <hr className="stitch-rule" />}
              <Link to={`/journal/${entry.id}`} className="block py-3.5 no-underline">
                <span className="block text-sm text-ink-soft">{formatDate(entry.createdAt)}</span>
                <span className="mt-0.5 line-clamp-2 block font-display text-lg leading-snug font-semibold">{entry.thought}</span>
                <span className="mt-1 line-clamp-1 block text-sm text-ink-soft">{entry.situation}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {list.hasNextPage && (
        <button type="button" className="btn btn-quiet" disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
          {list.isFetchingNextPage ? 'Loading' : 'Show older entries'}
        </button>
      )}
    </div>
  );
}

export const fetchEntry = (id: string) =>
  request<JournalEntry>('GET', `/journal/${encodeURIComponent(id)}`, {
    schema: journalResponse,
  });

function Block({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg">{heading}</h2>
      <div className="mt-1 whitespace-pre-wrap break-words text-ink-soft">{children}</div>
    </section>
  );
}

export function JournalDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const entry = useQuery({ queryKey: [...journalKey, id], queryFn: () => fetchEntry(id) });
  const remove = useMutation({
    mutationFn: () => request('DELETE', `/journal/${encodeURIComponent(id)}`),
    onSuccess: () => {
      client.removeQueries({ queryKey: [...journalKey, id] });
      void client.invalidateQueries({ queryKey: journalKey });
      navigate('/journal', { replace: true });
    },
  });

  if (entry.isPending) return <PageSkeleton />;
  if (isNotFound(entry.error)) return <NotFound />;
  if (entry.isError) return <ErrorState error={entry.error} onRetry={() => void entry.refetch()} />;
  const e = entry.data;

  return (
    <article className="flex flex-col gap-4">
      <p className="pt-2 text-sm text-ink-soft">{formatDate(e.createdAt)}</p>
      <PageTitle className="break-words text-2xl" title="Thought record">{e.thought}</PageTitle>
      <Block heading="What happened">{e.situation}</Block>
      {(e.feelings.length > 0 || e.intensityBefore !== null) && (
        <Block heading="How it felt">
          {e.feelings.join(', ')}{e.feelings.length > 0 ? '. ' : ''}Strength {e.intensityBefore} out of 10.
        </Block>
      )}
      {e.evidenceFor && <Block heading="What supported the thought">{e.evidenceFor}</Block>}
      {e.evidenceAgainst && <Block heading="What didn't fit">{e.evidenceAgainst}</Block>}
      {e.balancedThought && <Block heading="A more balanced view">{e.balancedThought}</Block>}
      {e.intensityAfter !== null && <Block heading="Afterwards">Strength {e.intensityAfter} out of 10.</Block>}

      <div className="mt-2 flex flex-col gap-2">
        <Link className="btn btn-secondary" to={`/journal/${e.id}/edit`}>Edit</Link>
        <button type="button" className="btn btn-ghost" onClick={() => setConfirming(true)}>Delete</button>
      </div>
      <ConfirmSheet
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => remove.mutate()}
        busy={remove.isPending}
        error={remove.error ? errorMessage(remove.error) : null}
        title="Delete this thought record?"
        confirmLabel="Delete record"
        cancelLabel="Keep record"
      >
        It will be removed from your journal. You can't undo this.
      </ConfirmSheet>
    </article>
  );
}
