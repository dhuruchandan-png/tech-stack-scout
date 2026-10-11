import type { LanguageShare } from "@/db/schema";
import type { RepoInfo } from "@/lib/types";
import { DAY } from "@/lib/util";

/** GitHub linguist colours for the languages devs recognise at a glance. */
export const LANG_COLORS: Record<string, string> = {
  Go: "#00ADD8", TypeScript: "#3178C6", JavaScript: "#F1E05A", Python: "#3572A5", Java: "#B07219",
  Kotlin: "#A97BFF", Ruby: "#701516", Rust: "#DEA584", "C++": "#F34B7D", C: "#555555", "C#": "#178600",
  PHP: "#4F5D95", Swift: "#F05138", Scala: "#C22D40", Elixir: "#6E4A7E", Shell: "#89E051",
  HCL: "#844FBA", Dart: "#00B4AB", Haskell: "#5E5086", Clojure: "#DB5855", Lua: "#000080",
  HTML: "#E34C26", CSS: "#663399", Vue: "#41B883", Svelte: "#FF3E00", "Objective-C": "#438EFF",
  Jupyter: "#DA5B0B", "Jupyter Notebook": "#DA5B0B", Dockerfile: "#384D54", Makefile: "#427819",
  Other: "#5B6878",
};
export const langColor = (name: string, fromApi?: string | null) => fromApi || LANG_COLORS[name] || "#8C9AA9";

/** Languages that are config / markup noise rather than "what they write". */
const NOISE = new Set(["Dockerfile", "Makefile", "Shell", "HTML", "CSS", "SCSS", "Jupyter Notebook", "Jupyter", "Batchfile", "PowerShell", "Smarty", "Procfile"]);

export function isActiveRepo(r: RepoInfo, now = Date.now()): boolean {
  if (r.isFork || r.isArchived || !r.pushedAt) return false;
  return now - new Date(r.pushedAt).getTime() <= 365 * DAY;
}

/**
 * Q1: sum language bytes over active, non-fork, non-archived repos pushed in the last 12 months.
 * Returns shares sorted descending. Noise languages are dropped unless nothing else exists.
 */
export function computeLanguages(repos: RepoInfo[], now = Date.now()): LanguageShare[] {
  const totals = new Map<string, { bytes: number; color: string | null }>();
  const active = repos.filter((r) => isActiveRepo(r, now));
  const add = (skipNoise: boolean) => {
    totals.clear();
    for (const r of active) {
      for (const l of r.languages) {
        if (skipNoise && NOISE.has(l.name)) continue;
        const t = totals.get(l.name) ?? { bytes: 0, color: l.color };
        t.bytes += l.size;
        totals.set(l.name, t);
      }
    }
  };
  add(true);
  if (totals.size === 0) add(false);
  const sum = [...totals.values()].reduce((s, t) => s + t.bytes, 0);
  if (sum === 0) return [];
  return [...totals.entries()]
    .map(([name, t]) => ({ name, color: langColor(name, t.color), bytes: t.bytes, share: t.bytes / sum }))
    .sort((a, b) => b.bytes - a.bytes);
}

/** Top 5 with the tail collapsed into "Other". */
export function topLanguages(all: LanguageShare[], n = 5): LanguageShare[] {
  if (all.length <= n) return all;
  const head = all.slice(0, n);
  const rest = all.slice(n);
  const bytes = rest.reduce((s, l) => s + l.bytes, 0);
  const share = rest.reduce((s, l) => s + l.share, 0);
  return [...head, { name: "Other", color: LANG_COLORS.Other, bytes, share }];
}

/** "Dominant" = the top 1–2 languages. The second only counts if it is a real contender (>= 60% of the top). */
export function dominantLanguages(all: LanguageShare[]): LanguageShare[] {
  if (all.length === 0) return [];
  const [a, b] = all;
  return b && b.share >= a.share * 0.6 ? [a, b] : [a];
}

export const pct = (share: number) => Math.round(share * 100);
