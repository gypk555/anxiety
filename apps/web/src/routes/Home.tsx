import { GAD7_ITEMS, readableProfile, severityFor, type Assessment, type Me } from '@anxiocare/shared';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, ChevronRight, Ear, FileText, ListChecks, NotebookPen, RotateCcw, Waves, Wind, type LucideIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, Navigate } from 'react-router';
import { formatDate, formatLongDay, greeting, nextCheckInDate } from '@/lib/dates';
import { hasDirtyDraft, NEW_DRAFT } from '@/lib/drafts';
import { loadCheckin, loadGuestResult, nextUnanswered } from '@/lib/guest';
import { loadReflection, loadReflectionResult, nextUnansweredReflection, STEPS } from '@/lib/reflection-store';
import { accountStep } from '@/lib/next-path';
import { suggestionsFor } from '@/lib/suggestions';
import { assessmentsKey, fetchAssessments, useMe } from '@/lib/queries';
import { CheckInChoices } from '@/ui/CheckInChoices';
import { MoodCard } from '@/ui/MoodCard';
import { PageTitle } from '@/ui/PageTitle';
import { RingsMark } from '@/ui/Rings';
import { SettingsGroup, SettingsRow } from '@/ui/SettingsList';
import { SuggestionList } from '@/ui/SuggestionList';
import { ErrorState, Skeleton } from '@/ui/States';

export function Home() {
  const me = useMe();
  // Signed in with consent or a name outstanding looks signed out here, so they go to the question that is waiting.
  const step = me.data ? accountStep(me.data, '/') : null;
  if (step) return <Navigate to={step} replace />;
  // A guest and someone offline both see the guest home: every part of it works without a server.
  if (me.data) return <AccountHome me={me.data} />;
  return <FirstRun />;
}

/** Something left half-done in this tab, as a row to pick it up again. */
function ResumeRow({ to, title, text, progress }: { to: string; title: string; text: string; progress?: number }) {
  return (
    <Link to={to} className="patch flex flex-col gap-2.5 px-4.5 py-4 no-underline">
      <span className="flex items-center gap-3">
        <RotateCcw aria-hidden="true" className="size-5 shrink-0 text-madder" strokeWidth={1.9} />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{title}</span>
          <span className="block text-sm text-ink-soft">{text}</span>
        </span>
        <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-ink-soft" />
      </span>
      {progress !== undefined && <span aria-hidden="true" className="progress-track"><span style={{ width: `${Math.round(progress * 100)}%` }} /></span>}
    </Link>
  );
}

function ResumeNotes() {
  const progress = loadCheckin();
  const result = loadGuestResult();
  const reflection = loadReflection();
  const reflectionResult = loadReflectionResult();
  const reflectionNext = reflection ? nextUnansweredReflection(reflection) : 0;
  const answered = progress?.answers.filter((a) => a !== null).length ?? 0;
  return (
    <>
      {reflectionResult && (
        <ResumeRow to="/reflection/result" title="Your reflection is still here" text="See it again, or save it. It goes away when you close this tab." />
      )}
      {!reflectionResult && reflection && reflectionNext > 0 && (
        <ResumeRow
          to={`/reflection/${reflectionNext < STEPS ? reflectionNext + 1 : 'note'}`}
          title="Continue your reflection"
          text={`You've answered ${reflectionNext} of ${STEPS} questions.`}
          progress={reflectionNext / STEPS}
        />
      )}
      {result && <ResumeRow to="/result" title="Your check-in result is still here" text="See it again, or save it. It goes away when you close this tab." />}
      {!result && progress && answered > 0 && (
        <ResumeRow
          to={`/check-in/${Math.min(nextUnanswered(progress) + 1, GAD7_ITEMS.length)}`}
          title="Continue your check-in"
          text={`You've answered ${answered} of ${GAD7_ITEMS.length} questions.`}
          progress={answered / GAD7_ITEMS.length}
        />
      )}
    </>
  );
}

/** First run: asks one honest question, and offers relief before asking for anything. */
function FirstRun() {
  return (
    <div className="hero relative flex flex-1 flex-col gap-5">
      <RingsMark className="hero-rings pointer-events-none absolute -right-16 -top-6 size-[var(--hero-rings)] md:-right-32" />
      <div className="hero-copy relative flex flex-col gap-3">
        <PageTitle className="text-[2.25rem] leading-[1.06] min-[360px]:text-3xl" title="A private anxiety check-in">
          How have the last two weeks been?
        </PageTitle>
        <p className="text-ink-soft">A private check-in. Your answers stay on this phone unless you sign in and choose to save them.</p>
      </div>

      <div className="relative flex flex-col gap-3">
        <ResumeNotes />
        <CheckInChoices />
        <Link to="/tools/breathe" className="choice-row night">
          <Wind aria-hidden="true" className="size-6 shrink-0 text-primary" strokeWidth={1.9} />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Overwhelmed? Breathe first</span>
            <span className="block text-sm text-ink-soft">One minute. Works offline.</span>
          </span>
          <ChevronRight aria-hidden="true" className="size-5 shrink-0" />
        </Link>
        <p className="pt-1 text-center text-sm text-ink-soft">For adults, 18 and over. A screening, not a diagnosis.</p>
      </div>

      <section aria-labelledby="save-over-time" className="patch relative mt-auto flex flex-col gap-2.5">
        <h2 id="save-over-time" className="font-body text-base font-semibold tracking-normal">Want to see how you change over time?</h2>
        <p className="text-sm text-ink-soft">An account saves your check-ins, mood log and journal.</p>
        <div className="flex flex-col gap-2 min-[360px]:flex-row">
          <Link className="btn btn-secondary btn-small flex-1" to="/sign-in">Sign in</Link>
          <Link className="btn btn-quiet btn-small flex-1" to="/create-account">Create account</Link>
        </div>
      </section>
    </div>
  );
}

