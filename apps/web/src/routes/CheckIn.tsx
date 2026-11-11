import {
  assessmentResponse,
  DIFFICULTY_OPTIONS,
  DIFFICULTY_STEM,
  GAD7_ITEMS,
  GAD7_OPTIONS,
  GAD7_STEM,
  type Assessment,
} from '@anxiocare/shared';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ClipboardList, Sprout } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router';
import { request } from '@/lib/api';
import {
  clearCheckin,
  clearGuestResult,
  completeCheckin,
  guestResultBody,
  loadCheckin,
  needsDifficulty,
  nextUnanswered,
  saveCheckin,
  saveGuestResult,
  startCheckin,
  type CheckinProgress,
  type GuestResult,
} from '@/lib/guest';
import { assessmentsKey, useMe } from '@/lib/queries';
import { beginReflection } from '@/lib/reflection';
import { loadReflection, nextUnansweredReflection, STEPS } from '@/lib/reflection-store';
import { PageTitle } from '@/ui/PageTitle';
import { OptionButton, QuestionFrame, Saving } from '@/ui/Question';
import { moveByArrow, useAdvance } from '@/ui/question-behaviour';
import { Stitches } from '@/ui/Stitches';

const ITEM_COUNT = GAD7_ITEMS.length;

/**
 * The start of a check-in: the person picks the GAD-7 or a Reflection, and goes ahead. Both are open to guests and
 * accounts alike. Get help and Quick exit stay in the header, as on every screen.
 */
export function CheckInChoice() {
  const navigate = useNavigate();
  const client = useQueryClient();
  // Who is signed in decides which saved reflections to leave questions out from.
  useMe();
  const [starting, setStarting] = useState(false);
  const progress = loadReflection();
  const answered = progress?.answers.filter((a) => a !== null).length ?? 0;

  const reflect = async () => {
    setStarting(true);
    await beginReflection(client);
    navigate('/reflection/1');
  };

  return (
    <div className="flex flex-1 flex-col">
      <PageTitle className="pt-2 text-2xl" title="Check in">What would you like to do?</PageTitle>
      {progress && answered > 0 && (
        <Link to={`/reflection/${nextUnansweredReflection(progress) < STEPS ? nextUnansweredReflection(progress) + 1 : 'note'}`} className="patch mt-4 block no-underline">
          <span className="block font-semibold">Continue your reflection</span>
          <span className="block text-sm text-ink-soft">You've answered {answered} of {STEPS} questions.</span>
        </Link>
      )}
      <ul className="mt-5 flex flex-col gap-3">
        <li>
          <Link to="/check-in/gad7" className="choice">
            <ClipboardList aria-hidden="true" className="size-6 shrink-0 text-madder" strokeWidth={1.9} />
            <span className="flex flex-col gap-1">
              <span className="font-display text-xl font-semibold">Anxiety check (GAD-7)</span>
              <span className="text-ink-soft">7 questions, the same each time. Gives a score you can track and share with a doctor. About 2 minutes.</span>
            </span>
          </Link>
        </li>
        <li>
          <button type="button" className="choice" disabled={starting} onClick={() => void reflect()}>
            <Sprout aria-hidden="true" className="size-6 shrink-0 text-madder" strokeWidth={1.9} />
            <span className="flex flex-col gap-1">
              <span className="font-display text-xl font-semibold">Reflection</span>
              <span className="text-ink-soft">5 questions, different each time, to notice how you're doing. No score. About 2 minutes.</span>
            </span>
          </button>
        </li>
      </ul>
      <div className="mt-auto flex flex-col gap-2 pt-6">
        <p className="text-sm text-ink-soft">Without an account, your answers stay in this browser tab and are gone when you close it.</p>
        <Link className="btn btn-ghost" to="/">Not now</Link>
        <p className="text-center text-sm text-ink-soft">For adults, 18 and over.</p>
      </div>
    </div>
  );
}

export function CheckInIntro() {
  const navigate = useNavigate();
  const existing = loadCheckin();
  const answered = existing?.answers.filter((a) => a !== null).length ?? 0;

  const begin = () => {
    startCheckin();
    navigate('/check-in/1');
  };

  return (
    <div className="flex flex-1 flex-col">
      <PageTitle className="pt-2 text-2xl" title="Before you start">
        Seven questions about the last two weeks
      </PageTitle>
      <ul className="mt-5 flex flex-col gap-4">
        <li>
          <strong className="block font-semibold">One at a time, about two minutes.</strong>
          <span className="text-ink-soft">There are no right or wrong answers. Go with your first instinct.</span>
        </li>
        <li>
          <strong className="block font-semibold">It stays private.</strong>
          <span className="text-ink-soft">Without an account, your answers stay in this browser tab and are gone when you close it.</span>
        </li>
        <li>
          <strong className="block font-semibold">It's a screening, not a diagnosis.</strong>
          <span className="text-ink-soft">
            These are the questions of the GAD-7, a widely used anxiety questionnaire. Only a doctor or mental health professional can diagnose.
          </span>
        </li>
        <li>
          <strong className="block font-semibold">You can stop at any time.</strong>
          <span className="text-ink-soft">"Get help" stays at the top of every question.</span>
        </li>
      </ul>
      <div className="mt-auto flex flex-col gap-2 pt-6">
        {answered > 0 && existing ? (
          <>
            <Link className="btn btn-primary" to={`/check-in/${Math.min(nextUnanswered(existing) + 1, ITEM_COUNT)}`}>
              Continue from question {Math.min(nextUnanswered(existing) + 1, ITEM_COUNT)}
            </Link>
            <button type="button" className="btn btn-secondary" onClick={begin}>Start again</button>
          </>
        ) : (
          <button type="button" className="btn btn-primary" onClick={begin}>Begin</button>
        )}
        <Link className="btn btn-ghost" to="/">Not now</Link>
        <p className="text-center text-sm text-ink-soft">For adults, 18 and over.</p>
      </div>
    </div>
  );
}

