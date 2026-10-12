# Tech Stack Scout

**AI-powered tech stack intelligence for a sales team's target-account watchlist.**
Domain: B2B Sales Intelligence · Developer Tools. Built for Nikhil, an enterprise account executive who sells a developer productivity tool.

> Live app: https://tech-stack-scout-six.vercel.app · Open access (no passcode needed)

Everything is **viewable without login**. Every action that changes data or reaches outside (Refresh, add/remove company, draft, approve, send internally, HubSpot sync, mark sent, Q&A) needs the **Admin passcode**, checked **on the server** in every Server Action and POST route (an httpOnly cookie), not just hidden in the UI. The header shows **Locked** or **Unlocked**. If `ADMIN_PASSCODE` is not set, actions stay disabled. For a no-login demo, set `OPEN_ACCESS=true` explicitly (the header then shows "Open access"). Nothing reaches a prospect in any mode.

> **Submitting?** See [`docs/SUBMISSION.md`](docs/SUBMISSION.md). The in-app **How it works** page (`/how-it-works`) explains the whole workflow with live numbers.

## The problem

Nikhil's product only fits certain setups: specific clouds, microservices, particular languages. For a sprint of 20 target companies he spends 2–3 hours piecing together engineering context from blogs, job descriptions, conference talks and public repos, and none of it reaches his CRM. His close rate is ~30% higher when he mentions something real about how a company builds.

Tech Stack Scout keeps that research current automatically, shows every claim with its source, and drafts a specific first line. **It never contacts a prospect. Nikhil approves and sends from his own inbox.**

## Brief → features (R1–R8)

| # | Requirement | Where it lives |
|---|---|---|
| R1 | Watchlist stays automatically current | Weekly Vercel Cron queues every active company; each refresh pulls live GitHub, job boards, blog RSS, YouTube, Hacker News |
| R2 | Q1: dominant languages | Code sums language bytes over active non-fork repos → **Q1 card**, Language Bar, trend vs last week |
| R3 | Q2: cloud / infra tooling | Code reads file trees and a few file contents (Dockerfile, k8s, Terraform providers, workflows, SDKs, protobuf) → **Q2 card**, microservices signal with reasons |
| R4 | Q3: how actively they build | Commits 30/90d, repos pushed, releases, open eng roles, posts, talks, 13-week heat strip → **Q3 card** |
| R5 | Refreshed weekly | `vercel.json` cron `30 0 * * 1` (Mon 6:00 IST); Freshness Pill on every account; stale sources are flagged |
| R6 | Gemini two-paragraph summary | Gemini Flash writes from evidence only; every sentence carries `[E#]` receipts |
| R7 | Specific first line, not a template | Opener must name one concrete thing from the cited evidence; code check enforces it |
| R8 | Add / remove without code | **Watchlist page** (Add drawer, remove + Undo) **or** the Neon table editor on `companies` |

## Architecture (mirrors the Components Map, steps 1–15)

```
Trigger        3a Vercel Cron (Mon 6:00 IST) ─┐        3b "Refresh now" / "Refresh all"
Input          1 Nikhil edits watchlist ─► 2 Neon `companies` (+ overrides)
                                           │
               4 Match sources (overrides, else auto-discover GitHub org / job board / RSS; stores confidence + candidates)
               5 Fetch live data: GitHub GraphQL+REST · Greenhouse/Lever/Ashby · blog RSS · YouTube · Hacker News
Context        6 Last week's snapshot  ─┐
               7 Evidence pack: every signal → item {id, source, url, title, snippet, date}
Processing     8 CODE, NOT AI: Q1–Q3, microservices, confidence, what changed vs last week
AI             9 Gemini Flash (evidence only): 2-paragraph summary + first line, with evidence ids
               10 CODE CHECK: ids exist, named things appear in the evidence, banned phrases, length. Regenerate once, else Needs review
Output         11 Save snapshot ─► 12 Account page (Q1·Q2·Q3, summary, opener, diff, Call first, Radar, One-pager) + HubSpot facts
Outreach       13 HubSpot: code facts auto; AI text only after approval; sent emails logged
               14 HUMAN GATE: Edit · Regenerate · Send internally · Approve
               15 Approved email opens in Nikhil's Gmail/Outlook. He sends, then clicks "Mark as sent". Resend = internal drafts + Monday brief only
```

