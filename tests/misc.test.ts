import { describe, expect, it } from "vitest";
import { computeConfidence, type ConfidenceInput } from "@/lib/compute/confidence";
import { callFirstScore } from "@/lib/compute/score";
import { buildRadar, ringFor } from "@/lib/compute/radar";
import { findTech } from "@/lib/compute/techdict";
import { costOf } from "@/lib/ai/gemini";
import { freshnessOf, weekOf } from "@/lib/util";
import { nextWeeklyRefresh } from "@/lib/safe";
import { judgeVideo } from "@/lib/sources/youtube";
import { isEngineeringRole } from "@/lib/compute/techdict";
import { keepHn } from "@/lib/sources/hn";
import { feedCandidates } from "@/lib/sources/blog";
import { slugCandidates } from "@/lib/sources/jobs";

const base: ConfidenceInput = { githubMatch: "high", activeRepos: 10, reposScanned: 8, jobPosts: 5, blogPosts: 2, talks: 1, hnItems: 0, sourceStatus: {} };

describe("computeConfidence", () => {
  it("high: domain-matched org, many active repos, corroborating signals", () => expect(computeConfidence(base).level).toBe("high"));
  it("medium when the org is only name-matched", () => expect(computeConfidence({ ...base, githubMatch: "medium" }).level).toBe("medium"));
  it("low with an honest reason when there is no GitHub org", () => {
    const c = computeConfidence({ ...base, githubMatch: null, activeRepos: 0, reposScanned: 0, jobPosts: 6, blogPosts: 0, talks: 2 });
    expect(c.level).toBe("low");
    expect(c.reason).toMatch(/No public GitHub org found/);
    expect(c.reason).toMatch(/6 job posts/);
  });
  it("low when the org exists but nothing is active", () => expect(computeConfidence({ ...base, activeRepos: 0 }).reason).toMatch(/No active public repositories/));
  it("drops to medium and says so when a source failed", () => {
    const c = computeConfidence({ ...base, sourceStatus: { github: { state: "failed" } } });
    expect(c.level).toBe("medium");
    expect(c.reason).toMatch(/github failed/);
  });
});

describe("callFirstScore", () => {
  const change = (text: string, sign: "+" | "-" | "~" = "+") => ({ sign, text });
  const input = { changes: [change("3 new roles mention Kubernetes"), change("New repo x")], activity: { level: "high" } as never, microservices: { level: "strong", reasons: [] } as never, clouds: ["AWS"], openerVerified: true, alreadyContacted: false };

  it("rewards fresh changes, activity, microservices, clouds and a verified opener", () => {
    const r = callFirstScore(input);
    expect(r.score).toBe(2 * 3 + 4 + 3 + 2 + 3);
    expect(r.reason).toBe("3 new roles mention Kubernetes");
  });
  it("penalises accounts already contacted", () => expect(callFirstScore({ ...input, alreadyContacted: true }).score).toBe(18 - 6));
  it("does not count 'first snapshot' or 'no material change' as news", () => {
    const r = callFirstScore({ ...input, changes: [change("First week tracked, no comparison yet.", "~"), change("No material change since last week.", "~")] });
    expect(r.score).toBe(4 + 3 + 2 + 3);
  });
});

describe("tech radar", () => {
  it("assigns rings by prevalence", () => {
    expect(ringFor(6, 10)).toBe("everywhere");
    expect(ringFor(3, 10)).toBe("common");
    expect(ringFor(1, 10)).toBe("emerging");
    expect(ringFor(1, 20)).toBe("rare");
    expect(ringFor(2, 50)).toBe("emerging");
    expect(ringFor(0, 0)).toBe("rare");
  });
  it("places tools in the right quadrant and counts accounts", () => {
    const mk = (name: string) => ({
      name, domain: `${name}.com`, languages: [{ name: "Go", share: 0.5 }, { name: "Perl", share: 0.01 }], clouds: ["AWS"],
      tools: [{ name: "Kubernetes", category: "orchestration" }, { name: "Vercel", category: "platform" }, { name: "AWS SDK", category: "sdk" }], dataTech: ["Kafka"],
    });
    const items = buildRadar([mk("a"), mk("b")]);
    const get = (n: string) => items.find((i) => i.name === n)!;
    expect(get("Go")).toMatchObject({ quadrant: "languages", count: 2, ring: "everywhere" });
    expect(items.find((i) => i.name === "Perl")).toBeUndefined(); // under 5% share is noise
    expect(get("AWS").quadrant).toBe("cloud");
    expect(get("Vercel").quadrant).toBe("cloud");
    expect(get("Kubernetes").quadrant).toBe("infra");
    expect(items.find((i) => i.name === "AWS SDK")).toBeUndefined();
    expect(get("Kafka")).toMatchObject({ quadrant: "data", filter: null });
  });
});

