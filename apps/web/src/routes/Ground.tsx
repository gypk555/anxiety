import { Check, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { PageTitle } from '@/ui/PageTitle';
import { Stitches } from '@/ui/Stitches';

const STEPS = [
  { n: 5, sense: 'see', title: 'Name 5 things you can see', hint: 'Small things count: a switch on the wall, a crack in the floor, the colour of your sleeve.' },
  { n: 4, sense: 'feel', title: 'Notice 4 things you can feel', hint: 'Your feet on the floor. The cloth on your arm. Air from the fan.' },
  { n: 3, sense: 'hear', title: 'Listen for 3 things you can hear', hint: 'Traffic, a pressure cooker, birds, your own breath.' },
  { n: 2, sense: 'smell', title: 'Find 2 things you can smell', hint: "If nothing comes, think of two smells you like." },
  { n: 1, sense: 'taste', title: 'Notice 1 thing you can taste', hint: 'Or take a sip of water and notice that.' },
] as const;

export default function Ground() {
  const [index, setIndex] = useState(0);
  const [ticked, setTicked] = useState(0);

  if (index >= STEPS.length) {
    return (
      <div className="flex flex-1 flex-col">
        <PageTitle className="pt-4 text-2xl" title="Grounding finished">You're here, in this room</PageTitle>
        <p className="mt-3 text-ink-soft">Stay a little longer if that feels right. You can go through it again as many times as you need.</p>
        <div className="mt-auto flex flex-col gap-2 pt-6">
          <button type="button" className="btn btn-primary" onClick={() => { setIndex(0); setTicked(0); }}>Go through it again</button>
          <Link className="btn btn-secondary" to="/tools/breathe">Try breathing</Link>
          <Link className="btn btn-ghost" to="/tools">Back to tools</Link>
        </div>
      </div>
    );
  }

  const step = STEPS[index]!;
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center gap-2">
        <Link to="/tools" aria-label="Back to tools" className="-ml-2 grid size-11 shrink-0 place-items-center rounded-full">
          <X aria-hidden="true" className="size-6" />
        </Link>
        <Stitches className="flex-1" total={STEPS.length} done={index + 1} label={`Step ${index + 1} of ${STEPS.length}`} />
        <span className="w-11 shrink-0 text-right text-sm tabular-nums text-ink-soft">{index + 1}/{STEPS.length}</span>
      </div>
      <PageTitle key={index} className="mt-3 text-[1.875rem] leading-[1.12]" title={`Grounding, step ${index + 1} of ${STEPS.length}`}>
        {step.title}
      </PageTitle>
      <p className="mt-2 text-ink-soft">{step.hint}</p>

      <div className="mt-auto flex flex-col gap-3 pt-6">
        <p className="text-sm text-ink-soft" aria-live="polite">Tap once for each one. {ticked} of {step.n}.</p>
        <div className="flex flex-wrap gap-2">
          {/* Five 48px circles fit one row at 320px. */}
          {Array.from({ length: step.n }, (_, i) => {
            const done = i < ticked;
            return (
              <button
                key={i}
                type="button"
                aria-pressed={done}
                aria-label={`Thing ${i + 1} of ${step.n}${done ? ', noticed' : ''}`}
                onClick={() => setTicked(done && i === ticked - 1 ? i : i + 1)}
                className={`grid size-12 place-items-center rounded-full border-2 border-dashed font-display text-xl font-semibold ${
                  done ? 'border-primary bg-primary text-on-primary' : 'border-thread bg-surface'
                }`}
              >
                {done ? <Check aria-hidden="true" className="size-6" strokeWidth={3} /> : i + 1}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className={`btn mt-1 w-full ${ticked >= step.n ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => { setIndex(index + 1); setTicked(0); }}
        >
          {index === STEPS.length - 1 ? 'Finish' : 'Next sense'}
        </button>
      </div>
    </div>
  );
}
