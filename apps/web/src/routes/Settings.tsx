import { avatarFor, emailSchema, googleConnectResponse, OTP_LENGTH, readableProfile, signInMethodsResponse, type Me, type Profile, type SessionInfo } from '@anxiocare/shared';
import { passwordProblem } from '@anxiocare/shared/passwords';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Info, KeyRound, Link2, ListX, LogOut, Mail, MailCheck, Moon, ScrollText, Shield, Smartphone, SquarePlus, Sun, Trash2, User, UserRound } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { ApiError, errorMessage, NetworkError, passwordFieldError, request, requestFile } from '@/lib/api';
import { formatDateTime } from '@/lib/dates';
import { profilePatch } from '@/lib/profile';
import { assessmentsKey, backupWindow, clearClientData, fetchAssessments, meKey, sessionList, sessionsKey, useMe, useMeta } from '@/lib/queries';
import { useTheme, type ThemeChoice } from '@/lib/theme';
import { nameProblem } from '@/lib/name';
import { NameField } from '@/ui/NameField';
import { OtpInput } from '@/ui/OtpInput';
import { PageTitle } from '@/ui/PageTitle';
import { PASSWORD_HINT, PasswordField } from '@/ui/PasswordField';
import { ProfileForm } from '@/ui/ProfileForm';
import { ResendCode } from '@/ui/ResendCode';
import { ConfirmSheet, Sheet } from '@/ui/Sheet';
import { SettingsGroup, SettingsRow } from '@/ui/SettingsList';
import { ErrorState, PageSkeleton } from '@/ui/States';

const CODE_HELP = "Check your spam folder too. If you don't get a code in a few minutes, try again later.";

const THEMES: { id: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { id: 'system', label: 'Phone', icon: Smartphone },
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
    <section aria-labelledby="appearance" className="flex flex-col gap-2">
      <h2 id="appearance" className="mx-1 font-body text-sm font-semibold tracking-normal text-ink-soft">Appearance</h2>
      <div role="radiogroup" aria-labelledby="appearance" className="segmented" onKeyDown={onKeyDown}>
        {THEMES.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" role="radio" aria-checked={theme === id} tabIndex={theme === id ? 0 : -1} onClick={() => setTheme(id)}>
            <Icon aria-hidden="true" className="size-[1.125rem] shrink-0" />
            {label}
          </button>
        ))}
      </div>
    </section>
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
    <SettingsGroup title="On this phone" id="install">
      {installEvent ? (
        <SettingsRow
          icon={SquarePlus}
          title="Add to home screen"
          description="Help and the tools then open offline."
          onClick={() => {
            void installEvent?.prompt();
            installEvent = null;
            force((n) => n + 1);
          }}
        />
      ) : (
        <SettingsRow icon={SquarePlus} title="Add to home screen" description={'In Safari, tap Share, then "Add to Home Screen". Help and the tools will then open offline.'} />
      )}
    </SettingsGroup>
  );
}

const LEGAL = [
  { to: '/privacy', label: 'Privacy notice', icon: Shield },
  { to: '/terms', label: 'Terms of use', icon: ScrollText },
  { to: '/about', label: 'About AnxioCare and the GAD-7', icon: Info },
];

const legalRows = () => LEGAL.map((l) => <SettingsRow key={l.to} icon={l.icon} title={l.label} to={l.to} />);

