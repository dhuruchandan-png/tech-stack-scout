import { sleep } from "./util";

export type FetchOpts = RequestInit & { retries?: number; timeoutMs?: number };

export class HttpError extends Error {
  constructor(public status: number, public url: string, message?: string) {
    super(message ?? `HTTP ${status} for ${url}`);
  }
}

/**
 * fetch with a timeout and exponential back-off on 403/429/5xx.
 * Honors Retry-After and GitHub's x-ratelimit-reset (capped so one call can't eat the budget).
 */
export async function fetchRetry(url: string, opts: FetchOpts = {}): Promise<Response> {
  const { retries = 2, timeoutMs = 12_000, ...init } = opts;
  let attempt = 0;
  while (true) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      clearTimeout(timer);
      const retryable = res.status === 429 || res.status === 403 || res.status >= 500;
      const rateLimited =
        res.status === 429 || (res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0");
      if (retryable && attempt < retries && (res.status !== 403 || rateLimited)) {
        const ra = Number(res.headers.get("retry-after"));
        const wait = ra > 0 ? Math.min(ra * 1000, 8000) : Math.min(500 * 2 ** attempt, 4000);
        attempt++;
        await sleep(wait);
        continue;
      }
      return res;
    } catch (e) {
      clearTimeout(timer);
      if (attempt < retries) {
        attempt++;
        await sleep(Math.min(500 * 2 ** attempt, 4000));
        continue;
      }
      throw e;
    }
  }
}

export async function getJson<T>(url: string, opts: FetchOpts = {}): Promise<T> {
  const res = await fetchRetry(url, opts);
  if (!res.ok) throw new HttpError(res.status, url);
  return (await res.json()) as T;
}
