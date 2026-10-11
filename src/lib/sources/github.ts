import type { GithubCandidate } from "@/db/schema";
import { domainRoot, sameDomain } from "@/lib/domain";
import { fetchRetry, getJson } from "@/lib/http";
import { selectFilesToFetch } from "@/lib/compute/infra";
import { isActiveRepo } from "@/lib/compute/languages";
import type { GithubData, GithubMatch, RepoInfo } from "@/lib/types";
import { DAY, mapLimit } from "@/lib/util";

const API = "https://api.github.com";

export class RateLimitError extends Error {
  constructor(public resetAt?: string) {
    super(`GitHub rate limit low${resetAt ? `, resets ${resetAt}` : ""}`);
  }
}

function headers(): HeadersInit {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "tech-stack-scout",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

function checkLimit(res: Response) {
  const rem = res.headers.get("x-ratelimit-remaining");
  if (rem !== null && Number(rem) < 25) {
    const reset = res.headers.get("x-ratelimit-reset");
    throw new RateLimitError(reset ? new Date(Number(reset) * 1000).toISOString() : undefined);
  }
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

type OrgInfo = {
  login: string; name?: string | null; blog?: string | null; description?: string | null;
  avatar_url?: string; public_repos?: number; type?: string;
};

async function orgInfo(login: string): Promise<OrgInfo | null> {
  for (const path of [`/orgs/${login}`, `/users/${login}`]) {
    const res = await fetchRetry(`${API}${path}`, { headers: headers(), retries: 1 });
    if (res.ok) return (await res.json()) as OrgInfo;
    if (res.status !== 404) checkLimit(res);
  }
  return null;
}

/** Step 4: find the GitHub org for a company. Auto-selects only high/medium matches; low stays a candidate. */
export async function discoverGithubOrg(name: string, domain: string): Promise<GithubMatch> {
  const root = domainRoot(domain);
  const logins = new Set<string>([root, norm(name)]);
  try {
    const res = await fetchRetry(`${API}/search/users?q=${encodeURIComponent(`${name} type:org`)}&per_page=5`, { headers: headers(), retries: 1 });
    if (res.ok) {
      const j = (await res.json()) as { items?: { login: string }[] };
      for (const i of j.items ?? []) logins.add(i.login);
    } else checkLimit(res);
  } catch (e) {
    if (e instanceof RateLimitError) throw e;
  }

  const infos = await mapLimit([...logins].slice(0, 7), 3, async (l) => orgInfo(l));
  const candidates: GithubCandidate[] = [];
  const seen = new Set<string>();
  for (const o of infos) {
    if (!o || seen.has(o.login.toLowerCase())) continue;
    seen.add(o.login.toLowerCase());
    let confidence: GithubCandidate["confidence"] = "low";
    if (sameDomain(o.blog, domain)) confidence = "high";
    else if (norm(o.login) === norm(root) || (o.name && norm(o.name) === norm(name)) || norm(o.login) === norm(name)) confidence = "medium";
    candidates.push({
      login: o.login, avatarUrl: o.avatar_url, description: o.description ?? undefined,
      website: o.blog ?? undefined, repoCount: o.public_repos, confidence,
    });
  }
  const rank = { high: 3, medium: 2, low: 1 } as const;
  candidates.sort((a, b) => rank[b.confidence] - rank[a.confidence] || (b.repoCount ?? 0) - (a.repoCount ?? 0));
  const best = candidates[0];
  if (best && best.confidence !== "low") return { org: best.login, confidence: best.confidence, candidates };
  return { org: null, confidence: null, candidates };
}

/* ---------------- GraphQL ---------------- */

async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetchRetry(`${API}/graphql`, {
    method: "POST",
    headers: { ...(headers() as Record<string, string>), "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    timeoutMs: 25_000,
  });
  if (!res.ok) throw new Error(`GitHub GraphQL ${res.status}`);
  const j = (await res.json()) as { data?: T; errors?: { message: string; type?: string }[] };
  if (j.errors?.length && !j.data) throw new Error(j.errors.map((e) => e.message).join("; "));
  return j.data as T;
}

const REPOS_QUERY = `
query($login:String!, $s30:GitTimestamp!, $s90:GitTimestamp!) {
  rateLimit { remaining resetAt }
  repositoryOwner(login:$login) {
    login avatarUrl url
    repositories(first:100, privacy:PUBLIC, orderBy:{field:PUSHED_AT, direction:DESC}) {
      totalCount
      nodes {
        name url description isFork isArchived pushedAt stargazerCount
        primaryLanguage { name }
        languages(first:10, orderBy:{field:SIZE, direction:DESC}) { edges { size node { name color } } }
        repositoryTopics(first:8) { nodes { topic { name } } }
        latestRelease { publishedAt }
        defaultBranchRef { name target { ... on Commit {
          h30: history(since:$s30) { totalCount }
          h90: history(since:$s90) { totalCount }
        } } }
      }
    }
  }
}`;

type GqlRepo = {
  name: string; url: string; description: string | null; isFork: boolean; isArchived: boolean; pushedAt: string | null;
  stargazerCount: number; primaryLanguage: { name: string } | null;
  languages: { edges: { size: number; node: { name: string; color: string | null } }[] };
  repositoryTopics: { nodes: { topic: { name: string } }[] };
  latestRelease: { publishedAt: string } | null;
  defaultBranchRef: { name: string; target: { h30?: { totalCount: number }; h90?: { totalCount: number } } | null } | null;
};

function toRepo(r: GqlRepo): RepoInfo {
  return {
    name: r.name, url: r.url, description: r.description, isFork: r.isFork, isArchived: r.isArchived,
    pushedAt: r.pushedAt, stars: r.stargazerCount, primaryLanguage: r.primaryLanguage?.name ?? null,
    languages: r.languages.edges.map((e) => ({ name: e.node.name, color: e.node.color, size: e.size })),
    topics: r.repositoryTopics.nodes.map((n) => n.topic.name),
    commits30: r.defaultBranchRef?.target?.h30?.totalCount ?? 0,
    commits90: r.defaultBranchRef?.target?.h90?.totalCount ?? 0,
    lastReleaseAt: r.latestRelease?.publishedAt ?? null,
    defaultBranch: r.defaultBranchRef?.name ?? null,
  };
}

/** 13 weekly commit totals (oldest -> newest) across the most recently pushed active repos. */
async function weeklySeries(login: string, repos: RepoInfo[], now: number): Promise<number[]> {
  const top = repos.filter((r) => isActiveRepo(r, now) && r.defaultBranch).slice(0, 20);
  if (top.length === 0) return new Array(13).fill(0);
  const iso = (t: number) => new Date(t).toISOString();
  const weekFields = Array.from({ length: 13 }, (_, i) => {
    const since = iso(now - (13 - i) * 7 * DAY);
    const until = iso(now - (12 - i) * 7 * DAY);
    return `w${i}: history(since:"${since}", until:"${until}") { totalCount }`;
  }).join(" ");
  const parts = top.map(
    (r, idx) => `r${idx}: repository(owner:${JSON.stringify(login)}, name:${JSON.stringify(r.name)}) { defaultBranchRef { target { ... on Commit { ${weekFields} } } } }`,
  );
  const data = await gql<Record<string, { defaultBranchRef?: { target?: Record<string, { totalCount: number }> } } | null>>(`query { ${parts.join("\n")} }`);
  const series = new Array(13).fill(0) as number[];
  for (const v of Object.values(data ?? {})) {
    const t = v?.defaultBranchRef?.target;
    if (!t) continue;
    for (let i = 0; i < 13; i++) series[i] += t[`w${i}`]?.totalCount ?? 0;
  }
  return series;
}

/* ---------------- REST: trees + files ---------------- */

async function fetchTree(owner: string, repo: string, branch: string): Promise<string[]> {
  const res = await fetchRetry(`${API}/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`, { headers: headers(), retries: 1 });
  if (!res.ok) {
    if (res.status !== 404 && res.status !== 409) checkLimit(res);
    return [];
  }
  checkLimit(res);
  const j = (await res.json()) as { tree?: { path: string; type: string }[] };
  return (j.tree ?? []).filter((t) => t.type === "blob").map((t) => t.path);
}

async function fetchRaw(owner: string, repo: string, branch: string, path: string): Promise<string> {
  try {
    const res = await fetchRetry(`https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch)}/${path}`, { retries: 1, timeoutMs: 8000 });
    if (!res.ok) return "";
    const t = await res.text();
    return t.slice(0, 40_000);
  } catch {
    return "";
  }
}

/** Step 5 (GitHub): repos, language bytes, commit counts, 13-week series, and infra files for the 15 most recent active repos. */
export async function fetchGithub(org: string, now = Date.now()): Promise<GithubData> {
  const data = await gql<{
    rateLimit: { remaining: number; resetAt: string };
    repositoryOwner: { login: string; avatarUrl: string; url: string; repositories: { totalCount: number; nodes: (GqlRepo | null)[] } } | null;
  }>(REPOS_QUERY, { login: org, s30: new Date(now - 30 * DAY).toISOString(), s90: new Date(now - 90 * DAY).toISOString() });

  if (data.rateLimit.remaining < 50) throw new RateLimitError(data.rateLimit.resetAt);
  const owner = data.repositoryOwner;
  if (!owner) throw new Error(`GitHub owner "${org}" not found`);

  const repos = owner.repositories.nodes.filter((n): n is GqlRepo => !!n).map(toRepo);
  const activeTop = repos.filter((r) => isActiveRepo(r, now) && r.defaultBranch).slice(0, 15);

  const trees: Record<string, string[]> = {};
  const files: Record<string, string> = {};
  await mapLimit(activeTop, 4, async (r) => {
    const paths = await fetchTree(owner.login, r.name, r.defaultBranch!);
    if (!paths.length) return;
    trees[r.name] = paths;
    const wanted = selectFilesToFetch(paths);
    await mapLimit(wanted, 4, async (p) => {
      const c = await fetchRaw(owner.login, r.name, r.defaultBranch!, p);
      if (c) files[`${r.name}:${p}`] = c;
    });
  });

  let commitSeries: number[];
  try {
    commitSeries = await weeklySeries(owner.login, repos, now);
  } catch {
    commitSeries = new Array(13).fill(0); // series is cosmetic; never fail the run for it
  }

  return {
    org: owner.login, orgUrl: owner.url, avatarUrl: owner.avatarUrl,
    repoTotal: owner.repositories.totalCount, repos, trees, files, commitSeries,
  };
}

export { getJson };