export default function Settings() {
  const me = useMe();
  const location = useLocation();
  const notice = (location.state as { notice?: string } | null)?.notice;
  return (
    <div className="flex flex-col gap-6">
      <PageTitle className="pt-2 text-2xl" title="Settings">Settings</PageTitle>
      {notice && <p role="status" className="patch">{notice}</p>}
      {me.isPending && <PageSkeleton />}
      {me.isError && !(me.error instanceof NetworkError) && <ErrorState error={me.error} onRetry={() => void me.refetch()} />}
      {me.data ? (
        me.data.consentRequired ? <RightsOnlySettings me={me.data} /> : <AccountSettings me={me.data} />
      ) : (
        <>
          {me.isError && me.error instanceof NetworkError ? (
            <section className="patch flex flex-col gap-3">
              <h2 className="text-xl">We can't load your account</h2>
              <p className="text-ink-soft">You may be offline. If you're signed in, your details, and the controls to download or delete your data, will show here once you're connected. The check-in and tools still work.</p>
              <button type="button" className="btn btn-quiet btn-small self-start" onClick={() => void me.refetch()}>Try again</button>
            </section>
          ) : me.isSuccess ? (
            <section aria-labelledby="signed-out" className="patch flex flex-col gap-3">
              <div className="flex items-center gap-3.5">
                <span className="grid size-12 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-soft"><User aria-hidden="true" className="size-6" /></span>
                <div>
                  <h2 id="signed-out" className="text-xl">You're not signed in</h2>
                  <p className="text-sm text-ink-soft">The check-in and tools still work.</p>
                </div>
              </div>
              <p className="text-sm text-ink-soft">Sign in to save check-ins, see trends and keep a journal.</p>
              <div className="flex flex-col gap-2 min-[360px]:flex-row">
                <Link className="btn btn-primary btn-small flex-1" to="/sign-in?next=%2Fsettings">Sign in</Link>
                <Link className="btn btn-secondary btn-small flex-1" to="/create-account?next=%2Fsettings">Create an account</Link>
              </div>
            </section>
          ) : null}
          <ThemePicker />
          <InstallRow />
          <SettingsGroup title="About and legal" id="legal">{legalRows()}</SettingsGroup>
        </>
      )}
    </div>
  );
}

function ProfileCard({ me }: { me: Me }) {
  const initial = (me.displayName?.trim() || me.email).charAt(0).toUpperCase();
  const avatar = avatarFor(me.profile.avatar);
  return (
    <div className="patch flex items-center gap-4">
      {avatar
        ? <span role="img" aria-label={avatar.label} className="profile-initial">{avatar.emoji}</span>
        : <span aria-hidden="true" className="profile-initial">{initial}</span>}
      <div className="min-w-0">
        <p className="font-display text-xl font-semibold leading-tight">{me.displayName || 'Your account'}</p>
        <p className="text-sm break-words text-ink-soft">{me.email}</p>
      </div>
    </div>
  );
}

/** Appearance, the phone and the legal pages: the same for everyone, signed in or not. */
function SharedSettings() {
  return (
    <>
      <ThemePicker />
      <InstallRow />
    </>
  );
}

function AccountSettings({ me }: { me: Me }) {
  return (
    <>
      <ProfileCard me={me} />
      <AccountGroup me={me} />
      <SignInSecurity me={me} />
      <SharedSettings />
      <YourData me={me} />
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
      <SettingsGroup title="Account" id="account">
        <SettingsRow icon={Mail} title="Email" description={me.email} />
      </SettingsGroup>
      <SignInSecurity me={me} />
      <SharedSettings />
      <YourData me={me} />
      <SignOut />
      <DeleteAccount />
    </>
  );
}

function AccountGroup({ me }: { me: Me }) {
  const [sheet, setSheet] = useState<'name' | 'email' | 'about' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  return (
    <>
      <SettingsGroup title="Account" id="account">
        <SettingsRow icon={User} title="Name" value={me.displayName || 'Not set'} description="Used to greet you" onClick={() => { setNotice(null); setSheet('name'); }} />
        <SettingsRow icon={Mail} title="Email" description={me.email} onClick={() => { setNotice(null); setSheet('email'); }} />
        <SettingsRow icon={UserRound} title="About you" value={profileSummary(me.profile)} description="Optional. Change or remove any detail" onClick={() => { setNotice(null); setSheet('about'); }} />
      </SettingsGroup>
      <div aria-live="polite" className="-mt-3 empty:hidden">{notice && <p role="status" className="mx-1 text-sm">{notice}</p>}</div>
      <NameSheet me={me} open={sheet === 'name'} onClose={() => setSheet(null)} onSaved={() => { setSheet(null); setNotice('Name saved'); }} />
      <Sheet open={sheet === 'about'} onClose={() => setSheet(null)} title="About you">
        <AboutForm me={me} onSaved={() => { setSheet(null); setNotice('Details saved'); }} />
      </Sheet>
      <EmailSheet me={me} open={sheet === 'email'} onClose={() => setSheet(null)} onDone={() => { setSheet(null); setNotice('Email updated. Use it next time you sign in.'); }} />
    </>
  );
}

/** A short, readable line for the row: what's set, or that nothing is. */
function profileSummary(profile: Profile): string {
  const words = readableProfile(profile);
  const parts = [words.ageRange, words.gender, words.occupation].filter(Boolean) as string[];
  if (words.stressFactors) parts.push(`${words.stressFactors.length} stress factor${words.stressFactors.length === 1 ? '' : 's'}`);
  return parts.length ? parts.join(', ') : 'Not set';
}

