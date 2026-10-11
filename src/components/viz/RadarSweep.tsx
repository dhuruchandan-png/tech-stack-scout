/** A faint radar that sweeps once on first load of Today. Static for reduced-motion users. */
export function RadarSweep({ size = 84 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden="true" className="hidden sm:block">
      {[46, 34, 22, 10].map((r) => <circle key={r} cx="50" cy="50" r={r} stroke="rgb(var(--border-strong))" strokeWidth="1" />)}
      <path d="M50 4v92M4 50h92" stroke="rgb(var(--border))" />
      <g className="animate-sweep" style={{ transformOrigin: "50px 50px" }}>
        <path d="M50 50 L50 4 A46 46 0 0 1 82.5 17.5 Z" fill="rgb(var(--signal) / .18)" />
        <path d="M50 50 L50 4" stroke="rgb(var(--signal))" strokeWidth="1.5" />
      </g>
      <circle cx="50" cy="50" r="2.5" fill="rgb(var(--signal))" />
    </svg>
  );
}
