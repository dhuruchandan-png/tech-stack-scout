import { BANNED_PHRASES } from "./check";
import { S } from "./gemini";

/* ================= 4.1 Account brief ================= */

export const BRIEF_SYSTEM = `You are a sharp sales-intelligence analyst writing a pre-call memo for an enterprise account executive who sells a developer productivity tool to engineering teams.

HARD RULES
- Use ONLY the evidence items and computed facts provided. Never use outside knowledge. Never guess.
- Every factual sentence in the two summary paragraphs ends with at least one citation like [E12] or [E3][E7]. Cite only ids that appear in the evidence list.
- Paragraph 1 (summary_p1): how they build: languages, cloud/platform, architecture, tooling.
- Paragraph 2 (summary_p2): what is happening now: activity, hiring, recent posts and talks, and what changed vs last week.
- The summary describes the stack and the activity ONLY. Do not add a closing sentence about why it matters, developer velocity or the product being sold: that reasoning belongs in talking_points, not in the summary.
- If a source says it is unavailable or not found (for example "jobs data unavailable"), say it is unavailable. Never turn it into "zero" of anything.
- Each paragraph is 55–95 words. Plain, specific, no marketing fluff, no hedging like "it seems" or "appears to".
- If confidence is low, say plainly what is missing.
- CITE THE RIGHT KIND OF EVIDENCE. Put the citation on the item that actually contains the fact: commits, repos pushed and releases -> the "Build activity" item; languages -> the "Language mix" item; cloud, tool and architecture claims -> the cloud, microservices or infra items, or job items that name the tool; hiring -> job items; blog and talk claims -> blog or talk items. Never cite the language item for activity or hiring. Every number you write must appear in a cited item.
- The opener (opener.text) is at most 2 short sentences and at most 35 words in total, written to the prospect. It must: (a) name ONE concrete thing that appears in the title or snippet of an item you cite (a repo name, a tool, a job title, a blog post title, a release); (b) connect it to ONE specific pain the product solves: CI time, flaky or slow tests, builds, or local environment setup across many services. It must not flatter ("impressive", "exciting", "shows how quickly"), must not say "streamline" or "opportunity to", and must not use placeholders. Do NOT put citation markers in the opener text; list its evidence ids in opener.evidence_ids.
  Good: "Saw Kubernetes cited across 14 open engineering roles alongside s2s-proxy and Helm charts. Curious how long CI takes when changes touch your Go services?"
- Banned in every output: ${BANNED_PHRASES.map((b) => `"${b}"`).join(", ")}, any {placeholder}, and anything that would fit any company.
- talking_points: exactly 3, each one short sentence (max 30 words) with its own evidence_ids.
- unknowns: things a salesperson would want to know that the evidence does not cover (can be empty).
- Spell the company name exactly as given.
- Mention ONLY technologies, products, tools and numbers that literally appear in the evidence items or the computed facts. If something is not written there (for example a cloud, a framework or a product name), do not mention it, even if you know it to be true.
- Never use the word "leverage". Prefer plain words over hyphenated compounds.`;

export const BRIEF_SCHEMA = S.obj({
  summary_p1: S.str,
  summary_p2: S.str,
  opener: S.obj({
    text: S.str,
    evidence_ids: S.strArray,
    hook_type: { type: "STRING", enum: ["repo", "hiring", "blog", "talk", "infra", "activity"] },
  }),
  talking_points: S.arr(S.obj({ text: S.str, evidence_ids: S.strArray })),
  unknowns: S.strArray,
});

export type BriefOutput = {
  summary_p1: string;
  summary_p2: string;
  opener: { text: string; evidence_ids: string[]; hook_type: "repo" | "hiring" | "blog" | "talk" | "infra" | "activity" };
  talking_points: { text: string; evidence_ids: string[] }[];
  unknowns: string[];
};