function AboutForm({ me, onSaved }: { me: Me; onSaved: () => void }) {
  const client = useQueryClient();
  const [profile, setProfile] = useState<Profile>(me.profile);
  const save = useMutation({
    mutationFn: () => request('PATCH', '/me/profile', { body: profilePatch(profile) }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: meKey });
      onSaved();
    },
  });
  return (
    <form className="flex flex-col gap-4" noValidate onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <p className="text-ink-soft">All optional, and encrypted. Used only to show back to you, in a report if you choose, and to suggest tools. Never to compare you with anyone.</p>
      <ProfileForm idPrefix="settings" value={profile} onChange={setProfile} />
      {save.error && <p role="alert" className="font-medium text-madder">{errorMessage(save.error)}</p>}
      <button type="submit" className="btn btn-primary" disabled={save.isPending}>{save.isPending ? 'Saving' : 'Save'}</button>
    </form>
  );
}

function NameSheet({ me, open, onClose, onSaved }: { me: Me; open: boolean; onClose: () => void; onSaved: () => void }) {
  // The sheet renders its contents only while open, so the form starts from the saved name each time.
  return (
    <Sheet open={open} onClose={onClose} title="Your name">
      <NameForm me={me} onSaved={onSaved} />
    </Sheet>
  );
}

function NameForm({ me, onSaved }: { me: Me; onSaved: () => void }) {
  const client = useQueryClient();
  const [name, setName] = useState(me.displayName ?? '');
  const [problem, setProblem] = useState<string | null>(null);
  const fieldRef = useRef<HTMLInputElement>(null);
  // It can be changed, never removed: PATCH /me refuses an empty name too.
  const save = useMutation({
    mutationFn: (displayName: string) => request('PATCH', '/me', { body: { displayName } }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: meKey });
      onSaved();
    },
  });
  return (
    <form
      className="flex flex-col gap-3"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const found = nameProblem(name);
        setProblem(found);
        if (found) return fieldRef.current?.focus();
        save.mutate(name.trim());
      }}
    >
      <NameField
        ref={fieldRef}
        value={name}
        error={problem}
        hint="Used to greet you, and on a report for your doctor only if you choose."
        onChange={(value) => { setName(value); setProblem(null); }}
      />
      {save.error && <p role="alert" className="font-medium text-madder">{errorMessage(save.error)}</p>}
      <button type="submit" className="btn btn-primary" disabled={save.isPending}>{save.isPending ? 'Saving' : 'Save name'}</button>
    </form>
  );
}

function EmailSheet({ me, open, onClose, onDone }: { me: Me; open: boolean; onClose: () => void; onDone: () => void }) {
  const client = useQueryClient();
  const [address, setAddress] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [currentCode, setCurrentCode] = useState('');
  const [code, setCode] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);

  const reset = () => {
    setAddress('');
    setSentTo(null);
    setCurrentCode('');
    setCode('');
    setFieldError(null);
    send.reset();
    verify.reset();
  };
  const close = () => {
    reset();
    onClose();
  };
  const send = useMutation({
    mutationFn: (newEmail: string) => request('POST', '/me/email/request', { body: { newEmail } }),
    onSuccess: (_, newEmail) => setSentTo(newEmail),
  });
  const verify = useMutation({
    mutationFn: () => request('POST', '/me/email/verify', { body: { newEmail: sentTo, currentCode, code } }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: meKey });
      reset();
      onDone();
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
  );
}

const methodsKey = ['sign-in-methods'] as const;

const CONNECT_OUTCOMES: Record<string, { text: string; error: boolean }> = {
  connected: { text: 'Google connected. You can now sign in with it too.', error: false },
  taken: { text: "That Google account is already connected to a different account here, so it wasn't connected.", error: true },
  failed: { text: "We couldn't connect Google. Nothing was changed. Try again.", error: true },
};

type Pending = 'connect' | 'disconnect';

