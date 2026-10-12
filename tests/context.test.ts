import { describe, expect, it } from "vitest";
import { gateByConfidence, LOW_CONFIDENCE_REASON, makeCheckContext } from "@/lib/ai/context";
import { buildEvidence, cloudSummary } from "@/lib/compute/evidence";
import type { GithubData, JobsData } from "@/lib/types";

describe("gateByConfidence: a Low-confidence account can never show Verified", () => {
  it("turns verified into needs_review with the reason first", () => {
    const g = gateByConfidence("verified", [], "low");
    expect(g.status).toBe("needs_review");
    expect(g.reasons[0]).toBe(LOW_CONFIDENCE_REASON);
  });
  it("leaves medium/high confidence and already-failing checks alone", () => {
    expect(gateByConfidence("verified", [], "high")).toEqual({ status: "verified", reasons: [] });
    expect(gateByConfidence("verified", [], "medium").status).toBe("verified");
    expect(gateByConfidence("needs_review", ["x"], "low")).toEqual({ status: "needs_review", reasons: ["x"] });
  });
});

describe("makeCheckContext", () => {
  it("tags each evidence item with its topic and keeps title+snippet separate from the url", () => {
    const c = makeCheckContext("Acme", [
      { ref: "E1", source: "github", kind: "activity", title: "Build activity", snippet: "160 commits in 30 days", url: "https://github.com/acme" },
      { ref: "E2", source: "jobs", kind: "job", title: "Platform Engineer", snippet: "Kubernetes", url: "https://x.io/j/1" },
    ], "facts");
    expect(c.evidenceTopic).toEqual({ E1: "activity", E2: "jobs" });
    expect(c.evidenceCore?.E1).toBe("Build activity 160 commits in 30 days");
    expect(c.evidenceText.E1).toContain("https://github.com/acme");
    expect([...c.validRefs]).toEqual(["E1", "E2"]);
  });
});

describe("computed evidence items for Q1/Q2/Q3", () => {
  const github: GithubData = { org: "acme", orgUrl: "https://github.com/acme", repoTotal: 3, repos: [], trees: {}, files: {}, commitSeries: [] };
  const job = (n: number) => ({ id: `${n}`, title: `Platform Engineer ${n}`, department: null, location: null, url: `https://boards.greenhouse.io/acme/jobs/${n}`, updatedAt: null, text: "Kubernetes" });
  const jobs: JobsData = { provider: "greenhouse", slug: "acme", totalJobs: 60, engineeringJobs: [job(1), job(2)] };
  const activity = { commits30: 1225, commits90: 3100, reposPushed30: 49, releases90: 3, openRoles: 2, totalRoles: 60, blogPosts90: 0, talks12mo: 0, activeRepos: 61, level: "high" as const, wowChangePct: null, commitsKnown: true };
  const infra = {
    items: [], clouds: ["AWS"], categories: {}, reposScanned: 3,
    cloudStrength: [{ cloud: "AWS", group: "runs" as const, strength: "strong" as const, signals: 3, origins: 2 }, { cloud: "GCP", group: "integrates" as const, strength: "weak" as const, signals: 1, origins: 1 }],
  };
  const items = buildEvidence({ github, jobs, activity, infra, microservices: { level: "medium", reasons: ["2 deployable service repos"] }, languages: [{ name: "Go", color: "#0", bytes: 1, share: 1 }], docsExcluded: 4 });

  it("an activity item gives Gemini the exact numbers to cite", () => {
    const a = items.find((i) => i.kind === "activity")!;
    expect(a.snippet).toContain("1,225 commits in 30 days across 49 repos pushed");
  });
  it("a jobs summary shows engineering roles out of the total", () => {
    expect(items.find((i) => i.kind === "jobsummary")!.snippet).toContain("2 open engineering roles (of 60 total roles)");
    expect(items.find((i) => i.kind === "jobsummary")!.url).toBe("https://boards.greenhouse.io/acme");
  });
  it("the cloud item splits runs-on from integrates-with, with strengths", () => {
    const s = cloudSummary(infra);
    expect(s).toContain("Runs on / deploys to: AWS (strong, 3 signals from 2 origins)");
    expect(s).toContain("Integrates with / supports: GCP (weak, 1 signal from 1 origin)");
  });
  it("the language item notes excluded docs repos, and a microservices item exists", () => {
    expect(items.find((i) => i.kind === "languages")!.snippet).toContain("4 docs/example repos excluded");
    expect(items.find((i) => i.kind === "microservices")!.title).toBe("Microservices signal: medium");
  });
});
