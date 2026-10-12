import { evidenceTopic, type CheckContext } from "./check";

type Item = { ref: string; source: string; kind: string; title: string; snippet: string; url: string; meta?: Record<string, unknown> | null };

/** Everything the code check needs to know about one snapshot's evidence. */
export function makeCheckContext(company: string, items: Item[], factsText: string): CheckContext {
  return {
    company,
    validRefs: new Set(items.map((r) => r.ref)),
    evidenceText: Object.fromEntries(items.map((r) => [r.ref, `${r.title} ${r.snippet} ${r.url} ${JSON.stringify(r.meta ?? {})}`])),
    evidenceCore: Object.fromEntries(items.map((r) => [r.ref, `${r.title} ${r.snippet}`])),
    evidenceTopic: Object.fromEntries(items.map((r) => [r.ref, evidenceTopic(r.source, r.kind)])),
    factsText,
  };
}

export const LOW_CONFIDENCE_REASON = "Low confidence: there is not enough public evidence to verify a first line. Add or fix sources, then refresh.";

/** A Low-confidence account can never show a Verified opener. */
export function gateByConfidence<S extends string>(status: S, reasons: string[], confidence: string | null | undefined): { status: S | "needs_review"; reasons: string[] } {
  if (confidence === "low" && status === "verified") return { status: "needs_review", reasons: [LOW_CONFIDENCE_REASON, ...reasons] };
  return { status, reasons };
}