function SignInSecurity({ me }: { me: Me }) {
  const client = useQueryClient();
  const meta = useMeta();
  const location = useLocation();
  const navigate = useNavigate();
  const methods = useQuery({ queryKey: methodsKey, queryFn: () => request('GET', '/me/sign-in-methods', { schema: signInMethodsResponse }) });
  // Coming back from Google after "Connect Google": read once, then drop it from the address bar.
  const [outcome] = useState(() => CONNECT_OUTCOMES[new URLSearchParams(location.search).get('google') ?? ''] ?? null);
  const [notice, setNotice] = useState<string | null>(outcome && !outcome.error ? outcome.text : null);
  const [problemText, setProblemText] = useState<string | null>(outcome?.error ? outcome.text : null);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const [confirmConnect, setConfirmConnect] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [devicesOpen, setDevicesOpen] = useState(false);
  const sessions = useSessions();
  const [reauthFor, setReauthFor] = useState<Pending | null>(null);
  useEffect(() => {
    if (new URLSearchParams(location.search).has('google')) navigate({ pathname: location.pathname, hash: '#security' }, { replace: true });
  }, [location.pathname, location.search, navigate]);
  const refresh = () => {
    void client.invalidateQueries({ queryKey: methodsKey });
    void client.invalidateQueries({ queryKey: sessionsKey });
  };
  const needsReauth = (e: unknown) => e instanceof ApiError && e.code === 'reauth_required';
  const connect = useMutation({
    mutationFn: () => request('POST', '/me/identities/google/connect', { schema: googleConnectResponse }),
    // A real navigation: Google sends the browser back to the API, which brings it back here.
    onSuccess: ({ url }) => window.location.assign(url),
    onError: (e) => {
      if (needsReauth(e)) setReauthFor('connect');
    },
  });
  const unlink = useMutation({
    mutationFn: () => request('DELETE', '/me/identities/google'),
    onSuccess: () => {
      setConfirmUnlink(false);
      setProblemText(null);
      setNotice('Google disconnected. Sign in with your password or an email code from now on.');
      refresh();
    },
    onError: (e) => {
      if (!needsReauth(e)) return;
      setConfirmUnlink(false);
      setReauthFor('disconnect');
    },
  });
  const afterReauth = () => {
    const next = reauthFor;
    setReauthFor(null);
    if (next === 'connect') connect.mutate();
    if (next === 'disconnect') unlink.mutate();
  };
  const m = methods.data;
  const googleOn = !!meta.data?.googleEnabled;
  const connectError = connect.error && !needsReauth(connect.error) ? errorMessage(connect.error) : null;
  const others = sessions.data?.filter((x) => !x.current).length ?? 0;
  const devicesSummary = !sessions.data ? undefined : others === 0 ? 'Only this device' : `This device and ${others} other${others === 1 ? '' : 's'}`;
  const done = (text: string) => { setPasswordOpen(false); setNotice(text); refresh(); };
  return (
    <section className="flex flex-col gap-2">
      <SettingsGroup title="Sign-in and security" id="security">
        {methods.isPending && <li className="p-4"><PageSkeleton /></li>}
        {methods.isError && <li className="p-4"><ErrorState error={methods.error} onRetry={() => void methods.refetch()} /></li>}
        {m && <SettingsRow icon={KeyRound} title="Password" value={m.password ? 'Set' : 'Not set'} onClick={() => { setNotice(null); setPasswordOpen(true); }} />}
        {m && (m.google || googleOn) && (
          <SettingsRow
            icon={Link2}
            title="Google"
            value={m.google ? 'Connected' : connect.isPending ? 'Opening Google' : 'Not connected'}
            disabled={connect.isPending}
            onClick={() => {
              setProblemText(null);
              setNotice(null);
              if (m.google) {
                unlink.reset();
                setConfirmUnlink(true);
              } else setConfirmConnect(true);
            }}
          />
        )}
        {m && <SettingsRow icon={MailCheck} title="Email codes" value="Always on" />}
        <SettingsRow icon={Smartphone} title="Signed-in devices" description={devicesSummary} onClick={() => setDevicesOpen(true)} />
      </SettingsGroup>
      <div aria-live="polite" className="mx-1 empty:hidden">
        {notice && <p role="status" className="text-sm">{notice}</p>}
        {(problemText ?? connectError) && <p role="alert" className="text-sm font-medium text-madder">{problemText ?? connectError}</p>}
      </div>
      {m && (m.password
        ? <ChangePassword open={passwordOpen} onClose={() => setPasswordOpen(false)} onDone={done} />
        : <AddPassword email={me.email} open={passwordOpen} onClose={() => setPasswordOpen(false)} onDone={done} />)}
      <ConfirmSheet
        open={confirmConnect}
        onClose={() => setConfirmConnect(false)}
        onConfirm={() => { setConfirmConnect(false); connect.mutate(); }}
        busy={connect.isPending}
        error={null}
        title="Connect Google?"
        confirmLabel="Connect Google"
        cancelLabel="Not now"
      >
        We'll ask you to confirm it's you first. If you connect Google, Google learns that you use this service.
      </ConfirmSheet>
      <Sheet open={devicesOpen} onClose={() => setDevicesOpen(false)} title="Signed-in devices">
        <Sessions />
      </Sheet>
        <ConfirmSheet
          open={confirmUnlink}
          onClose={() => setConfirmUnlink(false)}
          onConfirm={() => unlink.mutate()}
          busy={unlink.isPending}
          error={unlink.error && !needsReauth(unlink.error) ? errorMessage(unlink.error) : null}
          title="Disconnect Google?"
          confirmLabel="Disconnect"
          cancelLabel="Keep it connected"
        >
          You'll sign in with an email code, or your password if you have one. We'll email you to confirm.
        </ConfirmSheet>
        <ConfirmItsYou
          open={reauthFor !== null}
          email={me.email}
          hasPassword={!!m?.password}
          purpose={reauthFor === 'disconnect' ? 'disconnect Google' : 'connect Google'}
          onClose={() => setReauthFor(null)}
          onDone={afterReauth}
        />
    </section>
  );
}

