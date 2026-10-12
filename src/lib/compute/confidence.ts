import type { SourceStatus } from "@/db/schema";

export type ConfidenceInput = {
  githubMatch: "high" | "medium" | "low" | null;
  activeRepos: number;
  reposScanned: number;
  jobPosts: number;
  blogPosts: number;
  talks: number;
  hnItems: number;
  /** a job board (Greenhouse / Lever / Ashby) was found */
  jobsFound?: boolean;
  /** commits in the last 30 days (bots removed) */
  commits30?: number;
  sourceStatus: Record<string, SourceStatus>;
};

export type ConfidenceResult = { level: "high" | "medium" | "low"; reason: string };

/** Confidence in how well we understand this company's engineering, in code. */
export function computeConfidence(i: ConfidenceInput): ConfidenceResult {
  const nonCode = i.jobPosts + i.blogPosts + i.talks + i.hnItems;
  const failed = Object.entries(i.sourceStatus).filter(([, s]) => s.state === "failed").map(([k]) => k);
  const staleNote = failed.length ? ` ${failed.join(", ")} failed this run, so last week's data is shown for ${failed.length > 1 ? "them" : "it"}.` : "";

  if (!i.githubMatch || i.activeRepos === 0) {
    const bits = [
      i.jobPosts ? `${i.jobPosts} job post${i.jobPosts === 1 ? "" : "s"}` : null,
      i.blogPosts ? `${i.blogPosts} blog post${i.blogPosts === 1 ? "" : "s"}` : null,
      i.talks ? `${i.talks} talk${i.talks === 1 ? "" : "s"}` : null,
    ].filter(Boolean);
    const lead = !i.githubMatch ? "No public GitHub org found" : "No active public repositories";
    return {
      level: "low",
      reason: `${lead}; based on ${bits.length ? bits.join(" + ") : "very little public data"}.${staleNote}`,
    };
  }
  if (i.githubMatch === "low") {
    return { level: "low", reason: `GitHub org match is a fuzzy guess; confirm it in Sources & matching.${staleNote}` };
  }
  const strongCode = i.githubMatch === "high" && i.activeRepos >= 5 && i.reposScanned >= 3;
  // missing sources or a near-silent GitHub org cap confidence below High
  const noBoard = i.jobsFound === false;
  const quiet = (i.commits30 ?? Infinity) < 20;
  if (noBoard && (i.commits30 ?? Infinity) === 0) {
    return { level: "low", reason: `No job board found and no commits in the last 30 days; ${i.activeRepos} active repos but nothing recent to go on.${staleNote}` };
  }
  if (strongCode && nonCode >= 3 && failed.length === 0 && !noBoard && !quiet) {
    return { level: "high", reason: `Domain-matched GitHub org with ${i.activeRepos} active repos, plus ${nonCode} corroborating signals.` };
  }
  if (strongCode || i.githubMatch === "medium" || nonCode >= 3) {
    return {
      level: "medium",
      reason: `${i.githubMatch === "high" ? "Domain-matched" : "Name-matched"} GitHub org, ${i.activeRepos} active repos, ${nonCode} other signals.${noBoard ? " No job board found." : ""}${quiet ? " Few recent commits." : ""}${staleNote}`,
    };
  }
  return { level: "low", reason: `Thin public footprint: ${i.activeRepos} active repos and ${nonCode} other signals.${staleNote}` };
}
