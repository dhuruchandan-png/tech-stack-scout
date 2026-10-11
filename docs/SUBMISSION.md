# Submission guide: Tech Stack Scout

## What to hand in

| # | Item | Where | Weight |
|---|---|---|---|
| 1 | **Working public URL** | https://tech-stack-scout-six.vercel.app (no login needed to view; open access, so every action also works) | 10% |
| 2 | **GitHub repository** | https://github.com/dhuruchandan-png/tech-stack-scout | Backend and build quality 25% |
| 3 | **Components Map** | `docs/Tech_Stack_Scout_Components_Map.png` (also shown at `/how-it-works` and at `/components-map.png`) | 10% |
| 4 | **Demo video (2–3 min)** | Record with `docs/DEMO_SCRIPT.md` | 5% |
| 5 | **Viva** | Use the cheat sheet below | 40% |

Design is 10%. The reference image is `docs/Tech_Stack_Scout_Design_Reference.png`.

## Exam rules and where each is met

| Rule (Problem Statement booklet) | Where |
|---|---|
| Live external data, with some data present at submission | GitHub, Greenhouse/Lever/Ashby, blog RSS, YouTube, Hacker News. All 16 accounts hold a real snapshot. See the live counts on `/how-it-works` |
| All AI tasks use Gemini Flash, never the Claude API | Only `src/lib/ai/gemini.ts` calls a model, and only Gemini Flash. Searchable: no `anthropic` import exists in the repo |
| Deploy on Vercel | Public URL above; the weekly cron is in `vercel.json` |
| Submit URL + GitHub link + Components Map | Table above |

## The brief (R1–R8), where to point at it in the app

| | Requirement | Show this |
|---|---|---|
| R1 | Watchlist stays current automatically | Today → System Health strip ("Fresh ≤7d 16/16"), Runs page |
| R2 | Q1: dominant languages | Any account → Q1 card |
| R3 | Q2: cloud / infra tooling | Any account → Q2 card, and Radar |
| R4 | Q3: how actively they build | Any account → Q3 card (heat strip, 30/90 day counts) |
| R5 | Refreshed weekly | `vercel.json` cron `30 0 * * 1`; freshness pill on every account |
| R6 | Two-paragraph Gemini summary | Account → Engineering context (with [E#] receipts) |
| R7 | Specific first line, not a template | Account → Suggested first line card (Verified badge) |
| R8 | Add/remove without code | Watchlist → Add company / Remove with Undo (or the database table) |

Note for the viva: the brief says **Supabase**. We used **Neon** (also Postgres) because the Supabase free account hit its project limit. Same schema and SQL; switching back is one connection string. Companies can still be added or removed with no code, on the Watchlist page or in the database table editor.

## 60-second explanation

> Nikhil sells a developer tool that only fits some engineering setups, and he used to spend two to three hours researching each sprint of companies. Tech Stack Scout does that every Monday automatically. For each company it pulls live public data, then **code, not AI,** answers three questions: which languages, which cloud and infrastructure, how active. **Gemini** then writes a two-paragraph summary and a first line, but only from an evidence list, and every sentence cites its source. A **code check** verifies every claim against that evidence, and anything that fails is marked Needs review and cannot be approved. Nothing ever reaches a prospect: Nikhil approves a draft and sends it himself from his own inbox.

## Viva cheat sheet

**Why is the maths done in code and not by AI?** Numbers like "Go is 46% of code" must be exact and repeatable. A language model can invent them. The AI only writes the words, from numbers the code already computed.

**How do you stop Gemini making things up?** Four layers: (1) it only receives an evidence list, never raw web pages; (2) every sentence must cite an evidence id; (3) a code check confirms the ids exist and the named tools and numbers literally appear in the evidence; (4) failures are regenerated once, then marked Needs review and blocked from approval. The check caught real cases, for example a model adding "WebAssembly" to Cloudflare's brief when it was not in the evidence.

**What happens when a source is missing or an API fails?** Nothing is guessed. A missing source shows "Not found" with a tip to add an override. A failed source keeps last week's data, marked "Stale since…". The run is partial, not failed. Freshworks has no public GitHub org, so it shows Low confidence honestly.

**How does it stay inside free tiers and function limits?** Each company runs in its own request (60s). A weekly cron fans out at concurrency 2. Raw API responses are cached for 6 hours. GitHub uses GraphQL, and very large orgs fall back to a lighter query. Gemini cost is about half a cent per company.

**Why can it never email a prospect?** Resend is called from a single function that re-validates the recipient against an internal allowlist on every call. Prospect emails open in Nikhil's own Gmail/Outlook, and he presses Send. This is covered by unit tests (`tests/guard.test.ts`).

**What would you build next?** Slack/CRM alerts for "good week to call", per-account notes feeding the prompt, a second sample of repos for very large orgs, and domain-verified email for the Monday brief.

**Known limitations (say them before you are asked).**
- GitHub org matching is by domain and name; a wrong match can be corrected on the account's *Sources & matching* tab.
- Languages reflect public code only, which can understate private-heavy companies.
- Very large orgs are sampled (top 40–50 most recently pushed repos, 15 file-tree scans).
- Open-access mode means anyone with the URL can click actions. Set `ADMIN_PASSCODE` in Vercel to lock them.

## Extra tools you may need

| Need | Tool | Required? |
|---|---|---|
| Record the 2–3 minute demo video | QuickTime Player (Mac: File → New Screen Recording) or Loom | Yes, for the video |
| Run tests / typecheck locally | Node.js 20+ (`npm install`, `npm test`) | Optional. The repo deploys without it |
| Email the Monday brief to a real inbox | Resend account; with no verified domain it only sends to your own signup email | Optional (internal email only) |
| Schedule the weekly job | `CRON_SECRET` in Vercel (a long random string) | Yes, or the Monday cron returns 401 |
| Lock the dashboard for non-graders | `ADMIN_PASSCODE` in Vercel | Optional (the professor wants it open) |

## Final checklist before submitting

- [ ] Open the public URL in a private window: Today loads with data, no login
- [ ] `/how-it-works` shows live numbers and the Components Map
- [ ] Settings shows GitHub, YouTube, Gemini, HubSpot and Resend as connected
- [ ] Runs page shows the latest Refresh all as done
- [ ] `CRON_SECRET` is set (the weekly cron and Monday brief need it)
- [ ] GitHub repo is public (or shared with the professor) and `.env.local` is not in it
- [ ] Demo video recorded; links collected in one message
