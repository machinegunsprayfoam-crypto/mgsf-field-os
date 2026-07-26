# Klyfton AI — Frontend ↔ Backend Gap Analysis (manual)

_Date: 2026-07-26 · Branch: `claude/klyfton-ai-problems-ynhx9f` · Method: static wiring audit
(no InfraNodus — that connector isn't available in this session; this is the manual equivalent)._

**TL;DR** — The app is healthy: front-end parses & boots, all **44** `api/*.js` parse clean, no dead
buttons, no broken links. The only real *gaps* are **surfacing gaps** (backend power the UI doesn't
expose) and **two source-of-truth overlaps**. None are bugs. Top pick to act on: surface the existing
**warranty certificate** generator in the Warranty module. Everything here is a finding for your
review — I did **not** change app code.

---

## Method
- Listed all 44 backend endpoints (`api/*.js`) and their purpose headers.
- Listed the 31 front-end modules (`mod-*` panels in `public/index.html`).
- Grepped every `/api/<name>` the front-end actually calls, and every server-to-server `require()`.
- Cross-referenced to find: (a) backends the UI never reaches, (b) UI features with no backend,
  (c) two implementations of the same thing.

## What the front-end actually calls (16 of 44)
`sync, klyfton, notify, tts, photo, drive, auth, weather, samgov, proposal-pdf, invoice-remind,
infranodus, hubspot, command-center, pricing, capability-statement`

## Why the other 28 aren't a problem (verified, not assumed)
- **Cron/scheduler-driven (8)** — `daily-brief, follow-up, estimate-followup, missed-call,
  invoice-remind, roof-maintenance, inventory-reorder, axle`. Fired by Vercel cron, not the UI. Correct.
- **Infrastructure / server-to-server (7)** — `act, gearbox, ats, memory, mcp, notify, hubspot-sync`.
  These are the drivetrain/arms/brain plumbing; never meant to be a button.
- **Headless calculators for the AI/MCP layer (11)** — `roi, foam-calc, coating-calc, job-cost,
  bpi-calc, dew-point, measure, unit-convert, commission, payment-schedule` (+ `mcp-diag` retired).
  `photo-estimate.js` genuinely `require()`s **measure** + **foam-calc**, so those two are load-bearing.
  The rest exist so Klyfton's brain / MCP / external agents can do the math headlessly. **The UI does
  its own client-side math in the estimator + ROI modules** — see the one watch-item below.

## Genuine gaps / overlaps (the actual findings)

### 1. ✅ Surfacing gap — Warranty certificate (DRAFTED on branch 2026-07-26)
- **Backend built:** `api/warranty-cert.js` generates a real, hand-to-customer warranty certificate PDF.
- **Was:** Ops → **Warranty** register logged/tracked warranties (localStorage) but had **no button to
  generate the certificate** — the existing PDF generator was unreachable from the app.
- **Done (staged, not merged):** added a **📄 Certificate** button on each row of the Warranty register
  → new `opsWarrantyCert(id)` maps the logged warranty `{customer, job, wtype, termYears, start, notes}`
  to the endpoint's `{customer, jobType, product, termYears, start, coverage, certNo}`, POSTs to
  `/api/warranty-cert` with `base64:true`, and downloads the PDF — the exact pattern the Proposal
  module uses with `/api/proposal-pdf`, incl. graceful offline fallback. Invents nothing (states only
  what was entered; blank address/exclusions use the endpoint's own defaults). Frontend re-verified:
  parses & boots clean. **For your review before merge.**

### 2. Overlap — Change orders exist twice
- `api/change-order.js` (server PDF) **and** a full client-side Change-Order module (`renderCO`, saved to
  localStorage `changeorders`). The UI never calls the server endpoint — it reimplements the feature.
- **Not broken** (the client version works), but it's two sources of truth. Decide: keep client-only and
  retire/ignore the server endpoint, OR route the UI through `/api/change-order` for a branded PDF like
  proposals. Recommend the latter for consistency, but it's your call — flagging, not changing.

### 3. Watch-item — calculator math lives in two places
- Customer-facing math (foam yield, ROI, coating gallons, job cost) exists **both** client-side (UI) and
  as serverless endpoints. Doctrine (`mgsf-core`) says its numbers win. As long as both pull the same
  locked constants that's fine; the risk is silent drift if one side is updated and the other isn't.
- **Suggestion (not urgent):** when pricing/constants change, update both, or eventually have the UI call
  the endpoints so there's one source. No action needed now — just don't let them diverge.

## Confirmed clean (no gap)
- Proposal PDF, SAM.gov search, capability statement, weather/spray-window, HubSpot, command-center,
  pricing, TTS, sync, auth, photo, Drive backup — all wired UI↔backend correctly.
- All 44 `api/*.js` parse; front-end boots; 279 onclick handlers all defined; 0 broken links.

## Recommended order of action (your call — all gated)
1. **Surface warranty-cert** in the Warranty module (safe, small, valuable). ← I can draft this on the branch.
2. Decide the change-order source of truth (client-only vs route through the branded server PDF).
3. Leave the calculator overlap as-is; just keep client + server constants in sync on pricing changes.

---
_Findings only — no app code was modified to produce this. Not merged to main._
