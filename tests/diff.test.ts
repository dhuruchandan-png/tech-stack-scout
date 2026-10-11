import { describe, expect, it } from "vitest";
import { diffSnapshots, type CurrentSnap, type Snap } from "@/lib/compute/diff";

const lang = (name: string, share: number) => ({ name, color: "#000", bytes: Math.round(share * 1000), share });
const act = (commits30: number, openRoles = 0, level: "high" | "medium" | "low" | "dormant" = "high") => ({
  commits30, commits90: commits30 * 3, reposPushed30: 5, releases90: 1, openRoles, blogPosts90: 0, talks12mo: 0, level, wowChangePct: null,
});
const infra = (tools: string[], clouds: string[] = []) => ({
  items: tools.map((tool) => ({ tool, category: "containers" as const, repo: "r" })), clouds, categories: {}, reposScanned: 1,
});
const ms = (level: "strong" | "some" | "none" | "unknown") => ({ level, reasons: [] });

const prev: Snap = { languages: [lang("Go", 0.4), lang("TypeScript", 0.3)], infra: infra(["Docker"]), microservices: ms("some"), activity: act(356, 10) };

describe("diffSnapshots (what changed vs last week)", () => {
  it("says so on a first snapshot instead of inventing changes", () => {
    const d = diffSnapshots(null, { ...prev });
    expect(d).toHaveLength(1);
    expect(d[0].text).toMatch(/first snapshot/i);
  });

  it("reports language share moves of 2+ points with before/after", () => {
    const cur: CurrentSnap = { ...prev, languages: [lang("Go", 0.46), lang("TypeScript", 0.24)] };
    const d = diffSnapshots(prev, cur);
    expect(d).toContainEqual({ sign: "+", text: "Go share up 6 pts (40% → 46%)" });
    expect(d).toContainEqual({ sign: "-", text: "TypeScript share down 6 pts (30% → 24%)" });
  });

  it("reports the commit trend with its percentage", () => {
    const d = diffSnapshots(prev, { ...prev, activity: act(412, 10) });
    expect(d).toContainEqual({ sign: "~", text: "Commits 30d 356 → 412 (+16%)" });
  });

  it("calls out new roles that mention Kubernetes, with their evidence ids", () => {
    const cur: CurrentSnap = { ...prev, newJobs: [1, 2, 3].map((n) => ({ title: `Platform Engineer ${n}`, techs: ["Kubernetes"], ref: `E${n}` })) };
    const d = diffSnapshots(prev, cur);
    const k = d.find((c) => /Kubernetes/.test(c.text))!;
    expect(k.sign).toBe("+");
    expect(k.text).toBe("3 new roles mention Kubernetes");
    expect(k.evidenceIds).toEqual(["E1", "E2", "E3"]);
  });

  it("reports new infra tools and newly visible clouds", () => {
    const cur: CurrentSnap = { ...prev, infra: infra(["Docker", "Terraform"], ["AWS"]) };
    const d = diffSnapshots(prev, cur).map((c) => c.text);
    expect(d).toContain("New infra signal: Terraform");
    expect(d).toContain("AWS now visible in their code");
  });

  it("reports fewer open roles and level changes", () => {
    const d = diffSnapshots(prev, { ...prev, activity: act(356, 7, "medium") });
    expect(d.map((c) => c.text)).toEqual(expect.arrayContaining(["3 fewer open engineering roles (10 → 7)", "Activity level high → medium"]));
  });

  it("reports a microservices signal change", () => {
    expect(diffSnapshots(prev, { ...prev, microservices: ms("strong") }).map((c) => c.text)).toContain("Microservices signal some → strong");
  });

  it("says there was no material change when nothing moved", () => {
    expect(diffSnapshots(prev, { ...prev })).toEqual([{ sign: "~", text: "No material change since last week." }]);
  });

  it("ignores small noise (under 10% commits, under 2 points of language share)", () => {
    const cur: CurrentSnap = { ...prev, languages: [lang("Go", 0.41), lang("TypeScript", 0.3)], activity: act(360, 10) };
    expect(diffSnapshots(prev, cur)).toEqual([{ sign: "~", text: "No material change since last week." }]);
  });
});
