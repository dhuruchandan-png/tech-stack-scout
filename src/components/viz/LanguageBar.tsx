import { pct } from "@/lib/compute/languages";

type Lang = { name: string; color: string; share: number };

/** GitHub-style stacked bar + legend. `trend` maps language -> change in share since last week (points). */
export function LanguageBar({ languages, trend, compact = false, max = 5 }: { languages: Lang[]; trend?: Record<string, number>; compact?: boolean; max?: number }) {
  const list = languages.slice(0, max);
  if (!list.length) return <div className="h-2 rounded-full bg-raised" aria-label="No language data" />;
  const summary = list.map((l) => `${l.name} ${pct(l.share)}%`).join(", ");
  return (
    <div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-raised" role="img" aria-label={`Language share: ${summary}`}>
        {list.map((l) => (
          <div key={l.name} style={{ width: `${Math.max(l.share * 100, 1.5)}%`, background: l.color }} title={`${l.name} ${pct(l.share)}%`} />
        ))}
      </div>
      {!compact && (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[13px]">
          {list.map((l) => {
            const t = trend?.[l.name];
            return (
              <li key={l.name} className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: l.color }} />
                <span className="text-ink">{l.name}</span>
                <span className="mono text-muted">{pct(l.share)}%</span>
                {t != null && Math.abs(t) >= 1 && (
                  <span className="mono text-[11px] text-change" title="share vs last week">
                    {t > 0 ? "▲" : "▼"}{Math.abs(Math.round(t))}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
