export type Quadrant = "languages" | "cloud" | "infra" | "data";
export type Ring = "everywhere" | "common" | "emerging" | "rare";

export type RadarInput = {
  name: string; // account
  domain: string;
  languages: { name: string; share: number }[];
  clouds: string[];
  tools: { name: string; category: string }[];
  dataTech: string[]; // from job posts / blog posts
};

export type RadarItem = { name: string; quadrant: Quadrant; count: number; accounts: { name: string; domain: string }[]; ring: Ring; filter: { key: "lang" | "cloud" | "tool"; value: string } | null };

export const QUADRANT_LABEL: Record<Quadrant, string> = { languages: "Languages", cloud: "Cloud & Platforms", infra: "Infra & Orchestration", data: "Data & Messaging" };

const PLATFORM_TOOLS = new Set(["Vercel", "Netlify", "Fly.io", "Google App Engine", "Cloudflare Workers", "Serverless Framework", "Heroku-style Procfile"]);

/** Rings by prevalence across the watchlist: Everywhere >= 60%, Common >= 30%, Emerging >= 10% (or 2+ accounts), else Rare. */
export function ringFor(count: number, total: number): Ring {
  if (total === 0) return "rare";
  const p = count / total;
  if (p >= 0.6) return "everywhere";
  if (p >= 0.3) return "common";
  if (p >= 0.1 || count >= 2) return "emerging";
  return "rare";
}

export function buildRadar(inputs: RadarInput[]): RadarItem[] {
  const total = inputs.length;
  const map = new Map<string, RadarItem>();
  const add = (name: string, quadrant: Quadrant, acct: { name: string; domain: string }, filter: RadarItem["filter"]) => {
    const key = `${quadrant}:${name}`;
    const it = map.get(key) ?? { name, quadrant, count: 0, accounts: [], ring: "rare" as Ring, filter };
    if (!it.accounts.some((a) => a.domain === acct.domain)) { it.accounts.push(acct); it.count++; }
    map.set(key, it);
  };
  for (const i of inputs) {
    const a = { name: i.name, domain: i.domain };
    for (const l of i.languages) if (l.share >= 0.05) add(l.name, "languages", a, { key: "lang", value: l.name });
    for (const c of i.clouds) add(c, "cloud", a, { key: "cloud", value: c });
    for (const t of i.tools) {
      if (PLATFORM_TOOLS.has(t.name)) add(t.name, "cloud", a, { key: "tool", value: t.name });
      else if (t.category !== "sdk") add(t.name, "infra", a, { key: "tool", value: t.name });
    }
    for (const d of i.dataTech) add(d, "data", a, null);
  }
  return [...map.values()].map((it) => ({ ...it, ring: ringFor(it.count, total) })).sort((a, b) => b.count - a.count);
}
