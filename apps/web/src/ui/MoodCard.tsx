import { moodLabel } from '@anxiocare/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { errorMessage } from '@/lib/api';
import { fetchMoods, moodsKey, saveMood, todayLocal } from '@/lib/mood';
import { MoodNote, MoodPicker } from './MoodPicker';

/**
 * A gentle card on Home. Optional and quiet: no streaks, no reminders, no "you missed a day". The day is the phone's
 * own calendar day.
 */
export function MoodCard() {
  const client = useQueryClient();
  const today = todayLocal();
  const query = useQuery({ queryKey: [...moodsKey, today, today], queryFn: () => fetchMoods(today, today) });
  const saved = query.data?.[0];
  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [note, setNote] = useState('');

  const save = useMutation({
    mutationFn: () => saveMood(today, { rating: rating!, note: note.trim() }),
    onSuccess: (entry) => {
      client.setQueryData([...moodsKey, today, today], [entry]);
      void client.invalidateQueries({ queryKey: moodsKey });
      setEditing(false);
    },
  });

  if (query.isPending) return null;
  if (query.isError) return null; // Optional: a failure here shouldn't put an error on Home. The mood log page says more.

  if (saved && !editing) {
    return (
      <section aria-labelledby="mood-today" className="patch flex flex-col gap-2">
        <h2 id="mood-today" className="text-sm font-body font-medium tracking-normal text-ink-soft">How are you today?</h2>
        <p>Today you said <strong className="font-display text-xl font-semibold">{moodLabel(saved.rating)}</strong></p>
        {saved.note && <p className="text-sm break-words">{saved.note}</p>}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <button
            type="button"
            className="btn btn-quiet btn-small"
            onClick={() => {
              setRating(saved.rating);
              setNote(saved.note);
              setEditing(true);
            }}
          >
            Change
          </button>
          <Link className="link inline-block py-2 text-sm" to="/mood">Your mood log</Link>
        </div>
      </section>
    );
  }

  return (
    <section className="patch flex flex-col gap-3">
      <MoodPicker label="How are you today?" value={rating} onChange={setRating} />
      <MoodNote value={note} onChange={setNote} />
      {save.isError && <p role="alert" className="font-medium text-madder">{errorMessage(save.error)}</p>}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <button type="button" className="btn btn-primary btn-small" disabled={rating === null || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? 'Saving' : 'Save for today'}
        </button>
        <Link className="link inline-block py-2 text-sm" to="/mood">Your mood log</Link>
      </div>
      <p className="text-xs text-ink-soft">Optional, and only you can see it. Your daily mood log isn't a test score.</p>
    </section>
  );
}