One company is processed per request (`/api/refresh/[companyId]`, `maxDuration = 60`). The cron queues all companies into `runs` and fans out at a concurrency of 2. Every step writes to `run_steps`, which the **Run Console** polls.

## The Cut (non-negotiable)

Nothing reaches a prospect without Nikhil.

- No auto-send, no scheduling, no sequences.
- **No prospect email through Resend.** Resend is called from exactly one function (`sendRaw`, `src/lib/email/send.ts`), which re-validates the recipient against the internal allowlist on every call. Even a bug in a caller cannot reach a prospect. Covered by tests (`tests/guard.test.ts`).
- **No AI-written text in HubSpot before Nikhil approves it.** Refreshes write only code-calculated facts; the approved summary/opener and a Note are written in the Approve action.
- The tool drafts. Nikhil approves (step 14) and sends from his own inbox (step 15). "Open in Gmail/Outlook" only pre-fills a compose window.

## Data sources and limits

| Source | What | Key | Notes |
|---|---|---|---|
| GitHub GraphQL + REST | repos, language bytes, commits (30/90d + 13 weekly buckets), releases, git trees | `GITHUB_TOKEN` (fine-grained, public read) | Top **50** repos by last push (a heavier page returned 502s for the biggest orgs); tree scan on the **15** most recently pushed active repos; ≤3 `.tf` files per repo; raw file fetches via `raw.githubusercontent.com`. Pauses on low rate limit |
| Greenhouse / Lever / Ashby | open roles, descriptions | none | Slugs from override → name → domain root. Engineering roles by title/department |
| Blog RSS | last 10 posts | none | Override, else common feed paths |
| YouTube Data API v3 | conference talks (24 months) | `YOUTUBE_API_KEY` | ~100 quota units per company; 20 companies/week is far inside 10k/day. Filtered to titles that name the company **and** talk/conference words |
| Hacker News (Algolia) | stories, last 90 days | none | Company domain, or company name + tech keyword |

Raw responses are cached per source per company for **6 hours** (`source_cache`), so repeated "Refresh now" taps do not hammer the APIs. 403/429 get exponential back-off, honouring `Retry-After`.

### Code-calculated rules

