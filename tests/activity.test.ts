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
    repo({ name: "a", commits30: 10, commits90: 30, lastReleaseAt: daysAgoIso(20) }),
    repo({ name: "b", commits30: 20, commits90: 40, lastReleaseAt: daysAgoIso(200) }),
    repo({ name: "fork", isFork: true, commits30: 1000, commits90: 1000 }),
    repo({ name: "stale", pushedAt: daysAgoIso(90), commits30: 0, commits90: 5 }),
  ];
  const a = computeActivity({ repos, openRoles: 12, blogPosts90: 4, talks12mo: 2, previousCommits30: 20, now: NOW });

  it("sums only non-fork repos", () => {
    expect(a.commits30).toBe(30);
    expect(a.commits90).toBe(75);
  });
  it("counts repos pushed in 30 days, releases in 90 days and active repos", () => {
    expect(a.reposPushed30).toBe(2);
    expect(a.releases90).toBe(1);
    expect(a.activeRepos).toBe(3);
  });
  it("computes the week-over-week change from the previous snapshot", () => expect(a.wowChangePct).toBe(50));
  it("has no change figure when there is no previous snapshot", () => {
    expect(computeActivity({ repos, openRoles: 0, blogPosts90: 0, talks12mo: 0, now: NOW }).wowChangePct).toBeNull();
  });
  it("passes the role, post and talk counts through", () => {
    expect(a.openRoles).toBe(12);
    expect(a.blogPosts90).toBe(4);
    expect(a.talks12mo).toBe(2);
  });
});
