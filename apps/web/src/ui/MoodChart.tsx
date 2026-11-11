import { daysBetween, MOOD_LEVELS, moodLabel, type MoodEntry } from '@anxiocare/shared';
import { useId, useState, type ReactNode } from 'react';
import { formatDate, formatShortDate } from '@/lib/dates';
import { dayAsDate, moodSummary } from '@/lib/mood';
import { useWidth } from './TrendChart';

const HEIGHT = 176;
const PAD = { top: 12, right: 14, bottom: 26, left: 76 };

/**
 * The daily mood log, on its own axis of words. Never drawn with GAD-7 scores, which are a different measure. Same
 * running-stitch line as the check-in chart, and the same numbers as a real table.
 */
export function MoodChart({ entries, from, to, headingLevel = 2, footer }: { entries: readonly MoodEntry[]; from: string; to: string; headingLevel?: 2 | 3; footer?: ReactNode }) {
  const [ref, width] = useWidth();
  const [showTable, setShowTable] = useState(false);
  const titleId = useId();
  const descId = useId();
  const headingId = useId();
  const summary = moodSummary(entries);
  const span = Math.max(1, daysBetween(from, to));
  const innerW = Math.max(40, width - PAD.left - PAD.right);
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const x = (day: string) => PAD.left + (daysBetween(from, day) / span) * innerW;
  const y = (rating: number) => PAD.top + innerH - ((rating - 1) / 4) * innerH;
  const path = entries.map((e, i) => `${i === 0 ? 'M' : 'L'}${x(e.day).toFixed(1)} ${y(e.rating).toFixed(1)}`).join(' ');
  const Heading = headingLevel === 2 ? 'h2' : 'h3';

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <Heading id={headingId} className="text-xl">Your daily mood log, not a test score</Heading>
      <figure className="m-0">
        <p className="mb-3 text-ink-soft">{summary}</p>
        <div ref={ref} className="w-full">
          <svg role="img" aria-labelledby={`${titleId} ${descId}`} viewBox={`0 0 ${width} ${HEIGHT}`} width={width} height={HEIGHT} className="block max-w-full">
            <title id={titleId}>Your daily mood, rated from Very low to Very good, {formatDate(dayAsDate(from))} to {formatDate(dayAsDate(to))}</title>
            <desc id={descId}>{summary}</desc>
            {MOOD_LEVELS.map((level) => (
              <g key={level.value}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(level.value)} y2={y(level.value)} stroke="var(--line)" strokeWidth={1} strokeDasharray="2 5" />
                <text x={0} y={y(level.value) + 4} fill="var(--ink-soft)" fontSize={12} fontFamily="var(--font-body)">{level.label}</text>
              </g>
            ))}
            {entries.length > 1 && (
              <path d={path} fill="none" stroke="var(--thread)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="6 6" />
            )}
            {entries.map((e) => (
              <circle key={e.day} cx={x(e.day)} cy={y(e.rating)} r={4.5} fill="var(--surface)" stroke="var(--ink)" strokeWidth={2} />
            ))}
            <text x={PAD.left} y={HEIGHT - 6} fill="var(--ink-soft)" fontSize={12} fontFamily="var(--font-body)">{formatShortDate(dayAsDate(from))}</text>
            <text x={width - PAD.right} y={HEIGHT - 6} textAnchor="end" fill="var(--ink-soft)" fontSize={12} fontFamily="var(--font-body)">{formatShortDate(dayAsDate(to))}</text>
          </svg>
        </div>
        <button type="button" className="link mt-1 py-2.5 text-sm" aria-expanded={showTable} onClick={() => setShowTable(!showTable)}>
          {showTable ? 'Hide the mood table' : 'Show the mood log as a table'}
        </button>
        {showTable && (
          // Focusable, so a keyboard can scroll it if a long note makes it wider than the screen.
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Daily mood table">
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">Daily mood by date</caption>
              <thead>
                <tr className="border-b-2 border-line">
                  <th scope="col" className="py-1.5 pr-3 font-semibold">Date</th>
                  <th scope="col" className="py-1.5 pr-3 font-semibold">Mood</th>
                  <th scope="col" className="py-1.5 font-semibold">Note</th>
                </tr>
              </thead>
              <tbody>
                {[...entries].reverse().map((e) => (
                  <tr key={e.day} className="border-b border-line">
                    <td className="py-1.5 pr-3 whitespace-nowrap">{formatDate(dayAsDate(e.day))}</td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">{moodLabel(e.rating)}</td>
                    <td className="py-1.5 [overflow-wrap:anywhere]">{e.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </figure>
      {footer}
    </section>
  );
}
