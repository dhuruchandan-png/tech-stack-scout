import { checkEmail, checkOpener, checkSummary, checkTalkingPoint, citedIds, sanitizeGenerated, stripCites, type CheckContext } from "./check";
import { costOf, generateJson, MODEL, type Usage } from "./gemini";
import {
  BRIEF_SCHEMA, BRIEF_SYSTEM, briefPrompt, EMAIL_SCHEMA, EMAIL_SYSTEM, emailPrompt, QA_SCHEMA, QA_SYSTEM, qaPrompt,
  type BriefInput, type BriefOutput, type EmailOutput, type QaOutput,
} from "./prompts";

export type CheckStatus = "verified" | "needs_review";

function sumUsage(a: Usage | null, b: Usage): Usage {
  if (!a) return b;
  const inputTokens = a.inputTokens + b.inputTokens;
  const outputTokens = a.outputTokens + b.outputTokens;
  return { model: b.model, inputTokens, outputTokens, costUsd: costOf(inputTokens, outputTokens) };
}

const validIds = (ids: unknown, ctx: CheckContext): string[] =>
  (Array.isArray(ids) ? ids : []).map((x) => String(x).trim().toUpperCase()).filter((x) => /^E\d+$/.test(x));

/** Use the model's evidence_ids array; if it left it empty but cited inline ("[E4]"), recover those. */
function pickIds(ids: unknown, rawText?: string): string[] {
  const direct = validIds(ids, null as never);
  return direct.length ? direct : citedIds(rawText ?? "");
}

function normalizeBrief(o: BriefOutput): BriefOutput {
  return {
    summary_p1: sanitizeGenerated((o.summary_p1 ?? "").trim()),
    summary_p2: sanitizeGenerated((o.summary_p2 ?? "").trim()),
    opener: {
      text: sanitizeGenerated(stripCites(o.opener?.text ?? "")),
      evidence_ids: pickIds(o.opener?.evidence_ids, o.opener?.text),
      hook_type: o.opener?.hook_type ?? "repo",
    },
    talking_points: (o.talking_points ?? []).slice(0, 3).map((t) => ({
      text: sanitizeGenerated(stripCites(t.text ?? "")),
      evidence_ids: pickIds(t.evidence_ids, t.text),
    })),
    unknowns: (o.unknowns ?? []).map(String),
  };
}

export function checkBrief(b: BriefOutput, ctx: CheckContext): string[] {
  const reasons: string[] = [];
  reasons.push(...checkSummary([b.summary_p1, b.summary_p2], ctx).reasons);
  const o = checkOpener(b.opener.text, b.opener.evidence_ids, ctx);
  reasons.push(...o.reasons.map((r) => `Opener: ${r}`));
  if (b.talking_points.length !== 3) reasons.push(`Expected 3 talking points, got ${b.talking_points.length}`);
  b.talking_points.forEach((t, i) => {
    const c = checkTalkingPoint(t.text, t.evidence_ids, ctx);
    reasons.push(...c.reasons.map((r) => `Talking point ${i + 1}: ${r}`));
  });
  return reasons;
}

export type BriefResult = {
  brief: BriefOutput;
  checkStatus: CheckStatus;
  checkReasons: string[];
  usage: Usage;
  regenerated: boolean;
};

/** Steps 9 + 10: Gemini writes from evidence only; code verifies; regenerate once; otherwise Needs review. */
export async function generateBrief(input: BriefInput, ctx: CheckContext): Promise<BriefResult> {
  let usage: Usage | null = null;
  const first = await generateJson<BriefOutput>({ system: BRIEF_SYSTEM, prompt: briefPrompt(input), schema: BRIEF_SCHEMA });
  usage = sumUsage(usage, first.usage);
  let brief = normalizeBrief(first.data);
  let reasons = checkBrief(brief, ctx);
  if (reasons.length === 0) return { brief, checkStatus: "verified", checkReasons: [], usage, regenerated: false };

  try {
    const second = await generateJson<BriefOutput>({ system: BRIEF_SYSTEM, prompt: briefPrompt(input, reasons), schema: BRIEF_SCHEMA, temperature: 0.2 });
    usage = sumUsage(usage, second.usage);
    const b2 = normalizeBrief(second.data);
    const r2 = checkBrief(b2, ctx);
    brief = b2;
    reasons = r2;
  } catch {
    /* keep the first attempt and its reasons */
  }
  return { brief, checkStatus: reasons.length ? "needs_review" : "verified", checkReasons: reasons, usage, regenerated: true };
}

