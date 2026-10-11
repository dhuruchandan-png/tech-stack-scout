/**
 * Step 10: the code check. Every opener, talking point, summary and email draft must pass this before it can be
 * shown as Verified or approved. Pure code, no AI.
 */

export const BANNED_PHRASES = [
  "i came across", "hope this finds you well", "i noticed your company", "leverage", "synergy",
  "touch base", "circle back", "game-changer", "game changer", "cutting-edge", "cutting edge", "revolutionize",
  "i hope this email", "reaching out to",
];

export type CheckResult = { ok: boolean; reasons: string[] };

export type CheckContext = {
  company: string;
  /** refs valid for this company's current snapshot, e.g. "E12" */
  validRefs: Set<string>;
  /** text (title + snippet + url + meta) of every evidence item, keyed by ref */
  evidenceText: Record<string, string>;
  /** computed facts as plain text (language names, tool names, counts) that the model was also given */
  factsText: string;
};

const wc = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
export const CITE_RE = /\[E(\d+)\]/g;

export function stripCites(s: string): string {
  return s.replace(/\s*\[E\d+(?:\s*,\s*E\d+)*\]/g, "").replace(/\s+/g, " ").trim();
}

/** Deterministic clean-up for words the model keeps using despite instructions ("leverage" is a banned buzzword). */
export function sanitizeGenerated(s: string): string {
  const keepCase = (m: string, to: string) => (m[0] === m[0].toUpperCase() ? to[0].toUpperCase() + to.slice(1) : to);
  return s
    .replace(/\bleveraging\b/gi, (m) => keepCase(m, "using"))
    .replace(/\bleveraged\b/gi, (m) => keepCase(m, "used"))
    .replace(/\bleverages\b/gi, (m) => keepCase(m, "uses"))
    .replace(/\bleverage\b/gi, (m) => keepCase(m, "use"));
}

export function citedIds(s: string): string[] {
  const ids = new Set<string>();
  for (const m of s.matchAll(/\[(E\d+(?:\s*,\s*E\d+)*)\]/g)) for (const p of m[1].split(",")) ids.add(p.trim());
  return [...ids];
}

/** very light stemmer so "services" matches "service", "deploying" matches "deploy" */
export function stem(w: string): string {
  let s = w.toLowerCase();
  for (const suf of ["ing", "ers", "er", "es", "ed", "s"]) {
    if (s.length > suf.length + 3 && s.endsWith(suf)) { s = s.slice(0, -suf.length); break; }
  }
  // normalise the silent "e" so "service" and "services" ("servic") meet
  if (s.length > 4 && s.endsWith("e")) s = s.slice(0, -1);
  return s;
}

const STOP_CAPS = new Set([
  "your", "you", "we", "our", "the", "a", "an", "i", "with", "and", "for", "that", "this", "it", "its", "their", "they",
  "how", "what", "when", "why", "if", "so", "but", "from", "to", "of", "in", "on", "at", "as", "is", "are", "was", "were",
  "nikhil", "hi", "hello", "hey", "q1", "q2", "q3", "ci", "cd",
]);

/**
 * Key nouns = the specific things the line names: tool/repo/role/topic names.
 *  - tokens with digits, hyphen, underscore, dot, slash (repo names, versions, numbers)
 *  - capitalised words that are not at the start of a sentence (and not the company name)
 *  - quoted phrases are handled by the caller via the same tokens
 */
export function keyNouns(text: string, company: string): string[] {
  const nouns = new Set<string>();
  const comp = company.toLowerCase();
  const sentences = text.split(/(?<=[.!?])\s+/);
  for (const sent of sentences) {
    const toks = sent.replace(/[“”"()]/g, " ").split(/\s+/).filter(Boolean);
    toks.forEach((raw, idx) => {
      const t = raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
      if (!t) return;
      const low = t.toLowerCase();
      if (comp.split(/\s+/).includes(low) || low === comp) return;
      if (STOP_CAPS.has(low)) return;
      // numbers and identifiers (versions, file names, repo paths) are claims and must be grounded
      if (/\d/.test(t) || /[_./]/.test(t)) {
        if (/^\d+-?(minute|min|mins|minutes)$/i.test(t)) return; // "20-minute call" is not a claim
        nouns.add(t);
        return;
      }
      // hyphenated words: only a claim when a part is capitalised ("Go-first"); "front-end", "open-source" are plain English
      if (t.includes("-")) {
        if (t.split("-").some((p) => /^[A-Z]/.test(p)) && idx > 0) nouns.add(t);
        return;
      }
      if (idx > 0 && /^[A-Z]/.test(t) && t.length > 1) nouns.add(t);
    });
  }
  return [...nouns];
}

function grounded(noun: string, hay: string, hayStems: Set<string>): boolean {
  const n = noun.toLowerCase();
  if (hay.includes(n)) return true;
  // Compounds ("Go-first", "gRPC-heavy", "payments-service") are grounded if any meaningful part is.
  const parts = n.split(/[-_./]/).filter((p) => p.length >= 2 && !/^\d+$/.test(p));
  if (parts.length > 1 && parts.some((p) => hay.includes(p) || hayStems.has(stem(p)))) return true;
  return hayStems.has(stem(n));
}

export function checkNounsGrounded(text: string, ctx: CheckContext, ids: string[]): string[] {
  const reasons: string[] = [];
  const hay = (ids.map((id) => ctx.evidenceText[id] ?? "").join(" \n ") + " \n " + ctx.factsText).toLowerCase();
  const hayStems = new Set(hay.split(/[^\p{L}\p{N}]+/u).filter(Boolean).map(stem));
  const nouns = keyNouns(text, ctx.company);
  if (nouns.length === 0) reasons.push("Names nothing specific (no tool, repo, role, post or talk), so it could fit any company");
  for (const n of nouns) if (!grounded(n, hay, hayStems)) reasons.push(`“${n}” does not appear in the cited evidence`);
  return reasons;
}

function commonChecks(text: string, ctx: CheckContext): string[] {
  const reasons: string[] = [];
  const low = text.toLowerCase();
  for (const b of BANNED_PHRASES) if (low.includes(b)) reasons.push(`Contains banned phrase “${b}”`);
  if (/\{[^}]*\}|<[A-Za-z_ ]+>|\[(name|company|first ?name|your)[^\]]*\]/i.test(text)) reasons.push("Contains a placeholder");
  const c = ctx.company;
  if (c) {
    const esc = c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const standalone = new RegExp(`(?<![\\w/@-])(?<!\\w\\.)${esc}(?![\\w/-]|\\.\\w)`, "gi");
    const bad = (text.match(standalone) ?? []).some((m) => m !== c);
    if (bad) reasons.push(`Company name must be spelled exactly “${c}”`);
  }
  return reasons;
}

