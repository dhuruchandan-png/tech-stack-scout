import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { RunActions } from "@/components/run/RunActions";
import { EmptyState, PageHeader, SetupNotice } from "@/components/ui/States";
import { getRecentRuns } from "@/lib/queries";
import { safe } from "@/lib/safe";
import { cn, timeAgo } from "@/lib/util";

export const dynamic = "force-dynamic";
export const metadata = { title: "Runs" };

const SOURCES = ["github", "jobs", "blog", "youtube", "hn"] as const;
const DOT: Record<string, string> = { ok: "bg-verified", warn: "bg-change", fail: "bg-alert", skipped: "bg-faint", running: "bg-ai animate-pulse" };
const STATUS: Record<string, string> = { done: "text-verified", partial: "text-change", failed: "text-alert", running: "text-ai", queued: "text-muted" };

export default async function RunsPage() {
  const res = await safe(() => getRecentRuns(80));
  if (!res.ok) return <SetupNotice error={res.error} />;
  const runs = res.data;

  // GitHub rate-limit banner: parse the reset time from the latest rate-limit failure
  const rl = runs.flatMap((r) => r.steps).filter((s) => s.step === "github" && s.status === "fail" && /rate limit/i.test(s.detail ?? "")).at(-1);
  const resetAt = rl?.detail?.match(/resets (\S+)/)?.[1];
  const resetDate = resetAt ? new Date(resetAt) : null;
  const showBanner = resetDate && resetDate.getTime() > Date.now();

  return (
    <div>
      <PageHeader eyebrow="Weekly cron · Mondays 6:00 IST · one company per request" title="Runs" />
      {showBanner && (
        <div className="mb-4 flex items-center gap-3 rounded-card border border-change/40 bg-change/10 px-4 py-3 text-[13px] text-change">
          <AlertTriangle className="h-4 w-4" /> GitHub rate limit is low. Resuming at {resetDate!.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })} IST. Cached responses keep repeat calls down.
        </div>
      )}
      {runs.length === 0 ? (
        <div className="card"><EmptyState title="No runs yet." hint="Click Refresh now on an account, or wait for the Monday 6:00 IST refresh." /></div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[900px] text-[13px]">
            <thead className="border-b border-line">
              <tr className="label text-left"><th className="px-4 py-3 font-normal">Run</th><th className="font-normal">Account</th><th className="font-normal">Trigger</th><th className="font-normal">Status</th><th className="font-normal">Sources</th><th className="font-normal">Duration</th><th className="font-normal">Gemini</th><th className="w-40" /></tr>
            </thead>
            <tbody>
              {runs.map(({ run, name, domain, steps }) => {
                const last = new Map<string, (typeof steps)[number]>();
                for (const s of steps) last.set(s.step, s);
                const dur = run.finishedAt ? ((run.finishedAt.getTime() - run.startedAt.getTime()) / 1000).toFixed(1) + "s" : "…";
                const errors = [...last.values()].filter((s) => s.status === "fail");
                return (
                  <tr key={run.id} className="border-b border-line align-top last:border-0">
                    <td className="mono px-4 py-3 text-muted">#{run.id}<div className="text-[11px] text-faint">{timeAgo(run.startedAt)}</div></td>
                    <td className="py-3"><Link href={`/accounts/${domain}`} className="font-medium hover:text-signal">{name}</Link></td>
                    <td className="py-3 capitalize text-muted">{run.trigger}</td>
                    <td className={cn("py-3 font-medium capitalize", STATUS[run.status])}>{run.status}</td>
                    <td className="py-3">
                      <div className="flex gap-1.5">{SOURCES.map((s) => <span key={s} title={`${s}: ${last.get(s)?.detail ?? "n/a"}`} className={cn("h-2.5 w-2.5 rounded-full", DOT[last.get(s)?.status ?? "skipped"])} />)}</div>
                      {(errors.length > 0 || run.error) && (
                        <details className="mt-1.5 text-[12px] text-alert"><summary className="cursor-pointer">{errors.length || 1} error{errors.length > 1 ? "s" : ""}</summary>
                          <ul className="mt-1 space-y-0.5">{errors.map((e) => <li key={e.id}>{e.step}: {e.detail}</li>)}{run.error && <li>{run.error}</li>}</ul>
                        </details>
                      )}
                    </td>
                    <td className="mono py-3 text-muted">{dur}</td>
                    <td className="mono py-3 text-muted">{run.geminiTokens ? `${(run.geminiTokens / 1000).toFixed(1)}k · $${(run.costUsd ?? 0).toFixed(3)}` : "n/a"}</td>
                    <td className="py-3 pr-4 text-right"><RunActions runId={run.id} companyId={run.companyId} name={name} status={run.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
