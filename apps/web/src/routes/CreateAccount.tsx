import { emailSchema, meResponse, OTP_LENGTH, type Me } from '@anxiocare/shared';
import { passwordProblem } from '@anxiocare/shared/passwords';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router';
import { ApiError, errorMessage, passwordFieldError, request } from '@/lib/api';
import { clearRegistration, holdRegistration, readRegistration } from '@/lib/pending-registration';
import { useMe } from '@/lib/queries';
import { GoogleButton } from '@/ui/GoogleButton';
import { nameProblem } from '@/lib/name';
import { NameField } from '@/ui/NameField';
import { OtpInput } from '@/ui/OtpInput';
import { PageTitle } from '@/ui/PageTitle';
import { PASSWORD_HINT, PasswordField } from '@/ui/PasswordField';
import { afterSignIn, safeNext, withNext } from '@/lib/next-path';
import { RESEND_COOLDOWN_S, useSignedIn } from './SignIn';

export function CreateAccount() {
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const navigate = useNavigate();
  const location = useLocation();
  const me = useMe();
  const state = location.state as { email?: string; displayName?: string; passwordError?: string } | null;
  const [name, setName] = useState(state?.displayName ?? '');
  const [email, setEmail] = useState(state?.email ?? '');
  const [password, setPassword] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(state?.passwordError ?? null);
  const [sends, setSends] = useState(0);
  const nameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  // Coming back to this form means starting over, so nothing stays held.
  useEffect(clearRegistration, []);
  useEffect(() => {
    if (state?.passwordError) passwordRef.current?.focus();
  }, [state?.passwordError]);

  // Set when the address already has an account: the owner chose to say so (docs/decisions/015). Holds only the address.
  const [existsFor, setExistsFor] = useState<string | null>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (existsFor) noticeRef.current?.focus();
  }, [existsFor]);
  const ask = useMutation({
    mutationFn: (address: string) => request('POST', '/auth/register/request', { body: { email: address } }),
    onError: (e, address) => {
      if (!(e instanceof ApiError && e.code === 'account_exists')) return;
      // The password isn't needed any more, so it goes now, and was never held anywhere but this field.
      setPassword('');
      setExistsFor(address);
    },
    onSuccess: (_, address) => {
      holdRegistration({ email: address, password, displayName: name.trim() });
      navigate(withNext('/create-account/code', next), { state: { email: address, sentAt: Date.now() } });
    },
  });

  if (me.data) return <Navigate to={afterSignIn(me.data, next)} replace />;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const badName = nameProblem(name);
    setNameError(badName);
    if (badName) {
      setFieldError(null);
      nameRef.current?.focus();
      return;
    }
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) return setFieldError(email.trim() ? "That doesn't look like an email address. Check it and try again." : 'Enter your email address.');
    const problem = passwordProblem(password, parsed.data);
    if (problem) {
      setFieldError(problem);
      passwordRef.current?.focus();
      return;
    }
    setFieldError(null);
    setExistsFor(null);
    setSends((n) => n + 1);
    ask.mutate(parsed.data);
  };

  const exists = ask.error instanceof ApiError && ask.error.code === 'account_exists';
  const error = fieldError ?? (ask.error && !exists ? errorMessage(ask.error) : null);

  return (
    <form className="flex flex-1 flex-col" onSubmit={submit} noValidate>
      <PageTitle className="pt-2 text-2xl" title="Create an account">Create an account</PageTitle>
      <p className="mt-2 text-ink-soft">To save check-ins, see trends and keep a journal. We'll email you a code to prove the address is yours.</p>
      <div className="mt-4"><GoogleButton next={next} /></div>
      <div className="mt-5 flex flex-col gap-4">
        <NameField ref={nameRef} value={name} error={nameError} onChange={(value) => { setName(value); setNameError(null); }} />
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
            aria-describedby={error ? 'create-error' : 'email-note'}
            onChange={(e) => { setEmail(e.target.value); setFieldError(null); }}
          />
          <p id="email-note" className="mt-2 text-sm text-ink-soft">Our emails won't mention anxiety or health.</p>
        </div>
        <PasswordField
          ref={passwordRef}
          label="Password"
          autoComplete="new-password"
          value={password}
          hideNow={sends}
          invalid={!!fieldError && !!password}
          describedBy={error ? 'create-error password-hint' : 'password-hint'}
          onChange={(value) => { setPassword(value); setFieldError(null); }}
        >
          <p id="password-hint" className="mt-2 text-sm text-ink-soft">{PASSWORD_HINT}</p>
        </PasswordField>
        <div aria-live="polite">
          {error && <p id="create-error" role="alert" className="font-medium text-madder">{error}</p>}
        </div>
        {existsFor && (
          <div ref={noticeRef} tabIndex={-1} role="alert" className="patch flex flex-col gap-3">
            <p className="font-semibold">There's already an account for this email.</p>
            <Link className="btn btn-primary" to={withNext('/sign-in', next)} state={{ email: existsFor }}>Sign in</Link>
            <GoogleButton next={next} note={false} />
            <Link className="btn btn-secondary" to={withNext('/forgot-password', next)} state={{ email: existsFor }}>Reset password</Link>
          </div>
        )}
      </div>
      <div className="mt-auto flex flex-col gap-2 pt-6">
        <button type="submit" className="btn btn-primary" disabled={ask.isPending}>{ask.isPending ? 'Sending' : 'Continue'}</button>
        <p className="pt-2 text-center text-sm">Already have an account? <Link className="link inline-block py-2" to={withNext('/sign-in', next)} state={{ email }}>Sign in</Link></p>
        <Link className="btn btn-ghost" to="/">Continue without an account</Link>
      </div>
    </form>
  );
}

