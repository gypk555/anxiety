import { emailSchema, meResponse, OTP_LENGTH, type Me } from '@anxiocare/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router';
import { ApiError, errorMessage, request } from '@/lib/api';
import { afterSignIn, safeNext, withNext } from '@/lib/next-path';
import { hasHeldWork } from '@/lib/held';
import { meKey, reconcileHeld, useMe } from '@/lib/queries';
import { forgetOtherAccounts } from '@/lib/vault';
import { GoogleButton } from '@/ui/GoogleButton';
import { OtpInput } from '@/ui/OtpInput';
import { PageTitle } from '@/ui/PageTitle';
import { PasswordField } from '@/ui/PasswordField';

export const RESEND_COOLDOWN_S = 45;

const WHY: Record<string, string> = {
  '/journal': 'Thought records are saved to your account, encrypted, so sign in to write one.',
  '/trends': 'Trends need saved check-ins, so sign in to see yours.',
  '/result': 'Sign in, and you can choose to save the result you just took.',
};

/** What a failed Google sign-in says, by the `error` the API sent back. Nothing in it comes from Google. */
const GOOGLE_PROBLEMS: Record<string, string> = {
  google: "We couldn't sign you in with Google. Try again, or use your email and password.",
  google_link:
    'There is already an account with this email address, and Google isn\'t connected to it. Sign in another way below, with your password or an email code, then choose "Connect Google" in Settings.',
  google_new: "We can't start a new account with Google for this address. Create an account with your email address instead.",
};


/** Everything a sign-in of any kind does on success. */
export function useSignedIn(next: string) {
  const client = useQueryClient();
  const navigate = useNavigate();
  return (me: Me) => {
    reconcileHeld(me);
    // Another account's offline safety plan goes now, not at the next /me refetch.
    void forgetOtherAccounts(me.id);
    client.setQueryData(meKey, me);
    navigate(afterSignIn(me, next), { replace: true });
  };
}

export function SignIn() {
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const googleProblem = GOOGLE_PROBLEMS[params.get('error') ?? ''];
  const navigate = useNavigate();
  const location = useLocation();
  const me = useMe();
  const signedIn = useSignedIn(next);
  const [email, setEmail] = useState((location.state as { email?: string } | null)?.email ?? '');
  const [password, setPassword] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [failures, setFailures] = useState(0);
  const passwordRef = useRef<HTMLInputElement>(null);

  // The password is read from the closure and is never mutation `variables`, and gcTime 0 drops the mutation once
  // it is done with, so nothing keeps it in the cache.
  const login = useMutation({
    gcTime: 0,
    mutationFn: () => request<Me>('POST', '/auth/login', { body: { email: emailSchema.parse(email), password }, schema: meResponse }),
    onSuccess: (signedInAs) => {
      setPassword('');
      signedIn(signedInAs);
    },
    onError: (e) => {
      setPassword('');
      if (e instanceof ApiError && e.code === 'invalid_credentials') setFailures((n) => n + 1);
    },
  });
  // Not in onError: the input is disabled until the mutation settles, and a disabled input can't take focus.
  useEffect(() => {
    if (login.isError) passwordRef.current?.focus();
  }, [login.isError, failures]);

  const send = useMutation({
    mutationFn: (address: string) => request('POST', '/auth/otp/request', { body: { email: address } }),
    onSuccess: (_, address) => navigate(`/sign-in/code?next=${encodeURIComponent(next)}`, { state: { email: address, sentAt: Date.now() } }),
  });

  if (me.data) return <Navigate to={afterSignIn(me.data, next)} replace />;

  const checkedEmail = (): string | null => {
    const parsed = emailSchema.safeParse(email);
    if (parsed.success) return parsed.data;
    setFieldError(email.trim() ? "That doesn't look like an email address. Check it and try again." : 'Enter your email address.');
    return null;
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkedEmail()) return;
    if (!password) return setFieldError('Enter your password, or choose "Email me a code instead".');
    setFieldError(null);
    login.mutate();
  };

  const sendCode = () => {
    const address = checkedEmail();
    if (!address) return;
    setFieldError(null);
    login.reset();
    send.mutate(address);
  };

  const why = Object.entries(WHY).find(([path]) => next.startsWith(path))?.[1];
  const error = fieldError ?? (login.error ? errorMessage(login.error) : send.error ? errorMessage(send.error) : null);
  const held = hasHeldWork();

  return (
    <form className="flex flex-1 flex-col" onSubmit={submit} noValidate>
      <PageTitle className="pt-2 text-2xl" title="Sign in">Sign in</PageTitle>
      {why && <p className="mt-2 text-ink-soft">{why}</p>}
      {held && <p role="status" className="patch mt-3">You were signed out. Sign in with the same email and what you were working on comes back.</p>}
      {googleProblem && !error && <p role="alert" className="mt-3 font-medium text-madder">{googleProblem}</p>}
      {/* Leaving the page for Google would lose what is held in memory, so it isn't offered until that is back. */}
      {!held && <div className="mt-4"><GoogleButton next={next} /></div>}
      <div className="mt-5 flex flex-col gap-4">
        <div>
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
            aria-invalid={fieldError && !email.trim() ? true : undefined}
            aria-describedby={error ? 'sign-in-error' : undefined}
            onChange={(e) => { setEmail(e.target.value); setFieldError(null); }}
          />
        </div>
        <PasswordField
          ref={passwordRef}
          label="Password"
          autoComplete="current-password"
          value={password}
          hideNow={failures}
          invalid={!!login.error}
          describedBy={error ? 'sign-in-error' : undefined}
          disabled={login.isPending}
          onChange={(value) => { setPassword(value); setFieldError(null); if (login.error) login.reset(); }}
        />
        <p className="-mt-2 text-sm"><Link className="link inline-block py-2" to={withNext('/forgot-password', next)} state={{ email }}>Forgot your password?</Link></p>
        <div aria-live="polite">
          {error && <p id="sign-in-error" role="alert" className="font-medium text-madder">{error}</p>}
          {/* From what this screen saw, never from the server, so it says nothing about any address's real state. */}
          {failures >= 3 && (
            <p className="patch mt-2 text-sm">Still not working? After too many tries, password sign-in for this address pauses for up to an hour. An email code works during that time, and Get help and the tools don't need an account.</p>
          )}
        </div>
      </div>
      <div className="mt-auto flex flex-col gap-2 pt-6">
        <button type="submit" className="btn btn-primary" disabled={login.isPending}>{login.isPending ? 'Signing in' : 'Sign in'}</button>
        <button type="button" className="btn btn-secondary" disabled={send.isPending} onClick={sendCode}>{send.isPending ? 'Sending' : 'Email me a code instead'}</button>
        <p className="pt-2 text-center text-sm">New here? <Link className="link inline-block py-2" to={withNext('/create-account', next)} state={{ email }}>Create an account</Link></p>
        <Link className="btn btn-ghost" to="/">Continue without an account</Link>
      </div>
    </form>
  );
}

export function SignInCode() {
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const location = useLocation();
  const signedIn = useSignedIn(next);
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
    onSuccess: signedIn,
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
        We sent a {OTP_LENGTH}-digit code to <strong className="font-semibold text-ink">{email}</strong>. It works for 10 minutes. The email just says "Your sign-in code". It won't mention anxiety or health.
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
          Still not working? After too many wrong tries, sign-in codes for this address can be paused for up to 24 hours, and then even the right code won't work. Your password and devices already signed in keep working, and Get help and the tools don't need an account.
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
