import type { ActivityResult, ChangeItem, MicroservicesResult } from "@/db/schema";

export type ScoreInput = {
  changes: ChangeItem[] | null;
  activity: ActivityResult | null;
  microservices: MicroservicesResult | null;
  clouds: string[];
  openerVerified: boolean;
  alreadyContacted: boolean;
};

/**
 * "Call these first" score, in code. Documented in the README:
 *   +3 per meaningful change (max 4 counted), +4 High activity / +2 Medium,
 *   +3 Strong microservices / +1 Some, +2 any cloud signal, +3 verified opener, -6 already contacted.
 */
export function callFirstScore(i: ScoreInput): { score: number; reason: string } {
  let score = 0;
  const reasons: { w: number; t: string }[] = [];
  const meaningful = (i.changes ?? []).filter((c) => c.sign === "+" || (c.sign === "~" && !/first snapshot|no material/i.test(c.text)));
  const nChanges = Math.min(meaningful.length, 4);
  if (nChanges) {
    score += nChanges * 3;
    reasons.push({ w: nChanges * 3, t: meaningful[0].text });
  }
  if (i.activity?.level === "high") { score += 4; reasons.push({ w: 4, t: "High build activity" }); }
  else if (i.activity?.level === "medium") score += 2;
  if (i.microservices?.level === "strong") { score += 3; reasons.push({ w: 3, t: "Strong microservices signal" }); }
  else if (i.microservices?.level === "medium" || i.microservices?.level === "some") score += 1;
  if (i.clouds.length) { score += 2; reasons.push({ w: 2, t: `Visible on ${i.clouds.join(" + ")}` }); }
  if (i.openerVerified) { score += 3; reasons.push({ w: 3, t: "Verified opener ready" }); }
  if (i.alreadyContacted) score -= 6;
  reasons.sort((a, b) => b.w - a.w);
  return { score, reason: reasons[0]?.t ?? "Fresh data available" };
}
