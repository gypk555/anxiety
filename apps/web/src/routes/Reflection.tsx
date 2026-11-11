import {
  HELPLINES,
  REFLECTION_NOTE_MAX,
  REFLECTION_OPTIONS,
  reflectionQuestion,
  summarizeReflection,
  themeInfo,
  type Reflection,
  type ReflectionAnswer,
} from '@anxiocare/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Phone } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router';
import { ApiError, errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/dates';
import { withNext } from '@/lib/next-path';
import { useMe } from '@/lib/queries';
import { deleteReflection, fetchReflection, oneReflectionKey, reflectionsKey, saveReflection } from '@/lib/reflection';
import {
  clearReflection,
  clearReflectionResult,
  completeReflection,
  loadReflection,
  loadReflectionResult,
  nextUnansweredReflection,
  rememberReflection,
  saveReflection as saveProgress,
  saveReflectionResult,
  STEPS,
  type ReflectionProgress,
  type ReflectionResult,
} from '@/lib/reflection-store';
import { NotFound } from '@/shell/RouteError';
import { PageTitle } from '@/ui/PageTitle';
import { OptionButton, QuestionFrame, Saving } from '@/ui/Question';
import { useAdvance } from '@/ui/question-behaviour';
import { ConfirmSheet } from '@/ui/Sheet';
import { ErrorState, PageSkeleton } from '@/ui/States';
import { Stitches } from '@/ui/Stitches';
import { SelfHarmGuidance } from './Help';

/**
 * A Reflection: five questions from the bank, one per theme, then an optional note. Never scored: the result is a few
 * plain sentences, the answers, and what might help. See docs/modules/reflections.md.
 */

const oneKey = oneReflectionKey;

export function ReflectionStep() {
  const { step = '1' } = useParams();
  // Known before the last step, so that finishing can save straight away for an account.
  useMe();
  const progress = loadReflection();
  if (!progress) return <Navigate to="/check-in" replace />;
  const next = nextUnansweredReflection(progress);

  if (step === 'note') {
    if (next < STEPS) return <Navigate to={`/reflection/${next + 1}`} replace />;
    return <NoteStep progress={progress} />;
  }
  const n = Number(step);
  if (!Number.isInteger(n) || n < 1 || n > STEPS) return <Navigate to="/check-in" replace />;
  // No skipping ahead by URL: go to the first unanswered question.
  if (n - 1 > next) return <Navigate to={`/reflection/${next + 1}`} replace />;
  const question = reflectionQuestion(progress.questionIds[n - 1]!);
  if (!question) {
    // A question this version of the app doesn't know: start again rather than show something wrong.
    clearReflection();
    return <Navigate to="/check-in" replace />;
  }
  return <ReflectionQuestionStep key={n} index={n - 1} progress={progress} text={question.text} stem={themeInfo(question.theme).label} />;
}

function ReflectionQuestionStep({ index, progress, text, stem }: { index: number; progress: ReflectionProgress; text: string; stem: string }) {
  const navigate = useNavigate();
  const advance = useAdvance();
  const [selected, setSelected] = useState(progress.answers[index] ?? null);

  const choose = (value: number) => {
    setSelected(value);
    const answers = [...progress.answers];
    answers[index] = value;
    saveProgress({ ...progress, answers });
    advance(() => navigate(index + 1 < STEPS ? `/reflection/${index + 2}` : '/reflection/note'));
  };

  return (
    <QuestionFrame
      count={STEPS}
      position={index + 1}
      backTo={index === 0 ? '/check-in' : `/reflection/${index}`}
      stem={stem}
      question={text}
      titleKey={String(index)}
    >
      {REFLECTION_OPTIONS.map((o) => (
        <OptionButton key={o.value} label={o.label} selected={selected === o.value} onSelect={() => choose(o.value)} />
      ))}
    </QuestionFrame>
  );
}

function NoteStep({ progress }: { progress: ReflectionProgress }) {
  const navigate = useNavigate();
  const location = useLocation();
  const client = useQueryClient();
  const me = useMe();
  const noteId = useId();
  const hintId = useId();
  const [note, setNote] = useState(progress.note);
  const [saving, setSaving] = useState(false);

  const finish = async () => {
    const result = completeReflection({ ...progress, note });
    if (!result) return;
    clearReflection();
    saveReflectionResult(result);
    rememberReflection(progress.questionIds);
    const signedIn = !!me.data && !me.data.consentRequired;
    if (signedIn) {
      setSaving(true);
      const saved = await saveReflection(result).catch(() => null);
      if (saved) {
        clearReflectionResult();
        await client.invalidateQueries({ queryKey: reflectionsKey, refetchType: 'none' });
        client.setQueryData(oneKey(saved.id), saved);
        navigate(`/reflections/${saved.id}`, { replace: true });
        return;
      }
    }
    // A guest, or the save failed: it's safe in this tab and can be saved from there.
    navigate('/reflection/result', { replace: true, state: { saveFailed: signedIn } });
  };

  if (saving) return <Saving what="your reflection" />;
  const left = REFLECTION_NOTE_MAX - note.length;
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Back"
          className="-ml-2 grid size-11 shrink-0 place-items-center rounded-full"
          onClick={() => (location.key !== 'default' ? navigate(-1) : navigate(`/reflection/${STEPS}`))}
        >
          <ArrowLeft aria-hidden="true" className="size-6" />
        </button>
        <Stitches className="flex-1" total={STEPS} done={STEPS} label="All five questions answered" />
        <span className="shrink-0 text-right text-sm text-ink-soft">Last one</span>
      </div>
      <PageTitle className="mt-4 text-[1.625rem] leading-[1.16]" title="One last thing">One last thing</PageTitle>
      <div className="mt-4 flex flex-col gap-1.5">
        <label htmlFor={noteId} className="font-medium">Anything else on your mind? (optional)</label>
        <p id={hintId} className="text-sm text-ink-soft">A few words, if you'd like. Only you will see it. Until it's saved, it's kept only while the app is open.</p>
        <textarea
          id={noteId}
          aria-describedby={hintId}
          className="field min-h-32"
          maxLength={REFLECTION_NOTE_MAX}
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            saveProgress({ ...progress, note: e.target.value });
          }}
        />
        <p className="text-right text-sm text-ink-soft" aria-live="polite">{left} {left === 1 ? 'character' : 'characters'} left</p>
      </div>
      <div className="mt-auto flex flex-col gap-2 pt-6">
        <button type="button" className="btn btn-primary" onClick={() => void finish()}>See your reflection</button>
      </div>
    </div>
  );
}