export function CheckInStep() {
  const { step = '1' } = useParams();
  const progress = loadCheckin();
  const location = useLocation();

  if (!progress) return <Navigate to="/check-in/gad7" replace />;

  if (step === 'difficulty') {
    if (nextUnanswered(progress) < ITEM_COUNT) return <Navigate to={`/check-in/${nextUnanswered(progress) + 1}`} replace />;
    if (!needsDifficulty(progress.answers)) return <Navigate to="/check-in/7" replace />;
    return <DifficultyQuestion key={location.key} progress={progress} />;
  }

  const n = Number(step);
  if (!Number.isInteger(n) || n < 1 || n > ITEM_COUNT) return <Navigate to="/check-in/gad7" replace />;
  // No skipping ahead by URL: go to the first unanswered question.
  if (n - 1 > nextUnanswered(progress)) return <Navigate to={`/check-in/${nextUnanswered(progress) + 1}`} replace />;
  return <ItemQuestion key={n} index={n - 1} progress={progress} />;
}

function useFinish() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const me = useMe();
  const [saving, setSaving] = useState(false);

  return {
    saving,
    finish: async (progress: CheckinProgress) => {
      const result = completeCheckin(progress);
      if (!result) return;
      clearCheckin();
      saveGuestResult(result);
      const signedIn = !!me.data && !me.data.consentRequired;
      if (signedIn) {
        setSaving(true);
        const saved = await saveResult(result).catch(() => null);
        if (saved) {
          clearGuestResult();
          void client.invalidateQueries({ queryKey: assessmentsKey });
          navigate(`/result/${saved.id}`, { replace: true });
          return;
        }
      }
      // Guest, or the save failed: the result is safe in this tab and can be saved from there.
      navigate('/result', { replace: true, state: { saveFailed: signedIn } });
    },
  };
}

export function saveResult(result: GuestResult): Promise<Assessment> {
  // Replaying the same clientRequestId returns the original row, so a retry is always safe.
  return request<Assessment>('POST', '/assessments', {
    body: guestResultBody(result),
    schema: assessmentResponse,
  });
}

function ItemQuestion({ index, progress }: { index: number; progress: CheckinProgress }) {
  const navigate = useNavigate();
  const advance = useAdvance();
  const { finish, saving } = useFinish();
  const [selected, setSelected] = useState(progress.answers[index] ?? null);
  const question = GAD7_ITEMS[index]!;

  const choose = (value: number) => {
    setSelected(value);
    const answers = [...progress.answers];
    answers[index] = value as 0 | 1 | 2 | 3;
    const updated: CheckinProgress = { ...progress, answers };
    saveCheckin(updated);
    advance(() => {
      if (index + 1 < ITEM_COUNT) navigate(`/check-in/${index + 2}`);
      else if (needsDifficulty(answers)) navigate('/check-in/difficulty');
      else void finish(updated);
    });
  };

  if (saving) return <Saving />;
  return (
    <QuestionFrame
      count={ITEM_COUNT}
      position={index + 1}
      backTo={index === 0 ? '/check-in/gad7' : `/check-in/${index}`}
      stem={GAD7_STEM}
      question={question}
      titleKey={String(index)}
    >
      {GAD7_OPTIONS.map((o) => (
        <OptionButton key={o.value} label={o.label} selected={selected === o.value} onSelect={() => choose(o.value)} />
      ))}
    </QuestionFrame>
  );
}

function DifficultyQuestion({ progress }: { progress: CheckinProgress }) {
  const advance = useAdvance();
  const { finish, saving } = useFinish();
  const [selected, setSelected] = useState(progress.difficulty);
  const navigate = useNavigate();
  const location = useLocation();

  const choose = (value: number) => {
    setSelected(value as 0 | 1 | 2 | 3);
    const updated: CheckinProgress = { ...progress, difficulty: value as 0 | 1 | 2 | 3 };
    saveCheckin(updated);
    advance(() => void finish(updated));
  };

  if (saving) return <Saving />;
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Back"
          className="-ml-2 grid size-11 shrink-0 place-items-center rounded-full"
          onClick={() => (location.key !== 'default' ? navigate(-1) : navigate('/check-in/7'))}
        >
          <ArrowLeft aria-hidden="true" className="size-6" />
        </button>
        <Stitches className="flex-1" total={ITEM_COUNT} done={ITEM_COUNT} label="All seven questions answered" />
        <span className="shrink-0 text-right text-sm text-ink-soft">Last one</span>
      </div>
      <PageTitle className="mt-4 text-[1.625rem] leading-[1.16]" title="One last question">
        {DIFFICULTY_STEM}
      </PageTitle>
      <div role="group" aria-label="How difficult" className="mt-auto flex flex-col gap-2 pt-6" onKeyDown={moveByArrow}>
        {DIFFICULTY_OPTIONS.map((o) => (
          <OptionButton key={o.value} label={o.label} selected={selected === o.value} onSelect={() => choose(o.value)} />
        ))}
      </div>
    </div>
  );
}
