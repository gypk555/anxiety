import { emailSchema, OTP_LENGTH, type Me, type SessionInfo } from '@anxiocare/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Download, Laptop, Moon, Sun } from 'lucide-react';
import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { ApiError, errorMessage, NetworkError, request, requestFile } from '@/lib/api';
import { formatDateTime } from '@/lib/dates';
import { backupWindow, clearClientData, meKey, sessionList, sessionsKey, useMe, useMeta } from '@/lib/queries';
import { useTheme, type ThemeChoice } from '@/lib/theme';
import { OtpInput } from '@/ui/OtpInput';
import { PageTitle } from '@/ui/PageTitle';
import { ResendCode } from '@/ui/ResendCode';
import { ConfirmSheet, Sheet } from '@/ui/Sheet';
import { ErrorState, PageSkeleton } from '@/ui/States';

const CODE_HELP = "Check your spam folder too. If you don't get a code in a few minutes, try again later.";

function Section({ title, id, children }: { title: string; id: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-xl">{title}</h2>
      {children}
    </section>
  );
}

const THEMES: { id: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { id: 'system', label: 'Phone setting', icon: Laptop },
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
];

function ThemePicker() {
  const [theme, setTheme] = useTheme();
  // The radio pattern: one Tab stop, and arrow keys move and choose.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const index = THEMES.findIndex((t) => t.id === theme);
    const next = (index + step + THEMES.length) % THEMES.length;
    setTheme(THEMES[next]!.id);
    e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
  };
  return (
    <Section title="Appearance" id="appearance">
      <div role="radiogroup" aria-labelledby="appearance" className="grid grid-cols-3 gap-2" onKeyDown={onKeyDown}>
        {THEMES.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={theme === id}
            tabIndex={theme === id ? 0 : -1}
            onClick={() => setTheme(id)}
            className="chip min-h-16 flex-col justify-center gap-1 rounded-2xl px-1 text-center leading-tight"
          >
            <Icon aria-hidden="true" className="size-5" />
            {label}
          </button>
        ))}
      </div>
    </Section>
  );
}

/** Add to home screen, where the browser offers it. */
let installEvent: (Event & { prompt: () => Promise<void> }) | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installEvent = e as Event & { prompt: () => Promise<void> };
  });
}

function InstallRow() {
  const [, force] = useState(0);
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (standalone || (!installEvent && !ios)) return null;
  return (
    <Section title="Keep it on your phone" id="install">
      {installEvent ? (
        <button
          type="button"
          className="btn btn-quiet"
          onClick={() => {
            void installEvent?.prompt();
            installEvent = null;
            force((n) => n + 1);
          }}
        >
          Add to home screen
        </button>
      ) : (
        <p className="text-sm text-ink-soft">In Safari, tap Share, then "Add to Home Screen". Help and the tools will then open offline.</p>
      )}
    </Section>
  );
}

function LegalLinks() {
  return (
    <Section title="About and legal" id="legal">
      <ul className="flex flex-col">
        {[
          { to: '/privacy', label: 'Privacy notice' },
          { to: '/terms', label: 'Terms of use' },
          { to: '/about', label: 'About AnxioCare and the GAD-7' },
        ].map((l) => (
          <li key={l.to}><Link className="link inline-block py-2.5" to={l.to}>{l.label}</Link></li>
        ))}
      </ul>
    </Section>
  );
}

export default function Settings() {
  const me = useMe();
  const location = useLocation();
  const notice = (location.state as { notice?: string } | null)?.notice;
  return (
    <div className="flex flex-col gap-7">
      <PageTitle className="pt-2 text-2xl" title="Settings">Settings</PageTitle>
      {notice && <p role="status" className="patch">{notice}</p>}
      {me.isPending && <PageSkeleton />}
      {me.isError && !(me.error instanceof NetworkError) && <ErrorState error={me.error} onRetry={() => void me.refetch()} />}
      {me.data ? (
        me.data.consentRequired ? <RightsOnlySettings me={me.data} /> : <AccountSettings me={me.data} />
      ) : me.isError && me.error instanceof NetworkError ? (
        <section className="patch flex flex-col gap-3">
          <h2 className="text-xl">We can't load your account</h2>
          <p className="text-ink-soft">You may be offline. If you're signed in, your details, and the controls to download or delete your data, will show here once you're connected. The check-in and tools still work.</p>
          <button type="button" className="btn btn-quiet btn-small self-start" onClick={() => void me.refetch()}>Try again</button>
        </section>
      ) : me.isSuccess && !me.data ? (
        <section className="patch flex flex-col gap-3">
          <h2 className="text-xl">You're not signed in</h2>
          <p className="text-ink-soft">The check-in and tools work without an account. Sign in to save check-ins, see trends and keep a journal.</p>
          <Link className="btn btn-primary" to="/sign-in?next=%2Fsettings">Sign in</Link>
        </section>
      ) : null}
      <ThemePicker />
      <InstallRow />
      <LegalLinks />
    </div>
  );
}

