import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { pct } from "@/lib/compute/languages";

const { companies, snapshots, hubspotSync } = schema;
const BASE = "https://api.hubapi.com";

export const GROUP = "tech_stack_scout";
export const hubspotConfigured = () => !!process.env.HUBSPOT_PRIVATE_APP_TOKEN;

export type SyncResult = { status: "synced" | "failed" | "skipped"; message: string };

async function hs<T = unknown>(path: string, method = "GET", body?: unknown): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.HUBSPOT_PRIVATE_APP_TOKEN}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: res.ok, status: res.status, data: data as T };
}

function explain(r: { status: number; data: unknown }): string {
  const d = r.data as { message?: string; category?: string } | string | null;
  const msg = typeof d === "string" ? d : d?.message ?? "";
  if (r.status === 401) return "HubSpot token invalid or expired";
  if (r.status === 403) return `HubSpot scope missing: ${msg.slice(0, 120)}`;
  return `HubSpot ${r.status}: ${msg.slice(0, 160)}`;
}

async function record(companyId: number, kind: "facts" | "approved_text" | "email_log", res: SyncResult) {
  await getDb().insert(hubspotSync).values({
    companyId, kind, status: res.status === "synced" ? "synced" : res.status === "skipped" ? "pending" : "failed",
    error: res.status === "synced" ? null : res.message,
  });
}

/* ---------------- 5.1 one-time property setup ---------------- */

const PROPS: { name: string; label: string; type?: "string"; fieldType?: "text" | "textarea" }[] = [
  { name: "tss_top_languages", label: "TSS · Top languages" },
  { name: "tss_cloud_platforms", label: "TSS · Cloud platforms" },
  { name: "tss_infra_tools", label: "TSS · Infra tools" },
  { name: "tss_microservices_signal", label: "TSS · Microservices signal" },
  { name: "tss_activity_level", label: "TSS · Activity level" },
  { name: "tss_confidence", label: "TSS · Confidence" },
  { name: "tss_last_refreshed", label: "TSS · Last refreshed" },
  { name: "tss_scout_url", label: "TSS · Scout URL" },
  { name: "tss_summary_approved", label: "TSS · Approved summary", fieldType: "textarea" },
  { name: "tss_opener_approved", label: "TSS · Approved opener", fieldType: "textarea" },
];

export async function createProperties(): Promise<{ created: string[]; existed: string[]; errors: string[] }> {
  if (!hubspotConfigured()) return { created: [], existed: [], errors: ["HUBSPOT_PRIVATE_APP_TOKEN is not set"] };
  const out = { created: [] as string[], existed: [] as string[], errors: [] as string[] };
  const g = await hs("/crm/v3/properties/companies/groups", "POST", { name: GROUP, label: "Tech Stack Scout", displayOrder: -1 });
  if (!g.ok && g.status !== 409) { out.errors.push(`group: ${explain(g)}`); return out; }
  for (const p of PROPS) {
    const r = await hs("/crm/v3/properties/companies", "POST", {
      name: p.name, label: p.label, type: "string", fieldType: p.fieldType ?? "text", groupName: GROUP,
    });
    if (r.ok) out.created.push(p.name);
    else if (r.status === 409) out.existed.push(p.name);
    else out.errors.push(`${p.name}: ${explain(r)}`);
  }
  return out;
}

/* ---------------- company lookup / create ---------------- */

export async function ensureCompany(companyId: number): Promise<string> {
  const db = getDb();
  const [c] = await db.select().from(companies).where(eq(companies.id, companyId));
  if (!c) throw new Error("company not found");
  if (c.hubspotCompanyId) return c.hubspotCompanyId;
  const search = await hs<{ results?: { id: string }[] }>("/crm/v3/objects/companies/search", "POST", {
    filterGroups: [{ filters: [{ propertyName: "domain", operator: "EQ", value: c.domain }] }], limit: 1,
  });
  if (!search.ok) throw new Error(explain(search));
  let id = search.data.results?.[0]?.id;
  if (!id) {
    const created = await hs<{ id: string }>("/crm/v3/objects/companies", "POST", { properties: { name: c.name, domain: c.domain } });
    if (!created.ok) throw new Error(explain(created));
    id = created.data.id;
  }
  await db.update(companies).set({ hubspotCompanyId: id }).where(eq(companies.id, companyId));
  return id;
}

export const hubspotCompanyUrl = (id: string | null | undefined) =>
  id ? `https://app.hubspot.com/contacts/_/company/${id}` : null;

/* ---------------- 5.2 facts: automatic after every refresh ---------------- */

export async function syncCompanyFacts(companyId: number, snapshotId: number): Promise<SyncResult> {
  if (!hubspotConfigured()) return { status: "skipped", message: "HubSpot not configured" };
  try {
    const db = getDb();
    const [snap] = await db.select().from(snapshots).where(eq(snapshots.id, snapshotId));
    const [c] = await db.select().from(companies).where(eq(companies.id, companyId));
    if (!snap || !c) throw new Error("snapshot not found");
    const hsId = await ensureCompany(companyId);
    const infra = snap.infra;
    const properties = {
      tss_top_languages: (snap.languages ?? []).slice(0, 3).map((l) => `${l.name} ${pct(l.share)}%`).join(", "),
      tss_cloud_platforms: (infra?.clouds ?? []).join(", "),
      tss_infra_tools: [...new Set((infra?.items ?? []).map((i) => i.tool))].slice(0, 12).join(", "),
      tss_microservices_signal: snap.microservices?.level ?? "unknown",
      tss_activity_level: snap.activity?.level ?? "unknown",
      tss_confidence: snap.confidence ?? "unknown",
      tss_last_refreshed: snap.createdAt.toISOString().slice(0, 10),
      tss_scout_url: `${process.env.APP_BASE_URL ?? ""}/accounts/${c.domain}`,
    };
    const r = await hs(`/crm/v3/objects/companies/${hsId}`, "PATCH", { properties });
    if (!r.ok) throw new Error(explain(r));
    const res: SyncResult = { status: "synced", message: "facts synced to HubSpot" };
    await record(companyId, "facts", res);
    return res;
  } catch (e) {
    const res: SyncResult = { status: "failed", message: (e as Error).message };
    await record(companyId, "facts", res);
    return res;
  }
}

