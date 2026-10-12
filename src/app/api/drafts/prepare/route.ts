import { NextResponse } from "next/server";
import { prepareReadyDrafts } from "@/lib/outreach";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Writes finished, checked drafts for the top "Call these first" accounts. Sends nothing. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { ids?: number[]; limit?: number };
  const ids = Array.isArray(body.ids) ? body.ids.filter((n) => Number.isInteger(n)) : undefined;
  const summary = await prepareReadyDrafts({ limit: Math.min(Math.max(body.limit ?? 5, 1), 8), companyIds: ids });
  return NextResponse.json(summary);
}
