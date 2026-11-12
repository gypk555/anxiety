import { emailSchema, meResponse, OTP_LENGTH, type Me } from '@anxiocare/shared';
import { passwordProblem } from '@anxiocare/shared/passwords';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router';
import { errorMessage, passwordFieldError, request } from '@/lib/api';
import { afterSignIn, safeNext, withNext } from '@/lib/next-path';
import { useMe } from '@/lib/queries';
import { OtpInput } from '@/ui/OtpInput';
import { PageTitle } from '@/ui/PageTitle';
import { PASSWORD_HINT, PasswordField } from '@/ui/PasswordField';
import { RESEND_COOLDOWN_S, useSignedIn } from './SignIn';

export function ForgotPassword() {
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const navigate = useNavigate();
  const location = useLocation();
  const me = useMe();
  const [email, setEmail] = useState((location.state as { email?: string } | null)?.email ?? '');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const send = useMutation({
    mutationFn: (address: string) => request('POST', '/auth/password/forgot', { body: { email: address } }),
    onSuccess: (_, address) => navigate(withNext('/forgot-password/reset', next), { state: { email: address, sentAt: Date.now() } }),
  });

  if (me.data) return <Navigate to={afterSignIn(me.data, next)} replace />;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) return setFieldError(email.trim() ? "That doesn't look like an email address. Check it and try again." : 'Enter your email address.');
    setFieldError(null);
    send.mutate(parsed.data);
  };
  const error = fieldError ?? (send.error ? errorMessage(send.error) : null);

  return (
    <form className="flex flex-1 flex-col" onSubmit={submit} noValidate>
      <PageTitle className="pt-2 text-2xl" title="Forgot your password?">Forgot your password?</PageTitle>
      <p className="mt-2 text-ink-soft">We'll email you a {OTP_LENGTH}-digit code to choose a new one. It signs you out on your other devices.</p>
      <div className="mt-5">
        <label htmlFor="email" className="mb-2 block font-medium">Email address</label>
        <input
          id="email"
          name="email"
          className="field"
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          value={email}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'email-error' : undefined}
          onChange={(e) => { setEmail(e.target.value); setFieldError(null); }}
        />
        {error && <p id="email-error" role="alert" className="mt-2 font-medium text-madder">{error}</p>}
      </div>
      <div className="mt-auto flex flex-col gap-2 pt-6">
        <button type="submit" className="btn btn-primary" disabled={send.isPending}>{send.isPending ? 'Sending' : 'Email me a code'}</button>
        <Link className="btn btn-ghost" to={withNext('/sign-in', next)} state={{ email }}>Back to sign in</Link>
      </div>
    </form>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const location = useLocation();
  const signedIn = useSignedIn(next);
  const email = (location.state as { email?: string } | null)?.email;
  const sentAt = (location.state as { sentAt?: number } | null)?.sentAt ?? Date.now();
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [sends, setSends] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(() => Math.max(0, RESEND_COOLDOWN_S - Math.floor((Date.now() - sentAt) / 1000)));
  const [resent, setResent] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = window.setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [secondsLeft]);

  const reset = useMutation({
    gcTime: 0,
    mutationFn: () => request<Me>('POST', '/auth/password/reset', { body: { email, code, password }, schema: meResponse }),
    onSuccess: (me) => {
      setPassword('');
      signedIn(me);
    },
    onError: (e) => {
      const passwordError = passwordFieldError(e);
      if (passwordError) {
        setFieldError(passwordError);
      } else {
        setCode('');
      }
    },
  });
  useEffect(() => {
    if (reset.isError && !fieldError) codeRef.current?.focus();
  }, [reset.isError, fieldError]);
  const resend = useMutation({
    mutationFn: () => request('POST', '/auth/password/forgot', { body: { email } }),
    onSuccess: () => {
      setResent(true);
      setSecondsLeft(RESEND_COOLDOWN_S);
      reset.reset();
    },
  });

  if (!email) return <Navigate to={withNext('/forgot-password', next)} replace />;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== OTP_LENGTH) return setFieldError(`Enter the ${OTP_LENGTH}-digit code from the email.`);
    const problem = passwordProblem(password, email);
    if (problem) return setFieldError(problem);
    setFieldError(null);
    setSends((n) => n + 1);
    reset.mutate();
  };

  const error = fieldError ?? (reset.error ? errorMessage(reset.error) : resend.error ? errorMessage(resend.error) : null);

  return (
    <form className="flex flex-1 flex-col" onSubmit={submit} noValidate>
      <PageTitle className="pt-2 text-2xl" title="Choose a new password">Choose a new password</PageTitle>
      <p className="mt-2 break-words text-ink-soft">
        If there's an account for <strong className="font-semibold text-ink">{email}</strong>, we've emailed it a {OTP_LENGTH}-digit code. It works for 10 minutes.
      </p>
      {/* For password managers: they save the new password against this. */}
      <input type="email" name="email" autoComplete="username" value={email} readOnly hidden />
      <div className="mt-5 flex flex-col gap-4">
        <OtpInput ref={codeRef} value={code} onChange={(v) => { setCode(v); setFieldError(null); if (reset.error) reset.reset(); }} invalid={!!reset.error && !fieldError} disabled={reset.isPending} describedBy={error ? 'reset-error' : undefined} />
        <PasswordField
          label="New password"
          autoComplete="new-password"
          value={password}
          hideNow={sends}
          describedBy={error ? 'reset-error reset-hint' : 'reset-hint'}
          invalid={!!fieldError && !!password}
          disabled={reset.isPending}
          onChange={(value) => { setPassword(value); setFieldError(null); }}
        >
          <p id="reset-hint" className="mt-2 text-sm text-ink-soft">{PASSWORD_HINT}</p>
        </PasswordField>
        <div aria-live="polite">
          {error && <p id="reset-error" role="alert" className="font-medium text-madder">{error}</p>}
          {!error && resent && <p>New code sent. Use the latest one.</p>}
        </div>
        <p className="text-sm text-ink-soft">Check your spam folder too. If you don't get a code in a few minutes, check the address, or try again later.</p>
      </div>
      <div className="mt-auto flex flex-col gap-2 pt-6">
        <button type="submit" className="btn btn-primary" disabled={reset.isPending}>{reset.isPending ? 'Saving' : 'Set new password'}</button>
        <button type="button" className="btn btn-secondary" disabled={secondsLeft > 0 || resend.isPending} onClick={() => resend.mutate()}>
          {secondsLeft > 0 ? `Send a new code in ${secondsLeft}s` : resend.isPending ? 'Sending' : 'Send a new code'}
        </button>
        <Link className="btn btn-ghost" to={withNext('/forgot-password', next)} replace state={{ email }}>Use a different email</Link>
      </div>
    </form>
  );
}
