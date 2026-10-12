import type { getSystemHealth } from "@/lib/queries";

type H = Awaited<ReturnType<typeof getSystemHealth>>;

function Stat({ label, value, tone = "signal" }: { label: string; value: string; tone?: "signal" | "change" | "ai" | "verified" }) {
  const cls = { signal: "text-signal", change: "text-change", ai: "text-ai", verified: "text-verified" }[tone];
  return (
    <div className="flex shrink-0 items-baseline gap-2.5 border-r border-line px-5 py-3 last:border-r-0">
      <span className="label !text-[10px]">{label}</span>
      <span className={`mono text-[14px] font-medium ${cls}`}>{value}</span>
    </div>
  );
}

/** The proof-it-works strip: last weekly run, freshness, evidence coverage, verified openers, HubSpot, Gemini cost. */
export function HealthStrip({ h }: { h: H }) {
  const last = h.lastWeeklyRun
    ? new Date(h.lastWeeklyRun).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata", hour12: false })
    : "never";
  const freshTone = h.total === 0 || h.fresh / h.total >= 0.8 ? "signal" : "change";
  return (
    <div className="no-print -mx-4 overflow-x-auto border-b border-line bg-surface/60 md:-mx-6" aria-label="System health">
      <div className="flex min-w-max">
        <Stat label="Last full run" value={last} />
        <Stat label="Fresh ≤7d" value={`${h.fresh}/${h.total}`} tone={freshTone} />
        <Stat label="Evidence coverage" value={`${h.coveragePct}%`} />
        <Stat label="First lines verified" value={`${h.verified}/${h.openers}`} tone={h.openers === h.verified ? "verified" : "change"} />
        <Stat label="HubSpot synced" value={`${h.synced}/${h.total}`} tone={h.synced === h.total ? "verified" : "change"} />
        <Stat label="Gemini this week" value={`$${h.costWeek.toFixed(2)}`} tone="ai" />
      </div>
    </div>
  );
}
