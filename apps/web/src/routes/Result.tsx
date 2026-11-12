import {
  DIFFICULTY_OPTIONS,
  EMERGENCY_NUMBER,
  GAD7_ATTRIBUTION,
  GAD7_ITEMS,
  GAD7_MAX_SCORE,
  GAD7_OPTIONS,
  GAD7_REFERRAL_CUTOFF,
  HELPLINES,
  scoreGad7,
  SEVERITY_BANDS,
  severityFor,
  type Assessment,
} from '@anxiocare/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Phone, Printer } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router';
import { ApiError, errorMessage, isNotFound, request } from '@/lib/api';
import { formatDate, nextCheckInDate } from '@/lib/dates';
import { clearGuestResult, loadGuestResult, type GuestResult } from '@/lib/guest';
import { withNext } from '@/lib/next-path';
import { suggestionsFor } from '@/lib/suggestions';
import { assessmentsKey, useMe } from '@/lib/queries';
import { NotFound } from '@/shell/RouteError';
import { PageTitle } from '@/ui/PageTitle';
import { ConfirmSheet } from '@/ui/Sheet';
import { ErrorState, PageSkeleton } from '@/ui/States';
import { SuggestionList } from '@/ui/SuggestionList';
import { assessmentResponse, readableProfile } from '@anxiocare/shared';
import { SelfHarmGuidance } from './Help';
import { saveResult } from './CheckIn';

interface ResultData {
  score: number;
  answers: readonly number[];
  difficulty: number | null;
  takenAt: string;
}

export function GuestResultPage() {
  const result = loadGuestResult();
  if (!result) return <Navigate to="/check-in" replace />;
  return (
    <ResultView
      result={{ ...result, score: scoreGad7(result.answers) }}
      footer={<SaveOffer result={result} />}
    />
  );
}

export function SavedResultPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [confirming, setConfirming] = useState(false);

  const query = useQuery({
    queryKey: [...assessmentsKey, id],
    queryFn: () => request<Assessment>('GET', `/assessments/${encodeURIComponent(id)}`, {
      schema: assessmentResponse,
    }),
  });
  const remove = useMutation({
    mutationFn: () => request('DELETE', `/assessments/${encodeURIComponent(id)}`),
    onSuccess: () => {
      client.removeQueries({ queryKey: [...assessmentsKey, id] });
      void client.invalidateQueries({ queryKey: assessmentsKey });
      navigate('/trends', { replace: true });
    },
  });

  if (query.isPending) return <PageSkeleton />;
  if (isNotFound(query.error)) return <NotFound />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  return (
    <ResultView
      result={query.data}
      footer={
        <div className="no-print flex flex-col gap-1">
          <Link className="link self-start py-2" to="/trends">See all your check-ins</Link>
          <button type="button" className="link self-start py-2 text-left" onClick={() => setConfirming(true)}>Delete this result</button>
          <ConfirmSheet
            open={confirming}
            onClose={() => setConfirming(false)}
            onConfirm={() => remove.mutate()}
            busy={remove.isPending}
            error={remove.error ? errorMessage(remove.error) : null}
            title="Delete this result?"
            confirmLabel="Delete result"
            cancelLabel="Keep result"
          >
            This check-in will be removed from your history. This can't be undone.
          </ConfirmSheet>
        </div>
      }
    />
  );
}

