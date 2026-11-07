import { journalBody, journalResponse, type JournalEntry } from '@anxiocare/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, Plus, X } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { errorMessage, isNotFound, request } from '@/lib/api';
import { deleteDraft, emptyDraft, getDraft, NEW_DRAFT, setDraft, type DraftValues } from '@/lib/drafts';
import { journalKey } from '@/lib/queries';
import { NotFound } from '@/shell/RouteError';
import { PageTitle } from '@/ui/PageTitle';
import { ConfirmSheet } from '@/ui/Sheet';
import { ErrorState, PageSkeleton } from '@/ui/States';
import { Stitches } from '@/ui/Stitches';
import { fetchEntry } from './Journal';

const STEP_COUNT = 5;
const FEELINGS = ['Anxious', 'Worried', 'Scared', 'Sad', 'Angry', 'Ashamed', 'Guilty', 'Overwhelmed', 'Lonely', 'Tired'];
const MAX_FEELINGS = 10;
const MAX_FEELING_LENGTH = 40;

export function JournalNew() {
  return <Form draftKey={NEW_DRAFT} initial={getDraft(NEW_DRAFT)?.values ?? emptyDraft()} doneTo={(e) => `/journal/${e.id}`} exitTo="/journal" />;
}

export function JournalEdit() {
  const { id = '' } = useParams();
  const entry = useQuery({ queryKey: [...journalKey, id], queryFn: () => fetchEntry(id) });
  if (entry.isPending) return <PageSkeleton />;
  if (isNotFound(entry.error)) return <NotFound />;
  if (entry.isError) return <ErrorState error={entry.error} onRetry={() => void entry.refetch()} />;
  const { situation, thought, feelings, intensityBefore, evidenceFor, evidenceAgainst, balancedThought, intensityAfter } = entry.data;
  const initial: DraftValues = { situation, thought, feelings, intensityBefore, evidenceFor, evidenceAgainst, balancedThought, intensityAfter };
  return <Form draftKey={id} entryId={id} initial={getDraft(id)?.values ?? initial} doneTo={(e) => `/journal/${e.id}`} exitTo={`/journal/${id}`} />;
}

