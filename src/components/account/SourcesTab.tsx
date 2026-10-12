"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { toast } from "sonner";
import { pickGithubOrg, saveOverrides } from "@/app/actions";
import { useRuns } from "@/components/run/RunConsole";
import type { GithubCandidate } from "@/db/schema";
import { cn } from "@/lib/util";

type Props = {
  companyId: number; admin: boolean;
  org: string | null; orgConfidence: string | null; candidates: GithubCandidate[];
  jobProvider: string | null; jobSlug: string | null; blogRss: string | null; youtubeQuery: string | null; youtubeChannelId: string | null; notes: string | null;
  status: Record<string, { state: string; staleSince?: string; detail?: string }>;
  matched: { jobs?: string; blog?: string };
};

const DOT: Record<string, string> = { ok: "bg-verified", not_found: "bg-faint", failed: "bg-change", skipped: "bg-faint" };
const NAMES: Record<string, string> = { github: "GitHub", jobs: "Job board", blog: "Engineering blog RSS", youtube: "YouTube talks", hn: "Hacker News" };

export function SourcesTab(p: Props) {
  const [v, setV] = useState({ githubOrg: p.org ?? "", jobBoardProvider: p.jobProvider ?? "", jobBoardSlug: p.jobSlug ?? "", blogRssUrl: p.blogRss ?? "", youtubeQuery: p.youtubeQuery ?? "", youtubeChannelId: p.youtubeChannelId && p.youtubeChannelId !== "none" ? p.youtubeChannelId : "", notes: p.notes ?? "" });
  const [pending, start] = useTransition();
  const [chooser, setChooser] = useState(false);
  const router = useRouter();
  const { refresh, openRun } = useRuns();
  const guard = () => { if (!p.admin) { toast.error("Admin mode required. Unlock with the lock icon (top right)."); return false; } return true; };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
      <div className="card p-5">
        <div className="label mb-3">Source status · last run</div>
        <ul className="space-y-3">
          {["github", "jobs", "blog", "youtube", "hn"].map((k) => {
            const s = p.status[k];
            return (
              <li key={k} className="flex items-start gap-3 text-[13px]">
                <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", DOT[s?.state ?? "not_found"])} />
                <div className="min-w-0">
                  <div className="font-medium">{NAMES[k]}</div>
                  <div className="text-muted">
                    {k === "github" && (p.org ? <>github.com/{p.org} · match confidence <b className="text-ink">{p.orgConfidence ?? "override"}</b></> : "No GitHub org matched")}
                    {k === "jobs" && (p.matched.jobs ?? (s?.state === "ok" ? "matched" : "Not found. Add an override to fix."))}
                    {k === "blog" && (p.matched.blog ?? (s?.state === "ok" ? "matched" : "Not found. Add a feed URL to fix."))}
                    {k === "youtube" && (s?.state === "ok" ? "Talks found" : "None found")}
                    {k === "hn" && (s?.state === "ok" ? "Stories found" : "None found")}
                  </div>
                  {s?.state === "failed" && <div className="text-change">Failed{s.staleSince ? `, showing data since ${s.staleSince}` : ""}{s.detail ? `: ${s.detail}` : ""}</div>}
                </div>
              </li>
            );
          })}
        </ul>

        <div className="mt-5 border-t border-line pt-4">
          <button className="btn w-full" onClick={() => setChooser(!chooser)} disabled={!p.candidates.length}>{p.candidates.length ? "Pick a different GitHub org" : "No GitHub candidates found"}</button>
          {chooser && (
            <ul className="mt-3 space-y-2">
              {p.candidates.map((c) => (
                <li key={c.login} className={cn("flex items-center gap-3 rounded-input border border-line p-2.5", c.login === p.org && "border-signal/50 bg-signal/5")}>
                  {c.avatarUrl && <Image src={c.avatarUrl} alt="" width={32} height={32} className="rounded-md" unoptimized />}
                  <div className="min-w-0 flex-1 text-[12.5px]">
                    <div className="font-semibold">{c.login} <span className="chip ml-1 !py-0 text-[10.5px]">{c.confidence}</span></div>
                    <div className="truncate text-muted">{c.description || c.website || "No description"}{c.repoCount != null && ` · ${c.repoCount} repos`}</div>
                  </div>
                  <button className="btn h-8" disabled={pending || c.login === p.org} onClick={() => guard() && start(async () => {
                    const r = await pickGithubOrg(p.companyId, c.login);
                    if (!r.ok) { toast.error(r.error); return; }
                    toast.success(`Using ${c.login}. Refreshing now.`);
                    openRun(r.runId);
                    fetch(`/api/refresh/${p.companyId}?run=${r.runId}`, { method: "POST" });
                    router.refresh();
                  })}>{c.login === p.org ? "In use" : "Use this"}</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="card p-5">
        <div className="label mb-3">Overrides · leave blank to auto-discover</div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="GitHub org" value={v.githubOrg} onChange={(x) => setV({ ...v, githubOrg: x })} ph="e.g. razorpay" />
          <div>
            <label className="label mb-1.5 block">Job board provider</label>
            <select className="input" value={v.jobBoardProvider} onChange={(e) => setV({ ...v, jobBoardProvider: e.target.value })}>
              <option value="">Auto (Greenhouse, Lever, Ashby)</option><option value="greenhouse">Greenhouse</option><option value="lever">Lever</option><option value="ashby">Ashby</option>
            </select>
          </div>
          <Field label="Job board slug" value={v.jobBoardSlug} onChange={(x) => setV({ ...v, jobBoardSlug: x })} ph="e.g. razorpaysoftwareprivatelimited" />
          <Field label="Blog RSS URL" value={v.blogRssUrl} onChange={(x) => setV({ ...v, blogRssUrl: x })} ph="https://…/feed" />
          <Field label="YouTube channel id" value={v.youtubeChannelId} onChange={(x) => setV({ ...v, youtubeChannelId: x })} ph={p.youtubeChannelId === "none" ? "none found automatically; paste UC…" : "UC… (auto-detected if blank)"} />
          <Field label="YouTube search query" value={v.youtubeQuery} onChange={(x) => setV({ ...v, youtubeQuery: x })} ph='"Acme" KubeCon talk' />
          <div className="sm:col-span-2">
            <label className="label mb-1.5 block">Notes</label>
            <textarea className="input" rows={3} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} />
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button className="btn btn-primary" disabled={pending} onClick={() => guard() && start(async () => {
            const r = await saveOverrides(p.companyId, v);
            if (!r.ok) { toast.error(r.error); return; }
            toast.success("Overrides saved.", { action: { label: "Refresh now", onClick: () => refresh(p.companyId) } });
            router.refresh();
          })}>Save overrides</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, ph }: { label: string; value: string; onChange: (v: string) => void; ph?: string }) {
  return (
    <div>
      <label className="label mb-1.5 block">{label}</label>
      <input className="input" value={value} placeholder={ph} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
