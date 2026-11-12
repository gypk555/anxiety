import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import type { Suggestion } from '@/lib/suggestions';

/** Suggested tools as rows, and a note that isn't a tool as plain text. */
export function SuggestionList({ items }: { items: Suggestion[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((s) => (
        <li key={s.id}>
          {s.to ? (
            <Link to={s.to} className="choice-row">
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{s.title}</span>
                <span className="block text-sm text-ink-soft">{s.text}</span>
              </span>
              <ChevronRight aria-hidden="true" className="size-5 shrink-0" />
            </Link>
          ) : (
            <p className="patch">
              <span className="block font-semibold">{s.title}</span>
              <span className="block text-sm text-ink-soft">{s.text}</span>
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
