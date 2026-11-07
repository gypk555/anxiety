import { OTP_LENGTH } from '@anxiocare/shared';
import { forwardRef, useId } from 'react';

/** Keeps digits only, so a pasted "123 456" or "Your code: 123 456" still works. */
export const cleanCode = (raw: string) => raw.replace(/\D/g, '').slice(0, OTP_LENGTH);

/**
 * A single real input, so SMS and email autofill, paste, and screen readers all just
 * work. The boxes are drawn behind it and carry no meaning of their own.
 */
export const OtpInput = forwardRef<HTMLInputElement, {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (code: string) => void;
  label?: string;
  invalid?: boolean;
  describedBy?: string;
  disabled?: boolean;
}>(function OtpInput({ value, onChange, onComplete, label = `${OTP_LENGTH}-digit code`, invalid, describedBy, disabled }, ref) {
  const id = useId();
  const update = (raw: string) => {
    const code = cleanCode(raw);
    onChange(code);
    if (code.length === OTP_LENGTH && code !== value) onComplete?.(code);
  };
  return (
    <div>
      <label htmlFor={id} className="mb-2 block font-medium">{label}</label>
      <div className="relative h-16">
        {/* Split in the middle, the way the code is printed in the email. */}
        <div aria-hidden="true" className="absolute inset-0 flex gap-1">
          {Array.from({ length: OTP_LENGTH }, (_, i) => (
            <div
              key={i}
              data-otp-box
              className={`grid min-w-0 flex-1 place-items-center rounded-lg border-2 bg-surface font-display text-xl font-semibold ${i === OTP_LENGTH / 2 ? 'ml-2' : ''} ${
                invalid ? 'border-madder' : i === value.length ? 'border-ink' : 'border-ink-soft/50'
              }`}
            >
              {value[i] ?? ''}
            </div>
          ))}
        </div>
        <input
          ref={ref}
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          value={value}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          onChange={(e) => update(e.target.value)}
          className="absolute inset-0 h-full w-full cursor-text rounded-xl bg-transparent text-transparent caret-transparent selection:bg-transparent"
        />
      </div>
    </div>
  );
});
