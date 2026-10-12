/**
 * Step 10: the code check. Every opener, talking point, summary and email draft must pass this before it can be
 * shown as Verified or approved. Pure code, no AI.
 *
 * What "verified" means, concretely:
 *  1. every cited evidence id exists for this company's current snapshot;
 *  2. each sentence cites the RIGHT KIND of evidence for what it is about (activity -> an activity item,
 *     a cloud/tool claim -> an infra or jobs item, languages -> a language item, ...);
 *  3. every number in a sentence appears in the items that sentence cites;
 *  4. named tools, repos and roles exist in the evidence;
 *  5. the opener names a real thing from a cited item, ties it to a specific pain, and avoids flattery.
 */

export const BANNED_PHRASES = [
  "i came across", "hope this finds you well", "i noticed your company", "leverage", "synergy",
  "touch base", "circle back", "game-changer", "game changer", "cutting-edge", "cutting edge", "revolutionize",
  "i hope this email", "reaching out to",
];

/** Extra rules for the first line and email: no flattery, no "streamline", no "opportunity to". */
export const FLATTERY = /\b(impressive|exciting|shows? how quickly|streamlin\w*|opportunity to|innovative|remarkable|incredible|amazing|fascinating|love (how|what)|great work|congrats|kudos|truly)\b/i;

/** The product pain the opener must connect to: CI time, flaky tests, local setup across services. */
export const PAIN_TERMS = /\b(ci|builds?|building|tests?|testing|pipelines?|local|environments?|deploy(s|ing|ment|ments)?|monorepo|services?)\b/i;

export type CheckResult = { ok: boolean; reasons: string[] };

export type Topic = "language" | "infra" | "activity" | "jobs" | "blog" | "talk" | "hn" | "repo";

