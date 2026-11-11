import { MOOD_LEVELS, MOOD_NOTE_MAX } from '@anxiocare/shared';
import { useId } from 'react';

/** Five words, never faces or colours alone. Buttons with aria-pressed, like the check-in's answers. */
export function MoodPicker({ label, value, onChange }: { label: string; value: number | null; onChange: (rating: number) => void }) {
  const labelId = useId();
  return (
    <div role="group" aria-labelledby={labelId}>
      <h2 id={labelId} className="text-xl">{label}</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {MOOD_LEVELS.map((level) => (
          <button key={level.value} type="button" className="chip" aria-pressed={value === level.value} onClick={() => onChange(level.value)}>
            {level.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function MoodNote({ value, onChange }: { value: string; onChange: (note: string) => void }) {
  const id = useId();
  const countId = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">A note, if you like</label>
      <textarea id={id} className="field min-h-20" maxLength={MOOD_NOTE_MAX} value={value} aria-describedby={countId} onChange={(e) => onChange(e.target.value)} />
      <p id={countId} className="text-right text-xs text-ink-soft tabular-nums">{value.length} of {MOOD_NOTE_MAX}</p>
    </div>
  );
}