/* ---------------- on Approve: AI text + a Note ---------------- */

export async function pushApprovedText(companyId: number, args: { opener: string; summary: string; evidenceLinks: string[] }): Promise<SyncResult> {
  if (!hubspotConfigured()) return { status: "skipped", message: "HubSpot not configured" };
  try {
    const hsId = await ensureCompany(companyId);
    const r = await hs(`/crm/v3/objects/companies/${hsId}`, "PATCH", {
      properties: { tss_summary_approved: args.summary, tss_opener_approved: args.opener },
    });
    if (!r.ok) throw new Error(explain(r));
    const date = new Date().toISOString().slice(0, 10);
    const body = `<p><b>Approved by Nikhil via Tech Stack Scout on ${date}</b></p><p><b>Opener:</b> ${esc(args.opener)}</p><p><b>Summary:</b> ${esc(args.summary)}</p>` +
      (args.evidenceLinks.length ? `<p><b>Evidence:</b><br/>${args.evidenceLinks.map((u) => `<a href="${esc(u)}">${esc(u)}</a>`).join("<br/>")}</p>` : "");
    const note = await hs("/crm/v3/objects/notes", "POST", {
      properties: { hs_timestamp: new Date().toISOString(), hs_note_body: body },
      associations: [{ to: { id: hsId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 190 }] }],
    });
    if (!note.ok) throw new Error(explain(note));
    const res: SyncResult = { status: "synced", message: "approved text + note written to HubSpot" };
    await record(companyId, "approved_text", res);
    return res;
  } catch (e) {
    const res: SyncResult = { status: "failed", message: (e as Error).message };
    await record(companyId, "approved_text", res);
    return res;
  }
}

/* ---------------- on Mark as sent: email engagement ---------------- */

export async function logSentEmail(companyId: number, args: { subject: string; body: string; recipientEmail?: string | null }): Promise<SyncResult & { engagementId?: string }> {
  if (!hubspotConfigured()) return { status: "skipped", message: "HubSpot not configured" };
  try {
    const hsId = await ensureCompany(companyId);
    const associations: unknown[] = [{ to: { id: hsId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 186 }] }];
    if (args.recipientEmail) {
      const c = await hs<{ results?: { id: string }[] }>("/crm/v3/objects/contacts/search", "POST", {
        filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: args.recipientEmail }] }], limit: 1,
      });
      const cid = c.ok ? c.data.results?.[0]?.id : null;
      if (cid) associations.push({ to: { id: cid }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 198 }] });
    }
    const r = await hs<{ id: string }>("/crm/v3/objects/emails", "POST", {
      properties: {
        hs_timestamp: new Date().toISOString(), hs_email_direction: "EMAIL", hs_email_status: "SENT",
        hs_email_subject: args.subject, hs_email_text: args.body,
      },
      associations,
    });
    if (!r.ok) throw new Error(explain(r));
    const res = { status: "synced" as const, message: "email logged in HubSpot", engagementId: r.data.id };
    await record(companyId, "email_log", res);
    return res;
  } catch (e) {
    const res = { status: "failed" as const, message: (e as Error).message };
    await record(companyId, "email_log", res);
    return res;
  }
}

/* ---------------- contacts for the recipient dropdown ---------------- */

export type HsContact = { id: string; name: string; title: string; email: string };

export async function listContacts(companyId: number): Promise<HsContact[]> {
  if (!hubspotConfigured()) return [];
  try {
    const hsId = await ensureCompany(companyId);
    const assoc = await hs<{ results?: { toObjectId: number | string }[] }>(`/crm/v4/objects/companies/${hsId}/associations/contacts`);
    const ids = (assoc.data.results ?? []).slice(0, 50).map((r) => String(r.toObjectId));
    if (!ids.length) return [];
    const batch = await hs<{ results?: { id: string; properties: Record<string, string | null> }[] }>("/crm/v3/objects/contacts/batch/read", "POST", {
      properties: ["firstname", "lastname", "jobtitle", "email"], inputs: ids.map((id) => ({ id })),
    });
    return (batch.data.results ?? [])
      .map((c) => ({ id: c.id, name: [c.properties.firstname, c.properties.lastname].filter(Boolean).join(" ") || "(no name)", title: c.properties.jobtitle ?? "", email: c.properties.email ?? "" }))
      .filter((c) => c.email);
  } catch {
    return [];
  }
}

/* ---------------- status for UI ---------------- */

export async function latestSyncStatus(companyId: number) {
  const rows = await getDb().select().from(hubspotSync).where(eq(hubspotSync.companyId, companyId)).orderBy(desc(hubspotSync.at)).limit(10);
  const latestFacts = rows.find((r) => r.kind === "facts");
  return { facts: latestFacts?.status ?? "pending", error: latestFacts?.error ?? null, rows };
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

