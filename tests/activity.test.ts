import { describe, expect, it } from "vitest";
import { activityLevel, computeActivity } from "@/lib/compute/activity";
import { NOW, daysAgoIso, repo } from "./helpers";

const z = { reposPushed30: 0, openRoles: 0, blogPosts90: 0, talks12mo: 0, releases90: 0 };

describe("activityLevel thresholds", () => {
  it("High: 150+ commits, or 60+ commits across 8+ repos", () => {
    expect(activityLevel({ ...z, commits30: 150 })).toBe("high");
    expect(activityLevel({ ...z, commits30: 60, reposPushed30: 8 })).toBe("high");
    expect(activityLevel({ ...z, commits30: 59, reposPushed30: 8 })).toBe("medium");
  });
  it("Medium: 30+ commits or 4+ repos pushed", () => {
    expect(activityLevel({ ...z, commits30: 30 })).toBe("medium");
    expect(activityLevel({ ...z, commits30: 0, reposPushed30: 4 })).toBe("medium");
  });
  it("Low: any commit or any hiring / blog / talk / release signal", () => {
    expect(activityLevel({ ...z, commits30: 1 })).toBe("low");
    expect(activityLevel({ ...z, commits30: 0, openRoles: 3 })).toBe("low");
    expect(activityLevel({ ...z, commits30: 0, talks12mo: 1 })).toBe("low");
  });
  it("Dormant: nothing at all", () => expect(activityLevel({ ...z, commits30: 0 })).toBe("dormant"));
});

describe("computeActivity", () => {
  const repos = [
    repo({ name: "a", commits30: 10, commits60: 25, commits90: 30, lastReleaseAt: daysAgoIso(20) }),
    repo({ name: "b", commits30: 20, commits60: 45, commits90: 50, lastReleaseAt: daysAgoIso(200) }),
    repo({ name: "fork", isFork: true, commits30: 1000, commits60: 1000, commits90: 1000 }),
    repo({ name: "stale", pushedAt: daysAgoIso(90), commits30: 0, commits60: 0, commits90: 5 }),
  ];
  const a = computeActivity({ repos, openRoles: 12, totalRoles: 40, blogPosts90: 4, talks12mo: 2, now: NOW });

  it("sums only non-fork repos", () => {
    expect(a.commits30).toBe(30);
    expect(a.commits90).toBe(85);
  });
  it("compares the latest 30 days with the 30 days before (days 31-60), not an overlapping snapshot", () => {
    expect(a.commitsPrev30).toBe(40); // (25+45) - (10+20)
    expect(a.wowChangePct).toBe(-25);
  });
  it("removes the estimated bot share from every commit count", () => {
    const b = computeActivity({ repos, openRoles: 0, blogPosts90: 0, talks12mo: 0, botShare: 0.5, now: NOW });
    expect(b.commits30).toBe(15);
    expect(b.commitsPrev30).toBe(20);
    expect(b.botShare).toBe(0.5);
  });
  it("counts repos pushed in 30 days, releases in 90 days and active repos", () => {
    expect(a.reposPushed30).toBe(2);
    expect(a.releases90).toBe(1);
    expect(a.activeRepos).toBe(3);
  });
  it("keeps engineering roles next to the total so the UI can say 'N of M'", () => {
    expect(a.openRoles).toBe(12);
    expect(a.totalRoles).toBe(40);
    expect(a.blogPosts90).toBe(4);
    expect(a.talks12mo).toBe(2);
  });
  it("flags a watchlist company whose public repos are mostly SDKs", () => {
    const sdk = ["stripe-python", "stripe-node", "stripe-go", "stripe-ruby", "stripe-java"].map((name) => repo({ name }));
    expect(computeActivity({ repos: [...sdk, repo({ name: "api" })], openRoles: 0, blogPosts90: 0, talks12mo: 0, now: NOW }).sdkHeavy).toBe(true);
    expect(computeActivity({ repos: [repo({ name: "api" }), repo({ name: "web" }), repo({ name: "cli" }), repo({ name: "core" }), repo({ name: "sdk-go" })], openRoles: 0, blogPosts90: 0, talks12mo: 0, now: NOW }).sdkHeavy).toBe(false);
  });
  it("counts docs/example repos separately", () => {
    expect(computeActivity({ repos: [repo({ name: "docs" }), repo({ name: "examples" }), repo({ name: "engine" })], openRoles: 0, blogPosts90: 0, talks12mo: 0, now: NOW }).docsRepos).toBe(2);
  });
  it("knows when commit counts were not fetched (large-org fallback)", () => {
    const light = computeActivity({ repos: [repo({ name: "x", commitsKnown: false })], openRoles: 0, blogPosts90: 0, talks12mo: 0, now: NOW });
    expect(light.commitsKnown).toBe(false);
    expect(a.commitsKnown).toBe(true);
  });
});