export type BriefInput = {
  company: string;
  facts: string; // code-calculated Q1/Q2/Q3, microservices, confidence, changes (rendered text)
  evidence: { ref: string; source: string; title: string; snippet: string; date: string | null }[];
  productNotes?: string | null;
};

export function briefPrompt(i: BriefInput, retryReasons?: string[]): string {
  const ev = i.evidence
    .map((e) => `[${e.ref}] (${e.source}${e.date ? `, ${e.date}` : ""}) ${e.title} — ${e.snippet}`)
    .join("\n");
  return `COMPANY: ${i.company}
${i.productNotes ? `\nABOUT THE PRODUCT BEING SOLD (from the seller):\n${i.productNotes}\n` : ""}
COMPUTED FACTS (calculated by code, authoritative):
${i.facts}

EVIDENCE ITEMS (the only things you may cite):
${ev}
${retryReasons?.length ? `\nYOUR PREVIOUS ATTEMPT FAILED THESE CHECKS. FIX EVERY ONE:\n- ${retryReasons.join("\n- ")}\n` : ""}
Write the JSON now.`;
}

/* ================= 4.2 Email draft ================= */

export const EMAIL_SYSTEM = `You write a short, human, plain outreach email from Nikhil, an enterprise account executive selling a developer productivity tool, to an engineering leader. This is a DRAFT that Nikhil will review and send himself.
- subject: at most 7 words, specific, no clickbait.
- body: at most 110 words. Start directly with the opener sentence (no greeting line with a name). Then 2–3 lines on why it matters for how they build, grounded in the evidence. End with a soft call to action for a 20-minute call. Sign off with a new line and just "Nikhil".
- Use ONLY the provided evidence. List the ids you relied on in evidence_ids. Do not put citation markers in the text.
- No hype, no flattery, no "streamline", no "opportunity to". Banned: ${BANNED_PHRASES.map((b) => `"${b}"`).join(", ")}, any {placeholder}.`;

export const EMAIL_SCHEMA = S.obj({ subject: S.str, body: S.str, evidence_ids: S.strArray });
export type EmailOutput = { subject: string; body: string; evidence_ids: string[] };

export function emailPrompt(args: {
  company: string; opener: string; summary: string;
  evidence: { ref: string; source: string; title: string; snippet: string }[];
  recipient?: string | null; retryReasons?: string[];
}): string {
  return `COMPANY: ${args.company}
${args.recipient ? `RECIPIENT: ${args.recipient}\n` : ""}OPENER TO USE (keep its facts): ${args.opener}
SUMMARY: ${args.summary}
EVIDENCE:
${args.evidence.map((e) => `[${e.ref}] (${e.source}) ${e.title} — ${e.snippet}`).join("\n")}
${args.retryReasons?.length ? `\nPREVIOUS ATTEMPT FAILED THESE CHECKS. FIX EVERY ONE:\n- ${args.retryReasons.join("\n- ")}\n` : ""}
Write the JSON now.`;
}

/* ================= 4.3 Q&A ================= */

export const QA_SYSTEM = `You answer a salesperson's question about one company using ONLY the evidence items provided.
- Cite every factual claim with [E#] markers that appear in the evidence list.
- If the evidence does not contain the answer, answer exactly "Not in the evidence yet." and in "missing" name which source (GitHub, job board, blog, talks, Hacker News) might have it.
- Be brief: at most 90 words.`;

export const QA_SCHEMA = S.obj({ answer: S.str, evidence_ids: S.strArray, missing: S.str }, ["answer", "evidence_ids"]);
export type QaOutput = { answer: string; evidence_ids: string[]; missing?: string };

export function qaPrompt(company: string, question: string, evidence: { ref: string; source: string; title: string; snippet: string }[]): string {
  return `COMPANY: ${company}
QUESTION: ${question}
EVIDENCE:
${evidence.map((e) => `[${e.ref}] (${e.source}) ${e.title} — ${e.snippet}`).join("\n")}`;
}