export type CheckContext = {
  company: string;
  /** refs valid for this company's current snapshot, e.g. "E12" */
  validRefs: Set<string>;
  /** text (title + snippet + url + meta) of every evidence item, keyed by ref */
  evidenceText: Record<string, string>;
  /** title + snippet only, keyed by ref. Numbers and the opener's anchor must appear here. Falls back to evidenceText. */
  evidenceCore?: Record<string, string>;
  /** topic of each evidence item (language, infra, activity, jobs, blog, talk, hn, repo), keyed by ref */
  evidenceTopic?: Record<string, string>;
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
 *  - tokens with digits, underscore, dot, slash (repo names, versions, numbers)
 *  - capitalised words that are not at the start of a sentence (and not the company name)
 *  - hyphenated words only when a part is capitalised ("Go-first"); "front-end" is plain English
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
      if (/\d/.test(t) || /[_./]/.test(t)) {
        if (/^\d+-?(minute|min|mins|minutes|day|days|week|weeks|month|months|year|years)$/i.test(t)) return; // "20-minute call", "30-day" are not claims
        nouns.add(t);
        return;
      }
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
  // possessives ("Arora's") and plural acronyms ("SDKs") match their base form
  const base = n.replace(/['’]s$/, "");
  if (base !== n && hay.includes(base)) return true;
  if (/^[A-Z]{2,}s$/.test(noun) && hay.includes(n.slice(0, -1))) return true;
  // Compounds ("Go-first", "gRPC-heavy", "payments-service") are grounded if any meaningful part is.
  const parts = n.split(/[-_./]/).filter((p) => p.length >= 2 && !/^\d+$/.test(p));
  if (parts.length > 1 && parts.some((p) => hay.includes(p) || hayStems.has(stem(p)))) return true;
  return hayStems.has(stem(n));
}

/** Lowercase hyphenated tokens (repo names like "ndc-mongodb") that appear verbatim in the evidence: real, specific things. */
function evidencedHyphenNames(text: string, hay: string): string[] {
  return (text.match(/\b[a-z0-9]+(?:-[a-z0-9]+)+\b/g) ?? []).filter((t) => hay.includes(t));
}

const plainNums = (s: string) => s.replace(/(?<=\d),(?=\d)/g, "");

/** Names must exist in the cited evidence or the computed facts (numbers are checked separately, against the cited items). */
export function checkNounsGrounded(text: string, ctx: CheckContext, ids: string[]): string[] {
  const reasons: string[] = [];
  const hay = (ids.map((id) => ctx.evidenceText[id] ?? "").join(" \n ") + " \n " + ctx.factsText).toLowerCase();
  const hayPlain = plainNums(hay);
  const hayStems = new Set(hay.split(/[^\p{L}\p{N}]+/u).filter(Boolean).map(stem));
  const nouns = keyNouns(text, ctx.company);
  if (nouns.length === 0 && evidencedHyphenNames(text, hay).length === 0)
    reasons.push("Names nothing specific (no tool, repo, role, post or talk), so it could fit any company");
  for (const n of nouns) {
    const num = n.toLowerCase().replace(/,/g, "");
    if (/^[\d.]+$/.test(num) && hayPlain.includes(num)) continue;
    if (!grounded(n, hay, hayStems)) reasons.push(`“${n}” does not appear in the cited evidence`);
  }
  return reasons;
}

/* ---------------- topic and number fit (what makes "every claim cited" mean something) ---------------- */

/** Which topic does this evidence item answer? Used so an activity sentence cannot cite a language item. */
export function evidenceTopic(source: string, kind: string): Topic {
  if (source === "github") {
    if (kind === "languages") return "language";
    if (kind === "activity") return "activity";
    if (kind === "infra" || kind === "cloud" || kind === "microservices") return "infra";
    return "repo";
  }
  if (source === "jobs") return "jobs";
  if (source === "blog") return "blog";
  if (source === "youtube") return "talk";
  if (source === "hn") return "hn";
  return "repo";
}

const LANGS = /\b(TypeScript|JavaScript|Python|Java|Kotlin|Ruby|Rust|PHP|Swift|Scala|Elixir|Dart|Haskell|Clojure|Lua|Svelte)\b|\bC\+\+|\bC#|\bGo\b(?!-)/;
const TOPIC_RES: { topic: Topic; re: RegExp }[] = [
  { topic: "activity", re: /\b(commits?|pushed|pushes|releases?|active repos?|active repositories|build activity|shipping cadence)\b/i },
  { topic: "language", re: new RegExp(`${LANGS.source}|\\b(languages?|% of (their |the )?(public )?code|written in|codebase)\\b`, "i") },
  { topic: "infra", re: /\b(AWS|GCP|Azure|Cloudflare|Vercel|Kubernetes|K8s|Helm|Terraform|Docker|containers?|gRPC|protobuf|microservices?|CI\/CD|GitHub Actions|serverless|cloud|infrastructure|orchestration|Pulumi|Istio)\b/i },
  { topic: "jobs", re: /\b(roles?|hiring|job (posts?|postings?|descriptions?)|openings?|vacanc(y|ies)|recruit\w*|positions?)\b/i },
  { topic: "blog", re: /\b(blog|blog post|post titled|article)\b/i },
  { topic: "talk", re: /\b(talks?|keynote|conference|KubeCon|presentation|video|webinar|meetup)\b/i },
  { topic: "hn", re: /\b(Hacker News|HN)\b/ },
];

/** Case handling: language names are case-sensitive ("Go" is the language, "go" is a verb), the rest are not. */
export function sentenceTopics(s: string): Topic[] {
  const out: Topic[] = [];
  for (const { topic, re } of TOPIC_RES) {
    if (topic === "language") {
      if (LANGS.test(s) || /\b(languages?|% of (their |the )?(public )?code|written in|codebase)\b/i.test(s)) out.push(topic);
    } else if (re.test(s)) out.push(topic);
  }
  return out;
}

/** Evidence kinds that may support a sentence about each topic. */
const ALLOWED: Record<Topic, Topic[]> = {
  // a post, talk or HN story that mentions a release or a tool is still evidence for the sentence that describes it
  activity: ["activity", "repo", "blog", "talk", "hn"],
  language: ["language", "repo", "blog", "talk"],
  infra: ["infra", "jobs", "repo", "blog", "talk", "hn"],
  // the activity item also states the role, post and talk counts, so "no job board" or "zero posts" can cite it
  jobs: ["jobs", "activity"],
  blog: ["blog", "activity"],
  talk: ["talk", "activity"],
  hn: ["hn"],
  repo: ["repo"],
};

/** Numbers that are claims. Time windows ("30 days", "90 days", "12 months") are labels, not claims. */
export function numbersIn(s: string): string[] {
  const out: string[] = [];
  for (const m of s.matchAll(/\b\d[\d,]*(?:\.\d+)?\b/g)) {
    const after = s.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 12).toLowerCase();
    if (/^[\s-]*(day|days|week|weeks|month|months|year|years|hour|hours|minute|minutes|min|mins)\b/.test(after)) continue;
    out.push(m[0].replace(/,/g, ""));
  }
  return out;
}

const coreOf = (ctx: CheckContext, id: string) => (ctx.evidenceCore?.[id] ?? ctx.evidenceText[id] ?? "").toLowerCase();

/** Does this sentence cite items of the right kind, and do its numbers appear in the items it cites? */
export function checkCitationFit(sentence: string, ids: string[], ctx: CheckContext, opts: { topics?: boolean; numbersFromFacts?: boolean } = {}): string[] {
  const reasons: string[] = [];
  const s = stripCites(sentence);
  const valid = ids.filter((id) => ctx.validRefs.has(id));
  if (!valid.length) return reasons;

  if (opts.topics !== false && ctx.evidenceTopic) {
    const citedTopics = new Set(valid.map((id) => ctx.evidenceTopic![id] as Topic).filter(Boolean));
    // an item that spans two topics counts for both ("Cloud footprint (from public code and open roles)")
    for (const id of valid) if (/from public code and open roles/i.test(coreOf(ctx, id))) { citedTopics.add("infra"); citedTopics.add("jobs"); citedTopics.add("repo"); }
    // a sentence passes if ANY cited item's kind matches ANY topic detected in it (words like "Rust SDK" or "open roles" can misfire)
    const topics = sentenceTopics(s);
    if (topics.length && !topics.some((topic) => ALLOWED[topic].some((t) => citedTopics.has(t)))) {
      const got = [...citedTopics].join(", ") || "nothing";
      reasons.push(`A sentence about ${topics.join(" / ")} cites ${got} evidence, not ${[...new Set(topics.flatMap((t) => ALLOWED[t]))].join(" or ")}: “${s.slice(0, 70)}…”`);
    }
  }

  // for summary paragraphs and talking points a number may also come from the code-computed facts the model was given
  const core = plainNums(valid.map((id) => coreOf(ctx, id)).join(" \n ") + (opts.numbersFromFacts ? " \n " + ctx.factsText.toLowerCase() : ""));
  for (const num of numbersIn(s)) {
    if (!new RegExp(`(?<![\\d.])${num.replace(".", "\\.")}(?!\\d)`).test(core)) {
      reasons.push(`The number ${num} does not appear in the cited item${valid.length > 1 ? "s" : ""} (${valid.join(", ")})`);
    }
  }
  return reasons;
}

/* ---------------- shared rules ---------------- */

function commonChecks(text: string, ctx: CheckContext): string[] {
  const reasons: string[] = [];
  const low = text.toLowerCase();
  for (const b of BANNED_PHRASES) if (low.includes(b)) reasons.push(`Contains banned phrase “${b}”`);
  if (/\{[^}]*\}|<[A-Za-z_ ]+>|\[(name|company|first ?name|your)[^\]]*\]/i.test(text)) reasons.push("Contains a placeholder");
  const c = ctx.company;
  if (c) {
    const esc = c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const standalone = new RegExp(`(?<![\\w/@-])(?<!\\w\\.)${esc}(?![\\w/-]|\\.\\w)`, "gi");
    // a repo named after the company ("the posthog repository") is spelled in lower case on purpose
    const evAll = Object.values(ctx.evidenceText).join(" ").toLowerCase();
    const bad = (text.match(standalone) ?? []).some((m) => m !== c && !(m === m.toLowerCase() && evAll.includes(`repo ${m}`)));
    if (bad) reasons.push(`Company name must be spelled exactly “${c}”`);
  }
  return reasons;
}

