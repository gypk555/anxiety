import { useEffect, useState } from 'react';

const COOLDOWN_S = 45;

/** "Send a new code" inside a sheet, with the same wait as the sign-in screen, because each send spends a quota. */
export function ResendCode({ label, sentNote, pending, error, onResend }: {
  label: string;
  sentNote: string;
  pending: boolean;
  error: string | null;
  onResend: () => Promise<unknown>;
}) {
  const [secondsLeft, setSecondsLeft] = useState(COOLDOWN_S);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = window.setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [secondsLeft]);

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost"
        disabled={secondsLeft > 0 || pending}
        onClick={() => {
          setSent(false);
          onResend().then(
            () => {
              setSent(true);
              setSecondsLeft(COOLDOWN_S);
            },
            () => {},
          );
        }}
      >
        {secondsLeft > 0 ? `${label} in ${secondsLeft}s` : pending ? 'Sending' : label}
      </button>
      <div aria-live="polite">
        {error && <p role="alert" className="font-medium text-madder">{error}</p>}
        {!error && sent && <p className="text-sm">{sentNote}</p>}
      </div>
    </>
  );
}