/** A password, or a code to the account's inbox, proved within the last few minutes. Needed before changing how the account signs in. */
function ConfirmItsYou({ open, email, hasPassword, purpose, onClose, onDone }: { open: boolean; email: string; hasPassword: boolean; purpose: string; onClose: () => void; onDone: () => void }) {
  const [byCode, setByCode] = useState(false);
  const [sent, setSent] = useState(false);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const reset = () => {
    setByCode(false);
    setSent(false);
    setPassword('');
    setCode('');
    setFieldError(null);
    withPassword.reset();
    ask.reset();
    withCode.reset();
  };
  const close = () => {
    reset();
    onClose();
  };
  const finish = () => {
    reset();
    onDone();
  };
  const withPassword = useMutation({
    gcTime: 0,
    mutationFn: () => request('POST', '/me/reauth/password', { body: { password } }),
    onSuccess: finish,
    onError: () => setPassword(''),
  });
  const ask = useMutation({
    mutationFn: () => request('POST', '/me/reauth/code/request'),
    onSuccess: () => setSent(true),
  });
  const withCode = useMutation({
    mutationFn: () => request('POST', '/me/reauth/code', { body: { code } }),
    onSuccess: finish,
    onError: () => setCode(''),
  });
  const usingCode = byCode || !hasPassword;
  const wrongPassword = withPassword.error instanceof ApiError && withPassword.error.code === 'invalid_credentials';
  const passwordError = fieldError ?? (wrongPassword ? "That password isn't right. Try again, or use an email code instead." : withPassword.error ? errorMessage(withPassword.error) : null);
  const codeError = fieldError ?? (withCode.error ? errorMessage(withCode.error) : null);
  return (
    <Sheet open={open} onClose={close} title="Confirm it's you">
      <p className="text-ink-soft">To {purpose}, confirm it's you first.</p>
      {!usingCode ? (
        <form
          className="mt-3 flex flex-col gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!password) return setFieldError('Enter your password.');
            setFieldError(null);
            withPassword.mutate();
          }}
        >
          <input type="email" name="email" autoComplete="username" value={email} readOnly hidden />
          <PasswordField label="Your password" autoComplete="current-password" value={password} invalid={wrongPassword} disabled={withPassword.isPending} onChange={(v) => { setPassword(v); setFieldError(null); }} />
          {passwordError && <p role="alert" className="font-medium text-madder">{passwordError}</p>}
          <button type="submit" className="btn btn-primary" disabled={withPassword.isPending}>{withPassword.isPending ? 'Checking' : 'Confirm'}</button>
          <button type="button" className="btn btn-quiet btn-small self-start" onClick={() => { setByCode(true); setFieldError(null); }}>Email me a code instead</button>
        </form>
      ) : !sent ? (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-ink-soft">We'll email a code to <span className="break-words">{email}</span>.</p>
          {ask.error && <p role="alert" className="font-medium text-madder">{errorMessage(ask.error)}</p>}
          <button type="button" className="btn btn-primary" disabled={ask.isPending} onClick={() => ask.mutate()}>{ask.isPending ? 'Sending' : 'Email me a code'}</button>
        </div>
      ) : (
        <form
          className="mt-3 flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.length !== OTP_LENGTH) return setFieldError(`Enter the ${OTP_LENGTH}-digit code from the email.`);
            setFieldError(null);
            withCode.mutate();
          }}
        >
          <OtpInput value={code} onChange={(v) => { setCode(v); setFieldError(null); }} invalid={!!withCode.error} disabled={withCode.isPending} />
          <p className="text-sm text-ink-soft">{CODE_HELP}</p>
          {codeError && <p role="alert" className="font-medium text-madder">{codeError}</p>}
          <button type="submit" className="btn btn-primary" disabled={withCode.isPending}>{withCode.isPending ? 'Checking' : 'Confirm'}</button>
          <ResendCode label="Send a new code" sentNote="New code sent. Use the latest one." error={ask.error ? errorMessage(ask.error) : null} pending={ask.isPending} onResend={() => { withCode.reset(); return ask.mutateAsync(); }} />
        </form>
      )}
    </Sheet>
  );
}

