import { OutreachBoard, type DraftCard } from "@/components/outreach/OutreachBoard";
import { SetupNotice } from "@/components/ui/States";
import { isAdmin } from "@/lib/auth";
import { getDb, schema } from "@/db";
import { getDraftsWithCompany, getSettings } from "@/lib/queries";
import { safe } from "@/lib/safe";
import { inArray } from "drizzle-orm";
import { DAY } from "@/lib/util";

export const dynamic = "force-dynamic";
export const metadata = { title: "Outreach" };

export default async function OutreachPage({ searchParams }: { searchParams: Promise<{ draft?: string }> }) {
  const sp = await searchParams;
  const res = await safe(async () => {
    const rows = await getDraftsWithCompany();
    const snapIds = [...new Set(rows.map((r) => r.draft.snapshotId).filter((x): x is number => !!x))];
    const ev = snapIds.length ? await getDb().select().from(schema.evidence).where(inArray(schema.evidence.snapshotId, snapIds)) : [];
    return { rows, ev, settings: await getSettings() };
  });
  if (!res.ok) return <SetupNotice error={res.error} />;
  const { rows, ev, settings } = res.data;
  const admin = await isAdmin();

  const cards: DraftCard[] = rows.map(({ draft: d, name, domain }) => ({
    id: d.id, companyId: d.companyId, company: name, domain,
    recipientName: d.recipientName, recipientEmail: d.recipientEmail, subject: d.subject, body: d.body,
    status: d.status, checkStatus: d.checkStatus, checkReasons: d.checkReasons ?? [], evidenceIds: d.evidenceIds ?? [],
    createdAt: d.createdAt.toISOString(), approvedAt: d.approvedAt?.toISOString() ?? null, sentAt: d.sentLoggedAt?.toISOString() ?? null,
    reviewers: d.internalReviewers ?? [],
    evidence: Object.fromEntries(ev.filter((e) => e.snapshotId === d.snapshotId && (d.evidenceIds ?? []).includes(e.ref)).map((e) => [e.ref, { ref: e.ref, source: e.source, title: e.title, snippet: e.snippet, url: e.url, observedAt: e.observedAt?.toISOString() ?? null }])),
  }));

  const week = Date.now() - 7 * DAY;
  const sent = cards.filter((c) => c.sentAt);
  const avgHours = sent.length ? Math.round(sent.reduce((s, c) => s + (new Date(c.sentAt!).getTime() - new Date(c.createdAt).getTime()), 0) / sent.length / 3_600_000) : null;
  const metrics = {
    waiting: cards.filter((c) => c.status === "draft" || c.status === "internal_review").length,
    approvedWeek: cards.filter((c) => c.approvedAt && new Date(c.approvedAt).getTime() > week).length,
    sentWeek: cards.filter((c) => c.sentAt && new Date(c.sentAt).getTime() > week).length,
    avgHours,
  };

  return (
    <OutreachBoard
      cards={cards} metrics={metrics} admin={admin} openId={sp.draft ? Number(sp.draft) : null}
      allowlist={settings.internalAllowlist ?? []} internalDomain={process.env.INTERNAL_EMAIL_DOMAIN ?? ""} testMode={process.env.EMAIL_TEST_MODE === "true"}
    />
  );
}
