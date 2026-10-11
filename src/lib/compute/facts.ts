import type { ActivityResult, ChangeItem, InfraResult, LanguageShare, MicroservicesResult } from "@/db/schema";
import { pct } from "./languages";

export type Facts = {
  company: string;
  languages: LanguageShare[];
  infra: InfraResult | null;
  microservices: MicroservicesResult | null;
  activity: ActivityResult | null;
  confidence: string | null;
  confidenceReason: string | null;
  changes: ChangeItem[];
  activeRepoCount: number;
  serviceRepoCount: number;
  sourceNotes: string[];
};

/** Rendered once; used as Gemini's "computed facts" and as grounding text for the code check. */
export function factsToText(f: Facts): string {
  const L: string[] = [];
  L.push(
    `Q1 languages (by bytes, ${f.activeRepoCount} active non-fork repos): ` +
      (f.languages.length ? f.languages.slice(0, 5).map((l) => `${l.name} ${pct(l.share)}%`).join(", ") : "no public code found"),
  );
  if (f.infra) {
    const cats = Object.entries(f.infra.categories).map(([k, v]) => `${k}: ${v.join(", ")}`).join("; ");
    L.push(`Q2 cloud: ${f.infra.clouds.join(", ") || "none detected"}. Infra tools by category: ${cats || "none detected"}. Repos scanned: ${f.infra.reposScanned}.`);
  } else L.push("Q2 cloud/infra: unknown (no code scanned)");
  if (f.microservices) L.push(`Microservices signal: ${f.microservices.level} (${f.microservices.reasons.join("; ")}). ${f.serviceRepoCount} service-style repos.`);
  const a = f.activity;
  if (a) {
    L.push(
      `Q3 activity: ${a.level}. Commits last 30 days ${a.commits30}, last 90 days ${a.commits90}. Repos pushed last 30 days ${a.reposPushed30}. ` +
        `Releases last 90 days ${a.releases90}. Open engineering roles ${a.openRoles}. Blog posts last 90 days ${a.blogPosts90}. Talks last 12 months ${a.talks12mo}.` +
        (a.wowChangePct != null ? ` Commits changed ${a.wowChangePct}% vs last week's snapshot.` : ""),
    );
  }
  L.push(`Confidence: ${f.confidence ?? "unknown"}${f.confidenceReason ? `. ${f.confidenceReason}` : ""}`);
  if (f.sourceNotes.length) L.push(`Source notes: ${f.sourceNotes.join("; ")}`);
  L.push(`Changes since last week: ${f.changes.length ? f.changes.map((c) => `${c.sign} ${c.text}`).join(" | ") : "none"}`);
  return L.join("\n");
}