function checkIds(ids: string[], ctx: CheckContext): string[] {
  if (ids.length === 0) return ["Cites no evidence"];
  const bad = ids.filter((id) => !ctx.validRefs.has(id));
  return bad.length ? [`Cites evidence that does not exist: ${bad.join(", ")}`] : [];
}

/**
 * The opener. It must (a) name one concrete, checkable thing that appears in a cited item's title or snippet,
 * (b) connect it to a specific pain (CI, builds, tests, pipelines, local environments, deploys, monorepo, services),
 * (c) be at most 2 sentences and 35 words, with no flattery, no "streamline" and no "opportunity to".
 */
export function checkOpener(textIn: string, ids: string[], ctx: CheckContext): CheckResult {
  const text = stripCites(textIn);
  const reasons: string[] = [];
  const n = wc(text);
  if (n < 10 || n > 35) reasons.push(`Opener is ${n} words; must be 10–35`);
  const sentenceCount = text.replace(/\b(e\.g|i\.e)\./gi, "").split(/(?<=[.!?])\s+/).filter((x) => x.trim()).length;
  if (sentenceCount > 2) reasons.push("Opener must be at most two sentences");
  reasons.push(...checkIds(ids, ctx));
  reasons.push(...commonChecks(text, ctx));
  const fl = text.match(FLATTERY);
  if (fl) reasons.push(`Avoid flattery and filler (“${fl[0]}”). State the observation plainly`);
  if (!PAIN_TERMS.test(text))
    reasons.push("Does not connect to a specific pain (CI time, builds, tests, pipelines, local environments, deploys, monorepo or many services)");

  if (ids.length && ids.every((id) => ctx.validRefs.has(id))) {
    const cores = ids.map((id) => coreOf(ctx, id)).join(" \n ");
    const hay = (ids.map((id) => ctx.evidenceText[id] ?? "").join(" \n ") + " \n " + ctx.factsText).toLowerCase();
    const anchors = [...keyNouns(text, ctx.company).filter((x) => !/^[\d.,]+$/.test(x)), ...(text.match(/\b[a-z0-9]+(?:-[a-z0-9]+)+\b/g) ?? []).filter((t) => hay.includes(t))];
    if (anchors.length === 0) {
      reasons.push("Names nothing specific (no tool, repo, role, post or talk), so it could fit any company");
    } else if (!anchors.some((a) => cores.includes(a.toLowerCase().replace(/['’]s$/, "")))) {
      reasons.push("None of the things it names (repo, tool, role, post, release) appears in the cited item's title or snippet");
    }
    reasons.push(...checkNounsGrounded(text, ctx, ids).filter((r) => !r.startsWith("Names nothing")));
    reasons.push(...checkCitationFit(text, ids, ctx, { topics: false }));
  }
  return { ok: reasons.length === 0, reasons: [...new Set(reasons)] };
}

export function checkTalkingPoint(textIn: string, ids: string[], ctx: CheckContext): CheckResult {
  const text = stripCites(textIn);
  const reasons: string[] = [];
  if (wc(text) > 40) reasons.push("Talking point is longer than 40 words");
  reasons.push(...checkIds(ids, ctx));
  reasons.push(...commonChecks(text, ctx));
  if (ids.length && ids.every((id) => ctx.validRefs.has(id))) {
    reasons.push(...checkNounsGrounded(text, ctx, ids).filter((r) => !r.startsWith("Names nothing specific")));
    reasons.push(...checkCitationFit(text, ids, ctx, { numbersFromFacts: true }));
  }
  return { ok: reasons.length === 0, reasons: [...new Set(reasons)] };
}

/** Summary paragraphs: every cited id must exist, sentences must cite the right kind of evidence, and numbers must match. */
export function checkSummary(paragraphs: string[], ctx: CheckContext): CheckResult {
  const reasons: string[] = [];
  paragraphs.forEach((p, i) => {
    const label = `Paragraph ${i + 1}`;
    if (!p || wc(p) < 25) reasons.push(`${label} is missing or too short`);
    const sentences = p.split(/(?<=[.!?])\s+/).filter((s) => wc(stripCites(s)) >= 6);
    const uncited = sentences.filter((s) => citedIds(s).length === 0);
    if (uncited.length > 1) reasons.push(`${label} has ${uncited.length} sentence(s) without a citation`);
    const bad = citedIds(p).filter((id) => !ctx.validRefs.has(id));
    if (bad.length) reasons.push(`${label} cites evidence that does not exist: ${bad.join(", ")}`);
    reasons.push(...commonChecks(stripCites(p), ctx).filter((r) => !r.startsWith("Company name")));
    for (const s of sentences) {
      const ids = citedIds(s).filter((id) => ctx.validRefs.has(id));
      if (!ids.length) continue;
      // names must exist somewhere in this company's evidence; topic and numbers must fit what THIS sentence cites
      const names = checkNounsGrounded(stripCites(s), ctx, Object.keys(ctx.evidenceText)).filter((r) => !r.startsWith("Names nothing"));
      if (names.length) reasons.push(`${label}: ${names[0]}`);
      const fit = checkCitationFit(s, ids, ctx, { numbersFromFacts: true });
      if (fit.length) reasons.push(`${label}: ${fit[0]}`);
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
  const fl = e.body.match(FLATTERY);
  if (fl) reasons.push(`Avoid flattery and filler (“${fl[0]}”)`);
  if (e.evidence_ids.length && e.evidence_ids.every((id) => ctx.validRefs.has(id))) {
    reasons.push(...checkNounsGrounded(e.body, ctx, e.evidence_ids).filter((r) => !r.startsWith("Names nothing")));
    reasons.push(...checkCitationFit(e.body, e.evidence_ids, ctx, { topics: false }));
  }
  return { ok: reasons.length === 0, reasons: [...new Set(reasons)] };
}
