import Parser from "rss-parser";
import { fetchRetry } from "@/lib/http";
import type { BlogData, BlogPost, SourceResult } from "@/lib/types";
import { clip, stripHtml } from "@/lib/util";

export function feedCandidates(domain: string, override?: string | null): string[] {
  if (override) return [override];
  const d = domain;
  return [
    `https://${d}/blog/rss.xml`, `https://${d}/blog/feed`, `https://${d}/blog/feed.xml`, `https://${d}/feed`, `https://${d}/rss`,
    `https://${d}/engineering/feed`, `https://engineering.${d}/feed`, `https://blog.${d}/feed`,
    `https://blog.${d}/rss.xml`, `https://${d}/blog/index.xml`, `https://${d}/blog/atom.xml`,
  ];
}

const parser = new Parser({ timeout: 10_000, headers: { "User-Agent": "tech-stack-scout" } });

async function tryFeed(url: string): Promise<BlogData | null> {
  try {
    const res = await fetchRetry(url, { retries: 0, timeoutMs: 8000, headers: { "User-Agent": "tech-stack-scout", Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" } });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    const text = await res.text();
    if (!/<(rss|feed|rdf:RDF)\b/i.test(text.slice(0, 2000)) || /text\/html/i.test(ct) && !/<(rss|feed)/i.test(text.slice(0, 500))) return null;
    const feed = await parser.parseString(text);
    const posts: BlogPost[] = (feed.items ?? []).slice(0, 10).map((i) => ({
      title: i.title ?? "(untitled)",
      url: i.link ?? url,
      publishedAt: i.isoDate ?? i.pubDate ?? null,
      snippet: clip(stripHtml(i.contentSnippet ?? i.content ?? i.summary ?? ""), 320),
    }));
    return posts.length ? { feedUrl: url, posts } : null;
  } catch {
    return null;
  }
}

/** Step 5 (blog): override, then common feed locations. Not found is a real answer; we never guess. */
export async function fetchBlog(domain: string, override?: string | null): Promise<SourceResult<BlogData>> {
  try {
    for (const url of feedCandidates(domain, override)) {
      const d = await tryFeed(url);
      if (d) return { ok: true, data: d };
    }
    return { ok: false, status: "not_found" };
  } catch (e) {
    return { ok: false, status: "failed", error: (e as Error).message };
  }
}
