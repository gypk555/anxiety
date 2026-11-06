import { CONSENT_CHANGES, CONSENT_VERSION } from '@anxiocare/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { errorMessage, request } from '@/lib/api';
import { formatDate } from '@/lib/dates';
import { safeNext, withNext } from '@/lib/next-path';
import { clearClientData, fetchMe, meKey, useMe } from '@/lib/queries';
import { PageTitle } from '@/ui/PageTitle';
import { ErrorState, PageSkeleton } from '@/ui/States';

export default function Consent() {
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const navigate = useNavigate();
  const client = useQueryClient();
  const me = useMe();
  const [adult, setAdult] = useState(false);
  const [health, setHealth] = useState(false);
  const [missing, setMissing] = useState(false);
  // Declining ends the session, which would otherwise send this screen to sign-in before Home opens.
  const [declining, setDeclining] = useState(false);

  const accept = useMutation({
    mutationFn: async () => {
      await request('POST', '/me/consent', {
        body: { version: CONSENT_VERSION, adultConfirmed: true, healthDataConsent: true },
      });
      client.setQueryData(meKey, await fetchMe());
    },
    onSuccess: () => navigate(next, { replace: true }),
  });

  const decline = useMutation({
    mutationFn: () => request('POST', '/auth/logout').catch(() => {}),
    onSettled: () => {
      clearClientData();
      client.setQueryData(meKey, null);
      navigate('/', { replace: true });
    },
  });

  if (me.isPending) return <PageSkeleton />;
  if (declining) return <PageSkeleton />;
  // First-time and re-prompt need different words, and only the server knows which is true.
  if (me.data === undefined) return <ErrorState error={me.error} onRetry={() => void me.refetch()} />;
  if (me.data === null) return <Navigate to={withNext('/sign-in', next)} replace />;
  if (!me.data.consentRequired) return <Navigate to={next} replace />;
  const reprompt = me.data.acceptedConsentVersion !== null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adult || !health) {
      setMissing(true);
      return;
    }
    setMissing(false);
    accept.mutate();
  };

  return (
    <form className="flex flex-col gap-5" onSubmit={submit} noValidate>
      {reprompt ? (
        <>
          <div>
            <PageTitle className="pt-2 text-2xl" title="Your data">We've updated our privacy notice</PageTitle>
            <p className="mt-2 text-ink-soft">The new version is dated {formatDate(CONSENT_VERSION)}. Please read what changed, and tell us whether you agree.</p>
          </div>
          <section aria-labelledby="changed">
            <h2 id="changed" className="text-xl">What changed</h2>
            <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-5 text-ink-soft">
              {CONSENT_CHANGES.summary.map((line) => <li key={line}>{line}</li>)}
            </ul>
          </section>
          <section aria-labelledby="kept" className="patch flex flex-col gap-2">
            <h2 id="kept" className="text-xl">Your data is kept</h2>
            <p>Everything you've saved is still here: your check-ins, journal and account. Nothing is deleted while you decide. You don't have to agree to download it, delete your account or sign out.</p>
            <p><Link className="link inline-block py-2" to="/settings">Download or delete my data</Link></p>
          </section>
        </>
      ) : (
        <div>
          <PageTitle className="pt-2 text-2xl" title="Your data">Before we save anything</PageTitle>
          <p className="mt-2 text-ink-soft">An account stores information about your mental health, so here's exactly what that means.</p>
        </div>
      )}

      <section aria-labelledby="stored">
        <h2 id="stored" className="text-xl">What is stored</h2>
        <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-5 text-ink-soft">
          <li>Your email address, and a name if you choose to add one</li>
          <li>Your check-in answers, scores and dates</li>
          <li>Thought records you write</li>
          <li>Which devices are signed in, and when they were last used</li>
        </ul>
        <p className="mt-1.5 text-ink-soft">Nothing about your age, gender or job. No ads, no trackers, no selling your data.</p>
      </section>

      <section aria-labelledby="why">
        <h2 id="why" className="text-xl">Why</h2>
        <p className="mt-1.5 text-ink-soft">Only to show these back to you, so you can see how things change. Your check-ins and journal are encrypted before storage. No doctor, employer or anyone else gets access.</p>
      </section>

      <section aria-labelledby="rights">
        <h2 id="rights" className="text-xl">Your rights</h2>
        <p className="mt-1.5 text-ink-soft">
          In Settings you can download everything and delete your account at any time, whether or not you agree here. Once you've agreed, you can correct your details there too. Deleting removes your data from our database at once, and withdraws this consent. Encrypted backups age out within our backup retention period.
          Read the full <Link className="link" to="/privacy">privacy notice</Link> and <Link className="link" to="/terms">terms</Link> (dated {formatDate(CONSENT_VERSION)}).
        </p>
      </section>

      <hr className="stitch-rule" />

      <fieldset className="flex flex-col gap-1">
        <legend className="sr-only">Your agreement</legend>
        <label className="flex min-h-11 items-start gap-3 py-2">
          <input type="checkbox" className="mt-0.5 size-6 shrink-0 accent-[var(--primary)]" checked={adult} onChange={(e) => { setAdult(e.target.checked); setMissing(false); }} />
          <span>I am 18 or older.</span>
        </label>
        <label className="flex min-h-11 items-start gap-3 py-2">
          <input type="checkbox" className="mt-0.5 size-6 shrink-0 accent-[var(--primary)]" checked={health} onChange={(e) => { setHealth(e.target.checked); setMissing(false); }} />
          <span>I agree to AnxioCare storing my check-ins and thought records, which are health information, as described above.</span>
        </label>
      </fieldset>

      {(missing || accept.error) && (
        <p role="alert" className="font-medium text-madder">
          {missing ? 'Please tick both boxes to continue. If you would rather not, you can still use the check-in and tools without an account.' : errorMessage(accept.error)}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <button type="submit" className="btn btn-primary" disabled={accept.isPending}>{accept.isPending ? 'Saving' : 'Agree and continue'}</button>
        <button type="button" className="btn btn-ghost" onClick={() => { setDeclining(true); decline.mutate(); }}>Not now, sign me out</button>
        {reprompt ? (
          <p className="text-center text-sm text-ink-soft">If you don't agree, your account and data stay as they are, but the app can't show or save your check-ins and journal until you do.</p>
        ) : (
          <>
            <p className="text-center text-sm text-ink-soft">If you don't agree, nothing more is saved, and this new account, which holds only your email address and this device's name, is deleted after 24 hours.</p>
            <p className="text-center text-sm"><Link className="link inline-block py-2" to="/settings">Download or delete my data</Link></p>
          </>
        )}
        <p className="text-center text-sm"><Link className="link inline-block py-2" to="/tools">Use the tools without agreeing</Link></p>
      </div>
    </form>
  );
}
