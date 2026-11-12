import {
  addDays,
  DIFFICULTY_OPTIONS,
  GAD7_ATTRIBUTION,
  GAD7_MAX_SCORE,
  moodLabel,
  readableProfile,
  REFLECTION_OPTIONS,
  reflectionQuestion,
  SAFETY_PLAN_SECTIONS,
  severityFor,
  type Assessment,
  type JournalEntry,
  type MoodEntry,
  type PlanContact,
  type Profile,
  type Reflection,
  type SafetyPlan,
} from '@anxiocare/shared';
import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { formatDate } from '@/lib/dates';
import { dayAsDate, fetchMoods, moodsKey, todayLocal, weeklyAverages } from '@/lib/mood';
import { assessmentsKey, fetchAssessments, fetchJournal, journalKey, useMe } from '@/lib/queries';
import { fetchReflections, reflectionsKey } from '@/lib/reflection';
import { fetchPlan, planKey } from '@/lib/safety-plan';
import { PageTitle } from '@/ui/PageTitle';
import { ErrorState, PageSkeleton } from '@/ui/States';
import { TrendChart } from '@/ui/TrendChart';

/**
 * A report to take to a doctor, built here in the browser from data the app already reads. No server PDF and no new
 * endpoint: "Save as PDF" is the browser's own print dialog, with the print stylesheet in styles.css. Nothing is
 * included unless the person leaves it switched on. See docs/modules/doctor-report.md.
 */

const PERIODS = [
  { id: '1', label: 'Last month', months: 1 },
  { id: '3', label: 'Last 3 months', months: 3 },
  { id: '6', label: 'Last 6 months', months: 6 },
  { id: 'all', label: 'Everything', months: null },
] as const;
type PeriodId = (typeof PERIODS)[number]['id'];

const SECTIONS = [
  { id: 'scores', label: 'GAD-7 scores', on: true },
  { id: 'chart', label: 'A chart of the scores', on: true },
  { id: 'moodWeeks', label: 'Mood log, weekly averages', on: true },
  { id: 'moodNotes', label: 'Mood notes', on: false },
  { id: 'plan', label: 'Safety plan', on: false },
  { id: 'journal', label: 'Journal entries', on: false },
  { id: 'reflections', label: 'Reflections', on: false },
  { id: 'reflectionNotes', label: 'Reflection notes', on: false },
  { id: 'about', label: 'About me', on: false },
] as const;
type SectionId = (typeof SECTIONS)[number]['id'];

/** The moods API serves at most 400 days, and a mood can't be logged more than 366 days back. */
const MOOD_SPAN = 399;

async function allPages<T>(fetchPage: (cursor?: string) => Promise<{ items: T[]; nextCursor: string | null }>): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 100; i += 1) {
    const page = await fetchPage(cursor);
    items.push(...page.items);
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return items;
}

function cutoffFor(period: PeriodId, now = new Date()): Date | null {
  const months = PERIODS.find((p) => p.id === period)!.months;
  if (months === null) return null;
  const start = new Date(now);
  start.setMonth(start.getMonth() - months);
  return start;
}