function AccountSettings({ me }: { me: Me }) {
  return (
    <>
      <ProfileName me={me} />
      <EmailChange me={me} />
      <Sessions />
      <YourData />
      <SignOut />
      <DeleteAccount />
    </>
  );
}

/**
 * For someone who hasn't accepted the current notice. Their rights can't wait on that, and the server keeps these
 * open: see "never locks anyone out" in apps/api/test/data.test.ts. Changing the name or email needs consent, so those wait.
 */
function RightsOnlySettings({ me }: { me: Me }) {
  return (
    <>
      <section aria-labelledby="agreement" className="patch flex flex-col gap-3">
        <h2 id="agreement" className="text-xl">Your agreement is needed</h2>
        {me.acceptedConsentVersion !== null ? (
          <p>We've updated our privacy notice. Your data is kept, and nothing is deleted while you decide. Until you agree, the app can't show or save your check-ins and journal, but you can download them, delete your account or sign out here.</p>
        ) : (
          <p>You haven't agreed to the privacy notice yet, so nothing more is saved. If you don't agree, this new account is deleted after 24 hours. You can also download what's held, delete it now or sign out here.</p>
        )}
        <Link className="btn btn-primary" to="/consent?next=%2Fsettings">Review and agree</Link>
      </section>
      <Section title="Email" id="email-section">
        <p className="break-words">{me.email}</p>
      </Section>
      <Sessions />
      <YourData />
      <SignOut />
      <DeleteAccount />
    </>
  );
}

function ProfileName({ me }: { me: Me }) {
  const client = useQueryClient();
  const [name, setName] = useState(me.displayName ?? '');
  const [saved, setSaved] = useState(false);
  const save = useMutation({
    mutationFn: () => request('PATCH', '/me', { body: { displayName: name.trim() || null } }),
    onSuccess: () => {
      setSaved(true);
      void client.invalidateQueries({ queryKey: meKey });
    },
  });
  const changed = name.trim() !== (me.displayName ?? '');
  return (
    <Section title="Your name" id="name">
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <label htmlFor="display-name" className="text-sm text-ink-soft">Optional. Only used to greet you.</label>
        <input
          id="display-name"
          className="field"
          maxLength={60}
          autoComplete="given-name"
          value={name}
          onChange={(e) => { setName(e.target.value); setSaved(false); }}
        />
        {changed && <button type="submit" className="btn btn-primary btn-small" disabled={save.isPending}>Save name</button>}
        <div aria-live="polite">
          {saved && !changed && <p className="flex items-center gap-1.5 text-sm"><Check aria-hidden="true" className="size-4" />Name saved</p>}
          {save.error && <p role="alert" className="font-medium text-madder">{errorMessage(save.error)}</p>}
        </div>
      </form>
    </Section>
  );
}