function checkIds(ids: string[], ctx: CheckContext): string[] {
  if (ids.length === 0) return ["Cites no evidence"];
  const bad = ids.filter((id) => !ctx.validRefs.has(id));
  return bad.length ? [`Cites evidence that does not exist: ${bad.join(", ")}`] : [];
}

export function checkOpener(textIn: string, ids: string[], ctx: CheckContext): CheckResult {
  const text = stripCites(textIn);
  const reasons: string[] = [];
  const n = wc(text);
  if (n < 18 || n > 35) reasons.push(`Opener is ${n} words; must be 18–35`);
  if (/[.!?]\s+\S/.test(text.replace(/\b(e\.g|i\.e)\./gi, ""))) reasons.push("Opener must be one sentence");
  reasons.push(...checkIds(ids, ctx));
  reasons.push(...commonChecks(text, ctx));
  if (!/\b(productiv|developer|dev (loop|experience|workflow)|ci\b|build|test|local dev|deploy|engineers?|velocity|cycle time)/i.test(text))
    reasons.push("Does not connect to developer productivity");
  if (ids.every((id) => ctx.validRefs.has(id)) && ids.length) reasons.push(...checkNounsGrounded(text, ctx, ids));
  return { ok: reasons.length === 0, reasons };
}

export function checkTalkingPoint(textIn: string, ids: string[], ctx: CheckContext): CheckResult {
  const text = stripCites(textIn);
  const reasons: string[] = [];
  if (wc(text) > 40) reasons.push("Talking point is longer than 40 words");
  reasons.push(...checkIds(ids, ctx));
  reasons.push(...commonChecks(text, ctx));
  if (ids.every((id) => ctx.validRefs.has(id)) && ids.length)
    reasons.push(...checkNounsGrounded(text, ctx, ids).filter((r) => !r.startsWith("Names nothing specific")));
  return { ok: reasons.length === 0, reasons };
}

/** Summary paragraphs: every cited id must exist, and (almost) every sentence must carry a citation. */
export function checkSummary(paragraphs: string[], ctx: CheckContext): CheckResult {
  const reasons: string[] = [];
  paragraphs.forEach((p, i) => {
    const label = `Paragraph ${i + 1}`;
    if (!p || wc(p) < 25) reasons.push(`${label} is missing or too short`);
    const sentences = p.split(/(?<=[.!?])\s+/).filter((s) => wc(stripCites(s)) >= 6);
    const uncited = sentences.filter((s) => citedIds(s).length === 0);
    if (sentences.length && uncited.length / sentences.length > 0.2) reasons.push(`${label} has ${uncited.length} sentence(s) without a citation`);
    const bad = citedIds(p).filter((id) => !ctx.validRefs.has(id));
    if (bad.length) reasons.push(`${label} cites evidence that does not exist: ${bad.join(", ")}`);
    reasons.push(...commonChecks(stripCites(p), ctx).filter((r) => !r.startsWith("Company name")));
    // numbers and key nouns in each cited sentence must be grounded in what that sentence cites
    for (const s of sentences) {
      const ids = citedIds(s).filter((id) => ctx.validRefs.has(id));
      if (!ids.length) continue;
      const bads = checkNounsGrounded(stripCites(s), ctx, Object.keys(ctx.evidenceText)).filter((r) => !r.startsWith("Names nothing"));
      if (bads.length) reasons.push(`${label}: ${bads[0]}`);
    }
  });
  return { ok: reasons.length === 0, reasons: [...new Set(reasons)].slice(0, 8) };
}

export function checkEmail(e: { subject: string; body: string; evidence_ids: string[] }, ctx: CheckContext): CheckResult {
  const reasons: string[] = [];
  if (wc(e.subject) > 7) reasons.push("Subject is longer than 7 words");
  if (!e.subject.trim()) reasons.push("Subject is empty");
  if (wc(e.body) > 110) reasons.push(`Body is ${wc(e.body)} words; must be ≤ 110`);
  if (!/\bNikhil\s*$/.test(e.body.trim())) reasons.push("Body must end with the sign-off “Nikhil”");
  reasons.push(...checkIds(e.evidence_ids, ctx));
  reasons.push(...commonChecks(`${e.subject}\n${e.body}`, ctx));
  if (e.evidence_ids.every((id) => ctx.validRefs.has(id)) && e.evidence_ids.length)
    reasons.push(...checkNounsGrounded(e.body, ctx, e.evidence_ids).filter((r) => !r.startsWith("Names nothing")));
  return { ok: reasons.length === 0, reasons: [...new Set(reasons)] };
}
