import type { ActivityResult } from "@/db/schema";
import type { RepoInfo } from "@/lib/types";
import { DAY } from "@/lib/util";
import { isActiveRepo } from "./languages";

/**
 * Activity level thresholds (documented in the README):
 *   High    commits30 >= 150  OR  (commits30 >= 60 AND reposPushed30 >= 8)
 *   Medium  commits30 >= 30   OR  reposPushed30 >= 4
 *   Low     commits30 >= 1    OR  any hiring / blog / talk signal
 *   Dormant nothing at all in 30 days
 */
export function activityLevel(a: Pick<ActivityResult, "commits30" | "reposPushed30" | "openRoles" | "blogPosts90" | "talks12mo" | "releases90">): ActivityResult["level"] {
  if (a.commits30 >= 150 || (a.commits30 >= 60 && a.reposPushed30 >= 8)) return "high";
  if (a.commits30 >= 30 || a.reposPushed30 >= 4) return "medium";
  if (a.commits30 >= 1 || a.openRoles > 0 || a.blogPosts90 > 0 || a.talks12mo > 0 || a.releases90 > 0) return "low";
  return "dormant";
}

export function computeActivity(args: {
  repos: RepoInfo[];
  openRoles: number;
  blogPosts90: number;
  talks12mo: number;
  previousCommits30?: number | null;
  repoTotal?: number;
  now?: number;
}): ActivityResult {
  const now = args.now ?? Date.now();
  const active = args.repos.filter((r) => !r.isFork && !r.isArchived);
  const commits30 = active.reduce((s, r) => s + r.commits30, 0);
  const commits90 = active.reduce((s, r) => s + r.commits90, 0);
  const reposPushed30 = active.filter((r) => r.pushedAt && now - new Date(r.pushedAt).getTime() <= 30 * DAY).length;
  const releases90 = active.filter((r) => r.lastReleaseAt && now - new Date(r.lastReleaseAt).getTime() <= 90 * DAY).length;
  const base = { commits30, commits90, reposPushed30, releases90, openRoles: args.openRoles, blogPosts90: args.blogPosts90, talks12mo: args.talks12mo };
  const prev = args.previousCommits30;
  const wowChangePct = prev && prev > 0 ? Math.round(((commits30 - prev) / prev) * 100) : null;
  const activeRepos = args.repos.filter((r) => isActiveRepo(r, now)).length;
  return { ...base, activeRepos, repoTotal: args.repoTotal, level: activityLevel(base), wowChangePct };
}
