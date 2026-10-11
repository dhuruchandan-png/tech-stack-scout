type Lang = { name: string; color: string; share: number };

export type FingerprintProps = {
  languages: Lang[];
  /** infra categories detected: containers | orchestration | iac | cicd | platform | rpc | sdk */
  categories: string[];
  level: "high" | "medium" | "low" | "dormant" | string;
  size?: number;
  title?: string;
};

const SLOTS: { key: string[]; label: string }[] = [
  { key: ["containers"], label: "Containers" },
  { key: ["orchestration"], label: "Orchestration" },
  { key: ["iac"], label: "IaC" },
  { key: ["cicd"], label: "CI/CD" },
  { key: ["platform", "sdk"], label: "Serverless / platform" },
  { key: ["rpc"], label: "RPC" },
];

const polar = (cx: number, cy: number, r: number, a: number) => [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;

function arc(cx: number, cy: number, r: number, a0: number, a1: number) {
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a1);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

/**
 * Stack Fingerprint: a radial glyph unique to each company.
 *  outer ring  = language shares (linguist colours)
 *  middle ring = detected infra categories
 *  centre dot  = activity (pulses when High, static when Low, hollow when Dormant)
 */
export function Fingerprint({ languages, categories, level, size = 28, title }: FingerprintProps) {
  const vb = 100;
  const c = vb / 2;
  const outerR = 42, outerW = size < 40 ? 13 : 11;
  const midR = 26, midW = size < 40 ? 11 : 9;
  const gap = 0.045;

  // outer ring
  let a = -Math.PI / 2;
  const total = languages.reduce((s, l) => s + l.share, 0) || 1;
  const outer = languages.map((l) => {
    const span = (l.share / total) * Math.PI * 2;
    const seg = { l, a0: a, a1: a + span };
    a += span;
    return seg;
  });

  // middle ring: 6 fixed slots so fingerprints are comparable across accounts
  const slotSpan = (Math.PI * 2) / SLOTS.length;
  const present = SLOTS.map((s) => s.key.some((k) => categories.includes(k)));

  const dotColor = "rgb(var(--signal))";
  const r = level === "high" ? 7 : level === "medium" ? 6 : level === "low" ? 5 : 5;
  const aria = title ?? `Stack fingerprint. Languages: ${languages.slice(0, 3).map((l) => `${l.name} ${Math.round(l.share * 100)}%`).join(", ") || "none"}. Infra: ${SLOTS.filter((_, i) => present[i]).map((s) => s.label).join(", ") || "none"}. Activity ${level}.`;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${vb} ${vb}`} role="img" aria-label={aria} className="shrink-0">
      <title>{aria}</title>
      <circle cx={c} cy={c} r={outerR} fill="none" stroke="rgb(var(--border))" strokeWidth={outerW} />
      {outer.length === 0 && <circle cx={c} cy={c} r={outerR} fill="none" stroke="rgb(var(--border-strong))" strokeWidth={outerW} strokeDasharray="3 5" />}
      {outer.map(({ l, a0, a1 }) =>
        a1 - a0 > Math.PI * 2 - 0.01 ? (
          <circle key={l.name} cx={c} cy={c} r={outerR} fill="none" stroke={l.color} strokeWidth={outerW} />
        ) : (
          <path key={l.name} d={arc(c, c, outerR, a0 + gap / 2, a1 - gap / 2)} fill="none" stroke={l.color} strokeWidth={outerW} />
        ),
      )}
      {SLOTS.map((s, i) => {
        const a0 = -Math.PI / 2 + i * slotSpan, a1 = a0 + slotSpan;
        return (
          <path
            key={s.label}
            d={arc(c, c, midR, a0 + 0.06, a1 - 0.06)}
            fill="none"
            stroke={present[i] ? "rgb(var(--signal))" : "rgb(var(--border-strong))"}
            strokeOpacity={present[i] ? 0.85 : 0.5}
            strokeWidth={midW}
          >
            <title>{`${s.label}: ${present[i] ? "detected" : "not seen"}`}</title>
          </path>
        );
      })}
      {level === "dormant" ? (
        <circle cx={c} cy={c} r={r} fill="none" stroke="rgb(var(--text-faint))" strokeWidth={2} />
      ) : (
        <circle cx={c} cy={c} r={r} fill={dotColor} className={level === "high" ? "animate-pulseDot" : undefined} style={{ transformOrigin: "50px 50px", transformBox: "fill-box" }} />
      )}
    </svg>
  );
}
