# Demo video script (2–3 minutes)

Record the deployed Vercel URL, dark theme, browser at ~1440px wide. Unlock **Admin mode** before you start. Have one company *not* yet on the watchlist ready (e.g. **Linear**, `linear.app`) for the live add.

| Time | Screen | Say | Do |
|---|---|---|---|
| 0:00 | **Today** | "Nikhil sells a developer productivity tool. It only fits certain setups, and prep for each call took 2–3 hours. Tech Stack Scout keeps that research current every week, with a source for every claim." | Point at the System Health strip: last weekly run, accounts fresh, evidence coverage, openers verified, HubSpot synced, Gemini cost |
| 0:20 | **Watchlist** | "The watchlist is the only input. Add a company and that's it, no code." | Click **Add company** → type `Linear` / `https://www.linear.app/` → show the domain cleaning live → try adding **Stripe** again to show the duplicate block → leave "Run a refresh immediately" ticked → **Add** |
| 0:45 | **Run Console** | "Each company runs in its own request. Watch the steps: match the sources, fetch live data, code answers the three questions, then Gemini writes, and code checks it." | The console slides in and streams. Linger on `✓ matched github.com/…`, `✓ N repos · M active`, `✓ engineering roles`, `… gemini drafting`, `✓ opener verified [E…]` |
| 1:15 | **Account brief** (open **Razorpay** or **Vercel**) | "Q1 languages, Q2 cloud and infra, Q3 activity, all calculated in code from live data, not by AI." | Hover the Stack Fingerprint. Point at the Q cards and the microservices reasons. Hover a **[E#] receipt** to show the source card |
| 1:35 | **Engineering context + Opener** | "Gemini writes the two paragraphs from evidence only. Every sentence cites a receipt, and code verifies it. The first line names something real, not a template." | Hover two receipts. Show **✓ Verified** on the opener card. Click **Copy** |
| 1:50 | **What changed + Call these first** | "It diffs against last week, so Nikhil knows what's new." Then back on **Today**: "and it ranks who to call first." | Show the diff view (+ / − / ~), then the **Call these first** cards |
| 2:05 | **Outreach** | "Nothing reaches a prospect without Nikhil." | **Draft email** → pick a contact → **Send internally** (show the toast) → **Approve** (the orange gate) → **Open in Gmail** → "I press send here, in my own inbox" → back, **Mark as sent** → open the HubSpot record to show the approved note and the email activity |
| 2:30 | **Radar + Monday brief** | "Across the watchlist: which languages and clouds dominate. And Monday 8am, the brief lands in my inbox." | Hover a radar dot, click it to filter the Watchlist. Show the brief email in the test inbox |
| 2:45 | **Edge cases** | "It's honest when it doesn't know." | Open **Freshworks** (no public GitHub → Low confidence, "No public code found"). Show a **Needs review** opener with its reasons, and a **Not found** source with the override tip |
| 3:00 | **Close** | "Live data, Gemini Flash only, code-checked, and it never emails a prospect." | End on the System Health strip |

## Checklist before recording

- [ ] *Refresh all* has completed; **Runs** shows the weekly run
- [ ] At least one account each in: Verified opener, Needs-review opener, Low confidence, a "Not found" source
- [ ] Three drafts across states (one Approved, one In internal review, one Needs review)
- [ ] `EMAIL_TEST_MODE=true` and `TEST_EMAIL` set so the internal send and Monday brief arrive in your own inbox
- [ ] HubSpot properties created; the demo company has a record
- [ ] Browser zoom 100%, notifications off
