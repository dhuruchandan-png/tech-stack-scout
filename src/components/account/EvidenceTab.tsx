"use client";

import { useState } from "react";
import { Briefcase, ExternalLink, FileText, GitBranch, MessageSquare, Mic } from "lucide-react";
import { hostOf } from "@/lib/domain";
import { cn } from "@/lib/util";

type Ev = { ref: string; source: string; kind: string; title: string; snippet: string; url: string; observedAt: string | null; stale: boolean };
const ICON = { github: GitBranch, jobs: Briefcase, blog: FileText, youtube: Mic, hn: MessageSquare } as const;
const LABEL: Record<string, string> = { github: "GitHub", jobs: "Jobs", blog: "Blog", youtube: "Talks", hn: "Hacker News" };

export function EvidenceTab({ items }: { items: Ev[] }) {
  const [src, setSrc] = useState("all");
  const sources = [...new Set(items.map((i) => i.source))];
  const list = items.filter((i) => src === "all" || i.source === src);
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        {["all", ...sources].map((s) => (
          <button key={s} onClick={() => setSrc(s)} className={cn("chip", src === s && "border-signal bg-signal/10 text-signal")}>
            {s === "all" ? `All · ${items.length}` : `${LABEL[s] ?? s} · ${items.filter((i) => i.source === s).length}`}
          </button>
        ))}
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] text-[13px]">
          <thead className="border-b border-line">
            <tr className="label text-left"><th className="px-3 py-2.5 font-normal">ID</th><th className="px-3 font-normal">Source</th><th className="px-3 font-normal">Title and snippet</th><th className="px-3 font-normal">Date</th><th className="w-10" /></tr>
          </thead>
          <tbody>
            {list.map((e) => {
              const Icon = ICON[e.source as keyof typeof ICON] ?? FileText;
              const host = hostOf(e.url);
              return (
                <tr key={e.ref} id={`ev-${e.ref}`} className="border-b border-line align-top last:border-0">
                  <td className="mono px-3 py-3 text-signal">{e.ref}</td>
                  <td className="px-3 py-3"><span className="flex items-center gap-2 text-muted">{host && /* eslint-disable-next-line @next/next/no-img-element */ <img src={`https://www.google.com/s2/favicons?domain=${host}&sz=32`} alt="" width={14} height={14} />}<Icon className="h-3.5 w-3.5" />{LABEL[e.source] ?? e.source}</span></td>
                  <td className="px-3 py-3">
                    <div className="font-medium">{e.title}{e.stale && <span className="chip ml-2 !py-0 border-change/40 text-[10.5px] text-change">stale</span>}</div>
                    {e.snippet && <div className="mt-0.5 max-w-[640px] text-[12.5px] text-muted">{e.snippet}</div>}
                  </td>
                  <td className="mono whitespace-nowrap px-3 py-3 text-[12px] text-muted">{e.observedAt ? new Date(e.observedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "n/a"}</td>
                  <td className="px-3 py-3"><a href={e.url} target="_blank" rel="noreferrer" aria-label={`Open ${e.ref}`} className="text-muted hover:text-signal"><ExternalLink className="h-3.5 w-3.5" /></a></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
