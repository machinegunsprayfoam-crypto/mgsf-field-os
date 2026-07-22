# Klyfton — Pro Build Walkthrough (for tomorrow)

**TL;DR:** Pro's real unlock was the function cap (12 → ~100). I fixed a bid-inflation bug,
shipped 5 new backend functions, wired a real PDF-download button into the Proposal builder,
and confirmed every deploy green. A bunch of the "20 functions" list turned out to **already
exist** in the app — so instead of rebuilding them, I'm telling you straight what's there.

Everything below is **live in production** unless marked ⏳ (needs you) or 💤 (built but dormant
until a key/setting is added).

---

## What shipped this round (live now)

| # | Thing | Where | Notes |
|---|---|---|---|
| — | **BPI solo-audit fix** | Estimator → BPI/Audit item | Was billing a 2-person crew on every audit. Added a **Crew** selector (defaults to 1 = solo). A 6-hr energy audit dropped **$918 → $630** direct cost. Check any old audit bids that felt high. |
| 1 | `foam-calc` | `/api/foam-calc` | Area + thickness → board-feet + **sets to order** + optional material cost. |
| 2 | `job-cost` | `/api/job-cost` | Material+labor+drive+overhead → true cost, price-from-margin, **go/no-go** at a sell price. |
| 3 | `proposal-pdf` | **Proposal builder → 📄 PDF File** | Makes a **real .pdf file** to attach to a text/email (the old button only did print-to-PDF). |
| 4 | `reviews` | `/api/reviews` | Job-close → SMS + email review request in your voice. **Draft-only** (never auto-sends). |
| 5 | `invoice-remind` | `/api/invoice-remind` | Sweeps unpaid invoices → reminders, tone escalates by days overdue. **Draft-only, never charges.** |

**Draft-only** = Klyfton writes the message; a human hits send. That's on purpose — no auto-sending
customer messages or touching money without you.

---

## The "20 functions" list — real status

Turns out the app already had a lot of this. Honest map:

**Already built (no work needed):**
- **Weather-delay (#6)** → `weather.js` "Spray Window" — free NWS data, GO/CAUTION/NO-GO by job
  address. Also a live dew-point read on the dashboard.
- **Crew clock (#7)** → the timesheet (Clock Whole Crew In/Out, CSV export for payroll).
- **Daily brief (#18)** → the dashboard "Today's Brief" + AI day-plan already do this in-app.
- **Alerts router (#20)** → `notify.js` — Twilio SMS + a universal webhook to 6,000+ apps.
  **Built, 💤 dormant** until you add the Twilio env vars (see below).

**Shipped this round:** #1 foam-calc, #2 job-cost, #3 proposal-pdf, #4 reviews, #5 invoice-remind.

**Good next targets (keyless, I can build when you say go):**
- #10 warranty tracker · #11 dormant-lead follow-up drafts · #12 referral tracker · #15 server
  lead-scoring API · #17 material-price tracker.

**Need a key/account first (⏳ you):**
- #16 P&L → QuickBooks (subscription lapsed — renew to turn on).
- #14 HubSpot two-way sync → the old shelved version used an npm SDK that can't run here; I'll
  rewrite it to plain fetch. Needs `HUBSPOT_API_KEY` in Vercel.
- #13 lead-enrich → needs a property-data/phone API.

---

## ⏳ What I need from you tomorrow (5 quick things)

1. **Twilio text alerts** — two blockers: (a) the old Twilio token got pasted in a chat once, so it
   must be **rotated** before use; (b) Twilio needs to be **authorized** in this session
   (via /mcp or claude.ai connectors). Once done I set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
   `TWILIO_FROM`, `ALERT_SMS_TO` in Vercel and `notify.js` starts texting you on new HOT leads / bids.
2. **Supabase brain** — paste the schema SQL into the `fjmkmyguqzanyuycgxwq` project's SQL editor
   (https://supabase.com/dashboard/project/fjmkmyguqzanyuycgxwq/sql/new). Until then the mirror 404s.
3. **QuickBooks** — renew the sub so P&L / invoice pushes can go live.
4. **Google review link** — grab your Google Business "write a review" short link so `reviews`
   stops printing the OWNER-INPUT placeholder.
5. **Zapier webhook (optional, fastest win)** — paste a Zapier "Catch Hook" URL into Vercel as
   `ALERTS_WEBHOOK_URL` and every business event can fan out to email/SMS/Calendar with zero code.

---

## How to test what's live (2 min)

- **BPI fix:** Estimator → add a BPI/Audit item → pick "Full BPI Energy Audit" → Crew = 1. Labor
  should be one auditor, not two.
- **PDF proposal:** Proposal builder → fill customer + price → **📄 PDF File** → a real
  `Proposal-….pdf` downloads. Attach it to a text.
- **Foam calc:** `POST /api/foam-calc {"type":"closed","area":2400,"thickness":2}` → 2 sets to order.
- **Job cost:** `POST /api/job-cost {"material":2100,"laborHours":16,"laborRate":80,"miles":120,"sell":6500}`
  → THIN (40.4% vs 45% target).

---

## Deploy state
- Functions deployed: **15** (was 10) — cap on Pro is ~100, plenty of room.
- 7 old Silvr/v2.0 functions stay shelved in `.vercelignore` (they import npm packages that can't
  run here). I'll rewrite the useful ones to plain fetch when we get to #14.
- Every commit auto-deploys; author is the required `machinegunsprayfoam@gmail.com`.

*Built veteran-owned, numbers-first. Nothing here fabricates prices or auto-sends to customers.*
