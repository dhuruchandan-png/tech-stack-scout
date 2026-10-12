import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron";
import { callTheseFirst, getAccounts, getSettings } from "@/lib/queries";
import { envGuardConfig, guardRecipient } from "@/lib/email/guard";
import { sendMondayBrief } from "@/lib/email/send";
import { freshnessOf } from "@/lib/util";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Mondays 8:00 IST (30 2 * * 1 UTC). Internal only: goes to the brief recipients (allowlisted) or NIKHIL_EMAIL. */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const accts = await getAccounts();
  const s = await getSettings();
  const top = callTheseFirst(accts, 5).map((t) => ({ name: t.row.company.name, domain: t.row.company.domain, reason: t.reason, opener: t.row.brief?.openerText ?? null }));
  const changes = accts.flatMap((a) => (a.snapshot?.changes ?? []).filter((c) => c.sign === "+").slice(0, 2).map((c) => ({ company: a.company.name, text: c.text }))).slice(0, 12);
  const ready = accts.filter((a) => a.brief?.checkStatus === "verified" && a.brief.openerText).length;
  const problems: string[] = [];
  for (const a of accts) {
    if (a.snapshot && freshnessOf(a.snapshot.createdAt).level === "stale") problems.push(`${a.company.name}: data is stale`);
    for (const [src, st] of Object.entries(a.snapshot?.sourceStatus ?? {})) if (st.state === "failed") problems.push(`${a.company.name}: ${src} failed${st.staleSince ? ` (stale since ${st.staleSince})` : ""}`);
    if (a.brief?.checkStatus === "needs_review") problems.push(`${a.company.name}: first line needs review`);
  }

  const recipients = [...new Set([...(s.briefRecipients ?? []), ...(process.env.NIKHIL_EMAIL ? [process.env.NIKHIL_EMAIL] : [])])];
  const cfg = envGuardConfig(s.internalAllowlist ?? []);
  // the brief is for Nikhil himself, so his address counts as internal
  if (process.env.NIKHIL_EMAIL) cfg.allowlist = [...(cfg.allowlist ?? []), process.env.NIKHIL_EMAIL];
  const results: { to: string; ok: boolean; error?: string }[] = [];
  for (const r of recipients) {
    const g = guardRecipient(r, cfg);
    if (!g.ok) { results.push({ to: r, ok: false, error: g.error }); continue; }
    const sent = await sendMondayBrief(g.deliverTo, { top, changes, ready, problems: problems.slice(0, 8) }, g.intendedFor);
    results.push({ to: g.deliverTo, ok: sent.ok, error: sent.ok ? undefined : sent.error });
  }
  return NextResponse.json({ sent: results });
}