function EmailChange({ me }: { me: Me }) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [address, setAddress] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [currentCode, setCurrentCode] = useState('');
  const [code, setCode] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const close = () => {
    setOpen(false);
    setAddress('');
    setSentTo(null);
    setCurrentCode('');
    setCode('');
    setFieldError(null);
    send.reset();
    verify.reset();
  };
  const send = useMutation({
    mutationFn: (newEmail: string) => request('POST', '/me/email/request', { body: { newEmail } }),
    onSuccess: (_, newEmail) => setSentTo(newEmail),
  });
  const verify = useMutation({
    mutationFn: () => request('POST', '/me/email/verify', { body: { newEmail: sentTo, currentCode, code } }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: meKey });
      setDone(true);
      close();
    },
    onError: () => {
      setCurrentCode('');
      setCode('');
    },
  });
  const ready = currentCode.length === OTP_LENGTH && code.length === OTP_LENGTH;
  const verifyError = verify.error instanceof ApiError && verify.error.code === 'invalid_code'
    ? "Those codes didn't work. Check both emails and enter the latest code from each."
    : verify.error
      ? errorMessage(verify.error)
      : null;

  return (
    <Section title="Email" id="email-section">
      <p className="break-words">{me.email}</p>
      {done && <p role="status" className="text-sm">Email updated. Use it next time you sign in.</p>}
      <button type="button" className="btn btn-quiet btn-small self-start" onClick={() => { setDone(false); setOpen(true); }}>Change email</button>
      <Sheet open={open} onClose={close} title="Change your email">
        {!sentTo ? (
          <form
            className="flex flex-col gap-3"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              const parsed = emailSchema.safeParse(address);
              if (!parsed.success) return setFieldError("That doesn't look like an email address.");
              setFieldError(null);
              send.mutate(parsed.data);
            }}
          >
            <p className="text-ink-soft">We'll email one code to your current address and one to the new address. You'll need both.</p>
            <label htmlFor="new-email" className="font-medium">New email address</label>
            <input
              id="new-email"
              className="field"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              value={address}
              aria-invalid={fieldError ? true : undefined}
              onChange={(e) => setAddress(e.target.value)}
            />
            {(fieldError || send.error) && <p role="alert" className="font-medium text-madder">{fieldError ?? errorMessage(send.error)}</p>}
            <button type="submit" className="btn btn-primary" disabled={send.isPending}>{send.isPending ? 'Sending' : 'Send codes'}</button>
          </form>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (ready) verify.mutate();
            }}
          >
            <div>
              <OtpInput label="Code sent to your current address" describedBy="current-inbox" value={currentCode} onChange={setCurrentCode} invalid={!!verify.error} disabled={verify.isPending} />
              <p id="current-inbox" className="mt-1 break-words text-sm text-ink-soft">{me.email}</p>
            </div>
            <div>
              <OtpInput label="Code sent to your new address" describedBy="new-inbox" value={code} onChange={setCode} invalid={!!verify.error} disabled={verify.isPending} />
              <p id="new-inbox" className="mt-1 break-words text-sm text-ink-soft">{sentTo}</p>
            </div>
            <p className="text-sm text-ink-soft">{CODE_HELP}</p>
            {verifyError && <p role="alert" className="font-medium text-madder">{verifyError}</p>}
            <button type="submit" className="btn btn-primary" disabled={!ready || verify.isPending}>Confirm new email</button>
            <ResendCode
              label="Send new codes"
              sentNote="New codes sent. Use the latest one from each inbox."
              error={send.error ? errorMessage(send.error) : null}
              pending={send.isPending}
              onResend={() => {
                verify.reset();
                return send.mutateAsync(sentTo);
              }}
            />
          </form>
        )}
      </Sheet>
    </Section>
  );
}