// ── Results ───────────────────────────────────────────────────────────

export function GuestReflectionPage() {
  const result = loadReflectionResult();
  if (!result) return <Navigate to="/check-in" replace />;
  return <ReflectionView reflection={result} footer={<SaveOffer result={result} />} />;
}

export function SavedReflectionPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [deleted, setDeleted] = useState(false);
  // Once it's deleted, nothing on this page may ask for it again on its way out.
  const query = useQuery({ queryKey: oneKey(id), queryFn: () => fetchReflection(id), enabled: !deleted });
  const remove = useMutation({
    mutationFn: () => deleteReflection(id),
    onSuccess: () => {
      setDeleted(true);
      client.removeQueries({ queryKey: oneKey(id) });
      // Not the single-reflection entries: this page is still mounted, and its row is gone.
      void client.invalidateQueries({ queryKey: reflectionsKey, predicate: (q) => q.queryKey[1] !== 'one' });
      navigate('/trends', { replace: true });
    },
  });

  if (deleted || query.isPending) return <PageSkeleton />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (!query.data) return <NotFound />;

  return (
    <ReflectionView
      reflection={query.data}
      footer={
        <div className="no-print flex flex-col gap-1">
          <Link className="link self-start py-2" to="/trends">See all your reflections</Link>
          <button type="button" className="link self-start py-2 text-left" onClick={() => setConfirming(true)}>Delete this reflection</button>
          <ConfirmSheet
            open={confirming}
            onClose={() => setConfirming(false)}
            onConfirm={() => remove.mutate()}
            busy={remove.isPending}
            error={remove.error ? errorMessage(remove.error) : null}
            title="Delete this reflection?"
            confirmLabel="Delete reflection"
            cancelLabel="Keep reflection"
          >
            This reflection and its note will be removed. This can't be undone.
          </ConfirmSheet>
        </div>
      }
    />
  );
}

