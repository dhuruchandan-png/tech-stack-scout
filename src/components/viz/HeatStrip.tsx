/** Activity heat strip: 13 weekly squares in the teal scale, like a contribution graph. */
export function HeatStrip({ series, size = 18 }: { series: number[]; size?: number }) {
  const s = series.length ? series : new Array(13).fill(0);
  const max = Math.max(...s, 1);
  const label = `Commits per week, last ${s.length} weeks: ${s.join(", ")}`;
  return (
    <div className="flex gap-1" role="img" aria-label={label}>
      {s.map((v, i) => {
        const t = v === 0 ? 0 : 0.25 + 0.75 * (v / max);
        return (
          <div
            key={i}
            title={`${v} commits · week ${i + 1} of ${s.length}`}
            className="rounded-[4px]"
            style={{
              width: size, height: size,
              background: v === 0 ? "rgb(var(--raised))" : `rgb(var(--signal) / ${t.toFixed(2)})`,
              border: "1px solid rgb(var(--border))",
            }}
          />
        );
      })}
    </div>
  );
}

/** Tiny sparkline for table rows. */
export function Sparkline({ series, w = 84, h = 22 }: { series: number[]; w?: number; h?: number }) {
  const s = series.length ? series : [0];
  const max = Math.max(...s, 1);
  const step = w / Math.max(s.length - 1, 1);
  const pts = s.map((v, i) => `${(i * step).toFixed(1)},${(h - 2 - (v / max) * (h - 4)).toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Weekly commits trend, latest ${s[s.length - 1]}`}>
      <polyline points={pts} fill="none" stroke="rgb(var(--signal))" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