function Form({ draftKey, entryId, initial, doneTo, exitTo }: {
  draftKey: string;
  entryId?: string;
  initial: DraftValues;
  doneTo: (e: JournalEntry) => string;
  exitTo: string;
}) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const step = Math.min(STEP_COUNT, Math.max(1, Number(params.get('step')) || 1));
  const [values, setValues] = useState(initial);
  const [dirty, setDirty] = useState(getDraft(draftKey)?.dirty ?? false);
  const [stepError, setStepError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const update = (patch: Partial<DraftValues>) => {
    const next = { ...values, ...patch };
    setValues(next);
    setDirty(true);
    setDraft(draftKey, { values: next, dirty: true }); // in memory only
    setStepError(null);
  };

  // Closing the tab loses a draft for good, so the browser asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const save = useMutation({
    mutationFn: async () => {
      const body = journalBody.parse(values);
      return request<JournalEntry>(entryId ? 'PATCH' : 'POST', entryId ? `/journal/${encodeURIComponent(entryId)}` : '/journal', {
        body,
        schema: journalResponse,
      });
    },
    onSuccess: (entry) => {
      deleteDraft(draftKey);
      setDirty(false);
      void client.invalidateQueries({ queryKey: journalKey });
      navigate(doneTo(entry), { replace: true });
    },
  });

  const goTo = (n: number) => {
    setStepError(null);
    setParams({ step: String(n) });
  };

  const next = () => {
    if (step === 1 && !values.situation.trim()) return setStepError('Write a few words about what happened, even just "at work".');
    if (step === 2 && !values.thought.trim()) return setStepError('Write the thought in your own words. It only needs to be short.');
    if (step < STEP_COUNT) return goTo(step + 1);
    // Reached the last step by a link or a reload, with the required parts empty.
    if (!values.situation.trim()) return goTo(1);
    if (!values.thought.trim()) return goTo(2);
    save.mutate();
  };

  const exit = () => {
    if (dirty) setConfirmDiscard(true);
    else navigate(exitTo);
  };

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center gap-2">
        <button type="button" aria-label="Close" className="-ml-2 grid size-11 shrink-0 place-items-center rounded-full" onClick={exit}>
          <X aria-hidden="true" className="size-6" />
        </button>
        <Stitches className="flex-1" total={STEP_COUNT} done={step} label={`Step ${step} of ${STEP_COUNT}`} />
        <span className="w-11 shrink-0 text-right text-sm tabular-nums text-ink-soft">{step}/{STEP_COUNT}</span>
      </div>

      <div className="mt-3 flex flex-1 flex-col">
        {step === 1 && (
          <Long
            key="situation"
            title="What happened?"
            hint="Where were you, and what was going on? Just the facts, as a camera would have seen it."
            placeholder="My manager asked to talk tomorrow, and didn't say why."
            value={values.situation}
            error={stepError}
            onChange={(situation) => update({ situation })}
          />
        )}
        {step === 2 && (
          <Long
            key="thought"
            title="What went through your mind?"
            hint="Write the thought the way it sounded in your head. It doesn't need to be reasonable."
            placeholder="I must have done something wrong. I'm going to lose my job."
            value={values.thought}
            error={stepError}
            onChange={(thought) => update({ thought })}
          />
        )}
        {step === 3 && <FeelingsStep values={values} update={update} />}
        {step === 4 && <EvidenceStep values={values} update={update} />}
        {step === 5 && <BalanceStep values={values} update={update} />}
      </div>

      {save.error && <p role="alert" className="mt-3 font-medium text-madder">{errorMessage(save.error)} Your draft is safe here.</p>}

      <div className="sticky bottom-[max(0.5rem,env(safe-area-inset-bottom))] mt-4 flex gap-2 bg-ground pt-2">
        {step > 1 && (
          <button type="button" aria-label="Previous step" className="btn btn-secondary aspect-square shrink-0 !px-0" onClick={() => goTo(step - 1)}>
            <ArrowLeft aria-hidden="true" className="size-5" />
          </button>
        )}
        <button type="button" className="btn btn-primary flex-1" disabled={save.isPending} onClick={next}>
          {step < STEP_COUNT ? 'Next' : save.isPending ? 'Saving' : entryId ? 'Save changes' : 'Save thought record'}
        </button>
      </div>

      <ConfirmSheet
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        onConfirm={() => {
          deleteDraft(draftKey);
          setDirty(false);
          navigate(exitTo);
        }}
        title={entryId ? 'Discard your changes?' : 'Discard this thought record?'}
        confirmLabel={entryId ? 'Discard changes' : 'Discard draft'}
        cancelLabel="Keep writing"
      >
        What you've written here will be lost. It hasn't been saved.
      </ConfirmSheet>
    </div>
  );
}