function ReflectionView({ reflection, footer }: { reflection: Pick<Reflection, 'answers' | 'note' | 'takenAt'>; footer: ReactNode }) {
  const me = useMe();
  const account = !!me.data && !me.data.consentRequired;
  const summary = summarizeReflection(reflection.answers);

  return (
    <article className="flex flex-col gap-6">
      <header className="flex flex-col gap-3 pt-1">
        <p className="text-sm text-ink-soft">Your reflection, {formatDate(reflection.takenAt)}</p>
        <PageTitle className="text-3xl" title="Your reflection">Your reflection</PageTitle>
        {summary.lines.map((line) => <p key={line} className="text-lg leading-snug">{line}</p>)}
        <p className="text-sm text-ink-soft">This is a reflection, not a test or a diagnosis.</p>
      </header>

      {summary.bringsHelp && <SupportPanel />}

      <section aria-labelledby="answers" className="flex flex-col gap-2">
        <h2 id="answers" className="text-xl">What you said</h2>
        <ul aria-label="Your answers" className="flex flex-col">
          {reflection.answers.map((answer, i) => (
            <li key={answer.q}>
              {i > 0 && <hr className="stitch-rule" />}
              <AnswerRow answer={answer} />
            </li>
          ))}
        </ul>
        {reflection.note && (
          <div className="patch mt-2">
            <h3 className="text-sm font-body font-medium tracking-normal text-ink-soft">Your note</h3>
            <p className="mt-1 [overflow-wrap:anywhere]">{reflection.note}</p>
          </div>
        )}
      </section>

      <Suggestions strain={summary.strainThemes} account={account} />

      {summary.bringsHelp ? (
        <section aria-labelledby="harm" className="patch no-print">
          <h2 id="harm" className="text-xl">If you're having thoughts of harming yourself</h2>
          <p className="mt-2 text-ink-soft">These questions don't ask about that. Please take those thoughts seriously.</p>
          <SelfHarmGuidance />
        </section>
      ) : (
        <p className="no-print text-sm text-ink-soft">
          These questions don't ask about thoughts of harming yourself. If you're having them, please{' '}
          <Link className="link" to="/help">talk to someone now</Link>.
        </p>
      )}

      {footer}
    </article>
  );
}

function AnswerRow({ answer }: { answer: ReflectionAnswer }) {
  const question = reflectionQuestion(answer.q);
  return (
    <div className="flex flex-col gap-0.5 py-3">
      <span>{question?.text ?? 'A question from an earlier version of the app'}</span>
      <span className="font-semibold">{REFLECTION_OPTIONS[answer.a]?.label}</span>
    </div>
  );
}

/** Brought forward as the severe GAD-7 result does, and as calmly: an offer, not an alarm. */
function SupportPanel() {
  const primary = HELPLINES[0]!;
  return (
    <section aria-labelledby="support" className="patch-quilted no-print flex flex-col gap-3">
      <h2 id="support" className="text-xl">Support is here if you want it</h2>
      <p>Some of what you said sounds heavy to carry. You don't have to manage it alone. {primary.name} is free, available {primary.availability.toLowerCase()}, and you could call just to talk it through.</p>
      <a className="btn btn-call" href={`tel:${primary.tel}`}>
        <Phone aria-hidden="true" className="size-5" />
        Call {primary.display}
      </a>
      <Link className="btn btn-secondary" to="/help">See all helplines</Link>
      <Link className="btn btn-quiet" to="/safety-plan">Open your safety plan</Link>
    </section>
  );
}