function ChangePassword({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (text: string) => void }) {
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [sends, setSends] = useState(0);
  const me = useMe();
  const change = useMutation({
    gcTime: 0,
    mutationFn: () => request('POST', '/me/password', { body: { currentPassword: current, password } }),
    onSuccess: () => {
      reset();
      onDone('Password changed. Other devices were signed out.');
    },
    onError: (e) => {
      setCurrent('');
      setFieldError(passwordFieldError(e));
    },
  });
  const reset = () => {
    setCurrent('');
    setPassword('');
    setFieldError(null);
    change.reset();
  };
  const close = () => {
    reset();
    onClose();
  };
  const wrongCurrent = change.error instanceof ApiError && change.error.code === 'invalid_credentials';
  const error = fieldError ?? (wrongCurrent ? "Your current password isn't right. Try again, or sign out and use \"Forgot your password?\"." : change.error ? errorMessage(change.error) : null);
  return (
    <>
      <Sheet open={open} onClose={close} title="Change your password">
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!current) return setFieldError('Enter your current password.');
            const problem = passwordProblem(password, me.data?.email ?? '');
            if (problem) return setFieldError(problem);
            setFieldError(null);
            setSends((n) => n + 1);
            change.mutate();
          }}
        >
          <input type="email" name="email" autoComplete="username" value={me.data?.email ?? ''} readOnly hidden />
          <PasswordField name="current-password" label="Current password" autoComplete="current-password" value={current} hideNow={sends} invalid={wrongCurrent} disabled={change.isPending} onChange={(v) => { setCurrent(v); setFieldError(null); }} />
          <PasswordField name="new-password" label="New password" autoComplete="new-password" value={password} hideNow={sends} describedBy="change-hint" disabled={change.isPending} onChange={(v) => { setPassword(v); setFieldError(null); }}>
            <p id="change-hint" className="mt-2 text-sm text-ink-soft">{PASSWORD_HINT} Your other devices will be signed out.</p>
          </PasswordField>
          {error && <p role="alert" className="font-medium text-madder">{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={change.isPending}>{change.isPending ? 'Saving' : 'Change password'}</button>
        </form>
      </Sheet>
    </>
  );
}

