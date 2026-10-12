"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Mail, Sparkles } from "lucide-react";
import { Fingerprint } from "@/components/viz/Fingerprint";
import { EmptyState, PageHeader } from "@/components/ui/States";
import type { EvidenceMap } from "@/components/ui/Receipts";
import { DraftDrawer } from "./DraftDrawer";
import { cn, timeAgo } from "@/lib/util";

export type DraftCard = {
  id: number; companyId: number; company: string; domain: string;
  recipientName: string | null; recipientEmail: string | null; subject: string; body: string;
  status: string; checkStatus: string | null; checkReasons: string[]; evidenceIds: string[];
  createdAt: string; approvedAt: string | null; sentAt: string | null; reviewers: string[];
  evidence: EvidenceMap;
  /** the account's real fingerprint (languages, infra categories, activity) for the mini ring */
  fp: { languages: { name: string; color: string; share: number }[]; categories: string[]; level: string };
};

const COLS = [
  { id: "draft", label: "Ready to review" }, { id: "internal_review", label: "Shared with team" }, { id: "approved", label: "Approved" },
  { id: "opened", label: "Opened in your mail" }, { id: "sent", label: "Sent" },
] as const;

export function OutreachBoard({ cards, metrics, openId, allowlist, internalDomain, testMode }: {
  cards: DraftCard[]; metrics: { waiting: number; approvedWeek: number; sentWeek: number; avgHours: number | null };
  openId: number | null; allowlist: string[]; internalDomain: string; testMode: boolean;
}) {
  const [open, setOpen] = useState<number | null>(openId);
  const [preparing, startPrepare] = useTransition();
  const router = useRouter();
  const prepare = () =>
    startPrepare(async () => {
      try {
        const res = await fetch("/api/drafts/prepare", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ limit: 5 }) });
        const j = (await res.json()) as { created: { company: string }[]; skipped: { company: string; reason: string }[] };
        if (j.created.length) toast.success(`${j.created.length} draft${j.created.length === 1 ? "" : "s"} ready: ${j.created.map((c) => c.company).join(", ")}.`);
        else toast(j.skipped.length ? `No new drafts. ${j.skipped[0].company}: ${j.skipped[0].reason}.` : "Every top account already has a draft.");
        router.refresh();
      } catch {
        toast.error("Could not prepare drafts. Try again.");
      }
    });
  const current = cards.find((c) => c.id === open) ?? null;
  const needs = cards.filter((c) => c.checkStatus === "needs_review" && c.status !== "sent").length;

  return (
    <div>
      <PageHeader eyebrow="Drafts are written for you. You review, approve and send from your own inbox." title="Outreach">
        <button className="btn" onClick={prepare} disabled={preparing}><Sparkles className="h-3.5 w-3.5" /> {preparing ? "Writing drafts…" : "Prepare drafts for top accounts"}</button>
        {needs > 0 && <span className="chip border-change/40 bg-change/10 text-change"><AlertTriangle className="h-3 w-3" /> {needs} needs review</span>}
      </PageHeader>

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          [metrics.waiting, "drafts ready to review"], [metrics.approvedWeek, "approved this week"], [metrics.sentWeek, "sent this week"],
          [metrics.avgHours == null ? "n/a" : `${metrics.avgHours}h`, "average time to send"],
        ].map(([n, l]) => (
          <div key={l as string} className="card px-4 py-3"><div className="mono text-[24px] font-medium">{n}</div><div className="text-[12px] text-muted">{l}</div></div>
        ))}
      </div>

      {cards.length === 0 ? (
        <div className="card"><EmptyState title="No drafts yet." hint="Scout writes a draft for each top account after every full refresh. Click Prepare drafts for top accounts, or open an account and click Draft email." action={<button className="btn btn-primary" onClick={prepare} disabled={preparing}>Prepare drafts for top accounts</button>} /></div>
      ) : (
        <div className="grid gap-3 overflow-x-auto pb-2 lg:grid-cols-5">
          {COLS.map((col) => {
            const list = cards.filter((c) => c.status === col.id);
            return (
              <section key={col.id} className="min-w-[230px]" aria-label={col.label}>
                <div className="label mb-2 flex items-center justify-between px-1"><span>{col.label}</span><span>{list.length}</span></div>
                <div className="space-y-2.5">
                  {list.length === 0 && <div className="rounded-card border border-dashed border-line px-3 py-6 text-center text-[12px] text-faint">Empty</div>}
                  {list.map((c) => (
                    <button key={c.id} onClick={() => setOpen(c.id)} className={cn("card block w-full animate-rise p-3.5 text-left transition hover:border-signal/50", c.checkStatus === "needs_review" && col.id !== "sent" && "border-change/50")}>
                      <div className="flex items-center gap-2.5">
                        <Fingerprint size={26} languages={c.fp.languages} categories={c.fp.categories} level={c.fp.level} />
                        <div className="min-w-0"><div className="truncate text-[13.5px] font-semibold">{c.company}</div><div className="truncate text-[11.5px] text-muted">{c.recipientName ?? c.recipientEmail ?? "Add a recipient"}</div></div>
                      </div>
                      <div className="mt-2.5 line-clamp-2 text-[12.5px]">{c.subject || "(no subject)"}</div>
                      <div className="mt-2.5 flex items-center justify-between text-[11px]">
                        {c.checkStatus === "verified" ? <span className="text-verified">✓ Verified</span> : c.checkStatus === "needs_review" ? <span className="text-change">⚠ Needs review</span> : <span className="text-faint">Pending</span>}
                        <span className="mono text-faint">{timeAgo(c.createdAt)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <p className="mt-8 flex items-center gap-2 text-[12.5px] text-muted"><Mail className="h-3.5 w-3.5" /> Tech Stack Scout never sends to prospects. Nikhil sends each email himself, from his own inbox.</p>

      <DraftDrawer card={current} onClose={() => setOpen(null)} allowlist={allowlist} internalDomain={internalDomain} testMode={testMode} />
    </div>
  );
}