function ResultView({ result, footer }: { result: ResultData; footer: React.ReactNode }) {
  const band = severityFor(result.score);
  const severe = band.severity === 'severe';
  const difficulty = result.difficulty === null ? null : DIFFICULTY_OPTIONS[result.difficulty]?.label;
  const primary = HELPLINES[0]!;

  return (
    <article className="flex flex-col gap-6">
      <header className="flex flex-col gap-3 pt-1">
        <p className="text-sm text-ink-soft">Your check-in, {formatDate(result.takenAt)}</p>
        <PageTitle className="text-3xl" title="Your result">
          {band.label} range
          <span className="sr-only">: </span>
          <span className="block font-body text-lg font-medium tracking-normal">{result.score} out of {GAD7_MAX_SCORE}</span>
        </PageTitle>
        <p className="text-lg leading-snug">{band.meaning}</p>
        <p className="text-sm text-ink-soft">This is a screening, not a diagnosis. Only a doctor or mental health professional can diagnose anxiety.</p>
      </header>

      {severe && (
        <section aria-labelledby="support" className="patch-quilted no-print flex flex-col gap-3">
          <h2 id="support" className="text-xl">You don't have to manage this alone</h2>
          <p>{primary.name} is free, available {primary.availability.toLowerCase()}, and in many Indian languages. You could call now, just to talk it through.</p>
          <a className="btn btn-call" href={`tel:${primary.tel}`}>
            <Phone aria-hidden="true" className="size-5" />
            Call {primary.display}
          </a>
          <Link className="btn btn-secondary" to="/help">See all helplines</Link>
          <Link className="btn btn-quiet" to="/safety-plan">Open your safety plan</Link>
        </section>
      )}

      <ScoreScale score={result.score} />

      {difficulty && (
        <p>
          You said these problems have made day-to-day life <strong className="font-semibold">{difficulty.toLowerCase()}</strong>.
        </p>
      )}

      <NextSteps score={result.score} takenAt={result.takenAt} />

      {severe ? (
        <section aria-labelledby="harm" className="patch no-print">
          <h2 id="harm" className="text-xl">If you're having thoughts of harming yourself</h2>
          <p className="mt-2 text-ink-soft">These questions don't ask about that, so your score can't tell us. Please take those thoughts seriously.</p>
          <SelfHarmGuidance />
        </section>
      ) : (
        <p className="no-print text-sm text-ink-soft">
          These questions don't ask about thoughts of harming yourself, whatever your score. If you're having them, please{' '}
          <Link className="link" to="/help">talk to someone now</Link>.
        </p>
      )}

      <div className="no-print">
        <button type="button" className="btn btn-secondary w-full" onClick={() => window.print()}>
          <Printer aria-hidden="true" className="size-5" />
          Print for a doctor
        </button>
      </div>

      <PrintSummary result={result} />

      {footer}

      <p className="text-xs text-ink-soft">{GAD7_ATTRIBUTION}</p>
    </article>
  );
}