function AddPassword({ email, open, onClose, onDone }: { email: string; open: boolean; onClose: () => void; onDone: (text: string) => void }) {
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [sends, setSends] = useState(0);
  const ask = useMutation({
    mutationFn: () => request('POST', '/me/password/set/request'),
    onSuccess: () => setSent(true),
  });
  const save = useMutation({
    gcTime: 0,
    mutationFn: () => request('POST', '/me/password/set', { body: { code, password } }),
    onSuccess: () => {
      reset();
      onDone('Password added. Other devices were signed out.');
    },
    onError: (e) => {
      const problem = passwordFieldError(e);
      setFieldError(problem);
      if (!problem) setCode('');
    },
  });
  const reset = () => {
    setSent(false);
    setCode('');
    setPassword('');
    setFieldError(null);
    ask.reset();
    save.reset();
  };
  const close = () => {
    reset();
    onClose();
  };
  const error = fieldError ?? (save.error ? errorMessage(save.error) : null);
  return (
    <>
      <Sheet open={open} onClose={close} title="Add a password">
        {!sent ? (
          <div className="flex flex-col gap-3">
            <p className="text-ink-soft">To be sure it's you, we'll email a code to <span className="break-words">{email}</span> first.</p>
            {ask.error && <p role="alert" className="font-medium text-madder">{errorMessage(ask.error)}</p>}
            <button type="button" className="btn btn-primary" disabled={ask.isPending} onClick={() => ask.mutate()}>{ask.isPending ? 'Sending' : 'Email me a code'}</button>
          </div>
        ) : (
          <form
            className="flex flex-col gap-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (code.length !== OTP_LENGTH) return setFieldError(`Enter the ${OTP_LENGTH}-digit code from the email.`);
              const problem = passwordProblem(password, email);
              if (problem) return setFieldError(problem);
              setFieldError(null);
              setSends((n) => n + 1);
              save.mutate();
            }}
          >
            <input type="email" name="email" autoComplete="username" value={email} readOnly hidden />
            <OtpInput value={code} onChange={setCode} invalid={!!save.error && !fieldError} disabled={save.isPending} />
            <PasswordField label="New password" autoComplete="new-password" value={password} hideNow={sends} describedBy="add-hint" disabled={save.isPending} onChange={(v) => { setPassword(v); setFieldError(null); }}>
              <p id="add-hint" className="mt-2 text-sm text-ink-soft">{PASSWORD_HINT} Your other devices will be signed out.</p>
            </PasswordField>
            <p className="text-sm text-ink-soft">{CODE_HELP}</p>
            {error && <p role="alert" className="font-medium text-madder">{error}</p>}
            <button type="submit" className="btn btn-primary" disabled={save.isPending}>{save.isPending ? 'Saving' : 'Save password'}</button>
            <ResendCode label="Send a new code" sentNote="New code sent. Use the latest one." error={ask.error ? errorMessage(ask.error) : null} pending={ask.isPending} onResend={() => { save.reset(); return ask.mutateAsync(); }} />
          </form>
        )}
      </Sheet>
    </>
  );
}

const useSessions = () =>
  useQuery({
    queryKey: sessionsKey,
    queryFn: async (): Promise<SessionInfo[]> => {
      const data = await request('GET', '/auth/sessions', { schema: sessionList });
      return Array.isArray(data) ? data : data.items;
    },
  });

function Sessions() {
  const client = useQueryClient();
  const sessions = useSessions();
  const [pending, setPending] = useState<SessionInfo | null>(null);
  const revoke = useMutation({
    mutationFn: (id: string) => request('DELETE', `/auth/sessions/${encodeURIComponent(id)}`),
    onSuccess: () => {
      setPending(null);
      void client.invalidateQueries({ queryKey: sessionsKey });
    },
  });
  return (
    <div className="flex flex-col gap-2">
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
        {pending?.deviceLabel} will need to sign in again.
      </ConfirmSheet>
    </div>
  );
}

/** Download, delete all check-ins and clear profile details are rights: none of them waits on consent. */
function YourData({ me }: { me?: Me }) {
  const deleteAll = useDeleteCheckIns(me ?? null);
  const clearProfile = useClearProfile(me ?? null);
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
    <section className="flex flex-col gap-2">
      <SettingsGroup title="Your data and privacy" id="data">
        <SettingsRow
          icon={Download}
          title="Download my data"
          description={state === 'working' ? 'Preparing' : state === 'done' ? 'Download started.' : "A copy of everything we hold, as a file. It isn't encrypted once it's on your phone."}
          disabled={state === 'working'}
          onClick={() => void download()}
        />
        {deleteAll?.row}
        {clearProfile?.row}
        {legalRows()}
      </SettingsGroup>
      {deleteAll?.sheets}
      {clearProfile?.sheets}
      <p aria-live="polite" className="sr-only">{state === 'working' ? 'Preparing' : state === 'done' ? 'Download started.' : ''}</p>
      {error && <p role="alert" className="mx-1 font-medium text-madder">{error}</p>}
    </section>
  );
}

