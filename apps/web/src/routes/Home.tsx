import { GAD7_ITEMS, severityFor, type Assessment, type Me } from '@anxiocare/shared';
import { useQuery } from '@tanstack/react-query';
import { Ear, NotebookPen, Waves, Wind, type LucideIcon } from 'lucide-react';
import { Link, Navigate } from 'react-router';
import { formatDate, greeting, nextCheckInDate } from '@/lib/dates';
import { hasDirtyDraft, NEW_DRAFT } from '@/lib/drafts';
import { loadCheckin, loadGuestResult, nextUnanswered } from '@/lib/guest';
import { withNext } from '@/lib/next-path';
import { assessmentsKey, fetchAssessments, useMe } from '@/lib/queries';
import { PageTitle } from '@/ui/PageTitle';
import { RingsMark } from '@/ui/Rings';
import { ErrorState, Skeleton } from '@/ui/States';

export function Home() {
  const me = useMe();
  // Signed in with consent outstanding looks signed out here, so they go to the question that is waiting.
  if (me.data?.consentRequired) return <Navigate to={withNext('/consent', '/')} replace />;
  // A guest and someone offline both see the guest home: every part of it works without a server.
  if (me.data) return <AccountHome me={me.data} />;
  return <FirstRun />;
}

function ResumeNotes() {
  const progress = loadCheckin();
  const result = loadGuestResult();
  return (
    <>
      {result && (
        <Link to="/result" className="patch block no-underline">
          <span className="block font-semibold">Your check-in result is still here</span>
          <span className="block text-sm text-ink-soft">See it again, or save it. It goes away when you close this tab.</span>
        </Link>
      )}
      {!result && progress && progress.answers.some((a) => a !== null) && (
        <Link to={`/check-in/${Math.min(nextUnanswered(progress) + 1, GAD7_ITEMS.length)}`} className="patch block no-underline">
          <span className="block font-semibold">Continue your check-in</span>
          <span className="block text-sm text-ink-soft">
            You've answered {progress.answers.filter((a) => a !== null).length} of {GAD7_ITEMS.length} questions.
          </span>
        </Link>
      )}
    </>
  );
}

/** First run: asks one honest question, and offers relief before asking for anything. */
function FirstRun() {
  return (
    <div className="hero relative flex flex-1 flex-col">
      <RingsMark className="hero-rings pointer-events-none absolute -right-20 -top-20 size-[var(--hero-rings)] md:-right-40" />
      <div className="hero-copy relative flex flex-col gap-3">
        <PageTitle className="text-[2.25rem] leading-[1.06] min-[360px]:text-3xl" title="A private anxiety check-in">
          How have the last two weeks been?
        </PageTitle>
        <p className="text-ink-soft">
          Seven questions, about two minutes. Your answers stay on this phone unless you sign in and choose to save them.
        </p>
      </div>

      <div className="relative mt-auto flex flex-col gap-3 pt-7">
        <ResumeNotes />
        <Link className="btn btn-primary w-full" to="/check-in">Start the check-in</Link>
        <Link className="btn btn-secondary w-full" to="/tools/breathe">Overwhelmed? Breathe first</Link>
        <p className="pt-1 text-center text-sm text-ink-soft">
          For adults, 18 and over. A screening, not a diagnosis.
        </p>
        <p className="text-center text-sm">
          <Link className="link inline-block py-2" to="/sign-in">Sign in to see saved results</Link>
          {' or '}
          <Link className="link inline-block py-2" to="/create-account">create an account</Link>
        </p>
      </div>
    </div>
  );
}

const QUICK: { to: string; label: string; icon: LucideIcon }[] = [
  { to: '/tools/breathe', label: 'Breathe', icon: Wind },
  { to: '/tools/ground', label: 'Ground', icon: Ear },
  { to: '/tools/sounds', label: 'Sounds', icon: Waves },
  { to: '/journal/new', label: 'Write', icon: NotebookPen },
];

function AccountHome({ me }: { me: Me }) {
  const latest = useQuery({
    queryKey: [...assessmentsKey, 'latest'],
    queryFn: () => fetchAssessments(),
  });
  const last = latest.data?.items[0];
  return (
    <div className="flex flex-col gap-5">
      <PageTitle className="pt-2 text-2xl" title="Home">
        {greeting()}{me.displayName ? `, ${me.displayName}` : ''}.
      </PageTitle>

      <ResumeNotes />

      {latest.isPending && <Skeleton className="h-52 w-full rounded-[1.25rem]" />}
      {latest.isError && <ErrorState error={latest.error} onRetry={() => void latest.refetch()} />}
      {latest.isSuccess && (last ? <LastResult assessment={last} /> : <NoResultYet />)}

      {hasDirtyDraft(NEW_DRAFT) && (
        <Link to="/journal/new" className="patch block no-underline">
          <span className="block font-semibold">Continue your thought record</span>
          <span className="block text-sm text-ink-soft">Your draft is here until you sign out or close the app.</span>
        </Link>
      )}

      <section aria-labelledby="quick">
        <h2 id="quick" className="text-xl">For right now</h2>
        <ul className="mt-3 grid grid-cols-4 gap-2">
          {QUICK.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <Link to={to} className="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-2xl bg-surface text-sm font-medium no-underline">
                <Icon aria-hidden="true" className="size-6 text-madder" strokeWidth={1.9} />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function LastResult({ assessment }: { assessment: Assessment }) {
  const band = severityFor(assessment.score);
  const next = nextCheckInDate(assessment.takenAt);
  const due = next.getTime() <= Date.now();
  return (
    <section aria-labelledby="last" className="patch-quilted flex flex-col gap-3">
      <div>
        <h2 id="last" className="text-sm font-body font-medium tracking-normal text-ink-soft">
          Your last check-in, {formatDate(assessment.takenAt)}
        </h2>
        <p className="mt-1 font-display text-2xl font-semibold">{band.label}, {assessment.score} out of 21</p>
      </div>
      <p className="text-sm text-ink-soft">{due ? "It's been two weeks or more. Check in again whenever you're ready." : `Next check-in: ${formatDate(next)}`}</p>
      <div className="flex flex-col gap-2 min-[360px]:flex-row">
        <Link className={`btn btn-small flex-1 ${due ? 'btn-primary' : 'btn-secondary'}`} to="/check-in">Check in again</Link>
        <Link className="btn btn-small btn-quiet flex-1" to={`/result/${assessment.id}`}>See this result</Link>
      </div>
    </section>
  );
}

function NoResultYet() {
  return (
    <section className="patch-quilted flex flex-col gap-3">
      <h2 className="text-xl">No check-ins saved yet</h2>
      <p className="text-sm text-ink-soft">Your first one takes about two minutes, and gives you something to compare with later.</p>
      <Link className="btn btn-primary" to="/check-in">Start the check-in</Link>
    </section>
  );
}
