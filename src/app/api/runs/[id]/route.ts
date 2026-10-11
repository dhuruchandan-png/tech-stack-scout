import { NextResponse } from "next/server";
import { getRunWithSteps } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** Polled by the Run Console. Viewable without login. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getRunWithSteps(Number(id));
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({
    run: { id: data.run.id, status: data.run.status, trigger: data.run.trigger, startedAt: data.run.startedAt, finishedAt: data.run.finishedAt, error: data.run.error, costUsd: data.run.costUsd, tokens: data.run.geminiTokens },
    company: data.company ? { name: data.company.name, domain: data.company.domain } : null,
    steps: data.steps.map((s) => ({ id: s.id, step: s.step, status: s.status, detail: s.detail, durationMs: s.durationMs, at: s.at })),
  });
}