/** Every optional detail at once. A right, so it works before the current notice is accepted (DELETE /me/profile). */
function useClearProfile(me: Me | null) {
  const client = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const clear = useMutation({
    mutationFn: () => request('DELETE', '/me/profile'),
    onSuccess: () => {
      setConfirming(false);
      setNotice('Profile details cleared');
      void client.invalidateQueries({ queryKey: meKey });
    },
  });
  if (!me) return null;
  const row = <SettingsRow icon={UserRound} title="Clear my profile details" description="Your avatar, age range, gender, what you do and stress. Your name stays." onClick={() => { setNotice(null); clear.reset(); setConfirming(true); }} />;
  const sheets = (
    <>
      <div aria-live="polite" className="mx-1 empty:hidden">{notice && <p role="status" className="text-sm">{notice}</p>}</div>
      <ConfirmSheet
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => clear.mutate()}
        busy={clear.isPending}
        error={clear.error ? errorMessage(clear.error) : null}
        title="Clear your profile details?"
        confirmLabel="Clear details"
        cancelLabel="Keep them"
      >
        Your avatar, age range, gender, what you do and what causes you stress are removed at once. Your name, check-ins and everything else stay.
      </ConfirmSheet>
    </>
  );
  return { row, sheets };
}

/** Every check-in at once, part of the right to erasure. Names the count, and asks for proof that it's them. */
function useDeleteCheckIns(me: Me | null) {
  const client = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [reauth, setReauth] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const methods = useQuery({ queryKey: methodsKey, queryFn: () => request('GET', '/me/sign-in-methods', { schema: signInMethodsResponse }), enabled: !!me });
  const count = useQuery({
    queryKey: [...assessmentsKey, 'count'],
    queryFn: async () => {
      let n = 0;
      let cursor: string | undefined;
      for (let i = 0; i < 100; i += 1) {
        const page = await fetchAssessments(cursor);
        n += page.items.length;
        if (!page.nextCursor) break;
        cursor = page.nextCursor;
      }
      return n;
    },
    enabled: confirming && !!me,
  });
  const needsReauth = (e: unknown) => e instanceof ApiError && e.code === 'reauth_required';
  const remove = useMutation({
    mutationFn: () => request<{ deleted: number }>('DELETE', '/assessments'),
    onSuccess: ({ deleted }) => {
      setConfirming(false);
      setNotice(`${deleted} check-in${deleted === 1 ? '' : 's'} deleted`);
      void client.invalidateQueries({ queryKey: assessmentsKey });
    },
    onError: (e) => {
      if (!needsReauth(e)) return;
      setConfirming(false);
      setReauth(true);
    },
  });
  const n = count.data;
  const plural = n === 1 ? 'check-in' : 'check-ins';
  if (!me) return null;
  const row = <SettingsRow icon={ListX} title="Delete all check-ins" description="Your GAD-7 results. Everything else stays." onClick={() => { setNotice(null); remove.reset(); setConfirming(true); }} />;
  const sheets = (
    <>
      <div aria-live="polite" className="mx-1 empty:hidden">{notice && <p role="status" className="text-sm">{notice}</p>}</div>
      <ConfirmSheet
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => remove.mutate()}
        busy={remove.isPending || n === undefined || n === 0}
        error={remove.error && !needsReauth(remove.error) ? errorMessage(remove.error) : count.error ? errorMessage(count.error) : null}
        title="Delete all check-ins?"
        confirmLabel={n === undefined ? 'Delete' : `Delete ${n} ${plural}`}
        cancelLabel="Keep them"
      >
        {n === undefined ? 'Counting your check-ins.' : n === 0 ? 'You have no saved check-ins.' : `All ${n} of your saved ${plural} will be deleted, at once. This can't be undone. Your journal, mood log, reflections and safety plan stay.`}
      </ConfirmSheet>
      <ConfirmItsYou
        open={reauth}
        email={me.email}
        hasPassword={!!methods.data?.password}
        purpose="delete all your check-ins"
        onClose={() => setReauth(false)}
        onDone={() => { setReauth(false); remove.mutate(); }}
      />
    </>
  );
  return { row, sheets };
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
    <section aria-label="Sign out" className="flex flex-col gap-1">
      <div className="flex flex-col gap-1">
        <button type="button" className="btn btn-secondary" disabled={logout.isPending} onClick={() => logout.mutate('/auth/logout')}>
          <LogOut aria-hidden="true" className="size-5" />
          Sign out
        </button>
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
        Every device, including this one, will need to sign in again. Your data stays saved.
      </ConfirmSheet>
    </section>
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
    <>
      <SettingsGroup id="delete" title="Delete your account" heading="hidden" tone="danger">
        <SettingsRow icon={Trash2} title="Delete my account" description="Removes your account, check-ins and journal, and withdraws your consent. Can't be undone." onClick={() => setOpen(true)} />
      </SettingsGroup>
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
    </>
  );
}
