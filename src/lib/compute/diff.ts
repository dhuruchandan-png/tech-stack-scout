import type { ActivityResult, ChangeItem, InfraResult, LanguageShare, MicroservicesResult } from "@/db/schema";

export type Snap = {
  languages: LanguageShare[] | null;
  infra: InfraResult | null;
  microservices: MicroservicesResult | null;
  activity: ActivityResult | null;
  jobUrls?: string[]; // evidence urls of job posts, to spot new roles
  blogUrls?: string[];
  talkUrls?: string[];
  repoNames?: string[];
};

export type CurrentSnap = Snap & {
  newJobs?: { title: string; techs: string[]; ref?: string }[];
  newBlogs?: { title: string; ref?: string }[];
  newTalks?: { title: string; ref?: string }[];
  newRepos?: { name: string; commits30: number; language: string | null; ref?: string; created?: boolean }[];
};

/** Step 8: what changed vs last week. Pure code, no AI. */
export function diffSnapshots(prev: Snap | null, cur: CurrentSnap): ChangeItem[] {
  const out: ChangeItem[] = [];
  const refs = (r?: string) => (r ? [r] : undefined);

  if (!prev) {
    out.push({ sign: "~", text: "First week tracked, no comparison yet." });
    return out;
  }

  // roles
  const prevJobs = new Set(prev.jobUrls ?? []);
  const newJobs = (cur.newJobs ?? []).filter(Boolean);
  if (newJobs.length) {
    const k8s = newJobs.filter((j) => j.techs.some((t) => /kubernetes|k8s/i.test(t)));
    if (k8s.length) {
      out.push({ sign: "+", text: `${k8s.length} new ${k8s.length === 1 ? "role mentions" : "roles mention"} Kubernetes`, evidenceIds: k8s.map((j) => j.ref!).filter(Boolean) });
    }
    const rest = newJobs.length - k8s.length;
    if (rest > 0) out.push({ sign: "+", text: `${rest} new engineering role${rest === 1 ? "" : "s"} posted`, evidenceIds: newJobs.filter((j) => !k8s.includes(j)).map((j) => j.ref!).filter(Boolean) });
  }
  void prevJobs;

  for (const r of cur.newRepos ?? []) {
    // "New repo" = created in the last 7 days. Anything else that just started getting commits is "Newly active".
    const label = r.created === false ? "Newly active:" : "New repo";
    out.push({ sign: "+", text: `${label} ${r.name}${r.language ? ` (${r.language})` : ""}, ${r.commits30} commits`, evidenceIds: refs(r.ref) });
  }
  for (const b of cur.newBlogs ?? []) out.push({ sign: "+", text: `Blog: “${b.title}”`, evidenceIds: refs(b.ref) });
  for (const t of cur.newTalks ?? []) out.push({ sign: "+", text: `Talk: “${t.title}”`, evidenceIds: refs(t.ref) });

  // commits: the latest 30 days against the 30 days before (like-for-like rolling windows, bots excluded).
  // Only reported when the move is at least 20% AND at least 50 commits, so quiet weeks do not look like news.
  const c30 = cur.activity?.commits30, p30 = cur.activity?.commitsPrev30;
  if (cur.activity?.commitsKnown !== false && p30 != null && c30 != null && p30 > 0) {
    const pct = Math.round(((c30 - p30) / p30) * 100);
    if (Math.abs(pct) >= 20 && Math.abs(c30 - p30) >= 50) {
      out.push({ sign: "~", text: `Commits, last 30 days vs the 30 before: ${p30} → ${c30} (${pct > 0 ? "+" : ""}${pct}%)` });
    }
  }

  // language share shifts: at least 5 points, and the language must be in 3+ repos (a single repo swing is noise)
  const prevLang = new Map((prev.languages ?? []).map((l) => [l.name, l.share]));
  for (const l of cur.languages ?? []) {
    const before = prevLang.get(l.name);
    if (before == null || (l.repoCount ?? 3) < 3) continue;
    const d = Math.round((l.share - before) * 100);
    if (Math.abs(d) >= 5) {
      out.push({
        sign: d > 0 ? "+" : "-",
        text: `${l.name} share ${d > 0 ? "up" : "down"} ${Math.abs(d)} pts (${Math.round(before * 100)}% → ${Math.round(l.share * 100)}%)`,
      });
    }
  }

  // new infra tools
  const prevTools = new Set((prev.infra?.items ?? []).map((i) => i.tool));
  const newTools = [...new Set((cur.infra?.items ?? []).map((i) => i.tool))].filter((t) => !prevTools.has(t));
  if (newTools.length) out.push({ sign: "+", text: `New infra signal: ${newTools.slice(0, 4).join(", ")}` });
  const prevClouds = new Set(prev.infra?.clouds ?? []);
  for (const c of cur.infra?.clouds ?? []) if (!prevClouds.has(c)) out.push({ sign: "+", text: `${c} now visible in their code` });

  if (prev.microservices && cur.microservices && prev.microservices.level !== cur.microservices.level) {
    out.push({ sign: "~", text: `Microservices signal ${prev.microservices.level} → ${cur.microservices.level}` });
  }
  if (prev.activity && cur.activity && prev.activity.level !== cur.activity.level) {
    out.push({ sign: "~", text: `Activity level ${prev.activity.level} → ${cur.activity.level}` });
  }
  if (prev.activity && cur.activity && cur.activity.openRoles < prev.activity.openRoles) {
    const d = prev.activity.openRoles - cur.activity.openRoles;
    out.push({ sign: "-", text: `${d} fewer open engineering role${d === 1 ? "" : "s"} (${prev.activity.openRoles} → ${cur.activity.openRoles})` });
  }

  if (out.length === 0) out.push({ sign: "~", text: "No material change since last week." });
  return out;
}
