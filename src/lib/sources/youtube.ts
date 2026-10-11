import { fetchRetry } from "@/lib/http";
import type { SourceResult, Talk, YoutubeData } from "@/lib/types";
import { DAY } from "@/lib/util";

const TALK_WORDS = /\b(talk|conference|summit|meetup|keynote|kubecon|re:invent|reinvent|engineering|devops ?days|gophercon|pycon)\b/i;

export function keepTalk(title: string, description: string, company: string): boolean {
  const hay = `${title} ${description}`;
  const name = company.toLowerCase();
  return hay.toLowerCase().includes(name) && TALK_WORDS.test(hay);
}

/** Step 5 (talks): YouTube Data API v3, ~100 quota units per company. */
export async function fetchYoutube(company: string, query?: string | null, now = Date.now()): Promise<SourceResult<YoutubeData>> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return { ok: false, status: "skipped", error: "YOUTUBE_API_KEY not set" };
  const q = query || `"${company}" engineering OR "${company}" conference talk`;
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.search = new URLSearchParams({
    part: "snippet", type: "video", maxResults: "10", q, key,
    publishedAfter: new Date(now - 730 * DAY).toISOString(),
  }).toString();
  try {
    const res = await fetchRetry(url.toString(), { retries: 1 });
    if (!res.ok) return { ok: false, status: "failed", error: `YouTube HTTP ${res.status}` };
    const j = (await res.json()) as { items?: { id: { videoId: string }; snippet: { title: string; channelTitle: string; publishedAt: string; description: string } }[] };
    const talks: Talk[] = (j.items ?? [])
      .filter((i) => keepTalk(i.snippet.title, i.snippet.description, company))
      .map((i) => ({
        videoId: i.id.videoId, title: i.snippet.title, channel: i.snippet.channelTitle,
        publishedAt: i.snippet.publishedAt, description: i.snippet.description,
        url: `https://www.youtube.com/watch?v=${i.id.videoId}`,
      }));
    return talks.length ? { ok: true, data: { talks } } : { ok: false, status: "not_found" };
  } catch (e) {
    return { ok: false, status: "failed", error: (e as Error).message };
  }
}
