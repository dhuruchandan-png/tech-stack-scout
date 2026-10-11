import type { RepoInfo } from "@/lib/types";

export const NOW = Date.UTC(2026, 9, 12, 6, 0, 0); // Mon 12 Oct 2026
const iso = (daysAgo: number) => new Date(NOW - daysAgo * 86_400_000).toISOString();

export function repo(p: Partial<RepoInfo> & { name: string }): RepoInfo {
  return {
    url: `https://github.com/acme/${p.name}`, isFork: false, isArchived: false, pushedAt: iso(2), stars: 0, description: null,
    primaryLanguage: null, languages: [], topics: [], commits30: 0, commits90: 0, lastReleaseAt: null, defaultBranch: "main", ...p,
  };
}
export const daysAgoIso = iso;