/** The score on a line of running stitch. Severity is read from words and position; the colours don't change. */
function ScoreScale({ score }: { score: number }) {
  const percent = (score / GAD7_MAX_SCORE) * 100;
  return (
    <figure className="m-0" aria-label="Where your score sits on the 0 to 21 scale">
      <div className="relative h-7" aria-hidden="true">
        <div className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 gap-1">
          {SEVERITY_BANDS.map((b) => {
            const active = score >= b.min && score <= b.max;
            return (
              <div key={b.severity} style={{ flexGrow: b.max - b.min + 1, flexBasis: 0 }} className={`stitch-band h-1 ${active ? 'stitch-band-on' : ''}`} />
            );
          })}
        </div>
        <span
          className="absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-ink bg-haldi"
          style={{ left: `${percent}%` }}
        />
      </div>
      <ul className="mt-1 flex gap-1 text-xs">
        {SEVERITY_BANDS.map((b) => {
          const active = score >= b.min && score <= b.max;
          return (
            <li
              key={b.severity}
              style={{ flexGrow: b.max - b.min + 1, flexBasis: 0 }}
              className={active ? 'min-w-0 font-semibold' : 'min-w-0 text-ink-soft'}
              aria-current={active ? 'true' : undefined}
            >
              {b.label}
              <span className="block tabular-nums">{b.min}-{b.max}</span>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}

function NextSteps({ score, takenAt }: { score: number; takenAt: string }) {
  const professional = score >= GAD7_REFERRAL_CUTOFF;
  const primary = HELPLINES[0]!;
  return (
    <section aria-labelledby="next" className="no-print flex flex-col gap-3">
      <h2 id="next" className="text-xl">What you could do next</h2>
      <ul className="flex flex-col gap-3">
        {professional && (
          <li>
            <strong className="block font-semibold">Talk to a professional</strong>
            <span className="text-ink-soft">
              A doctor or counsellor can look at the full picture. You could show them this result. If you don't know where to start, {primary.name} on{' '}
              <a className="link" href={`tel:${primary.tel}`}>{primary.display}</a> can guide you.
            </span>
          </li>
        )}
        <li>
          <strong className="block font-semibold">Try something calming</strong>
          <span className="text-ink-soft">
            A few minutes of <Link className="link" to="/tools/breathe">slow breathing</Link> or{' '}
            <Link className="link" to="/tools/ground">grounding</Link> can help you settle.
          </span>
        </li>
        {!professional && (
          <li>
            <strong className="block font-semibold">Keep an eye on it</strong>
            <span className="text-ink-soft">If this starts getting in the way of work, home or relationships, it's worth talking to a doctor.</span>
          </li>
        )}
        <FittingTools />
        <li>
          <strong className="block font-semibold">Check in again around {formatDate(nextCheckInDate(takenAt))}</strong>
          <span className="text-ink-soft">The questions cover two weeks, so that's the soonest a new answer tells you something new.</span>
        </li>
      </ul>
    </section>
  );
}

/** For an account that chose stress factors: the tools that fit them. Nothing for anyone else. */
function FittingTools() {
  const me = useMe();
  const profile = me.data && !me.data.consentRequired ? me.data.profile : undefined;
  const items = suggestionsFor(profile?.stressFactors);
  if (!profile || !items.length) return null;
  const words = readableProfile(profile).stressFactors!.map((w) => w.toLowerCase()).join(', ');
  return (
    <li className="flex flex-col gap-2">
      <strong className="block font-semibold">Tools that may help</strong>
      <span className="text-ink-soft">Because you mentioned {words}.</span>
      <SuggestionList items={items} />
    </li>
  );
}

/** What a doctor needs on paper: the instrument, the answers, the total. */
function PrintSummary({ result }: { result: ResultData }) {
  const band = severityFor(result.score);
  return (
    <section className="print-only">
      <h2 className="text-xl">GAD-7 screening answers</h2>
      <p>Taken {formatDate(result.takenAt)}. Self-reported, over the previous 2 weeks. Total {result.score} of {GAD7_MAX_SCORE} ({band.label}). Not a diagnosis.</p>
      <table className="mt-3 w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-line">
            <th className="py-1 pr-3">Over the last 2 weeks</th>
            <th className="py-1 pr-3">Answer</th>
            <th className="py-1 text-right">Score</th>
          </tr>
        </thead>
        <tbody>
          {GAD7_ITEMS.map((item, i) => {
            const answer = result.answers[i] ?? 0;
            return (
              <tr key={item} className="border-b border-line">
                <td className="py-1 pr-3">{item}</td>
                <td className="py-1 pr-3">{GAD7_OPTIONS[answer]?.label}</td>
                <td className="py-1 text-right">{answer}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {result.difficulty !== null && <p className="mt-3">Functional difficulty: {DIFFICULTY_OPTIONS[result.difficulty]?.label}.</p>}
      <p className="mt-3">Emergency in India: {EMERGENCY_NUMBER.display}. {HELPLINES[0]!.name}: {HELPLINES[0]!.display}.</p>
    </section>
  );
}

function SaveOffer({ result }: { result: GuestResult }) {
  const me = useMe();
  const navigate = useNavigate();
  const client = useQueryClient();
  const autoSaveFailed = (useLocation().state as { saveFailed?: boolean } | null)?.saveFailed === true;
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const save = useMutation({
    mutationFn: () => saveResult(result),
    onSuccess: (saved) => {
      clearGuestResult();
      void client.invalidateQueries({ queryKey: assessmentsKey });
      navigate(`/result/${saved.id}`, { replace: true });
    },
  });

  if (!me.data || me.data.consentRequired) {
    return (
      <section aria-labelledby="keep" className="patch no-print flex flex-col gap-3">
        <h2 id="keep" className="text-xl">Want to keep this result?</h2>
        <p className="text-ink-soft">
          It goes away when you close this tab. To compare with later check-ins, sign in or create an account. It's encrypted when stored.
        </p>
        <Link className="btn btn-primary" to={withNext('/sign-in', '/result')}>Sign in to save</Link>
        <Link className="btn btn-secondary" to={withNext('/create-account', '/result')}>Create an account</Link>
      </section>
    );
  }

  const tooOld = save.error instanceof ApiError && save.error.code === 'validation_failed';
  return (
    <section aria-labelledby="keep" className="patch no-print flex flex-col gap-3">
      <h2 id="keep" className="text-xl">Save this result to your account?</h2>
      <p className="text-ink-soft">It will appear in your trends, and only you can see it.</p>
      {autoSaveFailed && !save.error && (
        <p role="alert" className="font-medium text-madder">We couldn't save this just now. It's safe in this tab, so you can try again.</p>
      )}
      {save.error && (
        <p role="alert" className="font-medium text-madder">
          {tooOld ? "This result is more than a day old, so it can't be saved. You can take a new check-in instead." : errorMessage(save.error)}
        </p>
      )}
      <button type="button" className="btn btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>
        {save.isPending ? 'Saving' : 'Save result'}
      </button>
      <button type="button" className="btn btn-ghost" onClick={() => setConfirmDiscard(true)}>Don't save</button>
      <ConfirmSheet
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        onConfirm={() => {
          clearGuestResult();
          navigate('/', { replace: true });
        }}
        title="Discard this result?"
        confirmLabel="Discard result"
        cancelLabel="Keep result"
      >
        It won't be saved to your account, and you won't be able to see it again.
      </ConfirmSheet>
    </section>
  );
}