/** Only from what the app already has. Each one matched to what came up. */
function Suggestions({ strain, account }: { strain: readonly string[]; account: boolean }) {
  const items: { key: string; title: string; body: ReactNode }[] = [];
  if (strain.includes('body')) {
    items.push({
      key: 'breathe',
      title: 'Give your body a few minutes',
      body: <>A few minutes of <Link className="link" to="/tools/breathe">slow breathing</Link> can ease some of what your body is holding.</>,
    });
  }
  if (strain.includes('worry')) {
    items.push(
      account
        ? { key: 'journal', title: 'Write the thought down', body: <>A <Link className="link" to="/journal/new">thought record</Link> can help you look at a worry from another side.</> }
        : { key: 'ground', title: 'Come back to the room you are in', body: <><Link className="link" to="/tools/ground">Grounding</Link> uses your senses to bring you back from a busy mind for a moment.</> },
    );
  }
  if (strain.includes('situations') && !items.some((i) => i.key === 'ground')) {
    items.push({ key: 'ground', title: 'A pause between things', body: <><Link className="link" to="/tools/ground">Grounding</Link> takes a couple of minutes and works anywhere.</> });
  }
  if (account) {
    items.push({ key: 'mood', title: 'Note how today went', body: <>Your <Link className="link" to="/mood">mood log</Link> helps you see how days compare, in your own words.</> });
  }
  if (items.length === 0) {
    items.push({ key: 'breathe', title: 'A moment to settle', body: <>If you'd like one, try a few minutes of <Link className="link" to="/tools/breathe">slow breathing</Link>.</> });
  }
  return (
    <section aria-labelledby="next" className="no-print flex flex-col gap-3">
      <h2 id="next" className="text-xl">What you could do next</h2>
      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <li key={item.key}>
            <strong className="block font-semibold">{item.title}</strong>
            <span className="text-ink-soft">{item.body}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SaveOffer({ result }: { result: ReflectionResult }) {
  const me = useMe();
  const navigate = useNavigate();
  const client = useQueryClient();
  const autoSaveFailed = (useLocation().state as { saveFailed?: boolean } | null)?.saveFailed === true;
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const save = useMutation({
    mutationFn: () => saveReflection(result),
    onSuccess: async (saved) => {
      clearReflectionResult();
      await client.invalidateQueries({ queryKey: reflectionsKey, refetchType: 'none' });
      client.setQueryData(oneKey(saved.id), saved);
      navigate(`/reflections/${saved.id}`, { replace: true });
    },
  });

  if (!me.data || me.data.consentRequired) {
    return (
      <section aria-labelledby="keep" className="patch no-print flex flex-col gap-3">
        <h2 id="keep" className="text-xl">Want to keep this reflection?</h2>
        <p className="text-ink-soft">It goes away when you close this tab. To look back on it later, sign in or create an account. It's encrypted when stored.</p>
        <Link className="btn btn-primary" to={withNext('/sign-in', '/reflection/result')}>Sign in to save</Link>
        <Link className="btn btn-secondary" to={withNext('/create-account', '/reflection/result')}>Create an account</Link>
      </section>
    );
  }

  const tooOld = save.error instanceof ApiError && save.error.code === 'validation_failed';
  return (
    <section aria-labelledby="keep" className="patch no-print flex flex-col gap-3">
      <h2 id="keep" className="text-xl">Save this reflection to your account?</h2>
      <p className="text-ink-soft">Only you can see it.</p>
      {autoSaveFailed && !save.error && (
        <p role="alert" className="font-medium text-madder">We couldn't save this just now. It's safe in this tab, so you can try again.</p>
      )}
      {save.error && (
        <p role="alert" className="font-medium text-madder">
          {tooOld ? "This reflection is more than a day old, so it can't be saved. You can do a new one instead." : errorMessage(save.error)}
        </p>
      )}
      <button type="button" className="btn btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>
        {save.isPending ? 'Saving' : 'Save reflection'}
      </button>
      <button type="button" className="btn btn-ghost" onClick={() => setConfirmDiscard(true)}>Don't save</button>
      <ConfirmSheet
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        onConfirm={() => {
          clearReflectionResult();
          navigate('/', { replace: true });
        }}
        title="Discard this reflection?"
        confirmLabel="Discard reflection"
        cancelLabel="Keep reflection"
      >
        It won't be saved to your account, and you won't be able to see it again.
      </ConfirmSheet>
    </section>
  );
}

