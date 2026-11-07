import { Eye, EyeOff } from 'lucide-react';
import { forwardRef, useId, useState, type ReactNode } from 'react';

/**
 * A real password input, so password managers and paste work. "Show" is a real button in the tab order. Passing
 * `reveal` from outside lets a form hide the text again the moment it is sent.
 */
export const PasswordField = forwardRef<HTMLInputElement, {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'current-password' | 'new-password';
  name?: string;
  invalid?: boolean;
  describedBy?: string;
  disabled?: boolean;
  hideNow?: number;
  children?: ReactNode;
}>(function PasswordField({ label, value, onChange, autoComplete, name = 'password', invalid, describedBy, disabled, hideNow = 0, children }, ref) {
  const id = useId();
  const [shownAt, setShownAt] = useState<number | null>(null);
  // Showing belongs to one send: once the form has been sent (`hideNow` moved on), the text is hidden again.
  const shown = shownAt === hideNow;
  return (
    <div>
      <label htmlFor={id} className="mb-2 block font-medium">{label}</label>
      <div className="relative">
        <input
          ref={ref}
          id={id}
          name={name}
          className="field pr-14"
          type={shown ? 'text' : 'password'}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          value={value}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-ink-soft"
          aria-label={shown ? 'Hide password' : 'Show password'}
          aria-pressed={shown}
          onClick={() => setShownAt(shown ? null : hideNow)}
        >
          {shown ? <EyeOff aria-hidden="true" className="size-5" /> : <Eye aria-hidden="true" className="size-5" />}
        </button>
      </div>
      {children}
    </div>
  );
});

export const PASSWORD_HINT = 'At least 10 characters. A few ordinary words together work well, and spaces are fine.';
