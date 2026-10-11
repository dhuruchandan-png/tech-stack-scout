import { domainRoot, slugify } from "@/lib/domain";
import { ENGINEERING_DEPT, ENGINEERING_TITLE } from "@/lib/compute/techdict";
import { fetchRetry } from "@/lib/http";
import type { JobPost, JobsData, SourceResult } from "@/lib/types";
import { stripHtml } from "@/lib/util";

type Provider = JobsData["provider"];

async function json<T>(url: string): Promise<T | null> {
  try {
    const res = await fetchRetry(url, { retries: 1, timeoutMs: 12_000, headers: { "User-Agent": "tech-stack-scout" } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

const isEng = (title: string, dept: string | null) => ENGINEERING_TITLE.test(title) || (!!dept && ENGINEERING_DEPT.test(dept));

async function greenhouse(slug: string): Promise<JobsData | null> {
  type GH = { jobs: { id: number; title: string; absolute_url: string; updated_at?: string; location?: { name?: string }; departments?: { name: string }[]; content?: string }[] };
  const j = await json<GH>(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`);
  if (!j?.jobs) return null;
  const posts: JobPost[] = j.jobs.map((x) => ({
    id: String(x.id), title: x.title, url: x.absolute_url, updatedAt: x.updated_at ?? null,
    department: x.departments?.[0]?.name ?? null, location: x.location?.name ?? null,
    // Greenhouse returns HTML-escaped HTML inside `content`
    text: stripHtml(decodeEntities(x.content ?? "")),
  }));
  return pack("greenhouse", slug, posts);
}

async function lever(slug: string): Promise<JobsData | null> {
  type LV = { id: string; text: string; hostedUrl: string; createdAt?: number; categories?: { team?: string; department?: string; location?: string }; descriptionPlain?: string; lists?: { text: string; content: string }[] }[];
  const j = await json<LV>(`https://api.lever.co/v0/postings/${slug}?mode=json`);
  if (!Array.isArray(j)) return null;
  const posts: JobPost[] = j.map((x) => ({
    id: x.id, title: x.text, url: x.hostedUrl, updatedAt: x.createdAt ? new Date(x.createdAt).toISOString() : null,
    department: x.categories?.department ?? x.categories?.team ?? null, location: x.categories?.location ?? null,
    text: [x.descriptionPlain ?? "", ...(x.lists ?? []).map((l) => `${l.text} ${stripHtml(l.content)}`)].join(" "),
  }));
  return pack("lever", slug, posts);
}

async function ashby(slug: string): Promise<JobsData | null> {
  type AB = { jobs: { id: string; title: string; jobUrl: string; publishedAt?: string; department?: string; team?: string; location?: string; descriptionPlain?: string; descriptionHtml?: string }[] };
  const j = await json<AB>(`https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=false`);
  if (!j?.jobs) return null;
  const posts: JobPost[] = j.jobs.map((x) => ({
    id: x.id, title: x.title, url: x.jobUrl, updatedAt: x.publishedAt ?? null,
    department: x.department ?? x.team ?? null, location: x.location ?? null,
    text: x.descriptionPlain ?? stripHtml(x.descriptionHtml ?? ""),
  }));
  return pack("ashby", slug, posts);
}

function decodeEntities(s: string) {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function pack(provider: Provider, slug: string, posts: JobPost[]): JobsData {
  return { provider, slug, totalJobs: posts.length, engineeringJobs: posts.filter((p) => isEng(p.title, p.department)) };
}

const FETCHERS: Record<Provider, (slug: string) => Promise<JobsData | null>> = { greenhouse, lever, ashby };

export function slugCandidates(name: string, domain: string, override?: string | null): string[] {
  const root = domainRoot(domain);
  const set = new Set<string>();
  for (const s of [override, slugify(name).replace(/-/g, ""), slugify(name), root]) if (s) set.add(s.toLowerCase());
  return [...set];
}

/** Step 5 (jobs): override first, otherwise try Greenhouse, Lever, Ashby with name/domain slugs. Never guesses beyond a 200 response. */
export async function fetchJobs(opts: {
  name: string; domain: string; provider?: string | null; slug?: string | null;
}): Promise<SourceResult<JobsData>> {
  const slugs = slugCandidates(opts.name, opts.domain, opts.slug);
  const providers: Provider[] = opts.provider && opts.provider in FETCHERS ? [opts.provider as Provider] : ["greenhouse", "lever", "ashby"];
  try {
    for (const slug of slugs) {
      for (const p of providers) {
        const d = await FETCHERS[p](slug);
        if (d && d.totalJobs > 0) return { ok: true, data: d };
      }
    }
    return { ok: false, status: "not_found" };
  } catch (e) {
    return { ok: false, status: "failed", error: (e as Error).message };
  }
}
