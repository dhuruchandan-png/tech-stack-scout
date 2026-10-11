/** Run a loader; on failure return the message so pages can show a SetupNotice instead of crashing. */
export async function safe<T>(fn: () => Promise<T>): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Next Monday 00:30 UTC (6:00 IST): the weekly cron. */
export function nextWeeklyRefresh(now = new Date()): { days: number; hours: number; at: Date } {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 30, 0));
  const dow = d.getUTCDay(); // 0 Sun .. 6 Sat
  let add = (8 - dow) % 7;
  if (add === 0 && d.getTime() <= now.getTime()) add = 7;
  d.setUTCDate(d.getUTCDate() + add);
  const ms = d.getTime() - now.getTime();
  return { days: Math.floor(ms / 86_400_000), hours: Math.floor((ms % 86_400_000) / 3_600_000), at: d };
}
