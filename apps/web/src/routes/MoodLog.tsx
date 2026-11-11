import { addDays, moodLabel, type MoodEntry } from '@anxiocare/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/dates';
import { dayAsDate, deleteMood, earliestMoodDay, fetchMoods, moodDayAllowed, moodsKey, saveMood, todayLocal } from '@/lib/mood';
import { MoodChart } from '@/ui/MoodChart';
import { MoodNote, MoodPicker } from '@/ui/MoodPicker';
import { PageTitle } from '@/ui/PageTitle';
import { ConfirmSheet, Sheet } from '@/ui/Sheet';
import { ErrorState, PageSkeleton } from '@/ui/States';

/** A year back, inside the API's 400-day range. */
const LIST_DAYS = 365;
const CHART_DAYS = 30;

export default function MoodLog() {
  const today = todayLocal();
  const from = addDays(today, -LIST_DAYS);
  const query = useQuery({ queryKey: [...moodsKey, from, today], queryFn: () => fetchMoods(from, today) });
  const [editing, setEditing] = useState<{ day: string | null; entry: MoodEntry | null } | null>(null);

  const chartFrom = addDays(today, -(CHART_DAYS - 1));
  const items = query.data ?? [];
  const recent = items.filter((e) => e.day >= chartFrom);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <PageTitle className="pt-2 text-2xl" title="Your mood log">Your mood log</PageTitle>
        <p className="mt-1 text-ink-soft">One entry a day, by your phone's calendar. Optional, and only you can see it.</p>
      </div>

      {query.isPending && <PageSkeleton />}
      {query.isError && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}

      {query.isSuccess && (
        <>
          <MoodChart entries={recent} from={chartFrom} to={today} />
          <section aria-labelledby="days" className="flex flex-col">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="days" className="text-xl">Days</h2>
              <button type="button" className="btn btn-quiet btn-small" onClick={() => setEditing({ day: null, entry: null })}>Log another day</button>
            </div>
            {items.length === 0 ? (
              <p className="mt-2 text-ink-soft">Nothing logged yet. You can start any day, from Home or here.</p>
            ) : (
              <ul aria-label="Days you logged" className="mt-1 flex flex-col">
                {[...items].reverse().map((e, i) => (
                  <li key={e.day}>
                    {i > 0 && <hr className="stitch-rule" />}
                    <div className="flex items-center gap-2 py-3">
                      <div className="min-w-0 flex-1">
                        <span className="block font-medium">{moodLabel(e.rating)}</span>
                        <span className="block text-sm text-ink-soft">{formatDate(dayAsDate(e.day))}</span>
                        {e.note && <span className="mt-1 block text-sm break-words">{e.note}</span>}
                      </div>
                      <button type="button" className="btn btn-quiet btn-small shrink-0" onClick={() => setEditing({ day: e.day, entry: e })}>
                        Change<span className="sr-only"> {formatDate(dayAsDate(e.day))}</span>
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {editing && <DaySheet key={editing.day ?? 'new'} day={editing.day} entry={editing.entry} onClose={() => setEditing(null)} />}
    </div>
  );
}

function DaySheet({ day, entry, onClose }: { day: string | null; entry: MoodEntry | null; onClose: () => void }) {
  const client = useQueryClient();
  const today = todayLocal();
  const dateId = useId();
  const [chosenDay, setChosenDay] = useState(day ?? addDays(today, -1));
  const [rating, setRating] = useState<number | null>(entry?.rating ?? null);
  const [note, setNote] = useState(entry?.note ?? '');
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const done = () => {
    void client.invalidateQueries({ queryKey: moodsKey });
    onClose();
  };
  const save = useMutation({ mutationFn: () => saveMood(chosenDay, { rating: rating!, note: note.trim() }), onSuccess: done });
  const remove = useMutation({ mutationFn: () => deleteMood(day!), onSuccess: done });

  const submit = () => {
    if (!moodDayAllowed(chosenDay, today)) return setProblem('Choose today or a day in the past year.');
    if (rating === null) return setProblem('Choose how the day was.');
    setProblem(null);
    save.mutate();
  };

  const title = day ? formatDate(dayAsDate(day)) : 'Log another day';
  return (
    <>
      <Sheet open={!confirmDelete} onClose={onClose} title={title}>
        <div className="flex flex-col gap-4">
          {!day && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor={dateId} className="text-sm font-medium">Which day</label>
              <input id={dateId} type="date" className="field" min={earliestMoodDay(today)} max={today} value={chosenDay} onChange={(e) => setChosenDay(e.target.value)} />
            </div>
          )}
          <MoodPicker label="How was it?" value={rating} onChange={setRating} />
          <MoodNote value={note} onChange={setNote} />
          {(problem || save.isError) && <p role="alert" className="font-medium text-madder">{problem ?? errorMessage(save.error)}</p>}
          <div className="flex flex-col gap-2">
            <button type="button" className="btn btn-primary" disabled={save.isPending} onClick={submit}>{save.isPending ? 'Saving' : 'Save'}</button>
            {day && <button type="button" className="btn btn-quiet" onClick={() => setConfirmDelete(true)}>Delete this day</button>}
          </div>
        </div>
      </Sheet>
      <ConfirmSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => remove.mutate()}
        busy={remove.isPending}
        error={remove.error ? errorMessage(remove.error) : null}
        title="Delete this day?"
        confirmLabel="Yes, delete it"
        cancelLabel="Keep it"
      >
        {day ? `What you logged for ${formatDate(dayAsDate(day))} will be removed.` : ''}
      </ConfirmSheet>
    </>
  );
}