function Sessions() {
  const client = useQueryClient();
  const sessions = useQuery({
    queryKey: sessionsKey,
    queryFn: async (): Promise<SessionInfo[]> => {
      const data = await request('GET', '/auth/sessions', { schema: sessionList });
      return Array.isArray(data) ? data : data.items;
    },
  });
  const [pending, setPending] = useState<SessionInfo | null>(null);
  const revoke = useMutation({
    mutationFn: (id: string) => request('DELETE', `/auth/sessions/${encodeURIComponent(id)}`),
    onSuccess: () => {
      setPending(null);
      void client.invalidateQueries({ queryKey: sessionsKey });
    },
  });
  return (
    <Section title="Signed-in devices" id="sessions">
      {sessions.isPending && <PageSkeleton />}
      {sessions.isError && <ErrorState error={sessions.error} onRetry={() => void sessions.refetch()} />}
      {sessions.data && (
        <ul className="flex flex-col">
          {sessions.data.map((s, i) => (
            <li key={s.id}>
              {i > 0 && <hr className="stitch-rule" />}
              <div className="flex items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="break-words font-medium">{s.deviceLabel}</p>
                  <p className="text-sm text-ink-soft">{s.current ? 'This device' : `Last used ${formatDateTime(s.lastSeenAt)}`}</p>
                </div>
                {!s.current && (
                  <button type="button" className="btn btn-quiet btn-small shrink-0" aria-label={`Sign out ${s.deviceLabel}`} onClick={() => setPending(s)}>Sign out</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <ConfirmSheet
        open={pending !== null}
        onClose={() => setPending(null)}
        onConfirm={() => pending && revoke.mutate(pending.id)}
        busy={revoke.isPending}
        error={revoke.error ? errorMessage(revoke.error) : null}
        title="Sign out this device?"
        confirmLabel="Sign out device"
        cancelLabel="Keep signed in"
      >
        {pending?.deviceLabel} will need a new code to sign in again.
      </ConfirmSheet>
    </Section>
  );
}

function YourData() {
  const [state, setState] = useState<'idle' | 'working' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const download = async () => {
    setState('working');
    setError(null);
    try {
      const { filename, text } = await requestFile('/me/export');
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setState('done');
    } catch (e) {
      setError(errorMessage(e));
      setState('idle');
    }
  };
  return (
    <Section title="Your data" id="data">
      <p className="text-sm text-ink-soft">A copy of everything we hold about you, as a JSON file. It isn't encrypted once it's on your phone, so keep it somewhere safe.</p>
      <button type="button" className="btn btn-quiet btn-small self-start" disabled={state === 'working'} onClick={() => void download()}>
        <Download aria-hidden="true" className="size-4" />
        {state === 'working' ? 'Preparing' : 'Download my data'}
      </button>
      <div aria-live="polite">
        {state === 'done' && <p className="text-sm">Download started.</p>}
        {error && <p role="alert" className="font-medium text-madder">{error}</p>}
      </div>
    </Section>
  );
}

function SignOut() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const [confirmAll, setConfirmAll] = useState(false);
  const logout = useMutation({
    mutationFn: (path: '/auth/logout' | '/auth/logout-all') => request('POST', path),
    onSuccess: () => {
      clearClientData();
      client.setQueryData(meKey, null);
      navigate('/', { replace: true });
    },
  });
  return (
    <Section title="Sign out" id="signout">
      <div className="flex flex-col gap-2">
        <button type="button" className="btn btn-secondary" disabled={logout.isPending} onClick={() => logout.mutate('/auth/logout')}>Sign out</button>
        <button type="button" className="btn btn-ghost" onClick={() => setConfirmAll(true)}>Sign out on all devices</button>
      </div>
      {logout.error && !confirmAll && <p role="alert" className="font-medium text-madder">{errorMessage(logout.error)}</p>}
      <ConfirmSheet
        open={confirmAll}
        onClose={() => setConfirmAll(false)}
        onConfirm={() => logout.mutate('/auth/logout-all')}
        busy={logout.isPending}
        error={logout.error ? errorMessage(logout.error) : null}
        title="Sign out on all devices?"
        confirmLabel="Sign out everywhere"
        cancelLabel="Stay signed in"
      >
        Every device, including this one, will need a new code to sign in. Your data stays saved.
      </ConfirmSheet>
    </Section>
  );
}

function DeleteAccount() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState('');
  const meta = useMeta();

  const send = useMutation({
    mutationFn: () => request('POST', '/me/delete/request'),
    onSuccess: () => setCodeSent(true),
  });
  const confirm = useMutation({
    mutationFn: () => request('POST', '/me/delete/confirm', { body: { code } }),
    onSuccess: () => {
      clearClientData();
      client.setQueryData(meKey, null);
      navigate('/settings', { replace: true, state: { notice: 'Your account and all your data have been deleted.' } });
    },
    onError: () => setCode(''),
  });

  useEffect(() => {
    if (!open) {
      setCodeSent(false);
      setCode('');
      send.reset();
      confirm.reset();
    }
  }, [open]);

  return (
    <Section title="Delete your account" id="delete">
      <p className="text-sm text-ink-soft">Removes your account, check-ins and journal, and withdraws your consent.</p>
      <button type="button" className="btn btn-quiet btn-small self-start" onClick={() => setOpen(true)}>Delete my account</button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Delete your account?">
        {!codeSent ? (
          <div className="flex flex-col gap-3">
            <ul className="flex list-disc flex-col gap-1 pl-5 text-ink-soft">
              <li>Your check-ins, journal, name and email are removed from our database right away. There's no waiting period, and you can't undo it.</li>
              <li>Encrypted backups age out {backupWindow(meta.data)}.</li>
              <li>You may want to <strong className="font-semibold">download your data</strong> first.</li>
            </ul>
            <p className="text-ink-soft">To be sure it's you, we'll email a code first.</p>
            {send.error && <p role="alert" className="font-medium text-madder">{errorMessage(send.error)}</p>}
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>Keep my account</button>
            <button type="button" className="btn btn-quiet" disabled={send.isPending} onClick={() => send.mutate()}>{send.isPending ? 'Sending' : 'Email me a code'}</button>
          </div>
        ) : (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (code.length === OTP_LENGTH) confirm.mutate();
            }}
          >
            <p className="text-ink-soft">Enter the code we emailed you. Your account will be deleted as soon as you confirm.</p>
            <p className="text-sm text-ink-soft">{CODE_HELP}</p>
            <OtpInput value={code} onChange={setCode} invalid={!!confirm.error} disabled={confirm.isPending} />
            {confirm.error && <p role="alert" className="font-medium text-madder">{errorMessage(confirm.error)}</p>}
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>Keep my account</button>
            <button type="submit" className="btn btn-quiet" disabled={code.length < OTP_LENGTH || confirm.isPending}>{confirm.isPending ? 'Deleting' : 'Delete everything now'}</button>
            <ResendCode
              label="Send a new code"
              sentNote="New code sent. Use the latest one."
              error={send.error ? errorMessage(send.error) : null}
              pending={send.isPending}
              onResend={() => {
                confirm.reset();
                return send.mutateAsync();
              }}
            />
          </form>
        )}
      </Sheet>
    </Section>
  );
}
