import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { queueRun, type Trigger } from "@/lib/pipeline";
import { mapLimit } from "@/lib/util";

/** Create queued runs for every active company (one run per company, so each fits in its own request). */
export async function enqueueAll(trigger: Trigger, onlyIds?: number[]): Promise<{ companyId: number; runId: number }[]> {
  const db = getDb();
  let cos = await db.select({ id: schema.companies.id }).from(schema.companies).where(eq(schema.companies.active, true));
  if (onlyIds?.length) cos = cos.filter((c) => onlyIds.includes(c.id));
  const out: { companyId: number; runId: number }[] = [];
  for (const c of cos) out.push({ companyId: c.id, runId: await queueRun(c.id, trigger) });
  return out;
}

/**
 * Fans out one request per company (each gets its own 60s function) at a concurrency of 3.
 * `wait=1` makes each request run the refresh inline, so this loop paces itself.
 */
export async function fanout(pairs: { companyId: number; runId: number }[], concurrency = 3) {
  const base = process.env.APP_BASE_URL;
  if (!base) throw new Error("APP_BASE_URL is not set");
  await mapLimit(pairs, concurrency, async (p) => {
    try {
      await fetch(`${base}/api/refresh/${p.companyId}?run=${p.runId}&wait=1`, {
        method: "POST",
        // With CRON_SECRET set the header authorises the call; in open-access mode (no ADMIN_PASSCODE) it is not needed.
        headers: process.env.CRON_SECRET ? { authorization: `Bearer ${process.env.CRON_SECRET}` } : {},
        signal: AbortSignal.timeout(75_000),
      });
    } catch {
      // the run row records its own status; a timeout here just means it will show as running/failed on /runs
    }
  });
}