export default function Report() {
  const me = useMe();
  const [now] = useState(() => new Date());
  const today = todayLocal(now);
  const [period, setPeriod] = useState<PeriodId>('3');
  const [on, setOn] = useState<Record<SectionId, boolean>>(() => Object.fromEntries(SECTIONS.map((s) => [s.id, s.on])) as Record<SectionId, boolean>);
  const [showName, setShowName] = useState(false);
  const [typedName, setName] = useState<string | null>(null);
  const name = typedName ?? me.data?.displayName ?? '';
  const nameId = useId();

  const assessments = useQuery({ queryKey: [...assessmentsKey, 'report'], queryFn: () => allPages(fetchAssessments) });
  const moodFrom = addDays(today, -MOOD_SPAN);
  const moods = useQuery({ queryKey: [...moodsKey, moodFrom, today], queryFn: () => fetchMoods(moodFrom, today), enabled: on.moodWeeks || on.moodNotes });
  const journal = useQuery({ queryKey: [...journalKey, 'report'], queryFn: () => allPages(fetchJournal), enabled: on.journal });
  const plan = useQuery({ queryKey: planKey, queryFn: fetchPlan, enabled: on.plan });
  const reflections = useQuery({ queryKey: [...reflectionsKey, 'report'], queryFn: () => allPages(fetchReflections), enabled: on.reflections });

  const cutoff = cutoffFor(period, now);
  const cutoffDay = cutoff ? todayLocal(cutoff) : null;
  const inPeriod = (iso: string) => !cutoff || new Date(iso) >= cutoff;
  const scores = (assessments.data ?? []).filter((a) => inPeriod(a.takenAt)).sort((a, b) => a.takenAt.localeCompare(b.takenAt));
  const moodDays = (moods.data ?? []).filter((m) => !cutoffDay || m.day >= cutoffDay);
  const entries = (journal.data ?? []).filter((j) => inPeriod(j.createdAt)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const reflected = (reflections.data ?? []).filter((r) => inPeriod(r.takenAt)).sort((a, b) => a.takenAt.localeCompare(b.takenAt));
  const periodLabel = cutoff ? `${formatDate(cutoff)} to ${formatDate(now)}` : `Everything saved, to ${formatDate(now)}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="no-print">
        <PageTitle className="pt-2 text-2xl" title="Report for a doctor">A report for your doctor</PageTitle>
        <p className="mt-1 text-ink-soft">Choose what goes in, check the preview, then save it as a PDF or print it. Nothing is sent anywhere: it's made on this phone, from your own data.</p>
      </div>

      <form className="no-print flex flex-col gap-5" onSubmit={(e) => e.preventDefault()}>
        <fieldset className="flex flex-col gap-2">
          <legend className="font-display text-xl font-semibold">Period</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {PERIODS.map((p) => (
              <label key={p.id} className="chip cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-on-primary has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus">
                <input type="radio" name="period" className="sr-only" checked={period === p.id} onChange={() => setPeriod(p.id)} />
                {p.label}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="flex flex-col gap-1">
          <legend className="font-display text-xl font-semibold">What to include</legend>
          {SECTIONS.map((s) => (
            <label key={s.id} className="flex min-h-11 items-center gap-3">
              <input type="checkbox" className="size-6 shrink-0 accent-[var(--primary)]" checked={on[s.id]} onChange={(e) => setOn({ ...on, [s.id]: e.target.checked })} />
              {s.label}
            </label>
          ))}
          <p className="text-sm text-ink-soft">Mood notes, your safety plan, journal entries and reflections are private, so they're left out unless you add them. Reflection notes appear only with reflections on. About me is your age range, gender, what you do and what causes you stress, if you've added them.</p>
        </fieldset>
        <fieldset className="flex flex-col gap-2">
          <legend className="font-display text-xl font-semibold">Your name</legend>
          <label className="flex min-h-11 items-center gap-3">
            <input type="checkbox" className="size-6 shrink-0 accent-[var(--primary)]" checked={showName} onChange={(e) => setShowName(e.target.checked)} />
            Put my name at the top
          </label>
          {showName && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor={nameId} className="text-sm font-medium">Name to show</label>
              <input id={nameId} className="field" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          )}
        </fieldset>
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>
          <Printer aria-hidden="true" className="size-5" />
          Save as PDF or print
        </button>
      </form>

      {assessments.isPending && <PageSkeleton />}
      {assessments.isError && <ErrorState error={assessments.error} onRetry={() => void assessments.refetch()} />}
      {assessments.isSuccess && (
        <section aria-label="Report preview" className="report">
          <header className="report-header">
            <p className="font-display text-2xl font-semibold">Anxiety check-in summary</p>
            {showName && name.trim() && <p className="text-lg">For {name.trim()}</p>}
            <p className="text-ink-soft">{periodLabel}</p>
          </header>

          {on.about && me.data && (
            <ReportSection title="About me">
              <AboutMe profile={me.data.profile} />
            </ReportSection>
          )}

          {on.scores && (
            <ReportSection title="GAD-7 scores">
              {scores.length === 0 ? <p>No check-ins in this period.</p> : <ScoresTable scores={scores} />}
            </ReportSection>
          )}
          {on.chart && scores.length > 0 && (
            <ReportSection title="GAD-7 scores over time">
              <TrendChart points={scores.map(({ id, takenAt, score }) => ({ id, takenAt, score }))} />
            </ReportSection>
          )}
          {on.moodWeeks && (
            <ReportSection title="Daily mood log, weekly averages">
              <p className="text-sm">The person's own rating of each day, from 1 (Very low) to 5 (Very good). Not a test score, and not part of the GAD-7.</p>
              <Loaded query={moods}>{moodDays.length === 0 ? <p>No days logged in this period.</p> : <MoodWeeks entries={moodDays} />}</Loaded>
            </ReportSection>
          )}
          {on.moodNotes && (
            <ReportSection title="Mood notes">
              <Loaded query={moods}>{moodDays.some((m) => m.note) ? <MoodNotes entries={moodDays.filter((m) => m.note)} /> : <p>No notes in this period.</p>}</Loaded>
            </ReportSection>
          )}
          {on.plan && (
            <ReportSection title="Safety plan">
              <Loaded query={plan}>{plan.data ? <PlanSummary plan={plan.data} /> : <p>No safety plan saved.</p>}</Loaded>
            </ReportSection>
          )}
          {on.journal && (
            <ReportSection title="Journal entries">
              <Loaded query={journal}>{entries.length === 0 ? <p>No entries in this period.</p> : <JournalEntries entries={entries} />}</Loaded>
            </ReportSection>
          )}

          {on.reflections && (
            <ReportSection title="Reflections">
              <p className="text-sm">The person's own answers to short questions, from Not at all to A lot. Not scored, and not part of the GAD-7.</p>
              <Loaded query={reflections}>{reflected.length === 0 ? <p>No reflections in this period.</p> : <ReflectionList reflections={reflected} notes={on.reflectionNotes} />}</Loaded>
            </ReportSection>
          )}

          <footer className="report-footer">
            <p className="font-semibold">Self-reported. A screening, not a diagnosis.</p>
            <p>{GAD7_ATTRIBUTION}</p>
            <p>Made on {formatDate(now)}, with AnxioCare.</p>
          </footer>
        </section>
      )}
    </div>
  );
}

/** The person's own optional details, in words. The avatar is decoration, so it never goes in. */
function AboutMe({ profile }: { profile: Profile }) {
  const words = readableProfile(profile);
  const rows = [
    ['Age range', words.ageRange],
    ['Gender', words.gender],
    ['Occupation', words.occupation],
    ['Things that cause stress', words.stressFactors?.join(', ')],
  ].filter((r): r is [string, string] => !!r[1]);
  if (rows.length === 0) return <p>No details added.</p>;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
      {rows.map(([term, value]) => (
        <div key={term} className="contents">
          <dt className="font-semibold">{term}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Loaded({ query, children }: { query: { isPending: boolean; isError: boolean; error: unknown; refetch: () => unknown }; children: ReactNode }) {
  if (query.isPending) return <PageSkeleton />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  return <>{children}</>;
}

function ReportSection({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="report-section flex flex-col gap-3">
      <h2 id={id} className="text-2xl">{title}</h2>
      {children}
    </section>
  );
}

const th = 'border-b-2 border-line py-2 pr-3 text-left font-semibold';
const td = 'border-b border-line py-2 pr-3 align-top';

function ScoresTable({ scores }: { scores: Assessment[] }) {
  return (
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="GAD-7 scores table">
      <table className="report-table w-full border-collapse text-lg">
        <caption className="sr-only">GAD-7 check-ins</caption>
        <thead>
          <tr>
            <th scope="col" className={th}>Date</th>
            <th scope="col" className={th}>Score</th>
            <th scope="col" className={th}>Range</th>
            <th scope="col" className={th}>Day-to-day difficulty</th>
          </tr>
        </thead>
        <tbody>
          {scores.map((a) => (
            <tr key={a.id}>
              <td className={`${td} whitespace-nowrap`}>{formatDate(a.takenAt)}</td>
              <td className={`${td} tabular-nums whitespace-nowrap`}>{a.score} of {GAD7_MAX_SCORE}</td>
              <td className={td}>{severityFor(a.score).label}</td>
              <td className={td}>{a.difficulty === null ? 'Not asked' : DIFFICULTY_OPTIONS[a.difficulty]?.label}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MoodWeeks({ entries }: { entries: MoodEntry[] }) {
  return (
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Weekly mood table">
      <table className="report-table w-full border-collapse text-lg">
        <caption className="sr-only">Daily mood, weekly averages</caption>
        <thead>
          <tr>
            <th scope="col" className={th}>Week starting</th>
            <th scope="col" className={th}>Days logged</th>
            <th scope="col" className={th}>Average, 1 to 5</th>
          </tr>
        </thead>
        <tbody>
          {weeklyAverages(entries).map((w) => (
            <tr key={w.weekStart}>
              <td className={`${td} whitespace-nowrap`}>{formatDate(dayAsDate(w.weekStart))}</td>
              <td className={`${td} tabular-nums`}>{w.days}</td>
              <td className={`${td} tabular-nums`}>{w.average.toFixed(1)}, about {moodLabel(Math.round(w.average)).toLowerCase()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MoodNotes({ entries }: { entries: MoodEntry[] }) {
  return (
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Mood notes table">
      <table className="report-table w-full border-collapse text-lg">
        <caption className="sr-only">Mood notes by date</caption>
        <thead>
          <tr>
            <th scope="col" className={th}>Date</th>
            <th scope="col" className={th}>Mood</th>
            <th scope="col" className={th}>Note</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((m) => (
            <tr key={m.day}>
              <td className={`${td} whitespace-nowrap`}>{formatDate(dayAsDate(m.day))}</td>
              <td className={`${td} whitespace-nowrap`}>{moodLabel(m.rating)}</td>
              <td className={`${td} [overflow-wrap:anywhere]`}>{m.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PlanSummary({ plan }: { plan: SafetyPlan }) {
  return (
    <div className="flex flex-col gap-3 text-lg">
      {SAFETY_PLAN_SECTIONS.map((s, i) => {
        const items = plan[s.key];
        return (
          <div key={s.key}>
            <h3 className="text-xl">{i + 1}. {s.title}</h3>
            {items.length === 0 ? (
              <p className="text-ink-soft">Left empty.</p>
            ) : (
              <ul className="list-disc pl-6">
                {s.kind === 'list'
                  ? (items as string[]).map((item, j) => <li key={j} className="[overflow-wrap:anywhere]">{item}</li>)
                  : (items as PlanContact[]).map((c, j) => <li key={j} className="[overflow-wrap:anywhere]">{c.name}{c.phone ? `, ${c.phone}` : ''}</li>)}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

function JournalEntries({ entries }: { entries: JournalEntry[] }) {
  return (
    <div className="flex flex-col gap-4 text-lg">
      {entries.map((e) => (
        <article key={e.id} className="report-entry flex flex-col gap-1">
          <h3 className="text-xl">{formatDate(e.createdAt)}</h3>
          <p><span className="font-semibold">What happened: </span><span className="[overflow-wrap:anywhere]">{e.situation}</span></p>
          <p><span className="font-semibold">Thought: </span><span className="[overflow-wrap:anywhere]">{e.thought}</span></p>
          {e.feelings.length > 0 && <p><span className="font-semibold">Feelings: </span>{e.feelings.join(', ')}, {e.intensityBefore} of 10</p>}
          {e.balancedThought && <p><span className="font-semibold">A more balanced view: </span><span className="[overflow-wrap:anywhere]">{e.balancedThought}</span></p>}
        </article>
      ))}
    </div>
  );
}

function ReflectionList({ reflections, notes }: { reflections: Reflection[]; notes: boolean }) {
  return (
    <div className="flex flex-col gap-4 text-lg">
      {reflections.map((r) => (
        <article key={r.id} className="report-entry flex flex-col gap-2">
          <h3 className="text-xl">{formatDate(r.takenAt)}</h3>
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={`Reflection answers, ${formatDate(r.takenAt)}`}>
            <table className="report-table w-full border-collapse">
              <caption className="sr-only">Reflection on {formatDate(r.takenAt)}</caption>
              <thead>
                <tr>
                  <th scope="col" className={th}>Question</th>
                  <th scope="col" className={th}>Answer</th>
                </tr>
              </thead>
              <tbody>
                {r.answers.map((a) => (
                  <tr key={a.q}>
                    <td className={td}>{reflectionQuestion(a.q)?.text ?? 'A question from an earlier version of the app'}</td>
                    <td className={`${td} whitespace-nowrap`}>{REFLECTION_OPTIONS[a.a]?.label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {notes && r.note && <p><span className="font-semibold">Note: </span><span className="[overflow-wrap:anywhere]">{r.note}</span></p>}
        </article>
      ))}
    </div>
  );
}
