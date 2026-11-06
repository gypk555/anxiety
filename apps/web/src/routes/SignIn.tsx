import { emailSchema, meResponse, OTP_LENGTH, type Me } from '@anxiocare/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router';
import { ApiError, errorMessage, request } from '@/lib/api';
import { safeNext, withNext } from '@/lib/next-path';
import { hasHeldWork } from '@/lib/held';
import { meKey, reconcileHeld, useMe } from '@/lib/queries';
import { OtpInput } from '@/ui/OtpInput';
import { PageTitle } from '@/ui/PageTitle';

export const RESEND_COOLDOWN_S = 45;

const WHY: Record<string, string> = {
  '/journal': 'Thought records are saved to your account, encrypted, so sign in to write one.',
  '/trends': 'Trends need saved check-ins, so sign in to see yours.',
  '/result': 'Sign in, and you can choose to save the result you just took.',
};

function afterSignIn(me: Me, next: string): string {
  return me.consentRequired ? withNext('/consent', next) : next;
}

export function SignIn() {
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const navigate = useNavigate();
  const me = useMe();
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const send = useMutation({
    mutationFn: (address: string) => request('POST', '/auth/otp/request', { body: { email: address } }),
    onSuccess: (_, address) => navigate(`/sign-in/code?next=${encodeURIComponent(next)}`, { state: { email: address, sentAt: Date.now() } }),
  });

  if (me.data) return <Navigate to={afterSignIn(me.data, next)} replace />;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setFieldError(email.trim() ? "That doesn't look like an email address. Check it and try again." : 'Enter your email address.');
      return;
    }
    setFieldError(null);
    send.mutate(parsed.data);
  };

  const why = Object.entries(WHY).find(([path]) => next.startsWith(path))?.[1];
  const error = fieldError ?? (send.error ? errorMessage(send.error) : null);

  return (
    <form className="flex flex-1 flex-col" onSubmit={submit} noValidate>
      <PageTitle className="pt-2 text-2xl" title="Sign in">Sign in with your email</PageTitle>
      <p className="mt-2 text-ink-soft">
        {why ?? `We'll email you a ${OTP_LENGTH}-digit code. No password, and it's the same whether you're new or coming back.`}
      </p>
      {hasHeldWork() && <p role="status" className="patch mt-3">You were signed out. Sign in with the same email and what you were working on comes back.</p>}
      <div className="mt-5">
        <label htmlFor="email" className="mb-2 block font-medium">Email address</label>
        <input
          id="email"
          className="field"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          value={email}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'email-error' : 'email-note'}
          onChange={(e) => { setEmail(e.target.value); setFieldError(null); }}
        />
        {error && <p id="email-error" role="alert" className="mt-2 font-medium text-madder">{error}</p>}
        <p id="email-note" className="mt-2 text-sm text-ink-soft">The email just says "Your sign-in code". It won't mention anxiety or health.</p>
      </div>
      <div className="mt-auto flex flex-col gap-2 pt-6">
        <button type="submit" className="btn btn-primary" disabled={send.isPending}>{send.isPending ? 'Sending' : 'Email me a code'}</button>
        <Link className="btn btn-ghost" to="/">Continue without an account</Link>
      </div>
    </form>
  );
}

export function SignInCode() {
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const location = useLocation();
  const navigate = useNavigate();
  const client = useQueryClient();
  const email = (location.state as { email?: string } | null)?.email;
  const sentAt = (location.state as { sentAt?: number } | null)?.sentAt ?? Date.now();

  const [code, setCode] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(() => Math.max(0, RESEND_COOLDOWN_S - Math.floor((Date.now() - sentAt) / 1000)));
  const [resent, setResent] = useState(false);
  const [wrongCodes, setWrongCodes] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = window.setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [secondsLeft]);

  const verify = useMutation({
    mutationFn: (value: string) => request<Me>('POST', '/auth/otp/verify', { body: { email, code: value }, schema: meResponse }),
    onSuccess: (me) => {
      reconcileHeld(me);
      client.setQueryData(meKey, me);
      navigate(afterSignIn(me, next), { replace: true });
    },
    onError: (e) => {
      setCode('');
      if (e instanceof ApiError && e.code === 'invalid_code') setWrongCodes((n) => n + 1);
    },
  });
  // Not in onError: the input is still disabled then, and a disabled input can't take focus.
  useEffect(() => {
    if (verify.isError) inputRef.current?.focus();
  }, [verify.isError]);
  const resend = useMutation({
    mutationFn: () => request('POST', '/auth/otp/request', { body: { email } }),
    onSuccess: () => {
      setResent(true);
      setSecondsLeft(RESEND_COOLDOWN_S);
      verify.reset();
    },
  });

  if (!email) return <Navigate to={withNext('/sign-in', next)} replace />;

  const error = verify.error ?? resend.error;
  const lockedOut = error instanceof ApiError && error.code === 'rate_limited';

  return (
    <form
      className="flex flex-1 flex-col"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (code.length === OTP_LENGTH) verify.mutate(code);
      }}
    >
      <PageTitle className="pt-2 text-2xl" title="Enter your code">Check your email</PageTitle>
      <p className="mt-2 break-words text-ink-soft">
        We sent a {OTP_LENGTH}-digit code to <strong className="font-semibold text-ink">{email}</strong>. It works for 10 minutes.
      </p>
      <div className="mt-5">
        <OtpInput
          ref={inputRef}
          value={code}
          onChange={(v) => { setCode(v); if (verify.error) verify.reset(); }}
          onComplete={(v) => verify.mutate(v)}
          invalid={!!verify.error}
          describedBy={error ? 'code-error' : undefined}
          disabled={verify.isPending}
        />
      </div>
      <div className="mt-3 min-h-6" aria-live="polite">
        {verify.isPending && <p>Checking your code</p>}
        {error && <p id="code-error" role="alert" className="font-medium text-madder">{errorMessage(error)}</p>}
        {!error && resent && !verify.isPending && <p>New code sent. Use the latest one.</p>}
      </div>
      {/* From what this screen saw, never from the server, so it says nothing about any address's real state. */}
      {wrongCodes >= 2 && (
        <p className="patch mt-2 text-sm">
          Still not working? After too many wrong tries, sign-in for this address can be paused for up to 24 hours, and then even the right code won't work. Devices already signed in keep working, and Get help and the tools don't need an account.
        </p>
      )}
      <p className="mt-2 text-sm text-ink-soft">Check your spam folder, and that the address is right. If you don't get it in a few minutes, try again later.</p>

      <div className="mt-auto flex flex-col gap-2 pt-6">
        <button type="submit" className="btn btn-primary" disabled={code.length < OTP_LENGTH || verify.isPending || lockedOut}>Continue</button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={secondsLeft > 0 || resend.isPending}
          onClick={() => resend.mutate()}
        >
          {secondsLeft > 0 ? `Send a new code in ${secondsLeft}s` : resend.isPending ? 'Sending' : 'Send a new code'}
        </button>
        <Link className="btn btn-ghost" to={withNext('/sign-in', next)} replace>Use a different email</Link>
      </div>
    </form>
  );
}
