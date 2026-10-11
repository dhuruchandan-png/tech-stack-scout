import { and, asc, desc, eq, gte, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { callFirstScore } from "@/lib/compute/score";
import { DAY, freshnessOf } from "@/lib/util";

const { companies, snapshots, briefs, evidence, runs, runSteps, drafts, hubspotSync, settings, qaMessages } = schema;

export type Company = typeof companies.$inferSelect;
export type Snapshot = typeof snapshots.$inferSelect;
export type Brief = typeof briefs.$inferSelect;
export type Evidence = typeof evidence.$inferSelect;
export type Draft = typeof drafts.$inferSelect;
export type Run = typeof runs.$inferSelect;

export type AccountRow = {
  company: Company;
  snapshot: Snapshot | null;
  brief: Brief | null;
  hubspot: "synced" | "pending" | "failed";
  hubspotError: string | null;
  lastRun: Run | null;
  evidenceCount: number;
  contacted: boolean;
};

/** Light index used by the sidebar and the ⌘K palette. */
export async function getCompanyIndex() {
  return getDb().select({ id: companies.id, name: companies.name, domain: companies.domain }).from(companies).where(eq(companies.active, true)).orderBy(asc(companies.name));
}

export async function getSettings() {
  const db = getDb();
  const [row] = await db.select().from(settings).limit(1);
  return row ?? { id: 1, productNotes: null, internalAllowlist: [] as string[], briefRecipients: [] as string[] };
}

/** Everything the Watchlist/Today pages need in a few round trips (no N+1). */
export async function getAccounts(opts: { includeRemoved?: boolean } = {}): Promise<AccountRow[]> {
  const db = getDb();
  const cos = await db.select().from(companies).where(opts.includeRemoved ? undefined : eq(companies.active, true)).orderBy(asc(companies.name));
  if (!cos.length) return [];
  const ids = cos.map((c) => c.id);

  const latest = await db.select({ id: sql<number>`max(${snapshots.id})` }).from(snapshots).where(inArray(snapshots.companyId, ids)).groupBy(snapshots.companyId);
  const snapIds = latest.map((l) => l.id);
  const snaps = snapIds.length ? await db.select().from(snapshots).where(inArray(snapshots.id, snapIds)) : [];
  const brs = snapIds.length ? await db.select().from(briefs).where(inArray(briefs.snapshotId, snapIds)) : [];
  const evCounts = snapIds.length
    ? await db.select({ snapshotId: evidence.snapshotId, n: sql<number>`count(*)::int` }).from(evidence).where(inArray(evidence.snapshotId, snapIds)).groupBy(evidence.snapshotId)
    : [];
  const sync = await db.select().from(hubspotSync).where(and(inArray(hubspotSync.companyId, ids), eq(hubspotSync.kind, "facts"))).orderBy(desc(hubspotSync.at));
  const latestRuns = await db.select().from(runs).where(inArray(runs.companyId, ids)).orderBy(desc(runs.startedAt)).limit(ids.length * 3);
  const sent = await db.select({ companyId: drafts.companyId }).from(drafts).where(and(inArray(drafts.companyId, ids), isNotNull(drafts.sentLoggedAt)));

  return cos.map((company) => {
    const snapshot = snaps.find((s) => s.companyId === company.id) ?? null;
    const s = sync.find((x) => x.companyId === company.id);
    return {
      company,
      snapshot,
      brief: snapshot ? brs.find((b) => b.snapshotId === snapshot.id) ?? null : null,
      hubspot: (s?.status as "synced" | "pending" | "failed") ?? "pending",
      hubspotError: s?.error ?? null,
      lastRun: latestRuns.find((r) => r.companyId === company.id) ?? null,
      evidenceCount: evCounts.find((e) => e.snapshotId === snapshot?.id)?.n ?? 0,
      contacted: sent.some((x) => x.companyId === company.id),
    };
  });
}

export async function getAccountByDomain(domain: string): Promise<AccountRow | null> {
  const all = await getAccounts({ includeRemoved: true });
  return all.find((a) => a.company.domain === domain.toLowerCase()) ?? null;
}

export async function getEvidence(snapshotId: number) {
  return getDb().select().from(evidence).where(eq(evidence.snapshotId, snapshotId)).orderBy(asc(evidence.id));
}

export async function getHistory(companyId: number, limit = 26) {
  return getDb().select().from(snapshots).where(eq(snapshots.companyId, companyId)).orderBy(desc(snapshots.createdAt)).limit(limit);
}

export async function getRunsForCompany(companyId: number, limit = 10) {
  const db = getDb();
  const rs = await db.select().from(runs).where(eq(runs.companyId, companyId)).orderBy(desc(runs.startedAt)).limit(limit);
  const steps = rs.length ? await db.select().from(runSteps).where(inArray(runSteps.runId, rs.map((r) => r.id))).orderBy(asc(runSteps.id)) : [];
  return rs.map((r) => ({ run: r, steps: steps.filter((s) => s.runId === r.id) }));
}

export async function getRunWithSteps(runId: number) {
  const db = getDb();
  const [run] = await db.select().from(runs).where(eq(runs.id, runId));
  if (!run) return null;
  const [company] = await db.select().from(companies).where(eq(companies.id, run.companyId));
  const steps = await db.select().from(runSteps).where(eq(runSteps.runId, runId)).orderBy(asc(runSteps.id));
  return { run, company, steps };
}

/**
 * A serverless function that hits its time limit dies without updating its run row. Anything "running" for over
 * 3 minutes (the limit is 60 seconds) or "queued" for over 10 minutes is marked failed so the Runs page never lies,
 * and the Retry button appears.
 */
export async function reapStuckRuns() {
  const db = getDb();
  const msg = "Timed out: the serverless function was stopped before this run finished. Tap Retry.";
  await db.update(runs).set({ status: "failed", finishedAt: new Date(), error: msg }).where(and(eq(runs.status, "running"), lt(runs.startedAt, new Date(Date.now() - 3 * 60_000))));
  await db.update(runs).set({ status: "failed", finishedAt: new Date(), error: msg }).where(and(eq(runs.status, "queued"), lt(runs.startedAt, new Date(Date.now() - 10 * 60_000))));
}

export async function getRecentRuns(limit = 60) {
  const db = getDb();
  await reapStuckRuns().catch(() => {});
  const rs = await db.select({ run: runs, name: companies.name, domain: companies.domain }).from(runs).innerJoin(companies, eq(companies.id, runs.companyId)).orderBy(desc(runs.startedAt)).limit(limit);
  const ids = rs.map((r) => r.run.id);
  const steps = ids.length ? await db.select().from(runSteps).where(inArray(runSteps.runId, ids)).orderBy(asc(runSteps.id)) : [];
  return rs.map((r) => ({ ...r, steps: steps.filter((s) => s.runId === r.run.id) }));
}

export async function getQa(companyId: number) {
  return getDb().select().from(qaMessages).where(eq(qaMessages.companyId, companyId)).orderBy(desc(qaMessages.createdAt)).limit(20);
}

export async function getDraftsWithCompany() {
  const db = getDb();
  return db.select({ draft: drafts, name: companies.name, domain: companies.domain }).from(drafts).innerJoin(companies, eq(companies.id, drafts.companyId)).orderBy(desc(drafts.createdAt));
}

export async function getDraft(id: number) {
  const db = getDb();
  const [row] = await db.select({ draft: drafts, name: companies.name, domain: companies.domain }).from(drafts).innerJoin(companies, eq(companies.id, drafts.companyId)).where(eq(drafts.id, id));
  return row ?? null;
}

/* ---------------- System Health strip ---------------- */

export async function getSystemHealth(accts?: AccountRow[]) {
  const db = getDb();
  const rows = accts ?? (await getAccounts());
  const n = rows.length;
  const fresh = rows.filter((r) => r.snapshot && freshnessOf(r.snapshot.createdAt).level === "fresh").length;
  const coverage = rows.filter((r) => r.evidenceCount >= 3).length;
  const openers = rows.filter((r) => r.brief?.openerText).length;
  const verified = rows.filter((r) => r.brief?.openerText && r.brief.checkStatus === "verified").length;
  const synced = rows.filter((r) => r.hubspot === "synced").length;
  const weekAgo = new Date(Date.now() - 7 * DAY);
  const [cost] = await db.select({ v: sql<number>`coalesce(sum(${briefs.costUsd}),0)::float` }).from(briefs).where(gte(briefs.createdAt, weekAgo));
  const [lastCron] = await db.select().from(runs).where(inArray(runs.trigger, ["cron", "bulk"])).orderBy(desc(runs.startedAt)).limit(1);
  return {
    total: n, fresh, coverage, coveragePct: n ? Math.round((coverage / n) * 100) : 0,
    openers, verified, synced, costWeek: cost?.v ?? 0, lastWeeklyRun: lastCron?.startedAt ?? null,
  };
}

/* ---------------- Today ---------------- */

export function callTheseFirst(rows: AccountRow[], k = 5) {
  return rows
    .filter((r) => r.snapshot)
    .map((r) => {
      const { score, reason } = callFirstScore({
        changes: r.snapshot!.changes, activity: r.snapshot!.activity, microservices: r.snapshot!.microservices,
        clouds: r.snapshot!.infra?.clouds ?? [], openerVerified: r.brief?.checkStatus === "verified" && !!r.brief.openerText,
        alreadyContacted: r.contacted,
      });
      return { row: r, score, reason };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