- **Q1 languages:** code size in active, non-fork, non-archived repos pushed in the last 12 months. **Markup, docs and config formats are never counted** (MDX, Markdown, HTML, CSS, SCSS, Jupyter, TeX, Roff, Makefile, Dockerfile, HCL, YAML, JSON, Shell, PowerShell, Batchfile, Pkl, Nix, Starlark, Smarty, Mustache). HCL and Dockerfile stay visible as Q2 infra signals. Repos named `docs`, `website`, `*.github.io`, `examples`, `samples` or `awesome-*` are excluded and shown as "N docs/example repos excluded". "Dominant" = the top 1–2 (the second only if it is ≥ 60% of the first). If more than 60% of active repos are public SDKs/client libraries, Q1 shows "Mostly public SDKs: their internal stack may differ" and Gemini is told so.
- **Q2 cloud and infra, in two labelled groups.** *Runs on / deploys to*: Terraform providers, CI deploy steps (aws-actions, google-github-actions…), serverless configs, a `vercel.json` in a real repo, or a cloud named in 3+ open engineering roles. *Integrates with / supports*: SDK imports, a `vercel.json` in a docs/website repo, one-off configs. Each cloud gets a **strength**: **Strong** = 3+ independent signals from 2+ repos or job posts, **Weak** = one signal, **Some** in between. Gemini is told never to describe a Weak signal as a "cloud footprint".
- **Microservices signal:** a *deployable service* is a repo with both a Dockerfile and Kubernetes/Helm manifests (docs and example repos never count). **Strong** = 5+ deployable services, or gRPC/protobuf in 5+ repos plus Kubernetes named in open roles. **Medium** = 2–4. **Weak** = 1. **None** = scanned, none found. **Unknown** = nothing could be scanned. The reason line is shown exactly as computed.
- **Q3 activity:** commits for the latest 30 days and the 30 days before (days 31–60), with **bot commits** (dependabot, renovate, github-actions, `*-bot`) removed by sampling the latest 100 commits of the 20 most recent repos. **Engineering roles** are counted by title (engineer, developer, SRE, devops, platform, infrastructure, architect…) and exclude success, advocate, sales, solutions, support, customer, recruiter, marketing, community and similar, shown as "N eng roles (of M total)". Level: **High** commits ≥ 150, or ≥ 60 across ≥ 8 repos · **Medium** ≥ 30 commits or ≥ 4 repos pushed · **Low** any commit or hiring/blog/talk/release · **Dormant** nothing.
- **What changed:** a commit move is reported only if it is ≥ 20% **and** ≥ 50 commits (30 days vs the 30 before); a language shift only if ≥ 5 points on a language used in 3+ repos. **"New repo"** means created in the last 7 days; otherwise "Newly active".
- **Talks (YouTube):** accepted only if the video is on the company's **own channel** (auto-detected, stored per company, editable), **or** its title names the company **and** a tech keyword (engineering, architecture, scale, kubernetes, migration, infra, platform, SDK, KubeCon/QCon/GopherCon…). Earnings, tickers (`$FRSH`), vox pops, reactions, memes, gaming, trailers and shorts are always rejected, and "Good week to call: a new talk" fires only on an accepted talk.
- **GitHub org matching:** domain match first; if the best candidate has no public repos, other candidates (`name-developers`, `-dev`, `-inc`, `-oss`, `-labs`…) are tried, and an org whose website is on the same brand domain (freshworks.dev for freshworks.com) counts as a domain match. Always overridable.
- **Confidence:** High needs a domain-matched org, ≥5 active repos, ≥3 scanned, ≥3 corroborating signals and no failed source. Medium for name-matched orgs or one strong leg. Low with no/fuzzy org or a thin footprint, always with the reason. **A Low-confidence account can never show a Verified opener.**
- **Freshness:** teal < 7 days, amber 7–10, red beyond; "Stale since {date}" when a source failed.
- **Call these first:** +3 per meaningful change (max 4), +4 High / +2 Medium activity, +3 Strong / +1 Medium microservices, +2 any "runs on" cloud, +3 verified opener, −6 already contacted.

## Gemini (Flash only)

Model from `GEMINI_MODEL` (default the rolling `gemini-flash-latest` alias, with automatic fallback across Flash versions, since Google retires versions for new API users) via `@google/genai`, always `responseMimeType: application/json` with a `responseSchema`. Tokens and cost are logged per call (`briefs`, `runs`). No Claude API or any other model is used anywhere in the app. All calls are in `src/lib/ai/`.

- **Brief** (`BRIEF_SYSTEM` / `BRIEF_SCHEMA` in `src/lib/ai/prompts.ts`): input is the company, code-calculated facts, and ≤40 evidence items, never raw web pages. Output: `{summary_p1, summary_p2, opener{text, evidence_ids, hook_type}, talking_points×3, unknowns}`.
- **Email draft:** `{subject ≤7 words, body ≤110 words, evidence_ids}`, signed "Nikhil".
- **Q&A:** top 15 evidence items by keyword + recency (in code); answers cite `[E#]` or say "Not in the evidence yet".

### Code check (step 10)

Runs on every opener, talking point, summary and email draft (`src/lib/ai/check.ts`). "✓ every claim cited" is shown **only** when all of this passes:

