import { describe, expect, it } from "vitest";
import { computeLanguages, dominantLanguages, topLanguages } from "@/lib/compute/languages";
import { NOW, daysAgoIso, repo } from "./helpers";

const langs = (o: Record<string, number>) => Object.entries(o).map(([name, size]) => ({ name, color: null, size }));

describe("computeLanguages (Q1)", () => {
  it("sums bytes over active non-fork, non-archived repos pushed in the last 12 months", () => {
    const repos = [
      repo({ name: "a", languages: langs({ Go: 600, TypeScript: 300, Shell: 100 }) }),
      repo({ name: "fork", isFork: true, languages: langs({ Python: 9999 }) }),
      repo({ name: "arch", isArchived: true, languages: langs({ Java: 9999 }) }),
      repo({ name: "old", pushedAt: daysAgoIso(400), languages: langs({ Ruby: 9999 }) }),
    ];
    const out = computeLanguages(repos, NOW);
    expect(out.map((l) => l.name)).toEqual(["Go", "TypeScript"]); // Shell is noise, the rest are excluded
    expect(out[0].share).toBeCloseTo(2 / 3, 3);
    expect(out.reduce((s, l) => s + l.share, 0)).toBeCloseTo(1, 6);
  });

  it("falls back to config languages when a repo set has nothing else", () => {
    const out = computeLanguages([repo({ name: "scripts", languages: langs({ Shell: 500 }) })], NOW);
    expect(out.map((l) => l.name)).toEqual(["Shell"]);
  });

  it("returns [] when there is no public code (only forks / archived)", () => {
    expect(computeLanguages([repo({ name: "f", isFork: true, languages: langs({ Go: 1 }) })], NOW)).toEqual([]);
    expect(computeLanguages([], NOW)).toEqual([]);
  });

  it("uses linguist colours when the API gives none", () => {
    const out = computeLanguages([repo({ name: "a", languages: langs({ Go: 1 }) })], NOW);
    expect(out[0].color).toBe("#00ADD8");
  });
});

describe("dominantLanguages", () => {
  const mk = (a: number, b: number) => [
    { name: "Go", color: "#0", bytes: a, share: a / (a + b) },
    { name: "TypeScript", color: "#1", bytes: b, share: b / (a + b) },
  ];
  it("returns one language when the second is a distant runner-up", () => expect(dominantLanguages(mk(70, 30)).map((l) => l.name)).toEqual(["Go"]));
  it("returns two when they are close", () => expect(dominantLanguages(mk(50, 40)).map((l) => l.name)).toEqual(["Go", "TypeScript"]));
  it("handles empty", () => expect(dominantLanguages([])).toEqual([]));
});

describe("topLanguages", () => {
  it("collapses the tail into Other and keeps shares summing to 1", () => {
    const all = ["A", "B", "C", "D", "E", "F", "G"].map((name, i) => ({ name, color: "#000", bytes: 100 - i, share: (100 - i) / 679 }));
    const top = topLanguages(all, 5);
    expect(top).toHaveLength(6);
    expect(top[5].name).toBe("Other");
    expect(top.reduce((s, l) => s + l.share, 0)).toBeCloseTo(1, 3);
  });
});