/** Re-check text Nikhil edited. Returns the same shape the generator produces. */
export function recheckOpener(text: string, ids: string[], ctx: CheckContext) {
  const r = checkOpener(text, ids, ctx);
  return { checkStatus: (r.ok ? "verified" : "needs_review") as CheckStatus, checkReasons: r.reasons };
}

export type EmailResult = { email: EmailOutput; checkStatus: CheckStatus; checkReasons: string[]; usage: Usage };

export async function generateEmail(
  args: { company: string; opener: string; summary: string; evidence: { ref: string; source: string; title: string; snippet: string }[]; recipient?: string | null },
  ctx: CheckContext,
): Promise<EmailResult> {
  let usage: Usage | null = null;
  const run = async (retry?: string[]) => {
    const r = await generateJson<EmailOutput>({ system: EMAIL_SYSTEM, prompt: emailPrompt({ ...args, retryReasons: retry }), schema: EMAIL_SCHEMA });
    usage = sumUsage(usage, r.usage);
    const email: EmailOutput = {
      subject: sanitizeGenerated((r.data.subject ?? "").trim()),
      body: sanitizeGenerated(r.data.body ?? "").replace(/[ \t]*\[E\d+(?:\s*,\s*E\d+)*\]/g, "").replace(/\s+Nikhil\s*$/, "\n\nNikhil").trim(),
      evidence_ids: validIds(r.data.evidence_ids, ctx),
    };
    return { email, check: checkEmail(email, ctx) };
  };
  let { email, check } = await run();
  if (!check.ok) ({ email, check } = await run(check.reasons));
  return { email, checkStatus: check.ok ? "verified" : "needs_review", checkReasons: check.reasons, usage: usage! };
}

export function recheckEmail(e: { subject: string; body: string; evidence_ids: string[] }, ctx: CheckContext) {
  const r = checkEmail(e, ctx);
  return { checkStatus: (r.ok ? "verified" : "needs_review") as CheckStatus, checkReasons: r.reasons };
}

/* ---------------- Q&A ---------------- */

/** Top-15 retrieval by keyword overlap + recency, in code (no embeddings). */
export function retrieveEvidence<T extends { title: string; snippet: string; observedAt: Date | null }>(question: string, items: T[], k = 15): T[] {
  const words = question.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2);
  const score = (e: T) => {
    const hay = `${e.title} ${e.snippet}`.toLowerCase();
    const kw = words.reduce((s, w) => s + (hay.includes(w) ? 1 : 0), 0);
    const ageDays = e.observedAt ? (Date.now() - e.observedAt.getTime()) / 86_400_000 : 400;
    return kw * 10 + Math.max(0, 5 - ageDays / 90);
  };
  return [...items].sort((a, b) => score(b) - score(a)).slice(0, k);
}

export async function answerQuestion(company: string, question: string, evidence: { ref: string; source: string; title: string; snippet: string }[], validRefs: Set<string>) {
  const r = await generateJson<QaOutput>({ system: QA_SYSTEM, prompt: qaPrompt(company, question, evidence), schema: QA_SCHEMA });
  const ids = validIds(r.data.evidence_ids, null as never).filter((id) => validRefs.has(id));
  const cited = citedIds(r.data.answer ?? "");
  const bad = cited.filter((id) => !validRefs.has(id));
  let answer = (r.data.answer ?? "").trim();
  if (bad.length) answer = `${answer.replace(/\[E\d+\]/g, (m) => (validRefs.has(m.slice(1, -1)) ? m : ""))}`.trim();
  const notFound = /^not in the evidence yet/i.test(answer);
  if (!notFound && ids.length === 0 && cited.length === 0) {
    return { answer: "Not in the evidence yet.", evidenceIds: [] as string[], missing: r.data.missing ?? "Try a Refresh, or check the sources tab.", usage: r.usage };
  }
  return { answer, evidenceIds: ids, missing: r.data.missing, usage: r.usage };
}

export { MODEL };
