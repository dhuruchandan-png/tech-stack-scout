import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron";
import { waitUntil } from "@vercel/functions";
import { enqueueAll, fanout } from "@/lib/fanout";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Mondays 6:00 IST (30 0 * * 1 UTC). Reads the watchlist and queues every active company. */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const pairs = await enqueueAll("cron");
  waitUntil(fanout(pairs));
  return NextResponse.json({ queued: pairs.length });
}
