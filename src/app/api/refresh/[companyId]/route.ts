import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { isAdminOrCron } from "@/lib/auth";
import { runRefresh } from "@/lib/pipeline";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Steps 4–12 for ONE company, so a weekly run never hits a function timeout. */
export async function POST(req: Request, { params }: { params: Promise<{ companyId: string }> }) {
  if (!(await isAdminOrCron(req))) return NextResponse.json({ error: "Admin mode required" }, { status: 401 });
  const { companyId } = await params;
  const id = Number(companyId);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "bad company id" }, { status: 400 });
  const url = new URL(req.url);
  const runId = url.searchParams.get("run") ? Number(url.searchParams.get("run")) : undefined;
  const trigger = req.headers.get("authorization") ? "cron" : "manual";
  const job = runRefresh(id, trigger, runId, { force: url.searchParams.get("force") === "1" });

  if (url.searchParams.get("wait") === "1") {
    const r = await job;
    return NextResponse.json(r);
  }
  waitUntil(job);
  return NextResponse.json({ accepted: true, runId }, { status: 202 });
}