function Long({ title, hint, placeholder, value, error, onChange, optional }: {
  title: string;
  hint: string;
  placeholder?: string;
  value: string;
  error?: string | null;
  onChange: (value: string) => void;
  optional?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <PageTitle className="text-[1.75rem] leading-[1.14]" title={title}><label htmlFor={id}>{title}</label></PageTitle>
      <p id={`${id}-hint`} className="text-ink-soft">{hint}{optional ? ' You can skip this.' : ''}</p>
      <textarea
        id={id}
        rows={5}
        maxLength={2000}
        className="field mt-1 resize-y"
        placeholder={placeholder}
        value={value}
        aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`}
        aria-invalid={error ? true : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && <p id={`${id}-error`} role="alert" className="font-medium text-madder">{error}</p>}
    </div>
  );
}

function Strength({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-2">
        <span className="font-medium">{label}</span>
        <span className="font-display text-xl font-semibold tabular-nums">{value}<span className="sr-only"> out of 10</span></span>
      </span>
      <input type="range" min={0} max={10} step={1} className="range" value={value} aria-valuetext={`${value} out of 10`} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="flex justify-between text-xs text-ink-soft" aria-hidden="true"><span>0, barely there</span><span>10, as strong as it gets</span></span>
    </label>
  );
}

function FeelingsStep({ values, update }: { values: DraftValues; update: (p: Partial<DraftValues>) => void }) {
  const [custom, setCustom] = useState('');
  const toggle = (feeling: string) => {
    const has = values.feelings.includes(feeling);
    if (!has && values.feelings.length >= MAX_FEELINGS) return;
    update({ feelings: has ? values.feelings.filter((f) => f !== feeling) : [...values.feelings, feeling] });
  };
  const addCustom = () => {
    const f = custom.trim().slice(0, MAX_FEELING_LENGTH);
    if (f && !values.feelings.includes(f) && values.feelings.length < MAX_FEELINGS) update({ feelings: [...values.feelings, f] });
    setCustom('');
  };
  const options = [...FEELINGS, ...values.feelings.filter((f) => !FEELINGS.includes(f))];
  return (
    <div className="flex flex-col gap-3">
      <PageTitle className="text-[1.75rem] leading-[1.14]" title="How did it feel?">How did it feel?</PageTitle>
      <p className="text-ink-soft">Choose any that fit, or add your own.</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Feelings">
        {options.map((f) => {
          const on = values.feelings.includes(f);
          return (
            <button key={f} type="button" className="chip" aria-pressed={on} onClick={() => toggle(f)}>
              {on && <Check aria-hidden="true" className="size-4" strokeWidth={3} />}
              {f}
            </button>
          );
        })}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          addCustom();
        }}
      >
        <label className="flex-1">
          <span className="sr-only">Add your own feeling</span>
          <input className="field" maxLength={MAX_FEELING_LENGTH} placeholder="Add your own" value={custom} onChange={(e) => setCustom(e.target.value)} />
        </label>
        <button type="submit" aria-label="Add feeling" className="btn btn-quiet aspect-square !px-0"><Plus aria-hidden="true" className="size-5" /></button>
      </form>
      <div className="mt-2"><Strength label="How strong was it?" value={values.intensityBefore} onChange={(intensityBefore) => update({ intensityBefore })} /></div>
    </div>
  );
}

function SmallArea({ label, hint, value, onChange }: { label: string; hint: string; value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-medium">{label}</label>
      <p id={`${id}-h`} className="text-sm text-ink-soft">{hint}</p>
      <textarea id={id} rows={3} maxLength={2000} aria-describedby={`${id}-h`} className="field mt-1 resize-y" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function EvidenceStep({ values, update }: { values: DraftValues; update: (p: Partial<DraftValues>) => void }) {
  return (
    <div className="flex flex-col gap-4">
      <PageTitle className="text-[1.75rem] leading-[1.14]" title="Look at the thought from both sides">Look at the thought from both sides</PageTitle>
      <p className="-mt-2 text-ink-soft">You can skip either of these.</p>
      <SmallArea label="What supports it?" hint="Things that actually happened, not feelings." value={values.evidenceFor} onChange={(evidenceFor) => update({ evidenceFor })} />
      <SmallArea label="What doesn't fit?" hint="What would you say to a friend who had this thought?" value={values.evidenceAgainst} onChange={(evidenceAgainst) => update({ evidenceAgainst })} />
    </div>
  );
}

function BalanceStep({ values, update }: { values: DraftValues; update: (p: Partial<DraftValues>) => void }) {
  return (
    <div className="flex flex-col gap-4">
      <Long
        key="balanced"
        title="Is there a more balanced way to see it?"
        hint="It doesn't have to be positive, just fair. Something true that you could say to yourself."
        placeholder="I don't know what the talk is about. It could be about many things."
        value={values.balancedThought}
        optional
        onChange={(balancedThought) => update({ balancedThought })}
      />
      {values.intensityAfter === null ? (
        <button type="button" className="btn btn-quiet" onClick={() => update({ intensityAfter: values.intensityBefore })}>
          Rate how it feels now
        </button>
      ) : (
        <div>
          <Strength label="How strong is it now?" value={values.intensityAfter} onChange={(intensityAfter) => update({ intensityAfter })} />
          <button type="button" className="link mt-1 py-2 text-sm" onClick={() => update({ intensityAfter: null })}>Skip this</button>
        </div>
      )}
    </div>
  );
}
