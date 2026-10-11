import { findTech } from "@/lib/compute/techdict";
import { hostOf } from "@/lib/domain";
import { fetchRetry } from "@/lib/http";
import type { HnData, HnItem, SourceResult } from "@/lib/types";
import { DAY } from "@/lib/util";

type Hit = { objectID: string; title: string | null; url: string | null; points: number | null; created_at: string };

export function keepHn(h: Pick<Hit, "title" | "url">, company: string, domain: string): boolean {
  const host = h.url ? hostOf(h.url) : null;
  if (host && (host === domain || host.endsWith(`.${domain}`))) return true;
  const title = h.title ?? "";
  return title.toLowerCase().includes(company.toLowerCase()) && findTech(title).length > 0;
}

/** Step 5 (HN): Algolia search, last 90 days, no key needed. */
export async function fetchHn(company: string, domain: string, now = Date.now()): Promise<SourceResult<HnData>> {
  const since = Math.floor((now - 90 * DAY) / 1000);
  const queries = [`"${company}"`, domain];
  try {
    const items = new Map<string, HnItem>();
    for (const q of queries) {
      const url = `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(q)}&tags=story&numericFilters=${encodeURIComponent(`created_at_i>${since}`)}&hitsPerPage=20`;
      const res = await fetchRetry(url, { retries: 1 });
      if (!res.ok) return { ok: false, status: "failed", error: `HN HTTP ${res.status}` };
      const j = (await res.json()) as { hits?: Hit[] };
      for (const h of j.hits ?? []) {
        if (!h.title || !keepHn(h, company, domain)) continue;
        items.set(h.objectID, {
          id: h.objectID, title: h.title, url: h.url ?? `https://news.ycombinator.com/item?id=${h.objectID}`,
          points: h.points ?? 0, createdAt: h.created_at, hnUrl: `https://news.ycombinator.com/item?id=${h.objectID}`,
        });
      }
    }
    const list = [...items.values()].sort((a, b) => b.points - a.points).slice(0, 8);
    return list.length ? { ok: true, data: { items: list } } : { ok: false, status: "not_found" };
  } catch (e) {
    return { ok: false, status: "failed", error: (e as Error).message };
  }
}
