import { useQueryClient } from '@tanstack/react-query';
import { ChevronRight, ClipboardList, Sprout } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';

/**
 * The two ways to check in, as rows: the GAD-7, or a Reflection. The same choice as /check-in, offered on Home so it
 * is one tap. A Reflection picks its questions first, as the chooser does.
 */
export function CheckInChoices() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const [starting, setStarting] = useState(false);
  const reflect = async () => {
    setStarting(true);
    try {
      // Loaded on tap: the question bank stays out of the first bundle (see e2e/live/compression.spec.ts).
      const { beginReflection } = await import('@/lib/reflection');
      await beginReflection(client);
      navigate('/reflection/1');
    } finally {
      setStarting(false);
    }
  };
  return (
    <ul className="flex flex-col gap-2.5">
      <li>
        <Link to="/check-in/gad7" className="choice-row">
          <ClipboardList aria-hidden="true" className="size-6 shrink-0 text-madder" strokeWidth={1.9} />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Anxiety check (GAD-7)</span>
            <span className="block text-sm text-ink-soft">7 questions · about 2 minutes</span>
          </span>
          <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-ink-soft" />
        </Link>
      </li>
      <li>
        <button type="button" className="choice-row" disabled={starting} onClick={() => void reflect()}>
          <Sprout aria-hidden="true" className="size-6 shrink-0 text-madder" strokeWidth={1.9} />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Reflection</span>
            <span className="block text-sm text-ink-soft">5 gentle questions · not scored</span>
          </span>
          <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-ink-soft" />
        </button>
      </li>
    </ul>
  );
}
