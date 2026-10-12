"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Check, CheckCircle2, Copy, ExternalLink, Mail, RefreshCw, Send, ShieldCheck, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import { approveDraft, loadContacts, markOpened, markSent, regenerateDraft, sendInternally, updateDraft } from "@/app/actions";
import { ReceiptRow } from "@/components/ui/Receipts";
import { gmailLink, mailtoLink, outlookLink } from "@/lib/email/guard";
import type { HsContact } from "@/lib/hubspot";
import type { DraftCard } from "./OutreachBoard";

const STATUS: Record<string, string> = { draft: "Ready to review", internal_review: "Shared internally", approved: "Approved", opened: "Opened in your mail app", sent: "Sent" };

export function DraftDrawer({ card, onClose, allowlist, internalDomain, testMode }: {
  card: DraftCard | null; onClose: () => void; allowlist: string[]; internalDomain: string; testMode: boolean;
}) {
  return (
    <AnimatePresence>
      {card && (
        <>
          <motion.div className="fixed inset-0 z-40 bg-black/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside key={card.id} className="fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-[640px] flex-col border-l border-line-strong bg-surface" initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ duration: 0.2, ease: "easeOut" }} role="dialog" aria-label="Draft editor">
            <Editor card={card} onClose={onClose} allowlist={allowlist} internalDomain={internalDomain} testMode={testMode} />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function Editor({ card, onClose, allowlist, internalDomain, testMode }: { card: DraftCard; onClose: () => void; allowlist: string[]; internalDomain: string; testMode: boolean }) {
  const router = useRouter();
  const [subject, setSubject] = useState(card.subject);
  const [body, setBody] = useState(card.body);
  const [name, setName] = useState(card.recipientName ?? "");
  const [email, setEmail] = useState(card.recipientEmail ?? "");
  const [contacts, setContacts] = useState<HsContact[]>([]);
  const [check, setCheck] = useState<{ status: string | null; reasons: string[] }>({ status: card.checkStatus, reasons: card.checkReasons });
  const [saving, setSaving] = useState<"idle" | "saving" | "saved">("idle");
  const [internalTo, setInternalTo] = useState(allowlist[0] ?? "");
  const [showInternal, setShowInternal] = useState(false);
  const [pending, start] = useTransition();
  const first = useRef(true);

  const locked = card.status === "sent";
  const dirty = subject !== card.subject || body !== card.body || name !== (card.recipientName ?? "") || email !== (card.recipientEmail ?? "");
  const approved = card.status === "approved" || card.status === "opened";

  useEffect(() => { loadContacts(card.companyId).then(setContacts).catch(() => setContacts([])); }, [card.companyId]);

  // live check: debounce-save edits, which re-runs the code check on the server
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (locked || !dirty) return;
    setSaving("saving");
    const t = setTimeout(async () => {
      const r = await updateDraft(card.id, { subject, body, recipientName: name, recipientEmail: email });
      if (r.ok) { setCheck({ status: r.checkStatus, reasons: r.reasons }); setSaving("saved"); router.refresh(); } else { toast.error(r.error); setSaving("idle"); }
    }, 900);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject, body, name, email]);

  const run = (fn: () => Promise<{ ok: boolean; error?: string } | void>, ok?: string) =>
    start(async () => {
      const r = await fn();
      if (r && !r.ok) toast.error(r.error ?? "Something went wrong"); else { if (ok) toast.success(ok); router.refresh(); }
    });

  const ready = check.status === "verified" && card.status !== "sent";
  const canApprove = !locked && check.status === "verified" && !!subject.trim() && !!body.trim() && (card.status === "draft" || card.status === "internal_review");
  const approveWhy = locked ? "Already logged as sent" : check.status !== "verified" ? "Needs review: edit until the check passes" : approved ? "Already approved" : "";
  const mailTo = email.trim();

  /**
   * One click for Nikhil: approve (if not yet approved), then open the finished draft in HIS Gmail or Outlook.
   * Nothing is sent. He presses Send in his own mail app, then comes back and clicks "Mark as sent".
   */
  const approveAndOpen = (kind: "gmail" | "outlook" | "mailto") => {
    const href = (kind === "gmail" ? gmailLink : kind === "outlook" ? outlookLink : mailtoLink)(mailTo, subject, body);
    // open the tab inside the click, so the browser does not treat it as a pop-up, then point it at the draft
    const tab = window.open("about:blank", "_blank");
    start(async () => {
      if (card.status === "draft" || card.status === "internal_review") {
        const a = await approveDraft(card.id);
        if (!a.ok) { tab?.close(); toast.error(a.error); return; }
      }
      const m = await markOpened(card.id);
      if (!m.ok) { tab?.close(); toast.error(m.error); return; }
      if (tab) tab.location.href = href; else window.location.href = href;
      toast("Opened in your mail app. Nothing has been sent yet. Press Send there, then click Mark as sent.");
      router.refresh();
    });
  };

  return (
    <>
      <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <div className="label">{STATUS[card.status] ?? card.status}</div>
          <h2 className="serif truncate text-[24px] leading-tight">{card.company}</h2>
        </div>
        <button className="btn btn-ghost h-8 w-8 p-0" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></button>
      </header>

      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        {ready && (
          <div className="rounded-card border border-human/40 bg-human/5 p-3.5 text-[13px]">
            <b className="text-human">Ready to send.</b>{" "}
            {card.status === "sent"
              ? "This email has been sent."
              : mailTo
                ? "Read it through, then open it in your own Gmail or Outlook and press Send there. Nothing goes out until you do."
                : "Add the recipient's email below so the To field is filled in, then open it in your own Gmail or Outlook and press Send there."}
          </div>
        )}
        {/* recipient */}
        <div>
          <label className="label mb-1.5 block">To</label>
          {contacts.length > 0 && (
            <select className="input mb-2" value="" disabled={locked} onChange={(e) => { const c = contacts.find((x) => x.id === e.target.value); if (c) { setName(c.name); setEmail(c.email); } }} aria-label="HubSpot contacts">
              <option value="">Choose a HubSpot contact…</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}{c.title ? `, ${c.title}` : ""} · {c.email}</option>)}
            </select>
          )}
          <div className="grid grid-cols-2 gap-2">
            <input className="input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} disabled={locked} aria-label="Recipient name" />
            <input className="input" type="email" placeholder="email@company.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={locked} aria-label="Recipient email" />
          </div>
        </div>

        <div>
          <label className="label mb-1.5 block" htmlFor="subj">Subject <span className="normal-case tracking-normal text-faint">({subject.trim().split(/\s+/).filter(Boolean).length}/7 words)</span></label>
          <input id="subj" className="input" value={subject} onChange={(e) => setSubject(e.target.value)} disabled={locked} />
        </div>
        <div>
          <label className="label mb-1.5 block" htmlFor="body">Body <span className="normal-case tracking-normal text-faint">({body.trim().split(/\s+/).filter(Boolean).length}/110 words)</span></label>
          <textarea id="body" className="input !leading-6" rows={11} value={body} onChange={(e) => setBody(e.target.value)} disabled={locked} />
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-muted">Sources: <ReceiptRow ids={card.evidenceIds} evidence={card.evidence} /></div>
        </div>

        {/* live check */}
        <div className={`rounded-card border p-3.5 ${check.status === "verified" ? "border-verified/40 bg-verified/5" : "border-change/40 bg-change/5"}`} aria-live="polite">
          <div className="flex items-center gap-2 text-[13px] font-medium">
            {check.status === "verified" ? <><CheckCircle2 className="h-4 w-4 text-verified" /> Check passed</> : <><XCircle className="h-4 w-4 text-change" /> Needs review</>}
            <span className="ml-auto text-[11.5px] font-normal text-faint">{saving === "saving" ? "checking…" : saving === "saved" ? "saved and re-checked" : "code check"}</span>
          </div>
          {check.reasons.length > 0 && <ul className="mt-2 space-y-1 text-[12.5px] text-change">{check.reasons.map((r, i) => <li key={i}>• {r}</li>)}</ul>}
          {check.status === "verified" && <p className="mt-1 text-[12px] text-muted">Every source it cites exists, the things it names appear in those sources, and the length and wording rules pass.</p>}
        </div>

        {card.reviewers.length > 0 && <p className="text-[12px] text-muted">Shared internally with {card.reviewers.join(", ")}</p>}

        {showInternal && (
          <div className="card space-y-2 p-3.5">
            <div className="label">Share with my team · internal addresses only</div>
            {testMode && <p className="text-[12px] text-change">Test mode is on: the email goes to your TEST_EMAIL inbox, with the intended recipient shown at the top.</p>}
            <div className="flex gap-2">
              <input className="input" list="internal-list" placeholder={internalDomain ? `name@${internalDomain}` : "allowlisted address"} value={internalTo} onChange={(e) => setInternalTo(e.target.value)} aria-label="Internal recipient" />
              <datalist id="internal-list">{allowlist.map((a) => <option key={a} value={a} />)}</datalist>
              <button className="btn btn-primary" disabled={pending || !internalTo} onClick={() => run(async () => { const r = await sendInternally(card.id, internalTo); if (r.ok) toast.success(r.testMode ? `Sent to the test inbox (${r.deliveredTo}).` : `Sent to ${r.deliveredTo}.`); return r; })}>Send</button>
            </div>
          </div>
        )}
      </div>

      {/* actions */}
      <footer className="space-y-3 border-t border-line p-4">
        {ready && !locked && (
          <div className="flex flex-wrap items-center gap-2">
            {approved ? (
              <>
                <button className="btn btn-human" disabled={pending} onClick={() => approveAndOpen("gmail")}><Mail className="h-3.5 w-3.5" /> Open in Gmail</button>
                <button className="btn" disabled={pending} onClick={() => approveAndOpen("outlook")}><ExternalLink className="h-3.5 w-3.5" /> Open in Outlook</button>
              </>
            ) : (
              <>
                <button className="btn btn-human" disabled={pending || !canApprove} title={approveWhy} onClick={() => approveAndOpen("gmail")}><Check className="h-3.5 w-3.5" /> Approve and open in Gmail</button>
                <button className="btn" disabled={pending || !canApprove} title={approveWhy} onClick={() => approveAndOpen("outlook")}>Outlook</button>
              </>
            )}
            <button className="btn ml-auto" disabled={pending || !approved} title={approved ? "" : "Approve the draft and open it in your mail app first"} onClick={() => run(async () => { const r = await markSent(card.id); if (r.ok) toast.success(`Marked as sent. HubSpot: ${r.hubspot}.`); return r; })}><Send className="h-3.5 w-3.5" /> I sent it</button>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button className="btn" disabled={pending || locked} onClick={() => run(() => regenerateDraft(card.id), "Draft rewritten and re-checked.")}><RefreshCw className="h-3.5 w-3.5" /> Rewrite</button>
          <button className="btn" disabled={pending || locked} onClick={() => setShowInternal(!showInternal)}><ShieldCheck className="h-3.5 w-3.5" /> Share with my team</button>
          <button className="btn" onClick={async () => { try { await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`); toast.success("Copied."); } catch { toast.error("Could not copy."); } }}><Copy className="h-3.5 w-3.5" /> Copy</button>
          <button className="btn btn-ghost" disabled={!approved || locked} onClick={() => approveAndOpen("mailto")}>Default mail app</button>
        </div>
        <p className="text-[11.5px] text-faint">Tech Stack Scout never sends to prospects. Opening your mail app sends nothing: you press Send yourself, then come back and click &ldquo;I sent it&rdquo;.</p>
      </footer>
    </>
  );
}
