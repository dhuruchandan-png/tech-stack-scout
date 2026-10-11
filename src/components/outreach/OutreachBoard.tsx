"use client";

import { useState } from "react";
import { AlertTriangle, Mail } from "lucide-react";
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
};

const COLS = [
  { id: "draft", label: "Draft" }, { id: "internal_review", label: "In internal review" }, { id: "approved", label: "Approved" },
  { id: "opened", label: "Opened in mail" }, { id: "sent", label: "Logged as sent" },
] as const;

export function OutreachBoard({ cards, metrics, admin, openId, allowlist, internalDomain, testMode }: {
  cards: DraftCard[]; metrics: { waiting: number; approvedWeek: number; sentWeek: number; avgHours: number | null };
  admin: boolean; openId: number | null; allowlist: string[]; internalDomain: string; testMode: boolean;
}) {
  const [open, setOpen] = useState<number | null>(openId);
  const current = cards.find((c) => c.id === open) ?? null;
  const needs = cards.filter((c) => c.checkStatus === "needs_review" && c.status !== "sent").length;

  return (
    <div>
      <PageHeader eyebrow="Draft → internal review → approve → send from your inbox" title="Outreach">
        {needs > 0 && <span className="chip border-change/40 bg-change/10 text-change"><AlertTriangle className="h-3 w-3" /> {needs} needs review</span>}
      </PageHeader>

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          [metrics.waiting, "drafts waiting"], [metrics.approvedWeek, "approved this week"], [metrics.sentWeek, "sent this week"],
          [metrics.avgHours == null ? "n/a" : `${metrics.avgHours}h`, "avg draft → sent"],
        ].map(([n, l]) => (
          <div key={l as string} className="card px-4 py-3"><div className="mono text-[24px] font-medium">{n}</div><div className="text-[12px] text-muted">{l}</div></div>
        ))}
      </div>

      {cards.length === 0 ? (
        <div className="card"><EmptyState title="No drafts yet." hint="Open an account and tap Draft email. Gemini writes it from the evidence; you review, approve and send from your own inbox." /></div>
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
                        <Fingerprint size={26} languages={[]} categories={[]} level="medium" />
                        <div className="min-w-0"><div className="truncate text-[13.5px] font-semibold">{c.company}</div><div className="truncate text-[11.5px] text-muted">{c.recipientName ?? c.recipientEmail ?? "No recipient yet"}</div></div>
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

      <p className="mt-8 flex items-center gap-2 text-[12.5px] text-muted"><Mail className="h-3.5 w-3.5" /> Tech Stack Scout never sends to prospects. You send from your own inbox.</p>

      <DraftDrawer card={current} onClose={() => setOpen(null)} admin={admin} allowlist={allowlist} internalDomain={internalDomain} testMode={testMode} />
    </div>
  );
}
