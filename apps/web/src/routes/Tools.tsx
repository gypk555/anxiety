import { Ear, NotebookPen, Waves, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router';
import { PageTitle } from '@/ui/PageTitle';
import { RingsMark } from '@/ui/Rings';

const OTHERS: { to: string; name: string; text: string; icon: LucideIcon; note?: string }[] = [
  { to: '/tools/ground', name: 'Grounding', text: 'Five senses, step by step, to come back to the room you are in.', icon: Ear },
  { to: '/tools/sounds', name: 'Sounds', text: 'Rain, the sea, a ceiling fan, a tanpura. Made on your phone, so no data used.', icon: Waves },
  { to: '/journal/new', name: 'Thought record', text: 'Write down a worry, then look at it from another side. Needs an account.', icon: NotebookPen },
];

export default function Tools() {
  return (
    <div className="flex flex-col gap-5">
      <PageTitle className="pt-2 text-2xl" title="Tools">Something to do, right now</PageTitle>

      <Link to="/tools/breathe" className="night relative block min-h-40 overflow-hidden rounded-[1.25rem] bg-surface p-5 pr-28 text-ink no-underline">
        <RingsMark className="pointer-events-none absolute -right-16 top-1/2 size-52 -translate-y-1/2" />
        <span className="relative block font-display text-2xl font-semibold">Breathe</span>
        <span className="relative mt-1 block text-sm text-ink-soft">Follow the circle. One to five minutes. Works offline.</span>
      </Link>

      <ul className="flex flex-col">
        {OTHERS.map(({ to, name, text, icon: Icon }, i) => (
          <li key={to}>
            {i > 0 && <hr className="stitch-rule" />}
            <Link to={to} className="flex items-start gap-3.5 py-4 no-underline">
              <Icon aria-hidden="true" className="mt-0.5 size-6 shrink-0 text-madder" strokeWidth={1.9} />
              <span>
                <span className="block font-display text-xl font-semibold">{name}</span>
                <span className="block text-sm text-ink-soft">{text}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
