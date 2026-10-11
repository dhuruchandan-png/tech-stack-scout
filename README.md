# Tech Stack Scout

**AI-powered tech stack intelligence for a sales team's target-account watchlist.**
Domain: B2B Sales Intelligence · Developer Tools. Built for Nikhil, an enterprise account executive who sells a developer productivity tool.

> Live app: _add your Vercel URL here_ · Admin passcode for graders: _add it here (the `ADMIN_PASSCODE` you set)_

Everything is **viewable without login**. Actions that change data or reach outside (Refresh, add/remove company, approve, send internally, HubSpot push, mark sent) unlock with the Admin passcode (lock icon, top right).

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

One company is processed per request (`/api/refresh/[companyId]`, `maxDuration = 60`). The cron queues all companies into `runs` and fans out at a concurrency of 3. Every step writes to `run_steps`, which the **Run Console** polls.

## The Cut (non-negotiable)

Nothing reaches a prospect without Nikhil.

- No auto-send, no scheduling, no sequences.
- **No prospect email through Resend.** Resend is called from exactly one function (`sendRaw`, `src/lib/email/send.ts`), which re-validates the recipient against the internal allowlist on every call. Even a bug in a caller cannot reach a prospect. Covered by tests (`tests/guard.test.ts`).
- **No AI-written text in HubSpot before Nikhil approves it.** Refreshes write only code-calculated facts; the approved summary/opener and a Note are written in the Approve action.
- The tool drafts. Nikhil approves (step 14) and sends from his own inbox (step 15). "Open in Gmail/Outlook" only pre-fills a compose window.

## Data sources and limits

| Source | What | Key | Notes |
|---|---|---|---|
| GitHub GraphQL + REST | repos, language bytes, commits (30/90d + 13 weekly buckets), releases, git trees | `GITHUB_TOKEN` (fine-grained, public read) | Top **100** repos by last push; tree scan on the **15** most recently pushed active repos; ≤3 `.tf` files per repo; raw file fetches via `raw.githubusercontent.com`. Pauses on low rate limit |
| Greenhouse / Lever / Ashby | open roles, descriptions | none | Slugs from override → name → domain root. Engineering roles by title/department |
| Blog RSS | last 10 posts | none | Override, else common feed paths |
| YouTube Data API v3 | conference talks (24 months) | `YOUTUBE_API_KEY` | ~100 quota units per company; 20 companies/week is far inside 10k/day. Filtered to titles that name the company **and** talk/conference words |
| Hacker News (Algolia) | stories, last 90 days | none | Company domain, or company name + tech keyword |

Raw responses are cached per source per company for **6 hours** (`source_cache`), so repeated "Refresh now" taps do not hammer the APIs. 403/429 get exponential back-off, honouring `Retry-After`.

### Code-calculated thresholds

- **Languages:** bytes over non-fork, non-archived repos pushed in the last 12 months; config languages (Shell, Dockerfile, Makefile…) dropped unless nothing else exists. "Dominant" = top 1–2 (the second only if ≥ 60% of the first).
- **Activity level:** **High** commits30 ≥ 150, or ≥ 60 across ≥ 8 repos · **Medium** commits30 ≥ 30 or ≥ 4 repos pushed · **Low** any commit or any hiring/blog/talk/release signal · **Dormant** nothing.
- **Microservices signal:** points from repos with Dockerfile + orchestration (+3 for ≥3 repos), gRPC/protobuf (+2), docker-compose (+1), service mesh (+2), service-style repo names (+1/+2). ≥5 Strong, ≥2 Some, else None. **Unknown** if nothing could be scanned. Reasons are always shown.
- **Confidence:** High needs a domain-matched org, ≥5 active repos, ≥3 scanned, ≥3 corroborating signals and no failed source. Medium for name-matched orgs or one strong leg. Low with no/fuzzy org or a thin footprint, always with the reason.
- **Freshness:** teal < 7 days, amber 7–10, red beyond; "Stale since {date}" when a source failed.
- **Call these first:** +3 per meaningful change (max 4), +4 High / +2 Medium activity, +3 Strong / +1 Some microservices, +2 any cloud signal, +3 verified opener, −6 already contacted.

