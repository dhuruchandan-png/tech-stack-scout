"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Pencil, RefreshCw, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { createDraft, regenerateBrief, saveOpenerEdit } from "@/app/actions";
import { CheckBadge } from "@/components/ui/Pills";
import { ReceiptRow, type EvidenceMap } from "@/components/ui/Receipts";

const HOOK: Record<string, string> = { repo: "Repo hook", hiring: "Hiring hook", blog: "Blog hook", talk: "Talk hook", infra: "Infra hook", activity: "Activity hook" };

export function OpenerCard({ companyId, text, ids, hook, status, reasons, evidence, admin }: {
  companyId: number; text: string | null; ids: string[]; hook: string | null; status: string | null; reasons: string[]; evidence: EvidenceMap; admin: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text ?? "");
  const [pending, start] = useTransition();
  const router = useRouter();
  const needAdmin = () => toast.error("Admin mode required. Unlock with the lock icon (top right).");

  const copy = async () => {
    if (!text) return;
    try { await navigator.clipboard.writeText(text); toast.success("Opener copied."); } catch { toast.error("Could not copy. Select the text instead."); }
  };

  return (
    <section className="card relative overflow-hidden border-ai/30 p-6" aria-label="Suggested first line">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="label !text-ai">Suggested first line</span>
        {hook && <span className="chip border-ai/40 bg-ai/10 text-ai uppercase !text-[10.5px] mono tracking-wider">{HOOK[hook] ?? hook}</span>}
        <CheckBadge status={status} reasons={reasons} />
        <div className="ml-auto flex gap-2">
          <button className="btn" onClick={copy} disabled={!text}><Copy className="h-3.5 w-3.5" /> Copy</button>
          <button className="btn" disabled={pending} title="Regenerate with Gemini" onClick={() => admin ? start(async () => { const r = await regenerateBrief(companyId); r.ok ? (toast.success("New opener drafted and checked."), router.refresh()) : toast.error(r.error); }) : needAdmin()}>
            <RefreshCw className={`h-3.5 w-3.5 ${pending ? "animate-spin" : ""}`} />
          </button>
          <button className="btn" onClick={() => admin ? setEditing(!editing) : needAdmin()} aria-label="Edit opener"><Pencil className="h-3.5 w-3.5" /></button>
          <button className="btn btn-human" disabled={pending || !text} onClick={() => admin ? start(async () => {
            const r = await createDraft(companyId);
            if (r.ok) { toast.success("Draft created. Review it in Outreach."); router.push(`/outreach?draft=${r.id}`); } else toast.error(r.error);
          }) : needAdmin()}><Send className="h-3.5 w-3.5" /> Draft email</button>
        </div>
      </div>

      {!text ? (
        <p className="text-[14px] text-muted">{status === "pending" ? "Summary pending (Gemini unavailable). It will retry on the next run." : "No opener yet. Run Refresh now to generate one from live evidence."}</p>
      ) : editing ? (
        <div>
          <textarea className="input serif !text-[20px] !leading-snug" rows={4} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Edit opener" />
          <div className="mt-3 flex gap-2">
            <button className="btn btn-primary" disabled={pending} onClick={() => start(async () => {
              const r = await saveOpenerEdit(companyId, draft, ids);
              if (!r.ok) { toast.error(r.error); return; }
              r.checkStatus === "verified" ? toast.success("Edit saved. It passes the evidence check.") : toast.warning(`Saved, but it needs review: ${r.reasons[0]}`);
              setEditing(false); router.refresh();
            })}><Check className="h-3.5 w-3.5" /> Save and re-check</button>
            <button className="btn" onClick={() => { setEditing(false); setDraft(text); }}>Cancel</button>
          </div>
        </div>
      ) : (
        <blockquote className="serif relative pl-8 text-[26px] leading-[1.3] text-ink">
          <span aria-hidden className="serif absolute left-0 top-0 text-[44px] leading-none text-ai">“</span>
          {text}
        </blockquote>
      )}

      {text && !editing && (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px] text-muted">
          <Sparkles className="h-3.5 w-3.5 text-ai" /> Written by Gemini Flash · cites <ReceiptRow ids={ids} evidence={evidence} />
        </div>
      )}
      {status === "needs_review" && reasons.length > 0 && (
        <ul className="mt-4 space-y-1 rounded-input border border-change/40 bg-change/10 p-3 text-[12.5px] text-change">
          {reasons.slice(0, 5).map((r, i) => <li key={i}>• {r}</li>)}
          <li className="text-muted">Edit the line until the check passes. It cannot be approved before that.</li>
        </ul>
      )}
    </section>
  );
}