describe("tech dictionary", () => {
  it("tags languages, clouds and infra from job text", () => {
    const t = findTech("Senior Platform Engineer. We run Kubernetes on AWS EKS with Terraform and gRPC; Golang and Kafka experience helps.");
    expect(t).toEqual(expect.arrayContaining(["Kubernetes", "AWS", "Terraform", "gRPC", "Go", "Kafka"]));
  });
  it("does not mistake the verb 'go' for the language", () => expect(findTech("Let's go build something. We go fast.")).not.toContain("Go"));
});

describe("source filters", () => {
  it("accepts a video only from the company's own channel, or when the title names the company AND a tech keyword", () => {
    expect(judgeVideo({ title: "Acme: running 27 services on EKS (KubeCon talk)" }, "Acme")).toMatchObject({ accept: true, own: false });
    expect(judgeVideo({ title: "Acme engineering at scale" }, "Acme").accept).toBe(true);
    expect(judgeVideo({ title: "Inside our platform architecture", channelId: "UCown" }, "Acme", "UCown")).toMatchObject({ accept: true, own: true });
    expect(judgeVideo({ title: "Jerry: Multi-Tenant AI Agent Workflow Builder | Built with Next.js, Acme engineering" }, "Acme").accept).toBe(false); // names the company late: a third-party project
    expect(judgeVideo({ title: "KubeCon keynote about nothing" }, "Acme").accept).toBe(false); // does not name the company
    expect(judgeVideo({ title: "Why Acme is great" }, "Acme").accept).toBe(false); // no tech keyword
  });
  it("always rejects earnings, tickers, vox pops, memes, gaming, trailers and shorts, even on the own channel", () => {
    const bad = [
      "Freshworks Q3 earnings call $FRSH", "Freshworks vox pop: what do people think?", "Postman meme compilation", "Temporal Warhammer 40k gameplay",
      "Acme unboxing review", "Acme product trailer", "Acme #shorts", "Acme stock price reaction", "Acme architecture reaction video",
    ];
    for (const title of bad) {
      expect(judgeVideo({ title, channelId: "UCown" }, title.split(" ")[0], "UCown").accept, title).toBe(false);
    }
  });
  it("ignores other companies' channels when only a company-name match exists", () => {
    expect(judgeVideo({ title: "Stripe Sessions recap", channelId: "UCother" }, "Stripe", "UCstripe").accept).toBe(false);
  });
  it("counts only real engineering titles as engineering roles", () => {
    for (const t of ["Senior Software Engineer", "Platform Engineer", "Site Reliability Engineer", "Security Engineer", "Data Engineer", "Engineering Manager", "Developer Experience Engineer", "DevOps Engineer", "Infrastructure Architect"]) {
      expect(isEngineeringRole(t), t).toBe(true);
    }
    for (const t of ["Developer Success Engineer", "Developer Advocate", "Solutions Engineer", "Sales Engineer", "Customer Support Engineer", "Technical Recruiter", "Account Executive", "Marketing Manager", "Community Evangelist", "Program Manager"]) {
      expect(isEngineeringRole(t), t).toBe(false);
    }
  });
  it("keeps HN items from the company domain or naming it with a tech keyword", () => {
    expect(keepHn({ title: "Whatever", url: "https://blog.acme.com/post" }, "Acme", "acme.com")).toBe(true);
    expect(keepHn({ title: "Acme moves to Kubernetes", url: "https://other.io/x" }, "Acme", "acme.com")).toBe(true);
    expect(keepHn({ title: "Acme raises Series B", url: "https://news.io/x" }, "Acme", "acme.com")).toBe(false);
  });
  it("tries the override alone, otherwise the common feed locations", () => {
    expect(feedCandidates("acme.com", "https://x.io/feed")).toEqual(["https://x.io/feed"]);
    const c = feedCandidates("acme.com");
    expect(c).toEqual(expect.arrayContaining(["https://acme.com/blog/rss.xml", "https://engineering.acme.com/feed", "https://blog.acme.com/feed"]));
  });
  it("builds job-board slug candidates from override, name and domain", () => {
    expect(slugCandidates("Grafana Labs", "grafana.com", "grafanalabs")[0]).toBe("grafanalabs");
    expect(slugCandidates("Grafana Labs", "grafana.com")).toEqual(expect.arrayContaining(["grafanalabs", "grafana-labs", "grafana"]));
  });
});

