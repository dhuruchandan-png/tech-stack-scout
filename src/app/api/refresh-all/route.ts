import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { enqueueAll, fanout } from "@/lib/fanout";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** "Refresh all" (or a selected subset): queue the companies, then fan out at a concurrency of 3. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { ids?: number[] };
  const ids = Array.isArray(body.ids) ? body.ids.filter((n) => Number.isInteger(n)) : undefined;
  const pairs = await enqueueAll("bulk", ids);
  waitUntil(fanout(pairs));
  return NextResponse.json({ queued: pairs.length, runIds: pairs.map((p) => p.runId) }, { status: 202 });
}
