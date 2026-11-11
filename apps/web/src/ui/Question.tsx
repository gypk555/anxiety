import { ArrowLeft, Check } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router';
import { PageTitle } from '@/ui/PageTitle';
import { Stitches } from '@/ui/Stitches';
import { moveByArrow } from './question-behaviour';

/** One question per screen, as the check-in and a reflection both ask them. */

export function QuestionFrame({ count, position, backTo, stem, children, question, titleKey }: {
  count: number;
  position: number;
  backTo: string;
  stem: string;
  question: string;
  titleKey: string;
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const canPop = location.key !== 'default';
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Back"
          className="-ml-2 grid size-11 shrink-0 place-items-center rounded-full"
          onClick={() => (canPop ? navigate(-1) : navigate(backTo))}
        >
          <ArrowLeft aria-hidden="true" className="size-6" />
        </button>
        <Stitches className="flex-1" total={count} done={position} label={`Question ${position} of ${count}`} />
        <span className="w-11 shrink-0 text-right text-sm tabular-nums text-ink-soft">{position}/{count}</span>
      </div>
      <p className="mt-4 text-sm text-ink-soft">{stem}</p>
      <PageTitle key={titleKey} className="mt-2 text-[1.875rem] leading-[1.12]" title={`Question ${position} of ${count}`}>
        {question}
      </PageTitle>
      <div role="group" aria-label={question} className="mt-auto flex flex-col gap-2 pt-6" onKeyDown={moveByArrow}>
        {children}
      </div>
    </div>
  );
}

export function OptionButton({ label, selected, onSelect }: { label: string; selected: boolean; onSelect: () => void }) {
  return (
    <button type="button" className="option" aria-pressed={selected} onClick={onSelect}>
      <span className="flex-1">{label}</span>
      {selected && <Check aria-hidden="true" className="size-5 shrink-0" strokeWidth={3} />}
    </button>
  );
}

export function Saving({ what = 'your result' }: { what?: string } = {}) {
  return (
    <div role="status" className="flex flex-1 items-center justify-center">
      <p className="font-display text-xl">Saving {what}</p>
    </div>
  );
}
