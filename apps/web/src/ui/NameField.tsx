import { forwardRef, useId, type ReactNode } from 'react';
import { NAME_MAX } from '@/lib/name';

export const NAME_LABEL = 'Your name or a nickname';

/** The one name input: Create account, the name screen and Settings. Its error sits right under it, tied by aria-describedby. */
export const NameField = forwardRef<HTMLInputElement, {
  value: string;
  onChange: (value: string) => void;
  error: string | null;
  hint?: ReactNode;
}>(function NameField({ value, onChange, error, hint }, ref) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [error && errorId, hint && hintId].filter(Boolean).join(' ') || undefined;
  return (
    <div>
      <label htmlFor={id} className="mb-2 block font-medium">{NAME_LABEL}</label>
      <input
        ref={ref}
        id={id}
        name="name"
        className="field"
        maxLength={NAME_MAX}
        autoComplete="given-name"
        required
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && <p id={errorId} role="alert" className="mt-2 font-medium text-madder">{error}</p>}
      {hint && <p id={hintId} className="mt-2 text-sm text-ink-soft">{hint}</p>}
    </div>
  );
});
