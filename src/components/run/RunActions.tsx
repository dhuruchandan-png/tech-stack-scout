"use client";

import { useRuns } from "./RunConsole";

export function RunActions({ runId, companyId, name, status }: { runId: number; companyId: number; name: string; status: string }) {
  const { openRun, refresh } = useRuns();
  const live = status === "running" || status === "queued";
  return (
    <div className="flex justify-end gap-2">
      <button className="btn h-8" onClick={() => openRun(runId)}>{live ? "Watch live" : "Console"}</button>
      {(status === "failed" || status === "partial") && <button className="btn h-8" onClick={() => refresh(companyId, name)}>Retry</button>}
    </div>
  );
}
