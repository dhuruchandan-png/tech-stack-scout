import type { GithubCandidate, SourceStatus } from "@/db/schema";

export type EvidenceSource = "github" | "jobs" | "blog" | "youtube" | "hn";

export type EvidenceDraft = {
  source: EvidenceSource;
  kind: string;
  title: string;
  snippet: string;
  url: string;
  observedAt: Date | null;
  meta?: Record<string, unknown>;
};

export type RepoInfo = {
  name: string;
  url: string;
  isFork: boolean;
  isArchived: boolean;
  pushedAt: string | null;
  stars: number;
  description: string | null;
  primaryLanguage: string | null;
  languages: { name: string; color: string | null; size: number }[];
  topics: string[];
  commits30: number;
  commits90: number;
  lastReleaseAt: string | null;
  defaultBranch: string | null;
};

export type GithubData = {
  org: string;
  orgUrl: string;
  avatarUrl?: string;
  repoTotal: number;
  repos: RepoInfo[];
  /** per-repo recursive tree paths (top 15 active repos) */
  trees: Record<string, string[]>;
  /** fetched file contents keyed by "repo:path" */
  files: Record<string, string>;
  /** 13 weekly commit totals, oldest -> newest */
  commitSeries: number[];
};

export type GithubMatch = {
  org: string | null;
  confidence: "high" | "medium" | "low" | null;
  candidates: GithubCandidate[];
};

export type JobPost = {
  id: string;
  title: string;
  department: string | null;
  location: string | null;
  url: string;
  updatedAt: string | null;
  text: string; // plain-text description (may be empty)
};

export type JobsData = {
  provider: "greenhouse" | "lever" | "ashby";
  slug: string;
  totalJobs: number;
  engineeringJobs: JobPost[];
};

export type BlogPost = {
  title: string;
  url: string;
  publishedAt: string | null;
  snippet: string;
};
export type BlogData = { feedUrl: string; posts: BlogPost[] };

export type Talk = { videoId: string; title: string; channel: string; publishedAt: string; url: string; description: string };
export type YoutubeData = { talks: Talk[] };

export type HnItem = { id: string; title: string; url: string; points: number; createdAt: string; hnUrl: string };
export type HnData = { items: HnItem[] };

export type SourceResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: "not_found" | "failed" | "skipped"; error?: string };

export type { SourceStatus };
