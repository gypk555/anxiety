import { GAD7_MAX_SCORE, SEVERITY_BANDS, severityFor } from '@anxiocare/shared';
import { useEffect, useId, useRef, useState } from 'react';
import { formatDate, formatShortDate } from '@/lib/dates';

export interface TrendPoint {
  id: string;
  takenAt: string;
  score: number;
}

const HEIGHT = 216;
const PAD = { top: 14, right: 30, bottom: 26, left: 66 };
const MIN_RANGE_MS = 14 * 86_400_000;

/** One sentence that says what the chart says. No judgement: going up isn't a failure. */
export function trendSummary(points: readonly TrendPoint[]): string {
  if (points.length === 0) return 'No check-ins yet.';
  const last = points[points.length - 1]!;
  const lastText = `Your latest score is ${last.score} out of ${GAD7_MAX_SCORE}, ${severityFor(last.score).label.toLowerCase()}, on ${formatDate(last.takenAt)}.`;
  if (points.length === 1) return lastText;
  const prev = points[points.length - 2]!;
  const diff = last.score - prev.score;
  const change = diff === 0 ? 'the same as' : `${Math.abs(diff)} ${diff > 0 ? 'higher than' : 'lower than'}`;
  return `${lastText} That is ${change} your check-in on ${formatDate(prev.takenAt)}.`;
}

export function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(340);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0) setWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/**
 * Scores over time, drawn as a line of running stitch. Hand-built SVG: the picture is
 * labelled with a full text summary, and the same numbers are available as a real table.
 */
export function TrendChart({ points }: { points: readonly TrendPoint[] }) {
  const [ref, width] = useWidth();
  const [showTable, setShowTable] = useState(false);
  const titleId = useId();
  const descId = useId();
  const summary = trendSummary(points);

  const times = points.map((p) => new Date(p.takenAt).getTime());
  const first = times[0] ?? 0;
  const last = times[times.length - 1] ?? 0;
  const range = Math.max(last - first, MIN_RANGE_MS);
  const innerW = Math.max(40, width - PAD.left - PAD.right);
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const x = (t: number) => PAD.left + ((t - first) / range) * innerW;
  const y = (score: number) => PAD.top + innerH - (score / GAD7_MAX_SCORE) * innerH;
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(times[i]!).toFixed(1)} ${y(p.score).toFixed(1)}`).join(' ');
  const lastPoint = points[points.length - 1];

  return (
    <figure className="m-0">
      <p className="mb-3">{summary}</p>
      <div ref={ref} className="w-full">
        <svg
          role="img"
          aria-labelledby={`${titleId} ${descId}`}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          width={width}
          height={HEIGHT}
          className="block max-w-full"
        >
          <title id={titleId}>Your check-in scores over time, on a scale of 0 to {GAD7_MAX_SCORE}</title>
          <desc id={descId}>{summary}</desc>
          {SEVERITY_BANDS.map((b) => (
            <g key={b.severity}>
              {b.min > 0 && (
                <line x1={0} x2={width - PAD.right} y1={y(b.min - 0.5)} y2={y(b.min - 0.5)} stroke="var(--line)" strokeWidth={1} />
              )}
              <text x={0} y={y((b.min + b.max) / 2) + 4} fill="var(--ink-soft)" fontSize={12} fontFamily="var(--font-body)">
                {b.label}
              </text>
            </g>
          ))}
          {points.length > 1 && (
            <path d={path} fill="none" stroke="var(--thread)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="9 7" />
          )}
          {points.map((p, i) => (
            <circle key={p.id} cx={x(times[i]!)} cy={y(p.score)} r={5} fill="var(--haldi)" stroke="var(--ink)" strokeWidth={2} />
          ))}
          {lastPoint && (
            <text x={x(last) + 9} y={y(lastPoint.score) + 5} fill="var(--ink)" fontSize={15} fontWeight={600} fontFamily="var(--font-body)">
              {lastPoint.score}
            </text>
          )}
          <text x={PAD.left} y={HEIGHT - 6} fill="var(--ink-soft)" fontSize={12} fontFamily="var(--font-body)">{points[0] ? formatShortDate(points[0].takenAt) : ''}</text>
          {points.length > 1 && lastPoint && (
            <text x={width - PAD.right} y={HEIGHT - 6} textAnchor="end" fill="var(--ink-soft)" fontSize={12} fontFamily="var(--font-body)">{formatShortDate(lastPoint.takenAt)}</text>
          )}
        </svg>
      </div>
      <button type="button" className="link mt-1 py-2.5 text-sm" aria-expanded={showTable} onClick={() => setShowTable(!showTable)}>
        {showTable ? 'Hide the table' : 'Show these as a table'}
      </button>
      {showTable && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">Check-in scores by date</caption>
            <thead>
              <tr className="border-b-2 border-line">
                <th scope="col" className="py-1.5 pr-3 font-semibold">Date</th>
                <th scope="col" className="py-1.5 pr-3 font-semibold">Score</th>
                <th scope="col" className="py-1.5 font-semibold">Range</th>
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().map((p) => (
                <tr key={p.id} className="border-b border-line">
                  <td className="py-1.5 pr-3">{formatDate(p.takenAt)}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{p.score}</td>
                  <td className="py-1.5">{severityFor(p.score).label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </figure>
  );
}
