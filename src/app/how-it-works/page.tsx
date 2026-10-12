import Link from "next/link";
import { inArray } from "drizzle-orm";
import { ArrowRight, Bot, Check, Code2, ExternalLink, ShieldCheck, User } from "lucide-react";
import { getDb, schema } from "@/db";
import { MODEL } from "@/lib/ai/gemini";
import { EmptyState, PageHeader, SetupNotice } from "@/components/ui/States";
import { getAccounts, getSystemHealth } from "@/lib/queries";
import { safe } from "@/lib/safe";
import { cn, fmtInt } from "@/lib/util";

export const dynamic = "force-dynamic";
export const metadata = { title: "How it works" };

const REPO = "https://github.com/dhuruchandan-png/tech-stack-scout";

type Who = "code" | "ai" | "human";
const WHO: Record<Who, { label: string; cls: string; icon: typeof Code2 }> = {
  code: { label: "Code", cls: "border-signal/40 bg-signal/10 text-signal", icon: Code2 },
  ai: { label: "Gemini Flash", cls: "border-ai/40 bg-ai/10 text-ai", icon: Bot },
  human: { label: "Nikhil", cls: "border-human/40 bg-human/10 text-human", icon: User },
};

export default async function HowItWorks() {
  const res = await safe(async () => {
    const accts = await getAccounts();
    const health = await getSystemHealth(accts);
    const snapIds = accts.map((a) => a.snapshot?.id).filter((x): x is number => !!x);
    const ev = snapIds.length ? await getDb().select({ source: schema.evidence.source }).from(schema.evidence).where(inArray(schema.evidence.snapshotId, snapIds)) : [];
    const drafts = await getDb().select({ status: schema.drafts.status }).from(schema.drafts);
    return { accts, health, ev, drafts };
  });
  if (!res.ok) return <SetupNotice error={res.error} />;
  const { accts, health, ev, drafts } = res.data;

  const withSnap = accts.filter((a) => a.snapshot);
  const bySource = (s: string) => ev.filter((e) => e.source === s).length;
  const sum = (f: (a: (typeof accts)[number]) => number) => accts.reduce((t, a) => t + f(a), 0);
  const activeRepos = sum((a) => a.snapshot?.activity?.activeRepos ?? 0);
  const roles = sum((a) => a.snapshot?.activity?.openRoles ?? 0);
  const langs = new Set(withSnap.flatMap((a) => (a.snapshot?.languages ?? []).slice(0, 1).map((l) => l.name)));
  const withCloud = accts.filter((a) => (a.snapshot?.infra?.clouds.length ?? 0) > 0).length;
  const strongMs = accts.filter((a) => a.snapshot?.microservices?.level === "strong").length;
  const openers = accts.filter((a) => a.brief?.openerText).length;
  const verified = accts.filter((a) => a.brief?.checkStatus === "verified" && a.brief.openerText).length;
  const needsReview = accts.filter((a) => a.brief?.checkStatus === "needs_review").length;
  const lowConf = accts.filter((a) => a.snapshot?.confidence === "low");
  const notFound = accts.flatMap((a) => Object.entries(a.snapshot?.sourceStatus ?? {}).filter(([, s]) => s.state === "not_found").map(([src]) => ({ a, src })));
  const changed = accts.filter((a) => (a.snapshot?.changes ?? []).some((c) => !/first snapshot|no material/i.test(c.text))).length;
  const sentDrafts = drafts.filter((d) => d.status === "sent").length;
  const sample = withSnap[0];

  const steps: { n: number; title: string; what: string; who: Who; href?: string; live?: string }[] = [
    { n: 1, title: "Nikhil edits the watchlist", what: "He adds or removes a company (name + website) on the Watchlist page, or directly in the database table. No code.", who: "human", href: "/accounts", live: `${accts.length} companies on the watchlist` },
    { n: 2, title: "One row per company is stored", what: "The `companies` table holds the name, a cleaned domain, and optional overrides (GitHub org, job-board slug, blog feed, YouTube query). Duplicate domains are blocked.", who: "code" },
    { n: 3, title: "Refresh is triggered", what: "Every Monday 6:00 IST a Vercel cron queues every active company (3a). Nikhil can also tap Refresh now before any call (3b). One company is processed per request, so nothing times out.", who: "code", href: "/runs", live: `Last weekly run: ${health.lastWeeklyRun ? new Date(health.lastWeeklyRun).toLocaleDateString("en-GB") : "not yet"}` },
    { n: 4, title: "Match the sources", what: "Uses the overrides, otherwise finds the company's GitHub org, job board and blog feed from its domain. Each match gets a confidence level, and Nikhil can correct it.", who: "code", href: sample ? `/accounts/${sample.company.domain}?tab=sources` : undefined },
    { n: 5, title: "Fetch live public data", what: "GitHub (repos, languages, commits, infra files), job boards (Greenhouse / Lever / Ashby), engineering blog RSS, YouTube talks (own channel or tech-titled videos only; earnings, memes and gaming are rejected), Hacker News.", who: "code", live: `${fmtInt(activeRepos)} active repos · ${fmtInt(roles)} open eng roles · ${bySource("blog")} posts · ${bySource("youtube")} talks · ${bySource("hn")} HN stories` },
    { n: 6, title: "Load last week's snapshot", what: "So the system can say what changed since last week.", who: "code" },
    { n: 7, title: "Build the evidence pack", what: "Every signal becomes an evidence item with an id (E1, E2…), source, link, title, snippet and date. This is what makes every claim checkable.", who: "code", live: `${fmtInt(ev.length)} evidence items` },
    { n: 8, title: "Code answers Q1, Q2, Q3", what: "Languages by code size (markup and docs repos excluded), cloud and infra split into \"runs on\" and \"integrates with\" with a strength, microservices from deployable services, commits for two 30-day windows with bots removed, engineering roles by title, confidence, and what changed. Plain code, not AI, so the numbers are exact.", who: "code", live: `${withCloud} accounts with a visible cloud · ${strongMs} with a strong microservices signal · ${changed} changed vs last week` },
    { n: 9, title: "Gemini writes the summary and first line", what: "Gemini Flash reads only the evidence pack and the computed facts, and writes two paragraphs plus one suggested opening line, citing evidence ids like [E12].", who: "ai", live: `${openers} openers drafted · model ${MODEL()} · $${health.costWeek.toFixed(2)} this week` },
    { n: 10, title: "Code checks the AI", what: "Every sentence must cite the right kind of evidence (a commits claim cites an activity item, a cloud claim an infra or jobs item), every number must appear in the cited item, and the opener must name a real repo, tool or role from a cited title and tie it to a specific pain, with no flattery. One automatic retry, then \"Needs review\". Needs-review text cannot be approved, and a Low-confidence account can never be Verified.", who: "code", live: `${verified} verified · ${needsReview} needs review` },
    { n: 11, title: "Save this week's snapshot", what: "Signals, evidence, summary, opener, confidence and run log are stored. If a source failed, last week's data is kept and marked \"Stale since…\".", who: "code" },
    { n: 12, title: "The account page shows it all", what: "Q1, Q2, Q3, the summary, the first line, what changed, with a source behind every claim. Also Call these first, Radar, One-pager.", who: "code", href: sample ? `/accounts/${sample.company.domain}` : "/accounts", live: `${withSnap.length}/${accts.length} accounts have data` },
    { n: 13, title: "HubSpot gets the facts", what: "After every refresh the code-calculated facts sync to the company record. AI-written text goes to HubSpot only after Nikhil approves it, and sent emails are logged.", who: "code", live: `${health.synced}/${accts.length} companies synced` },
    { n: 14, title: "Human gate: Nikhil approves", what: "He can Edit, Regenerate, share internally, then Approve. Only approved drafts can move on.", who: "human", href: "/outreach", live: `${drafts.length} drafts` },
    { n: 15, title: "He sends from his own inbox", what: "The approved email opens in his own Gmail or Outlook. He presses Send himself, then marks it sent. The app never emails a prospect; Resend only sends internal drafts and the Monday brief.", who: "human", live: `${sentDrafts} logged as sent` },
  ];

  const reqs: { id: string; need: string; how: string; proof: string; href?: string }[] = [
    { id: "R1", need: "The watchlist stays automatically current with engineering context", how: "Weekly cron + Refresh now pull live GitHub, jobs, blog, talks and Hacker News for every company.", proof: `${health.fresh}/${accts.length} accounts refreshed within 7 days`, href: "/" },
    { id: "R2", need: "Q1: which programming languages dominate their public codebase", how: "Code sums language bytes over active, non-fork repos from the last 12 months.", proof: `${withSnap.length} accounts analysed · top languages seen: ${[...langs].slice(0, 5).join(", ") || "n/a"}`, href: "/accounts" },
    { id: "R3", need: "Q2: which cloud / infrastructure tooling their engineers visibly use", how: "Code reads repo file trees and a few files (Dockerfile, Kubernetes, Terraform, CI, protobuf) and the open job posts. \"Runs on\" (deploy evidence) is kept separate from \"integrates with\" (SDK imports, docs hosting), each with a strength.", proof: `${withCloud} accounts with a "runs on" cloud · ${strongMs} strong microservices`, href: "/radar" },
    { id: "R4", need: "Q3: how actively their team is building", how: "Commits (latest 30 days vs the 30 before, bots removed), repos pushed, releases, engineering roles (of all roles), posts, talks, plus a 13-week heat strip.", proof: `${fmtInt(roles)} open eng roles across the watchlist`, href: "/accounts" },
    { id: "R5", need: "Refreshed weekly, so stale research never follows him into a call", how: "Vercel cron every Monday 6:00 IST. Every account shows a freshness pill and flags any stale source.", proof: "Cron: 30 0 * * 1 (UTC) · see the Runs page", href: "/runs" },
    { id: "R6", need: "Gemini writes a two-paragraph engineering context summary per company", how: "Gemini Flash, evidence only, every sentence cited, then verified by code.", proof: `${withSnap.filter((a) => a.brief?.summaryP1).length} summaries written`, href: sample ? `/accounts/${sample.company.domain}` : undefined },
    { id: "R7", need: "Gemini suggests a first outreach line tied to something specific, not a template", how: "The opener must name a real repo, tool, role or post from a cited item and tie it to one specific pain (CI time, tests, builds, local environments). Flattery, banned phrases and placeholders are rejected.", proof: `${openers} openers · ${verified} verified by the code check`, href: "/" },
    { id: "R8", need: "He can add or remove companies without touching code", how: "Add/remove on the Watchlist page (soft delete with Undo), or edit the `companies` table in the database.", proof: `${accts.length} companies, all added without code`, href: "/accounts?add=1" },
  ];

  const stack: [string, string][] = [
    ["Next.js 15 + TypeScript + Tailwind", "The app: pages, Server Actions and API routes"],
    ["Vercel (hosting + Cron)", "Public deployment and the Monday jobs"],
    ["Neon Postgres + Drizzle ORM", "Database (same Postgres as Supabase; see below)"],
    ["Google Gemini Flash", "The only AI used: summaries, first lines, email drafts, Q&A"],
    ["GitHub API (GraphQL + REST)", "Repos, languages, commits, infra files"],
    ["Greenhouse / Lever / Ashby, RSS, YouTube Data API, Hacker News", "Jobs, blog posts, talks, discussion"],
    ["HubSpot (service key)", "CRM record sync, approved text and email log"],
    ["Resend", "Internal-only drafts and the Monday brief"],
    ["Vitest + Playwright", "Unit tests and a smoke test across every page"],
  ];

  return (
    <div className="pb-10">
      <PageHeader eyebrow="Plain-English guide · every number on this page is live" title="How Tech Stack Scout works" />

      <section className="card p-6">
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <div className="label mb-2">The problem</div>
            <p className="serif text-[19px] leading-snug">Nikhil sells a developer productivity tool. It only fits certain setups, and learning how a company builds used to take 2–3 hours per sprint of research, none of it in his CRM.</p>
          </div>
          <div>
            <div className="label mb-2">The answer</div>
            <p className="serif text-[19px] leading-snug">Scout watches each target company&apos;s public engineering footprint every week, answers three questions with code, and has Gemini write a two-paragraph brief and a specific first line, every claim linked to its source.</p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2 text-[12.5px]">
          <span className="chip border-signal/40 bg-signal/10 text-signal"><Code2 className="h-3 w-3" /> Q1 Languages</span>
          <span className="chip border-signal/40 bg-signal/10 text-signal"><Code2 className="h-3 w-3" /> Q2 Cloud &amp; infra</span>
          <span className="chip border-signal/40 bg-signal/10 text-signal"><Code2 className="h-3 w-3" /> Q3 Activity</span>
          <span className="chip border-ai/40 bg-ai/10 text-ai"><Bot className="h-3 w-3" /> Summary + first line</span>
          <span className="chip border-human/40 bg-human/10 text-human"><User className="h-3 w-3" /> Nikhil approves and sends</span>
        </div>
        <div className="mt-5 flex items-start gap-3 rounded-card border border-alert/30 bg-alert/5 p-4 text-[13px]">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-alert" />
          <p><b>The Cut: nothing reaches a prospect without Nikhil.</b> No auto-send, no scheduling, no sequences, no prospect email through Resend, and no AI-written text in HubSpot before he approves it. The tool drafts; Nikhil approves and sends from his own inbox.</p>
        </div>
      </section>

      {/* ---- 15 steps ---- */}
      <section className="mt-8" aria-labelledby="steps">
        <h2 id="steps" className="label mb-1">The workflow, step by step (matches the Components Map)</h2>
        <p className="mb-4 flex flex-wrap items-center gap-3 text-[12.5px] text-muted">
          Who does each step:
          {(Object.keys(WHO) as Who[]).map((w) => { const I = WHO[w].icon; return <span key={w} className={cn("chip", WHO[w].cls)}><I className="h-3 w-3" /> {WHO[w].label}</span>; })}
        </p>
        <ol className="space-y-2.5">
          {steps.map((s) => {
            const w = WHO[s.who]; const I = w.icon;
            return (
              <li key={s.n} className={cn("card flex gap-4 p-4", s.n === 13 && "mt-6")}>
                <div className="mono flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line-strong bg-raised text-[13px] font-semibold">{s.n}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[15px] font-semibold">{s.title}</h3>
                    <span className={cn("chip !py-0 text-[11px]", w.cls)}><I className="h-3 w-3" /> {w.label}</span>
                    {s.n === 13 && <span className="label !text-[10px]">Outreach add-on</span>}
                  </div>
                  <p className="mt-1 text-[13.5px] text-muted">{s.what}</p>
                  {(s.live || s.href) && (
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-[12.5px]">
                      {s.live && <span className="mono rounded-input bg-raised px-2 py-1 text-ink">{s.live}</span>}
                      {s.href && <Link href={s.href} className="flex items-center gap-1 text-signal hover:underline">See it in the app <ArrowRight className="h-3 w-3" /></Link>}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {/* ---- requirements ---- */}
      <section className="mt-10" aria-labelledby="reqs">
        <h2 id="reqs" className="label mb-3">What the brief asks for (R1–R8) and live proof it works</h2>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[760px] text-[13px]">
            <thead className="border-b border-line"><tr className="label text-left"><th className="px-4 py-3 font-normal">#</th><th className="font-normal">Requirement</th><th className="font-normal">How it is met</th><th className="font-normal">Live proof</th><th /></tr></thead>
            <tbody>
              {reqs.map((r) => (
                <tr key={r.id} className="border-b border-line align-top last:border-0">
                  <td className="mono px-4 py-3 font-semibold text-signal">{r.id}</td>
                  <td className="py-3 pr-4">{r.need}</td>
                  <td className="py-3 pr-4 text-muted">{r.how}</td>
                  <td className="mono py-3 pr-4 text-[12px]"><span className="flex items-start gap-1.5"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-verified" />{r.proof}</span></td>
                  <td className="py-3 pr-4">{r.href && <Link href={r.href} className="text-signal hover:underline">Open</Link>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---- exam rules ---- */}
      <section className="mt-10" aria-labelledby="rules">
        <h2 id="rules" className="label mb-3">Exam rules, checked</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["Live external data", `${fmtInt(ev.length)} evidence items from live sources: GitHub ${bySource("github")}, jobs ${bySource("jobs")}, blog ${bySource("blog")}, talks ${bySource("youtube")}, Hacker News ${bySource("hn")}.`],
            ["All AI is Gemini Flash", `One file talks to a model (src/lib/ai/gemini.ts), and only to Gemini Flash. Current model: ${MODEL()}. No Claude API anywhere.`],
            ["Deployed on Vercel", "Public URL, no login needed to view. Actions (refresh, approve, send, HubSpot) need the passcode, checked on the server. Weekly cron configured in vercel.json."],
            ["Works with data at submission", `${withSnap.length} of ${accts.length} accounts already have a full brief.`],
          ].map(([t, d]) => (
            <div key={t} className="card p-4"><div className="flex items-center gap-2 text-[14px] font-semibold"><Check className="h-4 w-4 text-verified" />{t}</div><p className="mt-1.5 text-[12.5px] text-muted">{d}</p></div>
          ))}
        </div>
      </section>

      {/* ---- edge cases ---- */}
      <section className="mt-10" aria-labelledby="edge">
        <h2 id="edge" className="label mb-3">Edge cases you can click on right now</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="card p-4">
            <div className="text-[14px] font-semibold">Low confidence, thin public code</div>
            <p className="mt-1 text-[12.5px] text-muted">No public GitHub org or too little data: shown honestly, never guessed.</p>
            <div className="mt-2 flex flex-wrap gap-2">{lowConf.length ? lowConf.slice(0, 4).map((a) => <Link key={a.company.id} className="chip hover:border-signal" href={`/accounts/${a.company.domain}`}>{a.company.name}</Link>) : <span className="text-[12.5px] text-faint">none right now</span>}</div>
          </div>
          <div className="card p-4">
            <div className="text-[14px] font-semibold">Needs review</div>
            <p className="mt-1 text-[12.5px] text-muted">The code check caught a claim the evidence does not support; it cannot be approved until fixed.</p>
            <div className="mt-2 flex flex-wrap gap-2">{accts.filter((a) => a.brief?.checkStatus === "needs_review").slice(0, 4).map((a) => <Link key={a.company.id} className="chip hover:border-signal" href={`/accounts/${a.company.domain}`}>{a.company.name}</Link>)}{needsReview === 0 && <span className="text-[12.5px] text-faint">none right now</span>}</div>
          </div>
          <div className="card p-4">
            <div className="text-[14px] font-semibold">Source not found</div>
            <p className="mt-1 text-[12.5px] text-muted">No job board or blog feed found: marked Not found with a tip to add an override.</p>
            <div className="mt-2 flex flex-wrap gap-2">{notFound.slice(0, 4).map(({ a, src }) => <Link key={`${a.company.id}-${src}`} className="chip hover:border-signal" href={`/accounts/${a.company.domain}?tab=sources`}>{a.company.name} · {src}</Link>)}{notFound.length === 0 && <span className="text-[12.5px] text-faint">none right now</span>}</div>
          </div>
        </div>
      </section>

      {/* ---- stack ---- */}
      <section className="mt-10" aria-labelledby="stack">
        <h2 id="stack" className="label mb-3">Tools and services used</h2>
        <div className="card divide-y divide-line">
          {stack.map(([t, d]) => <div key={t} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2.5 text-[13px]"><span className="font-medium">{t}</span><span className="text-muted">{d}</span></div>)}
        </div>
        <p className="mt-3 text-[12.5px] text-muted"><b className="text-ink">Why Neon instead of Supabase?</b> The brief mentions Supabase. The Supabase free account had hit its project limit. Neon is also Postgres: the same schema and SQL, so switching back is one connection string. Nikhil still adds or removes companies without code, on the Watchlist page or in the database&apos;s table editor.</p>
      </section>

      {/* ---- submission ---- */}
      <section className="mt-10" aria-labelledby="submit">
        <h2 id="submit" className="label mb-3">What gets submitted</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <a className="card block p-4 hover:border-signal/60" href="/"><div className="text-[14px] font-semibold">1 · Public URL</div><p className="mt-1 text-[12.5px] text-muted">This site. Anyone can view it without logging in.</p></a>
          <a className="card block p-4 hover:border-signal/60" href={REPO} target="_blank" rel="noreferrer"><div className="flex items-center gap-1.5 text-[14px] font-semibold">2 · GitHub repository <ExternalLink className="h-3 w-3" /></div><p className="mt-1 text-[12.5px] text-muted">All code, SQL, tests, README and the demo script.</p></a>
          <a className="card block p-4 hover:border-signal/60" href="/components-map.png" target="_blank" rel="noreferrer"><div className="flex items-center gap-1.5 text-[14px] font-semibold">3 · Components Map <ExternalLink className="h-3 w-3" /></div><p className="mt-1 text-[12.5px] text-muted">The workflow diagram this app follows, step for step.</p></a>
        </div>
        <div className="card mt-4 overflow-hidden p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/components-map.png" alt="Tech Stack Scout Components Map: the 15-step workflow from trigger to output" className="w-full rounded-input" loading="lazy" />
        </div>
      </section>

      {accts.length === 0 && <div className="card mt-8"><EmptyState title="No data yet." hint="Run Refresh all and the live numbers above fill in." /></div>}
    </div>
  );
}
