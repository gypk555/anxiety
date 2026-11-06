/**
 * Progress as a line of running stitch, one stitch for each step. It carries a
 * real progressbar role and spoken value, the visible text is alongside it.
 */
export function Stitches({ total, done, label, className = '' }: { total: number; done: number; label: string; className?: string }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      className={`flex gap-1.5 ${className}`}
    >
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`h-1 flex-1 rounded-full ${i < done ? 'bg-thread' : 'bg-line'}`}
        />
      ))}
    </div>
  );
}
