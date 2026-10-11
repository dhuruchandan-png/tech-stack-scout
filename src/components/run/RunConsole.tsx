"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { X } from "lucide-react";
import { startRefresh } from "@/app/actions";

type Step = { id: number; step: string; status: "running" | "ok" | "warn" | "fail" | "skipped"; detail: string | null; durationMs: number | null; at: string };
type RunData = {
  run: { id: number; status: string; trigger: string; startedAt: string; finishedAt: string | null; error: string | null; costUsd: number | null; tokens: number | null };
  company: { name: string; domain: string } | null;
  steps: Step[];
};

type Ctx = {
  openRun: (runId: number) => void;
  refresh: (companyId: number, name?: string) => Promise<void>;
  refreshAll: () => Promise<void>;
  refreshMany: (ids?: number[]) => Promise<void>;
};
const RunCtx = createContext<Ctx | null>(null);
export const useRuns = () => {
  const c = useContext(RunCtx);
  if (!c) throw new Error("useRuns outside provider");
  return c;
};

const GLYPH: Record<Step["status"], { g: string; cls: string }> = {
  ok: { g: "✓", cls: "text-verified" },
  warn: { g: "~", cls: "text-change" },
  fail: { g: "✗", cls: "text-alert" },
  skipped: { g: "–", cls: "text-faint" },
  running: { g: "…", cls: "text-ai" },
};
const NAMES: Record<string, string> = {
  match: "match", github: "github", jobs: "jobs", blog: "blog rss", youtube: "youtube", hn: "hacker news",
  compute: "compute", gemini: "gemini flash", check: "evidence check", save: "snapshot", hubspot: "hubspot", done: "run",
};

/** Collapse "running" then final rows for the same step, keeping first-seen order. */
function collapse(steps: Step[]): Step[] {
  const order: string[] = [];
  const latest = new Map<string, Step>();
  for (const s of steps) {
    if (!latest.has(s.step)) order.push(s.step);
    latest.set(s.step, s);
  }
  return order.map((k) => latest.get(k)!);
}

export function RunConsoleProvider({ children, admin }: { children: React.ReactNode; admin: boolean }) {
  const [runId, setRunId] = useState<number | null>(null);
  const router = useRouter();

  const openRun = useCallback((id: number) => setRunId(id), []);

  const refresh = useCallback(
    async (companyId: number, name?: string) => {
      if (!admin) {
        toast.error("Admin mode required. Unlock with the lock icon (top right).");
        return;
      }
      const r = await startRefresh(companyId);
      if (!r.ok) { toast.error(r.error); return; }
      setRunId(r.runId);
      fetch(`/api/refresh/${companyId}?run=${r.runId}`, { method: "POST" }).catch(() => toast.error(`Could not start the refresh${name ? ` for ${name}` : ""}.`));
    },
    [admin],
  );

  const refreshMany = useCallback(async (ids?: number[]) => {
    if (!admin) { toast.error("Admin mode required. Unlock with the lock icon (top right)."); return; }
    const res = await fetch("/api/refresh-all", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids }) });
    if (!res.ok) { toast.error("Could not queue the refresh."); return; }
    const j = (await res.json()) as { queued: number };
    toast.success(`Queued ${j.queued} account${j.queued === 1 ? "" : "s"}. Running 3 at a time.`, { action: { label: "Open Runs", onClick: () => router.push("/runs") } });
  }, [admin, router]);
  const refreshAll = useCallback(() => refreshMany(), [refreshMany]);

  const value = useMemo(() => ({ openRun, refresh, refreshAll, refreshMany }), [openRun, refresh, refreshAll, refreshMany]);

  return (
    <RunCtx.Provider value={value}>
      {children}
      <ConsolePanel runId={runId} onClose={() => setRunId(null)} />
    </RunCtx.Provider>
  );
}

