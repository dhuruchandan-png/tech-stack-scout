import type { InfraResult, LanguageShare } from "@/db/schema";
import { findTech, snippetAround } from "@/lib/compute/techdict";
import { pct } from "@/lib/compute/languages";
import type { BlogData, EvidenceDraft, GithubData, HnData, JobsData, YoutubeData } from "@/lib/types";
import { clip } from "@/lib/util";

export const MAX_EVIDENCE = 60;
export const MAX_FOR_GEMINI = 40;

type Inputs = {
  github?: GithubData | null;
  languages?: LanguageShare[];
  infra?: InfraResult | null;
  jobs?: JobsData | null;
  blog?: BlogData | null;
  youtube?: YoutubeData | null;
  hn?: HnData | null;
};

const d = (s?: string | null) => (s ? new Date(s) : null);

/** Step 7: every signal becomes an evidence item with source, url, title, snippet, date. */
export function buildEvidence(i: Inputs): EvidenceDraft[] {
  const out: EvidenceDraft[] = [];

  if (i.github) {
    const g = i.github;
    if (i.languages?.length) {
      const top = i.languages.slice(0, 5).map((l) => `${l.name} ${pct(l.share)}%`).join(", ");
      out.push({
        source: "github", kind: "languages", title: `Language mix across active public repos`,
        snippet: top, url: g.orgUrl, observedAt: new Date(), meta: { org: g.org },
      });
    }
    const active = g.repos.filter((r) => !r.isFork && !r.isArchived).slice(0, 8);
    for (const r of active) {
      out.push({
        source: "github", kind: "repo", title: `Repo ${r.name}`,
        snippet: clip(`${r.description ?? "No description"} · ${r.primaryLanguage ?? "n/a"} · ${r.commits30} commits last 30d · ${r.stars}★${r.topics.length ? ` · topics: ${r.topics.join(", ")}` : ""}`, 260),
        url: r.url, observedAt: d(r.pushedAt), meta: { repo: r.name },
      });
    }
    // one evidence item per distinct infra tool (first repo that shows it)
    const seen = new Set<string>();
    for (const it of i.infra?.items ?? []) {
      if (seen.has(it.tool)) continue;
      seen.add(it.tool);
      out.push({
        source: "github", kind: "infra", title: `${it.tool} in ${it.repo}`,
        snippet: `${it.tool} (${it.category}) detected at ${it.path} in repo ${it.repo}`,
        url: it.url ?? g.orgUrl, observedAt: new Date(), meta: { repo: it.repo, path: it.path, category: it.category },
      });
    }
  }

  if (i.jobs) {
    const withTech = i.jobs.engineeringJobs.map((j) => ({ j, techs: findTech(`${j.title} ${j.text}`) }));
    withTech.sort((a, b) => b.techs.length - a.techs.length);
    for (const { j, techs } of withTech.slice(0, 14)) {
      out.push({
        source: "jobs", kind: "job", title: `${j.title}${j.location ? ` (${j.location})` : ""}`,
        snippet: techs.length ? `Mentions ${techs.join(", ")}. ${snippetAround(j.text, techs)}` : clip(j.text, 200),
        url: j.url, observedAt: d(j.updatedAt), meta: { techs, department: j.department },
      });
    }
  }

  if (i.blog) {
    for (const p of i.blog.posts.slice(0, 10)) {
      const techs = findTech(`${p.title} ${p.snippet}`);
      out.push({
        source: "blog", kind: "post", title: p.title, snippet: clip(p.snippet, 260),
        url: p.url, observedAt: d(p.publishedAt), meta: { techs },
      });
    }
  }
  if (i.youtube) {
    for (const t of i.youtube.talks.slice(0, 5)) {
      out.push({
        source: "youtube", kind: "talk", title: t.title, snippet: clip(`${t.channel}. ${t.description}`, 240),
        url: t.url, observedAt: d(t.publishedAt), meta: { channel: t.channel },
      });
    }
  }
  if (i.hn) {
    for (const h of i.hn.items.slice(0, 5)) {
      out.push({
        source: "hn", kind: "story", title: h.title, snippet: `${h.points} points on Hacker News`,
        url: h.hnUrl, observedAt: d(h.createdAt), meta: { points: h.points, link: h.url },
      });
    }
  }
  return out.slice(0, MAX_EVIDENCE);
}

export type Ref = EvidenceDraft & { ref: string };

export function assignRefs(items: EvidenceDraft[]): Ref[] {
  return items.map((e, idx) => ({ ...e, ref: `E${idx + 1}` }));
}

/** Pick the 40 most useful items for Gemini: keep source diversity, then recency. */
export function selectForGemini(items: Ref[], limit = MAX_FOR_GEMINI): Ref[] {
  if (items.length <= limit) return items;
  const rank = (e: Ref) => {
    const base = { jobs: 4, blog: 4, youtube: 3, hn: 3, github: e.kind === "infra" ? 3 : e.kind === "languages" ? 5 : 2 }[e.source] ?? 1;
    const age = e.observedAt ? (Date.now() - e.observedAt.getTime()) / 86_400_000 : 365;
    return base * 100 - Math.min(age, 365) / 4;
  };
  return [...items].sort((a, b) => rank(b) - rank(a)).slice(0, limit).sort((a, b) => Number(a.ref.slice(1)) - Number(b.ref.slice(1)));
}
