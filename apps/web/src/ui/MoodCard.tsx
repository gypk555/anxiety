import { moodLabel, type MoodEntry } from '@anxiocare/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, PencilLine } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { errorMessage } from '@/lib/api';
import { fetchMoods, moodsKey, saveMood, todayLocal } from '@/lib/mood';
import type { ReactNode } from 'react';
import { MoodNote } from './MoodPicker';
import { LevelBars, MoodScale } from './MoodScale';

const MoodLogLink = () => <Link className="link inline-block py-2 text-sm" to="/mood">Mood log</Link>;

/**
 * A gentle card on Home. One tap on a word saves today; a note is optional, after. No streaks, no reminders, no
 * "you missed a day". The day is the phone's own calendar day. `compact` is the quieter form Home uses when a
 * check-in is due and leads the page instead.
 */
export function MoodCard({ compact = false }: { compact?: boolean }) {
  const client = useQueryClient();
  const today = todayLocal();
  const key = [...moodsKey, today, today];
  const query = useQuery({ queryKey: key, queryFn: () => fetchMoods(today, today) });
  const saved = query.data?.[0];
  const [mode, setMode] = useState<'view' | 'change' | 'note'>('view');
  const [rating, setRating] = useState<number | null>(null);
  const [note, setNote] = useState('');
  // After a save, focus goes to what was saved: the tapped step is gone, and focus shouldn't fall to the page.
  const focusResult = useRef(false);
  const takeFocus = (el: HTMLElement | null) => {
    if (el && focusResult.current) {
      focusResult.current = false;
      el.focus();
    }
  };

  const save = useMutation({
    mutationFn: (body: { rating: number; note: string }) => saveMood(today, body),
    // The query as it was when the save began. If it's gone when the answer comes (sign-out, quick exit or
    // deletion cleared the cache), the answer belongs to someone who has left: it must not be put back.
    onMutate: () => client.getQueryCache().find({ queryKey: key, exact: true }),
    onSuccess: (entry: MoodEntry, _body, before) => {
      if (!before || client.getQueryCache().find({ queryKey: key, exact: true }) !== before) return;
      client.setQueryData(key, [entry]);
      void client.invalidateQueries({ queryKey: moodsKey });
      focusResult.current = true;
      setMode('view');
    },
  });

  if (query.isPending) return null;
  if (query.isError) return null; // Optional: a failure here shouldn't put an error on Home. The mood log page says more.

  const choose = (r: number) => {
    if (save.isPending) return;
    setRating(r);
    save.mutate({ rating: r, note: saved?.note ?? '' });
  };
  const error = save.isError && <p role="alert" className="font-medium text-madder">{errorMessage(save.error)}</p>;
  const change = (r: number) => {
    setRating(r);
    save.reset();
    setMode('change');
  };
  // One live region in one place for every view of the card, so the announcement lands in a region that was already there.
  const withStatus = (view: ReactNode) => (
    <>
      {view}
      <p aria-live="polite" className="sr-only">{save.isSuccess ? 'Saved for today' : ''}</p>
    </>
  );

  if (saved && mode !== 'change') {
    const word = moodLabel(saved.rating);
    if (compact) {
      return withStatus(
        <section aria-label="Your mood today" className="patch flex items-center gap-3 py-3.5">
          <p ref={takeFocus} tabIndex={-1} className="flex-1">
            <span className="block text-sm text-ink-soft">Today you said</span>
            <strong className="font-display text-xl font-semibold">{word}</strong>
          </p>
          <button type="button" className="btn btn-quiet btn-small" onClick={() => change(saved.rating)}>Change</button>
        </section>
      );
    }
    return withStatus(
      <section aria-labelledby="mood-today" className="patch-quilted flex flex-col gap-3.5">
        <div className="flex items-center gap-3.5">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-surface-2 text-madder">
            <Check aria-hidden="true" className="size-5" strokeWidth={2.2} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <p className="text-sm text-ink-soft">Saved for today</p>
              <MoodLogLink />
            </div>
            <h2 id="mood-today" ref={takeFocus} tabIndex={-1} className="text-xl">You're feeling {word.toLowerCase()}</h2>
          </div>
          <LevelBars level={saved.rating} className="!h-6 !w-10" />
        </div>
        {saved.note && mode !== 'note' && <p className="text-sm break-words">{saved.note}</p>}
        {mode === 'note' ? (
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate({ rating: saved.rating, note: note.trim() });
            }}
          >
            <MoodNote value={note} onChange={setNote} />
            {error}
            <div className="flex gap-2">
              <button type="submit" className="btn btn-primary btn-small flex-1" disabled={save.isPending}>{save.isPending ? 'Saving' : 'Save note'}</button>
              <button type="button" className="btn btn-quiet btn-small flex-1" onClick={() => { save.reset(); setMode('view'); }}>Cancel</button>
            </div>
          </form>
        ) : (
          <div className="flex gap-2">
            <button type="button" className="btn btn-quiet btn-small flex-1" onClick={() => { setNote(saved.note); save.reset(); setMode('note'); }}>
              <PencilLine aria-hidden="true" className="size-4" />
              {saved.note ? 'Edit note' : 'Add a note'}
            </button>
            <button type="button" className="btn btn-secondary btn-small flex-1" onClick={() => change(saved.rating)}>Change</button>
          </div>
        )}
      </section>,
    );
  }

  return withStatus(
    <section className="patch-quilted flex flex-col gap-3">
      <MoodScale label="How are you today?" value={rating} onChange={choose} disabled={save.isPending} action={<MoodLogLink />} />
      {error}
      <p className="text-xs text-ink-soft">One tap saves it for today. Only you can see this, and it isn't a test score.</p>
    </section>,
  );
}
