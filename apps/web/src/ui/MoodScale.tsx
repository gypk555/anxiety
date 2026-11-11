import { MOOD_LEVELS } from '@anxiocare/shared';
import { useId, type ReactNode } from 'react';

const HEIGHTS = [6, 9, 12, 15, 18];

/** Five rising bars, the first `level` filled: a picture of where a word sits on the scale. Never the only cue. */
export function LevelBars({ level, className = '' }: { level: number; className?: string }) {
  return (
    <svg viewBox="0 0 34 20" aria-hidden="true" className={`level-bars ${className}`}>
      {HEIGHTS.map((h, i) => (
        <rect key={h} x={i * 7} y={20 - h} width={4.5} height={h} rx={2} className={i < level ? 'on' : 'off'} />
      ))}
    </svg>
  );
}

/**
 * The daily mood as one row of five equal steps, low to high, each a word with its bars. Buttons with aria-pressed,
 * like the check-in's answers.
 */
export function MoodScale({ label, value, onChange, disabled, action }: {
  label: string;
  value: number | null;
  onChange: (rating: number) => void;
  disabled?: boolean;
  action?: ReactNode;
}) {
  const labelId = useId();
  return (
    <div role="group" aria-labelledby={labelId}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 id={labelId} className="text-xl">{label}</h2>
        {action}
      </div>
      <div className="mt-3 grid grid-cols-5 gap-1.5">
        {MOOD_LEVELS.map((level) => (
          <button
            key={level.value}
            type="button"
            className="mood-step"
            aria-pressed={value === level.value}
            disabled={disabled}
            onClick={() => onChange(level.value)}
          >
            <LevelBars level={level.value} />
            {level.label}
          </button>
        ))}
      </div>
    </div>
  );
}
