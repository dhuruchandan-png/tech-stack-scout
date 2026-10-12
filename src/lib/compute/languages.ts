import type { LanguageShare } from "@/db/schema";
import type { RepoInfo } from "@/lib/types";
import { DAY } from "@/lib/util";
import { isDocsRepo } from "./repos";

/** GitHub linguist colours for the languages devs recognise at a glance. */
export const LANG_COLORS: Record<string, string> = {
  Go: "#00ADD8", TypeScript: "#3178C6", JavaScript: "#F1E05A", Python: "#3572A5", Java: "#B07219",
  Kotlin: "#A97BFF", Ruby: "#701516", Rust: "#DEA584", "C++": "#F34B7D", C: "#555555", "C#": "#178600",
  PHP: "#4F5D95", Swift: "#F05138", Scala: "#C22D40", Elixir: "#6E4A7E", Dart: "#00B4AB", Haskell: "#5E5086",
  Clojure: "#DB5855", Lua: "#000080", Vue: "#41B883", Svelte: "#FF3E00", "Objective-C": "#438EFF", Other: "#5B6878",
};
export const langColor = (name: string, fromApi?: string | null) => fromApi || LANG_COLORS[name] || "#8C9AA9";

/**
 * Markup, docs, data and config formats are not "what they write". They are excluded from Q1 percentages.
 * HCL and Dockerfile stay visible as Q2 infra signals (detected from file names), not as languages.
 */
export const NOT_A_LANGUAGE = new Set([
  "MDX", "Markdown", "HTML", "CSS", "SCSS", "Sass", "Less", "Jupyter Notebook", "Jupyter", "TeX", "Roff", "Makefile", "Dockerfile",
  "HCL", "YAML", "JSON", "Shell", "PowerShell", "Batchfile", "Pkl", "Nix", "Starlark", "Smarty", "Mustache", "Procfile",
  "Handlebars", "Liquid", "Jinja", "Nunjucks", "XSLT", "Gherkin", "CMake", "Vim Script", "Vim script", "Emacs Lisp", "TOML", "Rich Text Format", "Inno Setup", "Perl 6",
].map((s) => s));

export function isActiveRepo(r: RepoInfo, now = Date.now()): boolean {
  if (r.isFork || r.isArchived || !r.pushedAt) return false;
  return now - new Date(r.pushedAt).getTime() <= 365 * DAY;
}

/** Active, non-fork repos that are docs / website / example repos. Shown as "N docs/example repos excluded". */
export function docsReposExcluded(repos: RepoInfo[], now = Date.now()): number {
  return repos.filter((r) => isActiveRepo(r, now) && isDocsRepo(r.name)).length;
}

/**
 * Q1: sum language bytes over active, non-fork, non-archived repos pushed in the last 12 months,
 * skipping docs/example repos and anything that is not a programming language. Shares sorted descending.
 */
export function computeLanguages(repos: RepoInfo[], now = Date.now()): LanguageShare[] {
  const totals = new Map<string, { bytes: number; color: string | null; repos: number }>();
  for (const r of repos) {
    if (!isActiveRepo(r, now) || isDocsRepo(r.name)) continue;
    for (const l of r.languages) {
      if (NOT_A_LANGUAGE.has(l.name) || l.size <= 0) continue;
      const t = totals.get(l.name) ?? { bytes: 0, color: l.color, repos: 0 };
      t.bytes += l.size;
      t.repos += 1;
      totals.set(l.name, t);
    }
  }
  const sum = [...totals.values()].reduce((s, t) => s + t.bytes, 0);
  if (sum === 0) return [];
  return [...totals.entries()]
    .map(([name, t]) => ({ name, color: langColor(name, t.color), bytes: t.bytes, share: t.bytes / sum, repoCount: t.repos }))
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
