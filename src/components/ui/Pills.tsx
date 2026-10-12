import { AlertTriangle, CheckCircle2, CircleDashed, XCircle } from "lucide-react";
import { cn, freshnessOf, timeAgo } from "@/lib/util";

/** Freshness pill: signal under 7 days, amber at 7–10, alert beyond; shows "Stale since" on failure. */
export function FreshnessPill({ at, staleSince }: { at: Date | string | null; staleSince?: { source: string; since: string } | null }) {
  const f = freshnessOf(at);
  if (staleSince) {
    return (
      <span className="chip border-change/40 bg-change/10 text-change" title={`${staleSince.source} failed on the last run`}>
        <AlertTriangle className="h-3 w-3" /> Stale since {new Date(staleSince.since).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })} ({staleSince.source})
      </span>
    );
  }
  const cls = f.level === "fresh" ? "border-signal/40 bg-signal/10 text-signal" : f.level === "aging" ? "border-change/40 bg-change/10 text-change" : "border-alert/40 bg-alert/10 text-alert";
  return (
    <span className={cn("chip", cls)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {at ? `Refreshed ${timeAgo(at)}` : "Never refreshed"}
    </span>
  );
}

const CONF = {
  high: { n: 3, cls: "bg-verified", label: "High" },
  medium: { n: 2, cls: "bg-change", label: "Medium" },
  low: { n: 1, cls: "bg-alert", label: "Low" },
} as const;

export function ConfidenceMeter({ level, reason, inline = false }: { level: string | null | undefined; reason?: string | null; inline?: boolean }) {
  const c = CONF[(level as keyof typeof CONF) ?? "low"] ?? CONF.low;
  return (
    <span className="chip" title={reason ?? undefined} aria-label={`Confidence ${c.label}${reason ? `: ${reason}` : ""}`}>
      {!inline && <span className="text-muted">Confidence</span>}
      <span className="flex gap-0.5">
        {[1, 2, 3].map((i) => (
          <span key={i} className={cn("h-1.5 w-4 rounded-full", i <= c.n ? c.cls : "bg-line-strong")} />
        ))}
      </span>
      <span className="font-medium">{c.label}</span>
    </span>
  );
}

export function CheckBadge({ status, reasons }: { status: string | null | undefined; reasons?: string[] | null }) {
  if (status === "verified")
    return <span className="chip border-verified/40 bg-verified/10 text-verified"><CheckCircle2 className="h-3 w-3" /> Verified</span>;
  if (status === "needs_review")
    return (
      <span className="chip border-change/40 bg-change/10 text-change" title={reasons?.join("\n")}>
        <AlertTriangle className="h-3 w-3" /> Needs review
      </span>
    );
  return <span className="chip text-muted"><CircleDashed className="h-3 w-3" /> Pending</span>;
}

export function HubspotBadge({ status, error }: { status: string; error?: string | null }) {
  if (status === "synced") return <span className="chip border-verified/40 bg-verified/10 text-verified"><CheckCircle2 className="h-3 w-3" /> HubSpot synced</span>;
  if (status === "failed") return <span className="chip border-alert/40 bg-alert/10 text-alert" title={error ?? undefined}><XCircle className="h-3 w-3" /> HubSpot failed</span>;
  return <span className="chip text-muted"><CircleDashed className="h-3 w-3" /> HubSpot pending</span>;
}

const LEVEL_CLS: Record<string, string> = {
  high: "border-signal/40 bg-signal/10 text-signal",
  medium: "border-change/40 bg-change/10 text-change",
  low: "border-line-strong text-muted",
  dormant: "border-line-strong text-faint",
};
export function ActivityBadge({ level }: { level: string | null | undefined }) {
  const l = level ?? "dormant";
  return <span className={cn("chip capitalize", LEVEL_CLS[l] ?? LEVEL_CLS.dormant)}>{l}{l === "high" ? " ▲" : ""}</span>;
}

const MS_CLS: Record<string, string> = {
  strong: "text-verified", medium: "text-change", some: "text-change", weak: "text-muted", none: "text-muted", unknown: "text-faint",
};
export function MicroservicesBadge({ level }: { level: string | null | undefined }) {
  const l = level ?? "unknown";
  return <span className="text-[13px]"><span className="text-muted">Microservices </span><span className={cn("font-semibold capitalize", MS_CLS[l])}>{l}</span></span>;
}
