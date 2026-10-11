"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { ADMIN_COOKIE, adminToken, checkPasscode, isAdmin, requireAdmin } from "@/lib/auth";
import type { CheckContext } from "@/lib/ai/check";
import { answerQuestion, generateBrief, generateEmail, recheckEmail, recheckOpener, retrieveEvidence } from "@/lib/ai/generate";
import { GeminiUnavailable } from "@/lib/ai/gemini";
import { normalizeDomain } from "@/lib/domain";
import { envGuardConfig, guardRecipient } from "@/lib/email/guard";
import { sendInternalDraft } from "@/lib/email/send";
import { createProperties, hubspotConfigured, listContacts, logSentEmail, pushApprovedText, syncCompanyFacts, type HsContact } from "@/lib/hubspot";
import { queueRun } from "@/lib/pipeline";
import { getSettings } from "@/lib/queries";
import { factsToText } from "@/lib/compute/facts";
import { selectForGemini, type Ref } from "@/lib/compute/evidence";

const { companies, snapshots, briefs, evidence, drafts, settings, qaMessages } = schema;
type R<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: e instanceof Error ? e.message : String(e) });

/* ---------------- admin mode ---------------- */

export async function unlockAdmin(passcode: string): Promise<R> {
  if (!checkPasscode(passcode)) return { ok: false, error: "That passcode is not right." };
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, adminToken()!, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 12 });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function lockAdmin(): Promise<R> {
  (await cookies()).delete(ADMIN_COOKIE);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function adminStatus() {
  return { admin: await isAdmin(), configured: !!process.env.ADMIN_PASSCODE };
}

/* ---------------- watchlist ---------------- */

export async function addCompany(name: string, website: string): Promise<R<{ id: number; domain: string; runId?: number }>> {
  try {
    await requireAdmin();
    const domain = normalizeDomain(website);
    if (!name.trim()) return { ok: false, error: "Add a company name." };
    if (!domain) return { ok: false, error: "That does not look like a website. Try acme.com." };
    const db = getDb();
    const [existing] = await db.select().from(companies).where(eq(companies.domain, domain));
    if (existing?.active) return { ok: false, error: `${existing.name} (${domain}) is already on your watchlist.` };
    if (existing && !existing.active) {
      await db.update(companies).set({ active: true, removedAt: null, name: name.trim() }).where(eq(companies.id, existing.id));
      revalidatePath("/accounts");
      return { ok: true, id: existing.id, domain };
    }
    const [row] = await db.insert(companies).values({ name: name.trim(), domain }).returning({ id: companies.id });
    revalidatePath("/accounts");
    revalidatePath("/");
    return { ok: true, id: row.id, domain };
  } catch (e) {
    return fail(e);
  }
}

export async function removeCompanies(ids: number[]): Promise<R> {
  try {
    await requireAdmin();
    const db = getDb();
    for (const id of ids) await db.update(companies).set({ active: false, removedAt: new Date() }).where(eq(companies.id, id));
    revalidatePath("/accounts"); revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function undoRemove(ids: number[]): Promise<R> {
  try {
    await requireAdmin();
    const db = getDb();
    for (const id of ids) await db.update(companies).set({ active: true, removedAt: null }).where(eq(companies.id, id));
    revalidatePath("/accounts"); revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Creates queued runs; the client then POSTs /api/refresh/[id]?run=... (single) or /api/refresh-all (bulk). */
export async function startRefresh(companyId: number): Promise<R<{ runId: number }>> {
  try {
    await requireAdmin();
    const runId = await queueRun(companyId, "manual");
    return { ok: true, runId };
  } catch (e) {
    return fail(e);
  }
}

/* ---------------- sources & matching ---------------- */

export async function saveOverrides(
  companyId: number,
  v: { githubOrg?: string; jobBoardProvider?: string; jobBoardSlug?: string; blogRssUrl?: string; youtubeQuery?: string; notes?: string },
): Promise<R> {
  try {
    await requireAdmin();
    const clean = (s?: string) => (s && s.trim() ? s.trim() : null);
    const provider = clean(v.jobBoardProvider);
    if (provider && !["greenhouse", "lever", "ashby"].includes(provider)) return { ok: false, error: "Job board must be greenhouse, lever or ashby." };
    const gh = clean(v.githubOrg)?.replace(/^https?:\/\/github\.com\//i, "").replace(/\/.*$/, "") ?? null;
    const [cur] = await getDb().select().from(companies).where(eq(companies.id, companyId));
    const changed = gh !== (cur?.githubOrg ?? null);
    await getDb().update(companies).set({
      githubOrg: gh, githubMatchConfidence: !gh ? null : changed ? "high" : cur?.githubMatchConfidence ?? "high", jobBoardProvider: provider, jobBoardSlug: clean(v.jobBoardSlug),
      blogRssUrl: clean(v.blogRssUrl), youtubeQuery: clean(v.youtubeQuery), notes: clean(v.notes),
    }).where(eq(companies.id, companyId));
    revalidatePath("/accounts", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function pickGithubOrg(companyId: number, login: string): Promise<R<{ runId: number }>> {
  try {
    await requireAdmin();
    await getDb().update(companies).set({ githubOrg: login, githubMatchConfidence: "high" }).where(eq(companies.id, companyId));
    const runId = await queueRun(companyId, "manual");
    return { ok: true, runId };
  } catch (e) {
    return fail(e);
  }
}

/* ---------------- brief context (shared by regenerate / drafts / Q&A) ---------------- */

async function loadContext(companyId: number) {
  const db = getDb();
  const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
  const [snap] = await db.select().from(snapshots).where(eq(snapshots.companyId, companyId)).orderBy(desc(snapshots.createdAt)).limit(1);
  if (!company || !snap) throw new Error("No snapshot yet. Run Refresh now first.");
  const ev = await db.select().from(evidence).where(eq(evidence.snapshotId, snap.id));
  const [brief] = await db.select().from(briefs).where(eq(briefs.snapshotId, snap.id));
  const refs: Ref[] = ev.map((e) => ({ ref: e.ref, source: e.source as Ref["source"], kind: e.kind, title: e.title, snippet: e.snippet, url: e.url, observedAt: e.observedAt, meta: (e.meta as Record<string, unknown>) ?? undefined }));
  const factsText = factsToText({
    company: company.name, languages: snap.languages ?? [], infra: snap.infra, microservices: snap.microservices, activity: snap.activity,
    confidence: snap.confidence, confidenceReason: snap.confidenceReason, changes: snap.changes ?? [], activeRepoCount: snap.activity?.activeRepos ?? 0,
    serviceRepoCount: snap.activity?.serviceRepos ?? 0,
    sourceNotes: Object.entries(snap.sourceStatus ?? {}).filter(([, s]) => s.state !== "ok").map(([k, s]) => `${k}: ${s.state === "failed" ? `failed (showing data since ${s.staleSince ?? "earlier"})` : "none found"}`),
  });
  const ctx: CheckContext = {
    company: company.name, validRefs: new Set(refs.map((r) => r.ref)),
    evidenceText: Object.fromEntries(refs.map((r) => [r.ref, `${r.title} ${r.snippet} ${r.url} ${JSON.stringify(r.meta ?? {})}`])),
    factsText,
  };
  return { company, snap, refs, brief, ctx, factsText };
}

/** Opener Card → Regenerate. Re-runs Gemini + the code check on the latest snapshot's evidence. */
export async function regenerateBrief(companyId: number): Promise<R> {
  try {
    await requireAdmin();
    const { company, snap, refs, ctx, factsText } = await loadContext(companyId);
    const s = await getSettings();
    const r = await generateBrief(
      { company: company.name, facts: factsText, productNotes: s.productNotes, evidence: selectForGemini(refs).map((e) => ({ ref: e.ref, source: e.source, title: e.title, snippet: e.snippet, date: e.observedAt?.toISOString().slice(0, 10) ?? null })) },
      ctx,
    );
    const values = {
      summaryP1: r.brief.summary_p1, summaryP2: r.brief.summary_p2, openerText: r.brief.opener.text, openerEvidenceIds: r.brief.opener.evidence_ids,
      hookType: r.brief.opener.hook_type, talkingPoints: r.brief.talking_points, unknowns: r.brief.unknowns, checkStatus: r.checkStatus,
      checkReasons: r.checkReasons, model: r.usage.model, inputTokens: r.usage.inputTokens, outputTokens: r.usage.outputTokens, costUsd: r.usage.costUsd,
    };
    await getDb().insert(briefs).values({ snapshotId: snap.id, ...values }).onConflictDoUpdate({ target: briefs.snapshotId, set: values });
    revalidatePath(`/accounts/${company.domain}`);
    return { ok: true };
  } catch (e) {
    return fail(e instanceof GeminiUnavailable ? new Error("Gemini is unavailable right now. Try again shortly.") : e);
  }
}

/** Nikhil edits the opener; the edited text is re-checked before it can be approved. */
export async function saveOpenerEdit(companyId: number, text: string, evidenceIds: string[]): Promise<R<{ checkStatus: string; reasons: string[] }>> {
  try {
    await requireAdmin();
    const { snap, ctx, company } = await loadContext(companyId);
    const r = recheckOpener(text.trim(), evidenceIds, ctx);
    await getDb().update(briefs).set({ openerText: text.trim(), openerEvidenceIds: evidenceIds, checkStatus: r.checkStatus, checkReasons: r.checkReasons }).where(eq(briefs.snapshotId, snap.id));
    revalidatePath(`/accounts/${company.domain}`);
    return { ok: true, checkStatus: r.checkStatus, reasons: r.checkReasons };
  } catch (e) {
    return fail(e);
  }
}

/* ---------------- Q&A ---------------- */

export async function askQuestion(companyId: number, question: string): Promise<R<{ answer: string; evidenceIds: string[]; missing?: string }>> {
  try {
    await requireAdmin();
    if (!question.trim()) return { ok: false, error: "Ask something about this account." };
    const { refs, ctx, company } = await loadContext(companyId);
    const top = retrieveEvidence(question, refs, 15);
    const a = await answerQuestion(company.name, question, top, ctx.validRefs);
    await getDb().insert(qaMessages).values({ companyId, question: question.trim(), answer: a.answer, evidenceIds: a.evidenceIds });
    revalidatePath(`/accounts/${company.domain}`);
    return { ok: true, answer: a.answer, evidenceIds: a.evidenceIds, missing: a.missing };
  } catch (e) {
    return fail(e instanceof GeminiUnavailable ? new Error("Gemini is unavailable right now. Try again shortly.") : e);
  }
}

/* ---------------- outreach: drafts ---------------- */

export async function createDraft(companyId: number, recipient?: { name?: string; email?: string }): Promise<R<{ id: number }>> {
  try {
    await requireAdmin();
    const { company, snap, refs, brief, ctx } = await loadContext(companyId);
    if (!brief?.openerText) return { ok: false, error: "No opener yet. Run a refresh first." };
    const e = await generateEmail(
      {
        company: company.name, opener: brief.openerText, summary: `${brief.summaryP1 ?? ""} ${brief.summaryP2 ?? ""}`.replace(/\[E\d+\]/g, ""),
        evidence: selectForGemini(refs, 25).map((x) => ({ ref: x.ref, source: x.source, title: x.title, snippet: x.snippet })), recipient: recipient?.name,
      },
      ctx,
    );
    const [row] = await getDb().insert(drafts).values({
      companyId, snapshotId: snap.id, recipientName: recipient?.name ?? null, recipientEmail: recipient?.email ?? null,
      subject: e.email.subject, body: e.email.body, evidenceIds: e.email.evidence_ids, status: "draft",
      checkStatus: e.checkStatus, checkReasons: e.checkReasons,
    }).returning({ id: drafts.id });
    revalidatePath("/outreach");
    return { ok: true, id: row.id };
  } catch (e) {
    return fail(e instanceof GeminiUnavailable ? new Error("Gemini is unavailable right now. Try again shortly.") : e);
  }
}

export async function regenerateDraft(draftId: number): Promise<R> {
  try {
    await requireAdmin();
    const db = getDb();
    const [d] = await db.select().from(drafts).where(eq(drafts.id, draftId));
    if (!d) return { ok: false, error: "Draft not found." };
    if (d.status === "sent") return { ok: false, error: "This draft was already logged as sent." };
    const { company, refs, brief, ctx } = await loadContext(d.companyId);
    if (!brief?.openerText) return { ok: false, error: "No opener yet." };
    const e = await generateEmail(
      { company: company.name, opener: brief.openerText, summary: `${brief.summaryP1 ?? ""} ${brief.summaryP2 ?? ""}`.replace(/\[E\d+\]/g, ""), evidence: selectForGemini(refs, 25).map((x) => ({ ref: x.ref, source: x.source, title: x.title, snippet: x.snippet })), recipient: d.recipientName },
      ctx,
    );
    await db.update(drafts).set({ subject: e.email.subject, body: e.email.body, evidenceIds: e.email.evidence_ids, checkStatus: e.checkStatus, checkReasons: e.checkReasons, status: "draft", approvedAt: null, approvedBy: null }).where(eq(drafts.id, draftId));
    revalidatePath("/outreach");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Editing re-runs the code check; any edit to an approved draft sends it back to Draft. */
export async function updateDraft(draftId: number, v: { subject: string; body: string; recipientName?: string; recipientEmail?: string }): Promise<R<{ checkStatus: string; reasons: string[] }>> {
  try {
    await requireAdmin();
    const db = getDb();
    const [d] = await db.select().from(drafts).where(eq(drafts.id, draftId));
    if (!d) return { ok: false, error: "Draft not found." };
    if (d.status === "sent") return { ok: false, error: "Already logged as sent." };
    const { ctx } = await loadContext(d.companyId);
    const r = recheckEmail({ subject: v.subject, body: v.body, evidence_ids: d.evidenceIds ?? [] }, ctx);
    const textChanged = v.subject !== d.subject || v.body !== d.body;
    await db.update(drafts).set({
      subject: v.subject, body: v.body, recipientName: v.recipientName ?? d.recipientName, recipientEmail: v.recipientEmail ?? d.recipientEmail,
      checkStatus: r.checkStatus, checkReasons: r.checkReasons,
      ...(textChanged && (d.status === "approved" || d.status === "opened") ? { status: "draft", approvedAt: null, approvedBy: null } : {}),
    }).where(eq(drafts.id, draftId));
    revalidatePath("/outreach");
    return { ok: true, checkStatus: r.checkStatus, reasons: r.checkReasons };
  } catch (e) {
    return fail(e);
  }
}

/** Resend, internal only. Moves Draft → In internal review. */
export async function sendInternally(draftId: number, to: string): Promise<R<{ deliveredTo: string; testMode: boolean }>> {
  try {
    await requireAdmin();
    const db = getDb();
    const s = await getSettings();
    const g = guardRecipient(to, envGuardConfig(s.internalAllowlist ?? []));
    if (!g.ok) return { ok: false, error: g.error };
    const row = (await db.select().from(drafts).where(eq(drafts.id, draftId)))[0];
    if (!row) return { ok: false, error: "Draft not found." };
    const [co] = await db.select().from(companies).where(eq(companies.id, row.companyId));
    const res = await sendInternalDraft({ draft: row, companyName: co.name, domain: co.domain, to: g.deliverTo, intendedFor: g.intendedFor });
    if (!res.ok) return { ok: false, error: res.error };
    await db.insert(schema.internalSends).values({ draftId, to, resendId: res.id });
    const reviewers = [...new Set([...(row.internalReviewers ?? []), to])];
    await db.update(drafts).set({ internalReviewers: reviewers, ...(row.status === "draft" ? { status: "internal_review" } : {}) }).where(eq(drafts.id, draftId));
    revalidatePath("/outreach");
    return { ok: true, deliveredTo: g.deliverTo, testMode: !!g.intendedFor };
  } catch (e) {
    return fail(e);
  }
}

/** THE HUMAN GATE (step 14). Blocked unless the code check passes. */
export async function approveDraft(draftId: number): Promise<R<{ hubspot: string }>> {
  try {
    await requireAdmin();
    const db = getDb();
    const [d] = await db.select().from(drafts).where(eq(drafts.id, draftId));
    if (!d) return { ok: false, error: "Draft not found." };
    if (d.checkStatus !== "verified") return { ok: false, error: "This draft needs review. Edit it until the check passes, then approve." };
    if (!d.subject.trim() || !d.body.trim()) return { ok: false, error: "Subject and body can't be empty." };
    // re-check against the current evidence, so a stale pass can't be approved
    const { ctx, brief, snap, refs } = await loadContext(d.companyId);
    const rc = recheckEmail({ subject: d.subject, body: d.body, evidence_ids: d.evidenceIds ?? [] }, ctx);
    if (rc.checkStatus !== "verified") return { ok: false, error: `Check failed: ${rc.checkReasons[0]}` };
    await db.update(drafts).set({ status: "approved", approvedAt: new Date(), approvedBy: "Nikhil" }).where(eq(drafts.id, draftId));
    // AI text reaches HubSpot only now
    let hubspot = "skipped";
    if (brief?.openerText) {
      const links = (brief.openerEvidenceIds ?? []).map((id) => refs.find((r) => r.ref === id)?.url).filter((u): u is string => !!u);
      const res = await pushApprovedText(d.companyId, { opener: brief.openerText, summary: `${brief.summaryP1 ?? ""}\n\n${brief.summaryP2 ?? ""}`.replace(/\s*\[E\d+\]/g, ""), evidenceLinks: links });
      hubspot = res.status;
    }
    void snap;
    revalidatePath("/outreach");
    return { ok: true, hubspot };
  } catch (e) {
    return fail(e);
  }
}

/** "Open in Gmail/Outlook". Only approved drafts. Never sends anything. */
export async function markOpened(draftId: number): Promise<R> {
  try {
    await requireAdmin();
    const db = getDb();
    const [d] = await db.select().from(drafts).where(eq(drafts.id, draftId));
    if (!d) return { ok: false, error: "Draft not found." };
    if (d.status !== "approved" && d.status !== "opened") return { ok: false, error: "Approve first: only approved drafts can be opened in your mail client." };
    await db.update(drafts).set({ status: "opened", openedInMailAt: new Date() }).where(eq(drafts.id, draftId));
    revalidatePath("/outreach");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function markSent(draftId: number): Promise<R<{ hubspot: string }>> {
  try {
    await requireAdmin();
    const db = getDb();
    const [d] = await db.select().from(drafts).where(eq(drafts.id, draftId));
    if (!d) return { ok: false, error: "Draft not found." };
    if (d.status !== "opened" && d.status !== "approved") return { ok: false, error: "Approve and open the draft in your mail client first." };
    const res = await logSentEmail(d.companyId, { subject: d.subject, body: d.body, recipientEmail: d.recipientEmail });
    await db.update(drafts).set({ status: "sent", sentLoggedAt: new Date(), hubspotEngagementId: res.engagementId ?? null }).where(eq(drafts.id, draftId));
    revalidatePath("/outreach");
    return { ok: true, hubspot: res.status };
  } catch (e) {
    return fail(e);
  }
}

export async function loadContacts(companyId: number): Promise<HsContact[]> {
  return listContacts(companyId);
}

/* ---------------- settings & HubSpot ---------------- */

export async function saveSettings(v: { productNotes: string; internalAllowlist: string[]; briefRecipients: string[] }): Promise<R> {
  try {
    await requireAdmin();
    const emails = (a: string[]) => [...new Set(a.map((x) => x.trim().toLowerCase()).filter(Boolean))];
    const vals = { productNotes: v.productNotes.trim() || null, internalAllowlist: emails(v.internalAllowlist), briefRecipients: emails(v.briefRecipients) };
    await getDb().insert(settings).values({ id: 1, ...vals }).onConflictDoUpdate({ target: settings.id, set: vals });
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function hubspotCreateProperties(): Promise<R<{ created: string[]; existed: string[]; errors: string[] }>> {
  try {
    await requireAdmin();
    if (!hubspotConfigured()) return { ok: false, error: "HUBSPOT_PRIVATE_APP_TOKEN is not set." };
    const r = await createProperties();
    return { ok: true, ...r };
  } catch (e) {
    return fail(e);
  }
}

export async function hubspotRetry(companyId: number): Promise<R<{ message: string }>> {
  try {
    await requireAdmin();
    const [snap] = await getDb().select().from(snapshots).where(eq(snapshots.companyId, companyId)).orderBy(desc(snapshots.createdAt)).limit(1);
    if (!snap) return { ok: false, error: "No snapshot yet." };
    const r = await syncCompanyFacts(companyId, snap.id);
    revalidatePath("/accounts"); revalidatePath("/");
    return r.status === "synced" ? { ok: true, message: r.message } : { ok: false, error: r.message };
  } catch (e) {
    return fail(e);
  }
}

export async function sendTestEmail(to: string): Promise<R<{ deliveredTo: string }>> {
  try {
    await requireAdmin();
    const s = await getSettings();
    const g = guardRecipient(to, envGuardConfig(s.internalAllowlist ?? []));
    if (!g.ok) return { ok: false, error: g.error };
    const { sendRaw } = await import("@/lib/email/send");
    const r = await sendRaw({ to: g.deliverTo, subject: "Tech Stack Scout: test email", html: `<p>This is a test from Tech Stack Scout.${g.intendedFor ? ` (Test mode: intended for ${g.intendedFor})` : ""}</p>` });
    return r.ok ? { ok: true, deliveredTo: g.deliverTo } : { ok: false, error: r.error };
  } catch (e) {
    return fail(e);
  }
}
