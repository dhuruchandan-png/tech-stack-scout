import { eq } from "drizzle-orm";
import { Resend } from "resend";
import { render } from "@react-email/render";
import { getDb, schema } from "@/db";
import { getSettings } from "@/lib/queries";
import { canDeliver, envGuardConfig } from "./guard";
import InternalDraftEmail from "@/emails/InternalDraft";
import MondayBriefEmail, { type BriefItem } from "@/emails/MondayBrief";

type Sent = { ok: true; id: string } | { ok: false; error: string };

/**
 * The ONLY place in the app that calls Resend. Every send is re-validated here:
 * prospects can never be reached, even by a bug in a caller.
 */
export async function sendRaw(args: { to: string; subject: string; html: string }): Promise<Sent> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "RESEND_API_KEY is not set." };
  const s = await getSettings();
  if (process.env.EMAIL_TEST_MODE === "true" && !process.env.TEST_EMAIL) {
    return { ok: false, error: "Email is blocked: EMAIL_TEST_MODE is on but TEST_EMAIL is not set. Set TEST_EMAIL in Vercel (your own inbox) and redeploy." };
  }
  if (!canDeliver(args.to, envGuardConfig(s.internalAllowlist ?? []))) {
    return { ok: false, error: `Blocked: ${args.to} is not an internal or test address.` };
  }
  try {
    const resend = new Resend(key);
    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM ?? "Tech Stack Scout <onboarding@resend.dev>",
      to: args.to, subject: args.subject, html: args.html,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: data?.id ?? "" };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

const base = () => process.env.APP_BASE_URL ?? "";

export async function sendInternalDraft(args: {
  draft: typeof schema.drafts.$inferSelect; companyName: string; domain: string; to: string; intendedFor: string | null;
}): Promise<Sent> {
  const db = getDb();
  const [brief] = args.draft.snapshotId ? await db.select().from(schema.briefs).where(eq(schema.briefs.snapshotId, args.draft.snapshotId)) : [];
  const evs = args.draft.snapshotId && args.draft.evidenceIds?.length
    ? (await db.select().from(schema.evidence).where(eq(schema.evidence.snapshotId, args.draft.snapshotId))).filter((e) => args.draft.evidenceIds!.includes(e.ref))
    : [];
  const html = await render(
    InternalDraftEmail({
      company: args.companyName, subject: args.draft.subject, body: args.draft.body,
      opener: brief?.openerText ?? "", summary: `${brief?.summaryP1 ?? ""} ${brief?.summaryP2 ?? ""}`.replace(/\s*\[E\d+\]/g, "").trim(),
      evidence: evs.map((e) => ({ ref: e.ref, title: e.title, url: e.url })),
      reviewUrl: `${base()}/outreach`, intendedFor: args.intendedFor,
    }),
  );
  return sendRaw({ to: args.to, subject: `[Internal draft] ${args.companyName}: ${args.draft.subject}`, html });
}

export async function sendMondayBrief(to: string, items: { top: BriefItem[]; changes: { company: string; text: string }[]; ready: number; problems: string[] }, intendedFor: string | null): Promise<Sent> {
  const html = await render(MondayBriefEmail({ ...items, baseUrl: base(), intendedFor }));
  return sendRaw({ to, subject: "Tech Stack Scout · your Monday brief", html });
}
