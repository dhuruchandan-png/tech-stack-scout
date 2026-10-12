import type { ActivityResult } from "@/db/schema";
import type { RepoInfo } from "@/lib/types";
import { DAY } from "@/lib/util";
import { isActiveRepo } from "./languages";
import { isDocsRepo, isSdkRepo } from "./repos";

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
  totalRoles?: number;
  blogPosts90: number;
  talks12mo: number;
  /** estimated share (0-1) of commits made by bots; removed from every commit count */
  botShare?: number;
  repoTotal?: number;
  now?: number;
}): ActivityResult {
  const now = args.now ?? Date.now();
  const active = args.repos.filter((r) => !r.isFork && !r.isArchived);
  const factor = 1 - Math.min(Math.max(args.botShare ?? 0, 0), 0.95);
  const sum = (f: (r: RepoInfo) => number) => active.reduce((s, r) => s + f(r), 0);
  const raw30 = sum((r) => r.commits30);
  const raw60 = sum((r) => r.commits60 ?? 0);
  const raw90 = sum((r) => r.commits90);
  const commitsKnown = active.some((r) => r.commitsKnown !== false && (r.commits90 > 0 || r.commits60 != null));
  const commits30 = Math.round(raw30 * factor);
  const commits90 = Math.round(raw90 * factor);
  // the 30 days BEFORE the latest 30 (days 31-60), so two like-for-like rolling windows can be compared
  const commitsPrev30 = Math.round(Math.max(0, raw60 - raw30) * factor);
  const reposPushed30 = active.filter((r) => r.pushedAt && now - new Date(r.pushedAt).getTime() <= 30 * DAY).length;
  const releases90 = active.filter((r) => r.lastReleaseAt && now - new Date(r.lastReleaseAt).getTime() <= 90 * DAY).length;
  const activeRepos = args.repos.filter((r) => isActiveRepo(r, now)).length;
  const real = active.filter((r) => isActiveRepo(r, now) && !isDocsRepo(r.name));
  const sdkHeavy = real.length >= 5 && real.filter((r) => isSdkRepo(r.name)).length / real.length > 0.6;
  const base = { commits30, commits90, reposPushed30, releases90, openRoles: args.openRoles, blogPosts90: args.blogPosts90, talks12mo: args.talks12mo };
  const wowChangePct = commitsPrev30 > 0 ? Math.round(((commits30 - commitsPrev30) / commitsPrev30) * 100) : null;
  return {
    ...base, activeRepos, repoTotal: args.repoTotal, totalRoles: args.totalRoles, commitsPrev30, commitsKnown,
    botShare: args.botShare ? Math.round(args.botShare * 100) / 100 : 0, docsRepos: args.repos.filter((r) => isActiveRepo(r, now) && isDocsRepo(r.name)).length,
    sdkHeavy, level: activityLevel(base), wowChangePct,
  };
}