export function CreateAccountCode() {
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const location = useLocation();
  const navigate = useNavigate();
  const signedIn = useSignedIn(next);
  // Copied once into this screen's own state, and cleared from where it was: it ends with this screen.
  const [pending] = useState(readRegistration);
  useEffect(clearRegistration, []);
  const sentAt = (location.state as { sentAt?: number } | null)?.sentAt ?? Date.now();

  const [code, setCode] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(() => Math.max(0, RESEND_COOLDOWN_S - Math.floor((Date.now() - sentAt) / 1000)));
  const [resent, setResent] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = window.setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [secondsLeft]);

  const verify = useMutation({
    gcTime: 0,
    mutationFn: () => request<Me>('POST', '/auth/register/verify', {
      body: { email: pending?.email, code: codeRef.current, password: pending?.password, displayName: pending?.displayName },
      schema: meResponse,
    }),
    onSuccess: signedIn,
    onError: (e) => {
      setCode('');
      const passwordError = passwordFieldError(e);
      if (passwordError && pending) {
        navigate(withNext('/create-account', next), { replace: true, state: { email: pending.email, displayName: pending.displayName, passwordError } });
      }
    },
  });
  const codeRef = useRef('');
  const submitCode = (value: string) => {
    codeRef.current = value;
    verify.mutate();
  };
  useEffect(() => {
    if (verify.isError) inputRef.current?.focus();
  }, [verify.isError]);
  const resend = useMutation({
    mutationFn: () => request('POST', '/auth/register/request', { body: { email: pending?.email } }),
    onSuccess: () => {
      setResent(true);
      setSecondsLeft(RESEND_COOLDOWN_S);
      verify.reset();
    },
  });

  if (!pending) return <Navigate to={withNext('/create-account', next)} replace />;

  const error = verify.error ?? resend.error;
  const lockedOut = error instanceof ApiError && error.code === 'rate_limited';

  return (
    <form
      className="flex flex-1 flex-col"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (code.length === OTP_LENGTH) submitCode(code);
      }}
    >
      <PageTitle className="pt-2 text-2xl" title="Enter your code">Check your email</PageTitle>
      <p className="mt-2 break-words text-ink-soft">
        We emailed <strong className="font-semibold text-ink">{pending.email}</strong>. A {OTP_LENGTH}-digit code in it works for 10 minutes.
      </p>
      <div className="mt-5">
        <OtpInput
          ref={inputRef}
          value={code}
          onChange={(v) => { setCode(v); if (verify.error) verify.reset(); }}
          onComplete={submitCode}
          invalid={!!verify.error}
          describedBy={error ? 'code-error' : undefined}
          disabled={verify.isPending}
        />
      </div>
      <div className="mt-3 min-h-6" aria-live="polite">
        {verify.isPending && <p>Checking your code</p>}
        {error && <p id="code-error" role="alert" className="font-medium text-madder">{errorMessage(error)}</p>}
        {!error && resent && !verify.isPending && <p>We've emailed you again. Use the latest code.</p>}
      </div>
      <p className="mt-2 text-sm text-ink-soft">Check your spam folder, and that the address is right. If you don't get it in a few minutes, try again later.</p>
      <div className="mt-auto flex flex-col gap-2 pt-6">
        <button type="submit" className="btn btn-primary" disabled={code.length < OTP_LENGTH || verify.isPending || lockedOut}>Create account</button>
        <button type="button" className="btn btn-secondary" disabled={secondsLeft > 0 || resend.isPending} onClick={() => resend.mutate()}>
          {secondsLeft > 0 ? `Send a new code in ${secondsLeft}s` : resend.isPending ? 'Sending' : 'Send a new code'}
        </button>
        <Link className="btn btn-quiet" to={withNext('/sign-in', next)} state={{ email: pending.email }}>Go to sign in</Link>
        <Link className="btn btn-ghost" to={withNext('/create-account', next)} replace>Use a different email</Link>
      </div>
    </form>
  );
}