1. Every cited evidence id exists for this company's current snapshot.
2. **Each sentence cites the right kind of evidence.** Every evidence item is tagged (language, infra, activity, jobs, blog, talk, Hacker News, repo). A sentence about commits must cite an *activity* item, a cloud or tool claim an *infra* or *jobs* item, languages a *language* item, hiring a *jobs* item, and so on.
3. **Every number in a sentence appears in the items it cites** (so "1,225 commits" must be in the cited activity item). The code adds computed items for Q1/Q2/Q3 so Gemini has something correct to cite. Time windows ("30 days") are labels, not claims.
4. Named tools, repos and roles exist in the evidence.
5. **The opener** (≤ 30 words, one sentence) must (a) name one concrete thing that appears in a cited item's **title or snippet** (a repo, tool, job title, post or release), (b) connect it to a specific pain (CI, build, test, pipeline, local, environment, deploy, monorepo, services), and (c) contain no flattery ("impressive", "exciting", "shows how quickly"), no "streamline" and no "opportunity to".
6. No banned phrase, no placeholder, company name spelled exactly, length limits met.

On failure Gemini regenerates **once** with the reasons appended; still failing → **Needs review** (amber, with reasons), and it cannot be approved until edited and re-checked. A draft email can only be created from a **Verified** opener.

## Edge cases

| Case | Behaviour |
|---|---|
| No public GitHub / only forks or archived | Excluded. Q1 shows "No public code found"; Q2/Q3 lean on jobs/blog/talks; confidence Low with the reason, and the opener cannot be Verified; Gemini states what is missing. (The matcher first tries other candidate orgs with real code, e.g. `freshworks-developers`.) |
| Wrong or ambiguous GitHub org | Candidates stored; "Pick a different GitHub org" chooser (avatar, description, website, repo count); choice saved as an override and a refresh runs |
| No job board / RSS / talks / HN | Source shows **Not found** (grey) with a tip to add an override. Never guessed |
| A source fails or times out | Last week's data and evidence kept, marked **Stale since {date}** (amber); run is **partial**, not failed; retried next run |
| GitHub rate limit low | Requests stop early; the Runs page shows "Resuming at {time}"; the cache prevents repeat calls |
| Mostly public SDKs (e.g. Stripe) | Q1 shows "Mostly public SDKs: their internal stack may differ", and Gemini lists it under "Not in the evidence" |
| Duplicate company | Unique normalised domain (UI message + DB constraint). `https://`, `www.`, paths, case are normalised |
| Company removed mid-run | Run finishes; data is hidden; skipped by the next cron. Soft delete with Undo for 30 days |
| Gemini invalid JSON / failing opener / outage | Retry once with reasons → Needs review. Outage: code facts still shown with "Summary pending (Gemini unavailable)"; retried next run |
| 100+ repos | Capped at the 100 most recently pushed; tree scan capped at 15 repos |
| HubSpot down / missing scope | Per-account status **Failed** + reason + Retry; the app is unaffected |
| Internal send to a non-allowlisted address | Blocked with an explanation. `EMAIL_TEST_MODE` routes everything to `TEST_EMAIL` |
| Approve on a Needs-review draft | Blocked until edited and re-checked |
| Long names, non-Latin text, no logo | Truncation with tooltips; the Stack Fingerprint is the logo fallback |

## Why Neon, not Supabase

- The Supabase free account hit its project limit.
- Both are Postgres: the same schema and SQL, so switching back is one connection string.
- Neon works natively with Vercel and scales to zero, which suits a weekly job.
- The watchlist stays editable without code: the Neon table editor on `companies`, or the Watchlist page.

## Setup (no local Node required)

