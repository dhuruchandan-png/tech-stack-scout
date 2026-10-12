import { desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { makeCheckContext } from "@/lib/ai/context";
import { generateEmail } from "@/lib/ai/generate";
import { selectForGemini, type Ref } from "@/lib/compute/evidence";
import { factsToText } from "@/lib/compute/facts";
import { hubspotConfigured, listContacts } from "@/lib/hubspot";
import { callTheseFirst, getAccounts } from "@/lib/queries";
import { mapLimit } from "@/lib/util";

const { companies, snapshots, briefs, evidence, drafts } = schema;

/** Everything about a company's latest snapshot that Gemini and the code check need. */
export async function loadSnapshotContext(companyId: number) {
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
  const ctx = makeCheckContext(company.name, refs, factsText);
  return { company, snap, refs, brief, ctx, factsText };
}

/** Best person to write to: a technical leader at the company, from HubSpot contacts (when connected). */
async function pickRecipient(companyId: number): Promise<{ name: string; email: string } | null> {
  if (!hubspotConfigured()) return null;
  try {
    const contacts = await Promise.race([listContacts(companyId), new Promise<never[]>((r) => setTimeout(() => r([]), 6000))]);
    if (!contacts.length) return null;
    const technical = /\b(cto|vp|head|director|platform|infrastructure|devops|sre|engineering|architect)\b/i;
    const best = contacts.find((c) => technical.test(c.title)) ?? contacts[0];
    return { name: best.name, email: best.email };
  } catch {
    return null;
  }
}

export type DraftResult = { ok: true; id: number } | { ok: false; error: string };

/**
 * Writes a draft email from the company's verified opener, checks it, and saves it as a draft.
 * Nothing is sent. `onlyIfVerified` skips (instead of saving) a draft that fails the code check.
 */
export async function createDraftFor(
  companyId: number,
  opts: { recipient?: { name?: string; email?: string }; onlyIfVerified?: boolean } = {},
): Promise<DraftResult> {
  const { company, snap, refs, brief, ctx } = await loadSnapshotContext(companyId);
  if (!brief?.openerText) return { ok: false, error: "No first line yet. Click Refresh now first." };
  if (brief.checkStatus !== "verified") {
    return { ok: false, error: "This first line is marked Needs review, so it cannot become an email draft yet. Edit it until the check passes (or rewrite it), then draft." };
  }
  const recipient = opts.recipient ?? (await pickRecipient(companyId)) ?? undefined;
  const e = await generateEmail(
    {
      company: company.name, opener: brief.openerText, summary: `${brief.summaryP1 ?? ""} ${brief.summaryP2 ?? ""}`.replace(/\[E\d+\]/g, ""),
      evidence: selectForGemini(refs, 25).map((x) => ({ ref: x.ref, source: x.source, title: x.title, snippet: x.snippet })), recipient: recipient?.name,
    },
    ctx,
  );
  if (opts.onlyIfVerified && e.checkStatus !== "verified") return { ok: false, error: `Email draft did not pass the check: ${e.checkReasons[0] ?? "see reasons"}` };
  const [row] = await getDb().insert(drafts).values({
    companyId, snapshotId: snap.id, recipientName: recipient?.name ?? null, recipientEmail: recipient?.email ?? null,
    subject: e.email.subject, body: e.email.body, evidenceIds: e.email.evidence_ids, status: "draft",
    checkStatus: e.checkStatus, checkReasons: e.checkReasons,
  }).returning({ id: drafts.id });
  return { ok: true, id: row.id };
}

export type PrepareSummary = { created: { company: string; id: number }[]; skipped: { company: string; reason: string }[] };

/**
 * Keeps a finished, checked draft ready for the top "Call these first" accounts, so Nikhil only has to review it,
 * open it in his own Gmail or Outlook and press Send himself. It never sends anything.
 * Skips accounts that already have a draft in progress, or that he has already emailed.
 */
export async function prepareReadyDrafts(opts: { limit?: number; companyIds?: number[] } = {}): Promise<PrepareSummary> {
  const limit = opts.limit ?? 5;
  const accts = await getAccounts();
  const open = await getDb().select({ companyId: drafts.companyId, status: drafts.status }).from(drafts)
    .where(inArray(drafts.status, ["draft", "internal_review", "approved", "opened"]));
  const busy = new Set(open.map((d) => d.companyId));
  const ranked = callTheseFirst(accts, accts.length)
    .map((t) => t.row)
    .filter((r) => (!opts.companyIds || opts.companyIds.includes(r.company.id)));
  const summary: PrepareSummary = { created: [], skipped: [] };
  const todo: typeof ranked = [];
  for (const r of ranked) {
    if (todo.length >= limit) break;
    if (busy.has(r.company.id)) continue;
    if (r.contacted) { summary.skipped.push({ company: r.company.name, reason: "already emailed" }); continue; }
    if (r.brief?.checkStatus !== "verified" || !r.brief.openerText) { summary.skipped.push({ company: r.company.name, reason: "opener needs review" }); continue; }
    todo.push(r);
  }
  await mapLimit(todo, 3, async (r) => {
    try {
      const res = await createDraftFor(r.company.id, { onlyIfVerified: true });
      if (res.ok) summary.created.push({ company: r.company.name, id: res.id });
      else summary.skipped.push({ company: r.company.name, reason: res.error });
    } catch (e) {
      summary.skipped.push({ company: r.company.name, reason: (e as Error).message.slice(0, 120) });
    }
  });
  return summary;
}