## Gemini (Flash only)

Model from `GEMINI_MODEL` (default `gemini-2.5-flash`) via `@google/genai`, always `responseMimeType: application/json` with a `responseSchema`. Tokens and cost are logged per call (`briefs`, `runs`). No Claude API or any other model is used anywhere in the app. All calls are in `src/lib/ai/`.

- **Brief** (`BRIEF_SYSTEM` / `BRIEF_SCHEMA` in `src/lib/ai/prompts.ts`): input is the company, code-calculated facts, and ≤40 evidence items, never raw web pages. Output: `{summary_p1, summary_p2, opener{text, evidence_ids, hook_type}, talking_points×3, unknowns}`.
- **Email draft:** `{subject ≤7 words, body ≤110 words, evidence_ids}`, signed "Nikhil".
- **Q&A:** top 15 evidence items by keyword + recency (in code); answers cite `[E#]` or say "Not in the evidence yet".

### Code check (step 10)

Runs on every opener, talking point, summary and email draft (`src/lib/ai/check.ts`):

1. Every cited evidence id exists for this company's snapshot.
2. The line's key nouns (tool / repo / role / topic names, numbers, mid-sentence capitalised words) appear in the cited evidence or in the code-calculated facts, after light stemming.
3. No banned phrase ("I came across", "hope this finds you well", "leverage", "synergy", …) and no placeholder.
4. Length: opener 18–35 words and one sentence; talking point ≤ 40; email subject ≤ 7 and body ≤ 110 with the "Nikhil" sign-off; summary sentences cited.
5. Company name spelled exactly. A line that names nothing specific fails as "could fit any company".

On failure Gemini regenerates **once** with the reasons appended. Still failing → **Needs review** (amber, with reasons). Needs-review text **cannot be approved** until edited, and edits are re-checked. Approve re-checks again against the current evidence.

## Edge cases

| Case | Behaviour |
|---|---|
| No public GitHub / only forks or archived | Excluded. Q1 shows "No public code found"; Q2/Q3 lean on jobs/blog/talks; confidence Low with the reason; Gemini states what is missing. **Freshworks in the seed shows this path.** |
| Wrong or ambiguous GitHub org | Candidates stored; "Pick a different GitHub org" chooser (avatar, description, website, repo count); choice saved as an override and a refresh runs |
| No job board / RSS / talks / HN | Source shows **Not found** (grey) with a tip to add an override. Never guessed |
| A source fails or times out | Last week's data and evidence kept, marked **Stale since {date}** (amber); run is **partial**, not failed; retried next run |
| GitHub rate limit low | Requests stop early; the Runs page shows "Resuming at {time}"; the cache prevents repeat calls |
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
| `npm test` | Vitest unit tests (domain, languages, infra detectors, microservices, activity, diff, code check, allowlist and "never email prospects" guards, radar, scoring) |
| `npm run typecheck` / `npm run lint` | TypeScript and ESLint |
| `npm run e2e` | Playwright smoke across all pages in both themes (`E2E_BASE_URL=https://… npm run e2e` to test a deployment) |

### Environment

See `.env.example`. `DATABASE_URL`, `GEMINI_API_KEY`, `GITHUB_TOKEN` and `ADMIN_PASSCODE` are required for the core loop. `YOUTUBE_API_KEY` adds talks; `HUBSPOT_PRIVATE_APP_TOKEN` adds CRM sync; `RESEND_API_KEY` + `INTERNAL_EMAIL_DOMAIN`/allowlist + `NIKHIL_EMAIL` add internal email. Missing optional keys degrade gracefully: the source shows as failed/not configured and the rest of the app works.

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
```