1. **Neon:** create a project, copy the **pooled** connection string. Open the SQL editor and run `drizzle/0000_init.sql`, then `drizzle/seed.sql` (16 verified companies).
2. **Keys:** [GitHub fine-grained token](https://github.com/settings/personal-access-tokens) (public repositories, read-only) · [YouTube Data API key](https://console.cloud.google.com/apis/library/youtube.googleapis.com) · [Gemini key](https://aistudio.google.com/apikey) · HubSpot private app (scopes: `crm.objects.companies` read/write, `crm.objects.contacts` read, `crm.schemas.companies` write, plus notes and emails write) · [Resend key](https://resend.com/api-keys).
3. **Push to GitHub** (`.env.local` is git-ignored; check with `git status` before pushing).
4. **Vercel:** Import the repo, add every variable from `.env.example`, deploy. Set `APP_BASE_URL` to the deployment URL and redeploy. Generate `CRON_SECRET` and `ADMIN_PASSCODE` as long random strings.
5. **HubSpot properties:** Settings → *Create HubSpot properties*.
6. **First full refresh:** unlock Admin mode → *Refresh all*, and watch the Run Console / Runs page.
7. Click through every page in both themes.

With Node installed you can also run locally:

```bash
npm install
cp .env.example .env.local   # fill it in
npm run db:seed              # applies the same two SQL files
npm run dev
```

| Command | What |
|---|---|
| `npm test` | 188 Vitest unit tests (domain, languages, repo classification, infra detectors and cloud strength, microservices, activity, diff, YouTube filter, engineering-role filter, the code check including topic/number/opener rules, the allowlist and "never email prospects" guards, radar, scoring) |
| `npm run typecheck` / `npm run lint` | TypeScript and ESLint |
| `npm run e2e` | Playwright smoke across all pages in both themes (`E2E_BASE_URL=https://… npm run e2e` to test a deployment) |

### Environment

See `.env.example`. `DATABASE_URL`, `GEMINI_API_KEY`, `GITHUB_TOKEN` and `ADMIN_PASSCODE` are required for the core loop (without a passcode the app is read-only). `TEST_EMAIL` is required while `EMAIL_TEST_MODE=true`: with it missing, every email send is blocked with a clear message. `YOUTUBE_API_KEY` adds talks; `HUBSPOT_PRIVATE_APP_TOKEN` adds CRM sync; `RESEND_API_KEY` + `INTERNAL_EMAIL_DOMAIN`/allowlist + `NIKHIL_EMAIL` add internal email. Missing optional keys degrade gracefully: the source shows as failed/not configured and the rest of the app works.

### Cron on Vercel

`/api/cron/weekly-refresh` (`30 0 * * 1`, Mon 6:00 IST) and `/api/cron/monday-brief` (`30 2 * * 1`, Mon 8:00 IST). Both require `Authorization: Bearer $CRON_SECRET`, which Vercel Cron sends automatically when `CRON_SECRET` is set. The weekly route fans out at concurrency 3 and needs a function duration above 60s (`maxDuration = 300`, available with Fluid compute, the default on new projects). If your plan caps duration lower, unfinished runs stay `queued` and *Refresh all* resumes them.

## Project layout

```
src/app/            pages (Today, accounts, outreach, radar, runs, settings, one-pager), actions.ts (Server Actions), api/ (refresh, cron, runs)
src/lib/compute/    Q1–Q3, microservices, confidence, diff, evidence pack, radar, scoring (pure code, unit-tested)
src/lib/sources/    github, jobs, blog, youtube, hn
src/lib/ai/         gemini client, prompts + schemas, generation, code check
src/lib/pipeline.ts steps 4–12 for one company
src/lib/hubspot.ts  properties, facts sync, approved text + note, email log, contacts
src/lib/email/      allowlist guard, Resend sender (single choke point)
src/components/     shell, signature viz (Fingerprint, Language Bar, Heat Strip, Receipts, Diff View, Radar), Run Console
drizzle/            0000_init.sql, seed.sql
tests/  e2e/        Vitest and Playwright
docs/DEMO_SCRIPT.md 2–3 minute demo video script
docs/SUBMISSION.md  what to submit, 60-second explanation, viva cheat sheet, extra tools
docs/Tech_Stack_Scout_Components_Map.png  the Components Map (also at /how-it-works)
```