function ConsolePanel({ runId, onClose }: { runId: number | null; onClose: () => void }) {
  const [data, setData] = useState<RunData | null>(null);
  const router = useRouter();
  const doneRef = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (runId == null) return;
    setData(null);
    doneRef.current = false;
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/runs/${runId}`, { cache: "no-store" });
        if (res.ok) {
          const j = (await res.json()) as RunData;
          if (stop) return;
          setData(j);
          if (["done", "partial", "failed"].includes(j.run.status) && !doneRef.current) {
            doneRef.current = true;
            router.refresh();
            return; // stop polling
          }
        }
      } catch { /* transient; keep polling */ }
      if (!stop && !doneRef.current) setTimeout(tick, 1200);
    };
    tick();
    return () => { stop = true; };
  }, [runId, router]);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [data?.steps.length]);

  const steps = data ? collapse(data.steps) : [];
  const finished = data && ["done", "partial", "failed"].includes(data.run.status);
  const total = data?.run.finishedAt ? ((new Date(data.run.finishedAt).getTime() - new Date(data.run.startedAt).getTime()) / 1000).toFixed(1) : null;

  return (
    <AnimatePresence>
      {runId != null && (
        <>
          <motion.div className="fixed inset-0 z-40 bg-black/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside
            className="fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-[560px] flex-col border-l border-line-strong bg-surface"
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ duration: 0.2, ease: "easeOut" }}
            role="dialog" aria-label="Run console"
          >
            <header className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <div className="label">Run · {data?.run.trigger ?? "…"} · {data?.company?.name ?? "…"}</div>
                <div className="mt-1 flex items-center gap-2 text-[13px] text-muted">
                  <span className={`h-2 w-2 rounded-full ${finished ? (data!.run.status === "failed" ? "bg-alert" : data!.run.status === "partial" ? "bg-change" : "bg-verified") : "animate-pulse bg-ai"}`} />
                  {data?.run.status ?? "starting"}
                  {total && <span className="mono">· done in {total}s</span>}
                </div>
              </div>
              <button className="btn btn-ghost h-8 w-8 p-0" onClick={onClose} aria-label="Close console"><X className="h-4 w-4" /></button>
            </header>

            <div className="mono flex-1 overflow-y-auto bg-bg px-5 py-4 text-[12.5px] leading-7">
              {steps.length === 0 && <div className="text-faint">… queued, waiting for the first step</div>}
              {steps.map((s) => (
                <motion.div key={s.step} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }} className="flex items-baseline gap-3">
                  <span className={`w-3 shrink-0 text-center ${GLYPH[s.status].cls}`}>{GLYPH[s.status].g}</span>
                  <span className="min-w-0 flex-1 break-words text-ink">
                    <span className="text-muted">{NAMES[s.step] ?? s.step}</span> <span className="text-faint">·</span> {s.detail}
                  </span>
                  <span className="shrink-0 text-faint">{s.durationMs != null ? `${(s.durationMs / 1000).toFixed(1)}s` : ""}</span>
                </motion.div>
              ))}
              <div ref={bottom} />
            </div>

            {finished && data && (
              <footer className="border-t border-line px-5 py-3 text-[12.5px] text-muted">
                {data.run.status === "failed" && <div className="text-alert">Run failed: {data.run.error}</div>}
                {data.run.status === "partial" && <div className="text-change">Partial run: a source failed or Gemini was unavailable. Last week&apos;s data is shown where needed.</div>}
                {data.run.status === "done" && <div className="text-verified">Run complete. Evidence checked and snapshot saved.</div>}
                {data.run.costUsd != null && <div className="mono mt-1 text-faint">Gemini · {((data.run.tokens ?? 0) / 1000).toFixed(1)}k tokens · ${data.run.costUsd.toFixed(3)}</div>}
              </footer>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

/** Reusable trigger button. */
export function RefreshButton({ companyId, name, label = "Refresh now", className = "btn" }: { companyId: number; name?: string; label?: string; className?: string }) {
  const { refresh } = useRuns();
  return (
    <button className={className} onClick={() => refresh(companyId, name)}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></svg>
      {label}
    </button>
  );
}

export function OpenRunLink({ runId, children }: { runId: number; children: React.ReactNode }) {
  const { openRun } = useRuns();
  return <button className="underline decoration-dotted underline-offset-4 hover:text-signal" onClick={() => openRun(runId)}>{children}</button>;
}
