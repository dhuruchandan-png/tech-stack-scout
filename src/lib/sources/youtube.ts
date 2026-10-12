import { fetchRetry } from "@/lib/http";
import type { SourceResult, Talk, YoutubeData } from "@/lib/types";
import { DAY } from "@/lib/util";

/** Always rejected, whatever the channel: finance, entertainment and low-signal uploads. */
const REJECT =
  /\b(earnings?|stock|stocks|shares?|nasdaq|nyse|ticker|investors?|quarterly results|vox ?pop|reactions?|reacts?|reacting|memes?|gaming|gameplay|walkthrough|warhammer|minecraft|fortnite|trailer|shorts?|unboxing|prank|funny|parody|asmr|lofi|giveaway)\b|\$[A-Za-z]{1,5}\b|#shorts/i;

/** A real engineering topic or conference. Needed when the video is NOT from the company's own channel. */
const TECH =
  /\b(engineering|architecture|architect|scal(e|ing|able)|kubernetes|k8s|migration|infra(structure)?|platform|sdk|microservices?|devops|sre|observability|distributed|workflows?|durable|open ?source|performance|database|kubecon|qcon|gophercon|pycon|re:?invent|devoxx|jsconf|strange ?loop|talk|keynote|summit|meetup|conference)\b/i;

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export type VideoLike = { title: string; description?: string; channelId?: string };

/**
 * Accept a video only if (a) it is on the company's own channel, or (b) its title names the company AND a tech keyword.
 * Earnings, tickers, vox pops, reactions, memes, gaming, trailers and shorts are always rejected.
 */
export function judgeVideo(v: VideoLike, company: string, ownChannelId?: string | null): { accept: boolean; own: boolean; reason: string } {
  const title = v.title ?? "";
  if (REJECT.test(title)) return { accept: false, own: false, reason: "rejected: finance, entertainment or low-signal upload" };
  const own = !!ownChannelId && ownChannelId !== "none" && v.channelId === ownChannelId;
  if (own) return { accept: true, own: true, reason: "company's own channel" };
  const hit = new RegExp(`(?<![\\w-])${esc(company)}(?![\\w-])`, "i").exec(title);
  const names = !!hit;
  // a third-party video must name the company early (first half of the title): "Jerry: Workflow Builder | Built with Next.js, Hasura" is a user project
  const early = !!hit && hit.index <= title.length / 2;
  if (names && early && TECH.test(title)) return { accept: true, own: false, reason: "names the company and a tech topic" };
  return { accept: false, own: false, reason: !names ? "does not name the company" : !early ? "names the company only late in the title (likely a third-party project)" : "no tech keyword in the title" };
}

const API = "https://www.googleapis.com/youtube/v3";

type Item = { title: string; description: string; publishedAt: string; channelTitle: string; channelId: string; videoId: string };

async function yt<T>(path: string, params: Record<string, string>): Promise<T | { error: string }> {
  const key = process.env.YOUTUBE_API_KEY!;
  const url = `${API}/${path}?${new URLSearchParams({ ...params, key }).toString()}`;
  const res = await fetchRetry(url, { retries: 1 });
  if (!res.ok) return { error: `YouTube HTTP ${res.status}` };
  return (await res.json()) as T;
}

/** Find the company's own channel by matching the channel title to the company name. Costs 100 quota units. */
async function detectChannel(company: string): Promise<string | null> {
  const r = await yt<{ items?: { id: { channelId: string }; snippet: { channelTitle: string; title: string } }[] }>("search", {
    part: "snippet", type: "channel", q: company, maxResults: "5",
  });
  if ("error" in r) return null;
  const want = norm(company);
  const hit = (r.items ?? []).find((c) => {
    const t = norm(c.snippet.channelTitle || c.snippet.title);
    return t === want || t === `${want}official` || t === `${want}developers` || t === `${want}engineering` || t === `${want}technologies` || t === `${want}hq`;
  });
  return hit?.id.channelId ?? null;
}

/** Latest uploads of a channel through its uploads playlist (1 quota unit). */
async function uploads(channelId: string): Promise<Item[]> {
  if (!channelId.startsWith("UC")) return [];
  const r = await yt<{ items?: { snippet: { title: string; description: string; publishedAt: string; channelTitle: string; resourceId: { videoId: string } } }[] }>("playlistItems", {
    part: "snippet", playlistId: `UU${channelId.slice(2)}`, maxResults: "15",
  });
  if ("error" in r) return [];
  return (r.items ?? []).map((i) => ({
    title: i.snippet.title, description: i.snippet.description, publishedAt: i.snippet.publishedAt,
    channelTitle: i.snippet.channelTitle, channelId, videoId: i.snippet.resourceId.videoId,
  }));
}

async function search(company: string, query?: string | null, now = Date.now()): Promise<Item[]> {
  const q = query || `"${company}" engineering OR architecture OR kubecon OR conference talk`;
  const r = await yt<{ items?: { id: { videoId: string }; snippet: { title: string; channelTitle: string; channelId: string; publishedAt: string; description: string } }[] }>("search", {
    part: "snippet", type: "video", maxResults: "10", q, publishedAfter: new Date(now - 730 * DAY).toISOString(),
  });
  if ("error" in r) return [];
  return (r.items ?? []).map((i) => ({
    title: i.snippet.title, description: i.snippet.description, publishedAt: i.snippet.publishedAt,
    channelTitle: i.snippet.channelTitle, channelId: i.snippet.channelId, videoId: i.id.videoId,
  }));
}

/**
 * Step 5 (talks): own-channel uploads first (cheap), then a targeted search only if we still have fewer than 3.
 * `channelId` is the stored override; if empty we auto-detect it once and the caller stores it ("none" = looked, found nothing).
 */
export async function fetchYoutube(
  company: string,
  opts: { query?: string | null; channelId?: string | null; onDetected?: (channelId: string) => Promise<void> } = {},
  now = Date.now(),
): Promise<SourceResult<YoutubeData & { detectedChannelId?: string }>> {
  if (!process.env.YOUTUBE_API_KEY) return { ok: false, status: "skipped", error: "YOUTUBE_API_KEY not set" };
  try {
    let channelId = opts.channelId && opts.channelId !== "none" ? opts.channelId : null;
    let detected: string | undefined;
    if (!channelId && opts.channelId !== "none") {
      channelId = await detectChannel(company);
      detected = channelId ?? "none";
      await opts.onDetected?.(detected); // remember it, so we never pay for the channel search again
    }
    const accepted: Talk[] = [];
    const seen = new Set<string>();
    const consider = (i: Item) => {
      if (seen.has(i.videoId)) return;
      seen.add(i.videoId);
      if (now - new Date(i.publishedAt).getTime() > 730 * DAY) return;
      const j = judgeVideo({ title: i.title, description: i.description, channelId: i.channelId }, company, channelId);
      if (!j.accept) return;
      accepted.push({
        videoId: i.videoId, title: i.title, channel: i.channelTitle, publishedAt: i.publishedAt,
        description: i.description, url: `https://www.youtube.com/watch?v=${i.videoId}`,
      });
    };
    (channelId ? await uploads(channelId) : []).forEach(consider);
    if (accepted.length < 3) (await search(company, opts.query, now)).forEach(consider);
    const talks = accepted.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 8);
    return talks.length ? { ok: true, data: { talks, detectedChannelId: detected } } : { ok: false, status: "not_found" };
  } catch (e) {
    return { ok: false, status: "failed", error: (e as Error).message };
  }
}
