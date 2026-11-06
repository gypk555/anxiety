/** Concentric running stitch, the way kantha quilters fill a circle. Purely decorative. */
export function StitchRing({ r, width = 1.4, dash = 5, gap = 3.4, color = 'var(--thread)', offset = 0 }: {
  r: number;
  width?: number;
  dash?: number;
  gap?: number;
  color?: string;
  offset?: number;
}) {
  return (
    <circle
      cx="50"
      cy="50"
      r={r}
      fill="none"
      stroke={color}
      strokeWidth={width}
      strokeLinecap="round"
      strokeDasharray={`${dash} ${gap}`}
      strokeDashoffset={offset}
    />
  );
}

/** The haldi knot at the centre, itself filled with two tiny rows of stitch. */
export function Knot({ r = 15, plain = false }: { r?: number; plain?: boolean }) {
  return (
    <>
      <circle cx="50" cy="50" r={r} fill="var(--haldi)" />
      <StitchRing r={r * (plain ? 0.9 : 0.68)} width={0.7} dash={2.4} gap={2} color="var(--haldi-deep)" />
      {!plain && <StitchRing r={r * 0.36} width={0.7} dash={1.8} gap={1.7} color="var(--haldi-deep)" />}
    </>
  );
}

export function RingsMark({ className, rings = [24, 32, 40, 48] }: { className?: string; rings?: number[] }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true" focusable="false">
      {rings.map((r, i) => (
        <StitchRing key={r} r={r} offset={i * 2.3} />
      ))}
      <Knot />
    </svg>
  );
}

/** Small brand mark for the top bar. */
export function Logomark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true" focusable="false">
      <StitchRing r={44} width={7} dash={14} gap={10.6} />
      <circle cx="50" cy="50" r="26" fill="var(--haldi)" />
    </svg>
  );
}