describe("dates and costs", () => {
  it("weekOf returns the Monday", () => {
    expect(weekOf(new Date("2026-10-14T10:00:00Z"))).toBe("2026-10-12"); // Wednesday
    expect(weekOf(new Date("2026-10-12T00:00:00Z"))).toBe("2026-10-12"); // Monday
    expect(weekOf(new Date("2026-10-18T23:59:00Z"))).toBe("2026-10-12"); // Sunday
  });
  it("freshness: under 7 days, 7–10 days, beyond", () => {
    const now = Date.UTC(2026, 9, 20);
    const ago = (d: number) => new Date(now - d * 86_400_000);
    expect(freshnessOf(ago(2), now).level).toBe("fresh");
    expect(freshnessOf(ago(8), now).level).toBe("aging");
    expect(freshnessOf(ago(12), now).level).toBe("stale");
    expect(freshnessOf(null, now).level).toBe("stale");
  });
  it("next weekly refresh is a Monday 00:30 UTC (6:00 IST)", () => {
    const n = nextWeeklyRefresh(new Date("2026-10-14T10:00:00Z"));
    expect(n.at.toISOString()).toBe("2026-10-19T00:30:00.000Z");
    expect(n.days).toBe(4);
  });
  it("prices Gemini Flash tokens", () => expect(costOf(1_000_000, 1_000_000)).toBeCloseTo(2.8, 5));
});

describe("final-fix rules", () => {
  it("HN: the company name must stand alone, not inside another word", async () => {
    const { keepHn } = await import("@/lib/sources/hn");
    expect(keepHn({ title: "A bi-temporal graph database in Rust", url: null }, "Temporal", "temporal.io")).toBe(false);
    expect(keepHn({ title: "Temporal on Kubernetes at scale", url: null }, "Temporal", "temporal.io")).toBe(true);
  });
  it("roles: Professional Services and Solutions Architect are not engineering roles", () => {
    expect(isEngineeringRole("Senior Professional Services Engineer")).toBe(false);
    expect(isEngineeringRole("Solutions Architect")).toBe(false);
    expect(isEngineeringRole("Senior Platform Engineer")).toBe(true);
  });
  it("repos: -samples/-examples/-demo/-starter repos are excluded from Q1", async () => {
    const { isDocsRepo } = await import("@/lib/compute/repos");
    for (const n of ["hello-samples", "api-examples", "chat-demo", "next-starter"]) expect(isDocsRepo(n), n).toBe(true);
    expect(isDocsRepo("payments-service")).toBe(false);
  });
  it("infra: files under test/, fixtures/, examples/ are ignored", async () => {
    const { isTestPath } = await import("@/lib/compute/infra");
    for (const p of ["test/main.tf", "tests/a/b.tf", "test-fixtures/x.tf", "examples/k8s/a.yaml", "pkg/fixtures/y.tf"]) expect(isTestPath(p), p).toBe(true);
    expect(isTestPath("deploy/main.tf")).toBe(false);
  });
  it("confidence: no job board and no commits cannot be High", () => {
    expect(computeConfidence({ ...base, jobsFound: false, commits30: 0 }).level).toBe("low");
    expect(computeConfidence({ ...base, jobsFound: false, commits30: 80 }).level).toBe("medium");
    expect(computeConfidence({ ...base, jobsFound: true, commits30: 80 }).level).toBe("high");
  });
});
