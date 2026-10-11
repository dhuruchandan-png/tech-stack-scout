export const DAY = 86_400_000;

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function daysAgo(n: number, from = Date.now()): Date {
  return new Date(from - n * DAY);
}

/** Monday (UTC) of the week containing `d`, as YYYY-MM-DD. */
export function weekOf(d = new Date()): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (x.getUTCDay() + 6) % 7; // Monday = 0
  x.setUTCDate(x.getUTCDate() - dow);
  return x.toISOString().slice(0, 10);
}

export function clip(s: string, n: number): string {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length <= n ? t : t.slice(0, n - 1).trimEnd() + "…";
}

export function stripHtml(html: string): string {
  return (html ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

export function timeAgo(d: Date | string | null | undefined, now = Date.now()): string {
  if (!d) return "never";
  const t = typeof d === "string" ? new Date(d).getTime() : d.getTime();
  const days = Math.floor((now - t) / DAY);
  if (days <= 0) {
    const h = Math.floor((now - t) / 3_600_000);
    return h <= 0 ? "just now" : `${h}h ago`;
  }
  return `${days}d ago`;
}

export type Freshness = "fresh" | "aging" | "stale";
export function freshnessOf(d: Date | string | null | undefined, now = Date.now()): { level: Freshness; days: number } {
  if (!d) return { level: "stale", days: Infinity };
  const t = typeof d === "string" ? new Date(d).getTime() : d.getTime();
  const days = Math.floor((now - t) / DAY);
  return { level: days < 7 ? "fresh" : days <= 10 ? "aging" : "stale", days };
}

export function cn(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export const fmtInt = (n: number) => new Intl.NumberFormat("en-US").format(n);