const QUICK: { to: string; label: string; icon: LucideIcon; night?: boolean }[] = [
  { to: '/tools/breathe', label: 'Breathe', icon: Wind, night: true },
  { to: '/tools/ground', label: 'Ground', icon: Ear },
  { to: '/tools/sounds', label: 'Sounds', icon: Waves },
  { to: '/journal/new', label: 'Write', icon: NotebookPen },
];

function Titled({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-xl">{title}</h2>
      {children}
    </section>
  );
}

function AccountHome({ me }: { me: Me }) {
  const latest = useQuery({
    queryKey: [...assessmentsKey, 'latest'],
    queryFn: () => fetchAssessments(),
  });
  const last = latest.data?.items[0];
  // When this Home was opened: due-ness doesn't flip while someone is looking at it.
  const [openedAt] = useState(() => Date.now());
  const due = latest.isSuccess && (!last || nextCheckInDate(last.takenAt).getTime() <= openedAt);
  return (
    <div className="flex flex-col gap-5">
      <div className="pt-2">
        <p className="text-sm font-medium text-ink-soft">{formatLongDay()}</p>
        <PageTitle className="text-2xl" title="Home">
          {greeting()}{me.displayName ? `, ${me.displayName}` : ''}.
        </PageTitle>
      </div>

      <ResumeNotes />

      {latest.isPending && <Skeleton className="h-52 w-full rounded-[1.25rem]" />}
      {latest.isError && <ErrorState error={latest.error} onRetry={() => void latest.refetch()} />}
      {due && <CheckInDue last={last} />}
      {/* Always in this one place, so it keeps its state when Home learns a check-in is due. */}
      <MoodCard compact={due} />

      {hasDirtyDraft(NEW_DRAFT) && (
        <ResumeRow to="/journal/new" title="Continue your thought record" text="Your draft is here until you sign out or close the app." />
      )}

      <Titled id="quick" title="For right now">
        <ul className="grid grid-cols-4 gap-2">
          {QUICK.map(({ to, label, icon: Icon, night }) => (
            <li key={to}>
              <Link to={to} className={`tool-tile ${night ? 'night' : ''}`}>
                <Icon aria-hidden="true" className={`size-6 ${night ? 'text-primary' : 'text-madder'}`} strokeWidth={1.9} />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </Titled>

      <Suggestions me={me} />

      {latest.isSuccess && last && !due && <YourCheckIns assessment={last} />}

      <SettingsGroup id="your-space" title="Your space" heading="section">
        <SettingsRow icon={ListChecks} title="Safety plan" description="Your steps for a hard moment" to="/safety-plan" />
        <SettingsRow icon={CalendarDays} title="Mood log" description="One word a day, only for you" to="/mood" />
        <SettingsRow icon={FileText} title="Report for your doctor" description="A printable summary" to="/report" />
      </SettingsGroup>
    </div>
  );
}

/** Existing tools that fit the stress factors the person chose. Nothing at all when they chose none. */
function Suggestions({ me }: { me: Me }) {
  const factors = me.profile.stressFactors;
  const items = suggestionsFor(factors);
  if (!items.length) return null;
  const words = readableProfile(me.profile).stressFactors!.map((w) => w.toLowerCase());
  return (
    <Titled id="suggested" title="Tools that may help">
      <p className="-mt-1 text-sm text-ink-soft">Because you mentioned {listOf(words)}. You can change this in Settings.</p>
      <SuggestionList items={items} />
    </Titled>
  );
}

const listOf = (words: string[]) => (words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`);

/** Leads the page when two weeks have passed, or before the first check-in: both kinds, one tap each. */
function CheckInDue({ last }: { last: Assessment | undefined }) {
  return (
    <section aria-labelledby="due" className="patch-quilted flex flex-col gap-3.5">
      <div>
        <p className="text-sm text-ink-soft">{last ? `It's been two weeks since ${formatDate(last.takenAt)}` : 'Your first check-in'}</p>
        <h2 id="due" className="text-xl">Time for a check-in</h2>
      </div>
      <CheckInChoices />
      {last && (
        <p className="text-sm text-ink-soft">
          Last time: {severityFor(last.score).label}, {last.score} out of 21.{' '}
          <Link className="link inline-block py-1" to={`/result/${last.id}`}>See result</Link>
        </p>
      )}
    </section>
  );
}

function YourCheckIns({ assessment }: { assessment: Assessment }) {
  const band = severityFor(assessment.score);
  return (
    <Titled id="checkins" title="Your check-ins">
      <div className="patch flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <div>
            <p className="text-sm text-ink-soft">Last check-in · {formatDate(assessment.takenAt)}</p>
            <p className="font-display text-2xl font-semibold leading-tight">{band.label}, {assessment.score} out of 21</p>
          </div>
          <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-semibold">
            <CalendarDays aria-hidden="true" className="size-3.5" />
            Next {formatDate(nextCheckInDate(assessment.takenAt))}
          </span>
        </div>
        <div className="flex flex-col gap-2 min-[360px]:flex-row">
          <Link className="btn btn-small btn-secondary flex-1" to="/check-in">Check in now</Link>
          <Link className="btn btn-small btn-quiet flex-1" to={`/result/${assessment.id}`}>See result</Link>
        </div>
      </div>
    </Titled>
  );
}
