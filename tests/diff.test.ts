import { describe, expect, it } from "vitest";
import { diffSnapshots, type CurrentSnap, type Snap } from "@/lib/compute/diff";

const lang = (name: string, share: number, repoCount = 5) => ({ name, color: "#000", bytes: Math.round(share * 1000), share, repoCount });
const act = (commits30: number, openRoles = 0, level: "high" | "medium" | "low" | "dormant" = "high", commitsPrev30?: number) => ({
  commits30, commits90: commits30 * 3, reposPushed30: 5, releases90: 1, openRoles, blogPosts90: 0, talks12mo: 0, level, wowChangePct: null,
  commitsPrev30, commitsKnown: true,
});
const infra = (tools: string[], clouds: string[] = []) => ({
  items: tools.map((tool) => ({ tool, category: "containers" as const, repo: "r" })), clouds, categories: {}, reposScanned: 1,
});
const ms = (level: "strong" | "medium" | "weak" | "none" | "unknown") => ({ level, reasons: [] });

const prev: Snap = { languages: [lang("Go", 0.4), lang("TypeScript", 0.3)], infra: infra(["Docker"]), microservices: ms("medium"), activity: act(356, 10) };

describe("diffSnapshots (what changed)", () => {
  it("says so on a first snapshot instead of inventing changes", () => {
    const d = diffSnapshots(null, { ...prev });
    expect(d).toHaveLength(1);
    expect(d[0].text).toMatch(/first week tracked/i);
  });

  it("reports a language shift of 5+ points on a language used in 3+ repos", () => {
    const cur: CurrentSnap = { ...prev, languages: [lang("Go", 0.46), lang("TypeScript", 0.24)] };
    const d = diffSnapshots(prev, cur);
    expect(d).toContainEqual({ sign: "+", text: "Go share up 6 pts (40% → 46%)" });
    expect(d).toContainEqual({ sign: "-", text: "TypeScript share down 6 pts (30% → 24%)" });
  });

  it("ignores small shifts and shifts on languages in fewer than 3 repos", () => {
    expect(diffSnapshots(prev, { ...prev, languages: [lang("Go", 0.44), lang("TypeScript", 0.3)] })).toEqual([{ sign: "~", text: "No material change since last week." }]);
    expect(diffSnapshots(prev, { ...prev, languages: [lang("Go", 0.5, 2), lang("TypeScript", 0.3)] })).toEqual([{ sign: "~", text: "No material change since last week." }]);
  });

  it("reports commits only when the last 30 days moved 20%+ AND 50+ commits against the 30 days before", () => {
    const text = (c30: number, p30: number) => diffSnapshots(prev, { ...prev, activity: act(c30, 10, "high", p30) }).find((c) => /Commits/.test(c.text))?.text;
    expect(text(500, 300)).toBe("Commits, last 30 days vs the 30 before: 300 → 500 (+67%)");
    expect(text(240, 400)).toBe("Commits, last 30 days vs the 30 before: 400 → 240 (-40%)");
    expect(text(412, 356)).toBeUndefined(); // +16%: under 20%
    expect(text(60, 40)).toBeUndefined(); // +50%, but only 20 commits
  });

  it("does not report commit moves when commit counts were not fetched", () => {
    const cur: CurrentSnap = { ...prev, activity: { ...act(900, 10, "high", 100), commitsKnown: false } };
    expect(diffSnapshots(prev, cur).some((c) => /Commits/.test(c.text))).toBe(false);
  });

  it("'New repo' only for a repo created in the last 7 days; otherwise 'Newly active'", () => {
    const cur: CurrentSnap = {
      ...prev,
      newRepos: [
        { name: "pi-temporal", commits30: 44, language: "TypeScript", ref: "E5", created: true },
        { name: "old-lib", commits30: 31, language: "Go", ref: "E6", created: false },
      ],
    };
    const d = diffSnapshots(prev, cur).map((c) => c.text);
    expect(d).toContain("New repo pi-temporal (TypeScript), 44 commits");
    expect(d).toContain("Newly active: old-lib (Go), 31 commits");
  });

  it("calls out new roles that mention Kubernetes, with their evidence ids", () => {
    const cur: CurrentSnap = { ...prev, newJobs: [1, 2, 3].map((n) => ({ title: `Platform Engineer ${n}`, techs: ["Kubernetes"], ref: `E${n}` })) };
    const k = diffSnapshots(prev, cur).find((c) => /Kubernetes/.test(c.text))!;
    expect(k.sign).toBe("+");
    expect(k.text).toBe("3 new roles mention Kubernetes");
    expect(k.evidenceIds).toEqual(["E1", "E2", "E3"]);
  });

  it("reports new infra tools and newly visible 'runs on' clouds", () => {
    const d = diffSnapshots(prev, { ...prev, infra: infra(["Docker", "Terraform"], ["AWS"]) }).map((c) => c.text);
    expect(d).toContain("New infra signal: Terraform");
    expect(d).toContain("AWS now visible in their code");
  });

  it("reports fewer open roles and level changes", () => {
    const d = diffSnapshots(prev, { ...prev, activity: act(356, 7, "medium") });
    expect(d.map((c) => c.text)).toEqual(expect.arrayContaining(["3 fewer open engineering roles (10 → 7)", "Activity level high → medium"]));
  });

  it("reports a microservices signal change", () => {
    expect(diffSnapshots(prev, { ...prev, microservices: ms("strong") }).map((c) => c.text)).toContain("Microservices signal medium → strong");
  });

  it("says there was no material change when nothing moved", () => {
    expect(diffSnapshots(prev, { ...prev })).toEqual([{ sign: "~", text: "No material change since last week." }]);
  });
});
