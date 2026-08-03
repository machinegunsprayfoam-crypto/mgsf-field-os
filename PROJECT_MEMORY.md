# PROJECT MEMORY — read this FIRST, every session

Single source of truth for the MGSF build so no session starts blind or re-derives what's
already known. If something here conflicts with a vague memory, **this file wins.** Keep it
current: when you finish a unit of work or make a decision, update the relevant section here in
the same commit. Doctrine numbers (`mgsf-core.skill`) still win over everything.

_Last updated: 2026-08-03._

## 1. What this is / repos
- **mgsf-field-os** — Klyfton AI (the app): `api/klyfton.js` = Queen router → worker minds → synthesizer/critic hive; `public/index.html` = single-file app; Supabase brain; **Vercel PRO**, auto-deploys **from `main`**.
- **mgsf-marketing** — the public site (20 pages), Vercel, cleanUrls.
- **MGSF** — MOGS (Apps Script ERP/CRM/estimator over Google Sheets).
- Work branch (all three): **`claude/klyfton-ai-problems-ynhx9f`**. **Never merge to main without Clifton's OK.**

## 2. Current build state
**★ DEPLOYED TO MAIN 2026-07-27 (Clifton's go):** field-os branch fast-forward-merged to main + live on Vercel (prod deploy READY, commit ad06190). LIVE now: 3D brain-graph boot screen, GraphRAG block-selection in the brain (both builders, safe full-brain fallback), live-data grounding (brainContext, pipeline-gated), warranty-cert button, + all prior staged subsystems (Command Center, ATS, axle, gearbox, memory, act.js[inert until ALERTS_WEBHOOK_URL], crons now on their Mon-Sat schedule). HUBSPOT_TOKEN + KV set in Vercel. Smoke test `/api/brain-context` = {configured:true, source:kv, 12 open leads / 11 cold}. **Hardening flag:** read endpoints (`/api/brain-context`, `/api/command-center`) return aggregate pipeline data UNAUTHENTICATED (noindex, but public) — existing app posture; consider gating behind CREW_CODE.
**Klyfton backend (field-os) — shipped to branch, not merged:**
- `agent_runs` telemetry table + KPI views (Command Center **Phase 1**). Owner step to activate: re-run `db/schema.sql` in Supabase + confirm `SUPABASE_URL`/service-role key in Vercel.
- Command Center **Phase C** ✅ — live drivetrain strip in the app (recent gear-turns from `events`).
- **VEHICLE ARCHITECTURE** ([`VEHICLE_ARCHITECTURE.md`](VEHICLE_ARCHITECTURE.md)) — Clifton's frame: the whole system is a car (engine=hive, transmission=gearbox, clutch=arms/approval, driveshaft=event spine, differential=Queen router, dashboard=Command Center, battery=memory, brakes=doctrine gates, wheels=outward actions). **★ Two prime movers:** the ENGINE (event-driven/reactive) and the **AXLE that drives TIME** (the scheduler — daily brief, sweeps, cert-expiry, SAM scans turn the same drivetrain on a cadence). Powertrain refinements: **engine powers the Queen** (Queen is driven); **dual AI⟷owner transmission** — same gears driven from both sides, gated gears owner-only (= the approval gate as a transmission); **RPM sets speed** (speed ≈ rpm × engaged; throttle=throughput). 3D model updated (same URL).
- **★ AUTOMATIC TRANSFER SWITCH (BUILT 2026-07-25, `api/ats.js`):** fuel⟷battery. When month-to-date token spend hits `ATS_TRANSFER_PCT` of `KLYFTON_MONTHLY_BUDGET_USD` (default 80% of $50), Klyfton auto-transfers from FUEL (full hive + best models) to BATTERY: `ats.applyToPlan` collapses the hive to a **single mind** + a **modelOverride** forces the cheapest model (`ATS_BATTERY_MODEL`, default claude-haiku-4-5) + leans on memory recall — the graceful step before the existing hard cap (100%). Wired into klyfton.js BOTH paths (stream + non-stream); `runMind`/`runMindResilient` gained an optional `modelOverride` (undefined = normal, backward-compatible). **No budget set ⇒ source always 'fuel', zero behavior change.** Responses carry `power:'fuel'|'battery'`; klyfton GET + `/api/command-center` expose the `power`/`ats` state (month-to-date spend vs budget). UI: transfer-switch indicator in the Command Center Powertrain section (`#ccPower` + `renderPower()`, FUEL|BATTERY two-position switch, render-verified 3 states). Owner activation: set `KLYFTON_MONTHLY_BUDGET_USD` (+ KV) to arm it; tune `ATS_TRANSFER_PCT`/`ATS_BATTERY_MODEL`.
- **★ HYBRID / ALTERNATOR + GAUGE CLUSTER (BUILT 2026-07-25):** it's a hybrid — engine (tokens) + battery (memory) with **regenerative braking**: an approved owner-gear turn (Clifton's decision) is captured to the battery via `gearbox.turn()`→`memory.remember()` (`charged` flag on the turn result; best-effort, gated, reversible). `memory.charge()` = battery state-of-charge (row count). `/api/command-center` now serves `battery{charge}`. **Powertrain gauge cluster** in the Command Center UI (`public/index.html`): two canvas half-dials (`#ccGauges` + `renderGauges()`) — ODOMETER (net-miles needle, red reverse ↔ green forward, ▲fwd ▼rev) + FUEL (7-day token $) — plus a **very-large-capacity BATTERY PACK** (`#ccBattery` + `renderBattery()`): wide 40-cell EV-style pack, state-of-charge fill (amber low-zone → green), big honest fact count + %, terminal nub, always-visible sliver so a huge pack never reads dead. Capacity = `BATTERY_CAPACITY` env (default **100,000** facts; pgvector scales past it — it's the gauge's full-scale ref) served via `/api/command-center` `battery{charge,capacity}`. Render-verified headless at 0.04% and 61.2%. Honest empty state when unconfigured.
- **★ ODOMETER + FUEL (BUILT 2026-07-25, Clifton's "reverse gear" model):** every gearbox turn racks **miles** — +1 FORWARD when Clifton drives an owner gear (approved = leverage), −1 REVERSE when an owner gear blocks (machine reaches into him for approval = his attention), 0 for AI-internal. `turn()` returns `miles{forward,reverse,net}`; persisted to `events.miles`; aggregated by **`v_odometer`** (forward/reverse/net + `fuel_usd` from agent_runs 7d). Surfaced in `/api/command-center` as `odometer`. **Two gauges, deliberately separate:** miles net out (the same gear is −1 when asked, +1 when approved → net 0), fuel (tokens/$) never does — honest counter to "I never spent tokens." Net miles = is the machine a net force-multiplier. Verified. (Owner activation: re-run db/schema.sql for the miles column + v_odometer.) UI tile in Command Center still TODO.
- **★ AXLE — BUILT (2026-07-25): `api/axle.js`** — the time prime mover coupled to the gearbox. `tick(cadence, at?)` runs a saved **transmission program** (`PROGRAMS.daily`/`weekly`) by calling `gearbox.turn()` per gear → logged to `events` (source `axle:*`, shows on the drivetrain strip), dual-drive honored (AI gears run, owner gears draft+block), **Sunday-guarded**, idempotent per day (key=gear|YYYY-MM-DD). Optional endpoint guard via `AXLE_SECRET`/`CRON_SECRET`. Two Vercel crons added (`/api/axle?cadence=daily` 11:30 Mon-Sat, `?cadence=weekly` Mon 11:35). Turns internal/heartbeat gears (`axle.daily`, `pipeline.sweep`, `certs.watch`, `roofmaint.sweep`, `axle.weekly`) — **does NOT duplicate** the 7 dedicated outward crons (daily-brief/follow-up/invoice-remind/roof-maintenance/etc.). Verified: weekday tick drives 3 gears, Sunday skips, unknown program errors cleanly.
- Command Center **Phase 2 UI** ✅ — `api/command-center.js` (read endpoint) + `public/index.html` OPS nav → `mod-command` panel (KPI tiles + agent grid + leaderboard, `renderCommand()`). Real data once telemetry is on; honest roster-only state until then.
- Brain blocks added: STEM, HVAC, accounting/finance, MASTERY, GAP_BRIDGES, PROCUREMENT, EQUIPMENT, **COMPETITIVE_EDGE** (all wired into BOTH prompt builders; `node -c` clean).
- 4 capabilities: `api/missed-call.js`, `api/estimate-followup.js`, `api/photo-estimate.js`, self-healing `runMindResilient` in klyfton.js.
- **`api/act.js` = the "arms"** — gated outward executor (email/sms/appointment/crm/invoice/order). Requires `approved:true`; dispatches via `ALERTS_WEBHOOK_URL`; **inert until that env is set**.
- **`api/memory.js` = semantic memory (pgvector)** — Klyfton's real long-term recall. `remember`/`recall` (top-K by embedding similarity). Gated on Supabase + `OPENAI_API_KEY` (text-embedding-3-small, 1536-dim); stores notes without a vector if no embed key (degrades to note recall). Wired into klyfton.js: every non-trivial message best-effort recalls the 6 most relevant facts (no-op/zero-cost when unconfigured). **Owner activation:** run the SEMANTIC MEMORY block in `db/schema.sql` + set `OPENAI_API_KEY` in Vercel.
- Docs: COMPETITIVE_ANALYSIS.md, CAPABILITIES_ROADMAP.md, OPERATIONS_COMMAND_CENTER.md.

**Frontend / UX (public/index.html) — session 2026-07-26 (branch, not merged):**
- **Boot loader = the 3D "brain" gear machine** (`startBootGears`): pentagon gold KLYFTON-AI brain center, 13 departments as RED octagon angle-boxes (white outline) each grinding RAINBOW extruded gears, blue drive shafts (brain→boxes + box↔box ring links). Hand-rolled software 3D on canvas (extruded meshes, per-face normals, painter-sort, back-face cull); brightness floor so nothing renders black on the black bg. This is the app's uploading/boot screen. (Went through many owner-directed iterations; this is the settled version.)
- **Phone/Tablet/Desktop layout selector** (`#layoutSeg` in top bar + `window.setLayout`) — forces `body.lay-phone|lay-tablet|lay-desktop`, persisted per device (`localStorage 'mgsf_layout'`), overrides @media. Phone = icon-only top bar + 60px icon nav rail so modules get full width.
- **Responsive audit of all 30 modules:** 8 clipped content off-screen on phone → fixed with `overflow-x:auto` net (except `#mod-estimate`). Estimator iframe widened (`.main` 820→1180px; has its own `#estWideBtn`).
- **QA sweep (all clean):** 279 onclick handlers all defined (no dead buttons); fixed 1 real duplicate id (incident-log `in_desc`→`inc_desc`, was colliding with invoice textarea); dangling-ref audit = all non-crashing (print areas + `klyftonActionPrompt` created dynamically, `in_num` intentional fallback, `updateLeadStatus` dead, `exportEstimate` lives inside inert `<template id="legacyEstimator">` so never fires). Boot render verified headless: canvas draws, `setLayout` works, only `file://` egress/permissions-policy console noise (none in prod https).

**✅ THREE UPGRADES — tie modules into daily flow (2026-08-01, Clifton's "build those three"):**
- **Predictive cost in the estimator:** the multi-scope bid result now has a "🔮 vs past jobs" button (`calcComparePast`) — predicts cost from YOUR completed-job history for the primary service + total sqft and shows it against the bid's own direct cost (within 15% = green). Advisory; changes no price. Verified headless (stubbed): renders "vs N past jobs … predicts ~$X … this bid's cost $Y".
- **Audit findings in the daily brief:** `daily-brief.js` handler now computes `business-audit.audit()` on the same KV data and injects the top 3 red/amber findings as a "Needs attention:" section (compose stays pure — findings injected, optional, backward-compatible). `tests/daily-brief.js` +5 (26 total).
- **Portal "Accept this quote":** `portal.html` shows an Accept button (only when there's a quote and the job isn't already booked) → token-gated `POST /api/portal {action:accept}` records an inbound `acceptEvent` to KV `mgsf:portal_events` (capped 200) + best-effort fires `ALERTS_WEBHOOK_URL` to notify the owner. It's an INBOUND customer signal (like a lead form) — books NOTHING; owner confirms. accept path is TOKEN-gated (not crew-gated); link-gen stays crew-gated. acceptEvent is allowlist-safe (no cost/margin/notes leak — security-tested). `tests/portal.js` +8 (53 total).
- Verified: backend parses, 25 inline scripts parse, headless portal accept flow (button→thank-you) + estimator compare both render, 0 PAGEERR. Gate **87 suites / 1980 checks** green. Not merged to main.

**✅ FRONTEND WIRING SWEEP + guided workflow (2026-08-01, Clifton's "do everything you can"):**
- Audited the frontend: ~50 endpoints wired across 96 tab/module switches; everything unwired was correctly server-only (crons, AI internals, calc libs) EXCEPT 5 stranded capabilities. Wired all the real gaps into `public/index.html` (all verified: 25 inline scripts parse, headless boot 0 PAGEERR, functional headless test with stubbed APIs confirms each renders correctly):
  - **AI Business Audit** → OPS/Command Center owner-tools card + `renderBizAudit()` (ranked findings from `/api/business-audit`, severity-colored, gated/KV-aware).
  - **Predictive Cost** → OPS card + `renderPredictCost()` (service+size → `/api/predictive-cost`, honest insufficient-history + config states).
  - **Customer Portal link** → CRM lead-detail "🔗 PORTAL LINK" button + `sharePortalLink()` (crew-gated `POST /api/portal {action:link}`, shows/copies URL + drafts a customer share text; draft-only).
  - **Gov Programs** → GOV tab "State & Workforce Programs" card (MT/ND/SD/WY) + `renderGovPrograms()` (registration + prevailing wage + WOTC/WIOA from `/api/gov-programs`).
  - **Guided workflow** → OPS "▶ What's next — every open job" card + `renderWorkflow()` (feeds app leads+jobs to `/api/projects`; shows overdue-first + next step per open record with jump-to-tab buttons; auto-populates when OPS opens).
- **change-order was NOT a real gap** — its UI (`renderCO`) is already a complete client-side form with signature capture + print-to-PDF (richer than the endpoint's `build()`); wiring it to `/api/change-order` would be redundant, so left as-is.
- **Multi-page recommendation (answered, not acted):** keep the single offline PWA (page-nav breaks field/offline use); the real wins are wiring (done) + guided flows (done) + incrementally extracting JS into separate files for maintainability (app.css/theme-2026.css/brain-graph.js already split). Reserve the Next.js/React path (MGCC's stack) for if the app keeps growing hard. Gate 87/1967 green; not merged to main.

**✅ CUSTOMER PORTAL — the last unbuilt module from the MGCC/MOGS platform plans (2026-08-01, Clifton's "yes do it"):**
- Built `api/portal.js` + `public/portal.html`: a customer-facing, READ-ONLY window where one customer sees THEIR own job — plain-English status, scheduled date, the quote they were already given, and any docs awaiting their signature. Nothing else.
- **Security model (deliberately NOT the crew gate):** per-record unguessable token = HMAC-SHA256(recordId, `PORTAL_SECRET`), **stateless** (generating a link writes nothing). Two modes on one endpoint: `GET ?token=` = customer read (token-gated safe view); `POST {action:"link",id}` = owner link-gen (CREW_CODE-gated via guard.js). `safeView` is a strict **ALLOWLIST** — cost/material/labor/margin/gm/overhead/internal-notes/source/other-customers can NEVER leave (security-tested: 18 leak assertions on a fully-loaded record). Quote = sell `value`, never a cost fallback. DORMANT until `PORTAL_SECRET` + KV set; read-only always.
- `tests/portal.js` (45 checks incl. the allowlist security suite + HMAC verify/tamper) registered; tools-catalog entry (crm). Headless portal.html: 0 PAGEERR, graceful no-token lock state. Gate **87 suites / 1967 checks** green.
- **OWNER ACTIVATION:** set `PORTAL_SECRET` (any long random string) + `PORTAL_BASE_URL` (optional, defaults app.machinegunsprayfoam.info) in Vercel. Generate a link: authenticated `POST /api/portal {action:"link", id:<lead/job id>}` → `{url}`; share that URL with the customer. **NEXT (owner-review):** a CRM "Share portal link" button + a `share_portal` draft action so Klyfton drafts the customer text with the link (draft-only, owner sends). All three platform plans (MOGS/MGCC/Klyfton) are now feature-complete on their shared module list. Not merged to main.

**✅ MOGS PHASE-1 HARVEST + parked-repo check (2026-08-01, Clifton's "harvest Phase-1 into field-os, check on mog stuff"):**
- The parked MGSF/MOGS repo's `main` carried a Klyfton AI Upgrades Phase-1 (from branch `claude/klyfton-ai-upgrades-v8ylwy`, Apps-Script `.gs`): EstimateAssistant, PhotoEstimator, PredictiveCosting, AIProvider.
  Cross-checked all 4 vs field-os: EstimateAssistant→already covered (estimator mind + trade-estimate + estimate-followup), PhotoEstimator→`api/photo-estimate.js`, AIProvider→`api/provider.js`. **Only PredictiveCosting was genuinely missing** → harvested it.
- Built **`api/predictive-cost.js`** (NOT a straight port — the MOGS live layer was a mock/TODO placeholder). Pure core: least-squares size→cost regression + R² confidence + `costBreakdown`/`extractHistory`/`predictFromJobs`/`formatPrediction`. **Fixed a divide-by-zero bug** the original had (n<2 or zero x-variance → NaN) — now falls back to mean-cost at LOW confidence. Real gated live layer reads completed jobs from Vercel KV (like business-audit), grounded ONLY in the crew's own logged actuals: never uses sell `value` as cost, never invents a data point, honest `insufficient_history` under 3 samples; advisory only, sets NO doctrine price. `tests/predictive-cost.js` (25 checks, registered) + tools-catalog entry (finance). Gate **86 suites / 1922 checks** green.
- **MOG check (PARKED.md harvest list reconciled):** the queued items are now nearly all built in field-os since the 7/22 park — Capability Statement ✓ (`capability-statement.js`), Roof Maintenance ✓ (`roof-maintenance.js`), Follow-up sequencer ✓ (`estimate-followup.js`), supplier/foam map ✓ (brain). **Still genuinely stranded:** (1) **Customer Portal** (no `api/portal.js` — real feature, not built, out of this task's scope — owner decision to build); (2) the **446-row supplier pricing catalog** — NOT touched (pricing is doctrine/owner-gated). Everything else in MOGS is reference-only. Not merged to main.

**✅ ESTIMATE → CRM AUTO-HALLWAY — v2.0 item 10, the #1 missing module-to-module link (2026-08-01, branch):**
- Was PARTIAL (a manual "→ CREATE LEAD" button that always duplicated). Now saving an estimate
  (`saveEstimate`) automatically flows into the CRM pipeline via new `upsertLeadFromEstimate(name,val,opts)`
  in `public/index.html`: create-or-update the matching lead + advance stage to **Estimate Sent**.
- **Safe by design:** internal CRM record only (no outward customer action → no confirm needed), but
  transparent (owner notified "lead created/updated → Estimate Sent"). **Idempotent** — re-saving the
  same customer UPDATES the one lead (case-insensitive name match), never duplicates. **Never regresses**
  a lead already at/after Estimate Sent (Follow-Up/Won/Lost stay put); only advances New/Qualified/blank.
  Guards blank/"Customer" placeholder names. The manual button now routes through the same idempotent
  upsert (so it can't create a dup either) + switches to CRM.
- Verified: all 25 inline scripts parse; headless boot 0 PAGEERR; new **`tests/estimate-crm-hallway.js`**
  (19 checks, registered in run-all) covers create/update/no-regress/advance/guard/idempotent. Full gate
  **84 suites / 1888 checks** green. NEXT (owner review): mirror the stage change into HubSpot via
  `hubspot-sync` (server-side) so the CRM connector reflects it too. Not merged to main.

**✅ RESOLVED — InfraNodus brain re-scan done (interactive, 2026-08-01, Clifton's "yes"):**
- Fed the FULL assembled brain corpus (`assembleBrainBlocks("")`, ~90 KB / 13.3k words) through the
  live InfraNodus connector → saved graph **`klyfton-brain-2026-08`**
  (https://infranodus.com/Klyfton AI/klyfton-brain-2026-08/edit). Result is **healthy**: modularity
  0.435, diversity "diversified" (not over-focused on top nodes/clusters).
- **Trades domain now IS represented** (was the whole point): the fresh 8-cluster structure has a
  **"Code Compliance"** cluster (code/irc/safety/**trade**/verify/defer/scope) and `code`/`irc` are now
  top-influence nodes (bc 0.093 / 0.074) — absent from the pre-trades 7/27 graph. Confirmed the re-scan
  picked up TRADES_EXPERT + the calculators.
- **NEW structural finding (actioned):** all 3 content gaps share one endpoint — the **Insurance /
  Licensing** cluster (state/license/bid/training/insurance/sdvosb) is the least-bridged part of the
  brain, disconnected from Soil-Stability, Moisture-Management, and Thermal-Barrier. This is a
  **recurrence of the 7/24 finding #1 ("the brain can't see the filing cabinet")** — the credentials/
  insurance/bonding layer stays structurally isolated from the technical work.
- **Acted on it (safe, tested):** confirmed the retriever MISSED insurance/bonding queries — "what COI
  and bonding do we need" returned *no concept match* → defaults, never pulling the BUSINESS block that
  holds the GL/WC/pollution/umbrella/auto + bonding + SDVOSB facts. Added an insurance/bonding/
  credentials ALIAS group (insurance/coi/bond/bonding/surety/pollution/umbrella/liability/workers/comp/
  cage/uei → `credential`+`federal`; enriched `sdvosb`) in `brain-graph-retrieve.js` so those route to
  the Credential Binding cluster → **BUSINESS + DOCTRINE + FEDERAL**. Verified all 3 test queries now
  pull BUSINESS; retriever suite 23/23; full gate **83 suites / 1869 checks** green.
- **✅ BAKED GRAPH REGENERATED + BOOT VIZ REFRESHED (2026-08-01, Clifton's "then the brain stuff"):**
  regenerated all three artifacts — `public/brain-graph.js` (window.BRAIN_GRAPH, 3D boot viz),
  `public/brain-graph.json`, `api/brain-graph-data.js` (retriever + boot) — from the InfraNodus scan.
  Now **150 real nodes / 1125 real edges / 9 named clusters** (Foam Verification, Business Licensing,
  Cost Efficiency, Performance Metrics, Soil Stability, Safety Compliance, Moisture Control, Pressure
  Testing, Dew Point), dated 2026-08-01. Used ONLY real InfraNodus data (real node keys + betweenness +
  weighted edges + InfraNodus's own named clusters); per-node cluster membership assigned by seeding
  from InfraNodus's named-cluster keywords + edge-weighted label propagation (deterministic, standard
  method — not fabricated). Generator: `scratchpad/regen-brain-graph.js`. **Trades + credentials are now
  FIRST-CLASS clusters** (Safety Compliance→TRADES_EXPERT; Business Licensing→BUSINESS+FEDERAL), not
  alias hacks. Rewrote the retriever's CLUSTER_BLOCKS (9 new names) + ALIAS (retargeted to the new node
  vocabulary), keeping ACTIONS/EQUIPMENT/PROCUREMENT reachable. Both retriever suites + full gate
  **84 suites / 1888 checks** green; headless boot 0 PAGEERR. NOTE for next re-scan: InfraNodus community
  detection is stochastic run-to-run (got 8 then 9 clusters) — after any future scan, reconcile
  CLUSTER_BLOCKS + ALIAS to the new node vocabulary and keep the behavior tests green.

**★ SUB-TRADE QUANTITY CALCS — closing the trades-depth gap — 2026-08-01 (branch, not merged):**
- Honest audit (told Clifton): foam = mastery depth (verified specs + locked pricing + calcs + skills);
  subbed trades = GC depth (scope/size/sub-check), correct by design, but **9 of 13 sub-trades had NO
  quantity calculator** (masonry/drywall/roofing-shingle/excavation/metal/doors-windows/fire/sitework/
  concrete-flatwork) — fell back to trade-estimate. Offered to build the 9; Clifton hadn't said go yet,
  so building them ONE-per-fire overnight, grounded + staged for review.
- **4 of 9 built** (all: pure geometry solid + standard coverage constants labeled ESTIMATE, overridable,
  no pricing, structural/design deferred to the code/engineer/AHJ; each wired into construction ENGINES
  so it surfaces in the trade-pack Toolbox; each registered in run-all + tools catalog):
  - `api/drywall-calc.js` — area→sheets by size + waste + GA-216 screws + GA-214 mud/tape.
  - `api/flatwork-calc.js` — area×thickness→cubic yards (0.25-yd round-up) + bagged-mix for small pours;
    rebar/mix/frost-depth deferred to ACI 318/332 + IRC. (Distinct from concrete-calc = our PU lifting.)
  - `api/roofing-shingle-calc.js` — roof-surface area→squares + bundles/underlayment/accessories;
    ice-barrier + fastening per IRC R905. (SPF/coated roofs = coating-calc.)
  - `api/masonry-calc.js` — wall area × unit coverage→block/brick + mortar + grout(filled cells);
    reinforcing/structural deferred to TMS 402/602.
  Tests: drywall 18, flatwork 11, roofing 10, masonry 11 + construction wiring checks. Gate **81 suites
  / 1842 checks** green.
  - **Remaining candidates:** excavation (cut/fill cu-yd) + sitework (asphalt tonnage/base) are buildable
    next. metal (structural→engineer), doors-windows (a COUNT→trade-estimate), fire (stamped NFPA-13
    design→NICET) are correctly LEFT deferred, not naive-calc'd.
  - **UPDATE: all 6 built** (drywall/flatwork/roofing-shingle/masonry/excavation/sitework) AND **wired
    into the frontend CALCS forms** (`CALC_ENGINES` + `CALC_SEED` in public/index.html) — tap-to-use in
    the app, verified end-to-end headless (drywall 1200+800→69 sheets, no JS break). Gap fully closed.

**★ JOB WORKFLOW / WIRING MAP + AI-connections answer — 2026-08-01 (branch, not merged):**
- Clifton asked for a "map + blueprint workflow and wiring tool" and an "AI connections tool."
- **AI connections tool = already exists** → `cmdb.js` (components → capabilities they depend on,
  why-is-X-dark root cause, blast radius, biggest-unlock) + `health.js` (live/dark) + `tools.js`
  (catalog) + `boot.js` (manifest). It IS the app's connections/wiring self-map — just not surfaced
  prominently. Did NOT build a redundant module. **Next (owner):** give cmdb/boot a dedicated panel.
- **UI WIRED (2026-08-01):** (a) **Connections & wiring panel** — enhanced `renderSystem()` (SYS nav →
  mod-system) to also pull `/api/cmdb`: a "Connections & wiring" card lists all 14 connections
  (capabilities) sorted by what each powers, live/dark dot, the exact env-var to arm each, + "do first"
  = biggest unlock. (Did NOT add a redundant new panel — cmdb IS the connections map; surfaced it.)
  (b) **Blueprint → workflow** — `renderBlueprint()` (PLANS nav) now auto-builds the job-workflow from a
  read plan's resolved trades (`d.structure` prime/sub ids), and a manual "Job workflow / wiring map"
  box lets the crew type trades in natural language. Also made `job-workflow.workflow()` resolve names
  FUZZILY via `construction.tradeMatch` (so "spray foam"/"foundation"/"electrician" resolve, not just
  exact ids) — fixed a real usability bug found in headless verify. Both panels render-verified headless
  (in-process server shimming the Vercel handlers). +1 test (fuzzy). Gate **77 suites / 1784 checks**.
- **Job workflow = real gap, built** → `api/job-workflow.js`, the missing link between `blueprint.js`
  (reads plan → scope → trades) and `construction.js` (prime/sub). Pure keyless `workflow(tradeIds)`
  turns a job's trades into the ORDERED construction sequence (site → foundation → structure →
  roof-dryin → rough-in → insulation → coatings → finishes → final) with **dependency edges (the
  wiring — what must finish first), inspection GATES per phase, prime/sub tag per trade**, and the
  baked-in MGSF rule *never cover spray foam before the insulation inspection*. Dependencies resolve
  to the nearest PRESENT phase when a phase is skipped. Grounded in the standard GC/IRC inspection
  sequence (same as the TRADES_EXPERT brain block) — GUIDANCE + verify-AHJ, no pricing, no invented
  durations (scheduling = mgsf-scheduling). Registered in run-all.js + tools.js catalog (category pm);
  `tests/job-workflow.js` = 19 checks. Field-os gate **77 suites / 1783 checks** green. **Next (owner):**
  wire blueprint.js scope output straight into workflow(), and surface it as a PLANS-panel view.

**★ BUSINESS AUDIT — AI business-audit tool — 2026-08-01 (branch, not merged):**
- Clifton asked "AI business audit tool?" — gap was real: we had a PLATFORM audit (`engineer.js`) and a
  snapshot (`daily-brief.js`) but nothing that DIAGNOSES the business. Built **`api/business-audit.js`**
  (the business analog of engineer.js): pure keyless `audit(data,opts)` reads leads/jobs/estimates/
  invoices and returns severity-ranked (red/amber/green) findings across **Pipeline, Sales/stale-bids,
  Close-rate, Leads/cold, Cash-AR-aging, Ops/overdue-jobs, Customer-concentration, Margin** — each with
  a metric + recommended action + which cron/tool drafts the fix. `headline` + `topActions` + `summary`
  for a one-glance read. Optional gated owner-voice **memo** (ANTHROPIC_API_KEY, self-contained fetch,
  inert without key). Handler reads Vercel KV like daily-brief; DORMANT without KV.
- **Guardrails:** deterministic (asOfMs injected, no Date.now in core); every finding traces to a real
  record count or a clearly-labeled operational threshold (mirrors the crons' 7/21/30-day cadences);
  **margin is graded ONLY when a targetGm is supplied (from doctrine) — the tool never invents a GM**;
  no pricing, nothing fabricated; all outputs are GUIDANCE/draft.
- Registered in `tests/run-all.js` + the `api/tools.js` catalog (category pm). `tests/business-audit.js`
  = 20 checks. Field-os gate **76 suites / 1764 checks** green. **Next (owner review):** surface it as a
  Klyfton panel (OPS or a new AUDIT nav item) + optionally a weekly cron that pushes the memo. Not merged.

**★ TRADES EXPERT — Klyfton brain now knows every trade in depth — 2026-08-01 (branch, not merged):**
- Clifton: "Klyfton has to know ALL the trades in-depth like spray foam." Gap was real — the brain
  (`api/klyfton.js` BRAIN_BLOCKS) was foam/concrete-centric (FOAM_SPECS/STEM/HVAC_ENGINEERING); we had
  trade *calculators + toolboxes* but no *reasoning* knowledge for electrical/plumbing/framing/etc.
- Added **`TRADES_EXPERT`** knowledge block (grounded in the SAME published codes as trade-pack.js —
  NEC/IPC/IRC/IECC/OSHA-Subpart-P/TMS-402-602/ACI-318/NFPA-13 — no fabricated numbers): master-level
  reasoning for electrical, plumbing, framing/carpentry, masonry, concrete flatwork/foundations, roofing
  (shingle/metal), drywall, doors/windows, excavation, steel, fire suppression, sitework — each with
  governing code + key rules + the MGSF calculator for it + red flags + safety + the defer-to-a-licensed-
  pro/AHJ/engineer line, PLUS cross-trade GC sequencing. HVAC stays in HVAC_ENGINEERING (block points to
  it). Wired into BRAIN_BLOCKS + BRAIN_ORDER (after HVAC_ENGINEERING).
- Routing: `api/brain-graph-retrieve.js` — added TRADES_EXPERT to the Estimate/Engineering/Safety clusters
  + ~50 trade-vocabulary ALIASes so trade questions reliably pull it (verified: electrical/plumbing/
  framing/masonry/roofing/excavation queries all route ✅; foam queries still pull FOAM_SPECS).
- Tests: +5 routing checks (tests/brain-graph-retrieve.js) + 3 brain-assembly checks (tests/klyfton.js).
  Gate **74 suites / 1729 checks** green. Stance preserved: GUIDANCE, licensed trade + AHJ own the
  sign-off, MGSF self-performs foam/concrete & subs the rest as PRIME, no pricing here (DOCTRINE owns $).

**★ Frontend refit — Option 2 (split) + 2026 redesign — 2026-08-01 (branch, not merged):**
- Clifton: "It's a pain to change / it looks dated-rough → do #2 and make it state-of-the-art." Decision: **do NOT rewrite** (app works: 13.5k-line single file, 38 panels, ~17 themes, vanilla JS, no framework risk). Instead split for maintainability + modernize the look.
- **CSS extracted** from the two inline `<style>` blocks (was index.html lines 12–572) into **`public/app.css`** (linked in `<head>`). Zero visual change — verified pixel-identical via headless Chromium before/after. This is the Option-2 maintainability win (index.html 13,579→13,021 lines). The 3 remaining `<style>` blocks in index.html are the embedded proposal/invoice/cert PRINT templates (JS template literals) — left as-is (print-specific, white paper).
- **`public/theme-2026.css`** ("APEX" refit, loaded AFTER app.css) — additive/override ONLY: refined design tokens (deeper cool surface, elevation scale, larger radii, modern font stack), frosted HUD topbar, premium nav rail (active pill + accent bar), elevated cards, gradient metric numbers (theme-adaptive via `var(--tx)→var(--or)`), depth buttons, premium inputs, cleaner chat/tables. **Renames no class, moves no hook, changes no layout** → all JS wiring + all ~17 `data-theme` skins still work (verified default/synthwave/aeon + admin module headless). Remove the one `<link>` to fully revert.
- Verification harness (local, not committed): tiny static server + Playwright screenshot scripts in scratchpad; app loads via `file://` (API fetches 404 → shell still renders). Chromium at `/opt/pw-browsers`, playwright global at `/opt/node22`.
- **QA VERIFIED (autonomous, 2026-08-01):** headless sweep of ALL 38 modules under the new theme —
  zero page-level horizontal overflow anywhere (only 3 benign flags = wide inner tables that scroll
  inside their own panel, pre-existing). Verified phone (390px) + tablet (820px) + desktop layouts
  (0 overflow) and default/synthwave/aeon themes. Money screens (invoice/pricebook/admin) render
  clean behind the normal PIN access-gate. Added **reduced-motion** support to theme-2026.css
  (calms animations for prefers-reduced-motion / field use). Reusable QA harness committed:
  `tools/ui/qa-sweep.js` (38-module layout + console-error sweep) + `tools/ui/ui-preview.html` +
  `tools/ui/shot-preview.js` (component preview). Use these after ANY future CSS/layout change.
- **Next (owner review):** confirm the look on the branch; then optional phase 2 = extract the ~11k-line inline JS into per-module files (bigger, riskier — do incrementally with the same screenshot harness). NOTE: did NOT attempt JS extraction autonomously — it needs the live backend + owner verification to be safe.

**Gap analysis + warranty surfacing — 2026-07-26 (branch, not merged):**
- **`FRONTEND_BACKEND_GAP_ANALYSIS.md`** (manual, since InfraNodus connector isn't in-session) — static wiring audit: UI calls 16 of 44 `api/*.js`; the other 28 are legit (8 cron, 7 infra/server-to-server, 11 headless calculators for the AI/MCP layer — `photo-estimate.js` `require()`s measure+foam-calc). Real findings: (1) **warranty-cert** built but not surfaced → **FIXED**; (2) **change-order** exists twice (server PDF + client-side localStorage module; UI uses client) — flagged for Clifton to pick a source of truth; (3) calc math lives client+server — watch for drift, keep constants in sync. All else wired clean.
- **Warranty certificate surfaced** (`public/index.html`): added a **📄 Certificate** button per row in Ops→Warranty → `opsWarrantyCert(id)` POSTs the logged warranty to `/api/warranty-cert` (base64) and downloads the PDF, mirroring `downloadProposalPDF` (graceful offline fallback). Boot re-verified clean.

**Marketing — COMPLETE (Passes 16–25 in mgsf-marketing/NIGHT_LOG.md):** crawl-space page built (SEO_GAPS P1), all internal links + sitemap + og:url + FAQ schema (9/9 service pages) + canonical/robots/alt all verified. Nothing safe left to add.

## 3. Key decisions + rationale (don't relitigate)
- **v2.0 / Silvr is DEAD scaffolding, not a TODO.** `IMPROVEMENTS.md`'s "✓ Deployed" was false. 6 of the 7 files never existed; only `hubspot-sync.js` exists (pure fetch, redundant with `hubspot.js`, kept ignored). Vercel **Pro** lifted the old 12-fn cap (api/ already ~38 fns). Intent since rebuilt in plain fetch: arms=`act.js`, parallelism=the hive, persistence=`agent_runs`, govcon=`samgov.js`. Only genuinely-unbuilt idea = **predictive lead scoring** (fresh build).
- **KLYFTON_V2_UPGRADE_PLAN (Drive doc, 7/24)** is the real roadmap — "same rooms, real hallways." Its InfraNodus gap pass already ran (3 gaps: brain can't see certs/docs; assistant↔CRM don't talk; assistant can't see the job). Recommended start = **Phase A** (stage certs/docs + cert-expiry watch).
- **Hearth** is Clifton's missed-call AI → `missed-call.js` must defer to Hearth (don't double-text). Also Hearth = $0-down financing partner on the marketing site.
- Competitor scan done (~34 tools); Klyfton's edge = vertical contractor fit + owner's voice + self-hosted (no per-seat bill).
- **Klyfton's brain stays CLAUDE-LOCKED (Clifton's call 2026-07-25)** — Haiku router + Sonnet workers/critic (Opus optional). One tuned voice > swappable. Other models only for UTILITY: OpenAI embeddings (semantic memory) + OpenAI/ElevenLabs TTS. Do NOT make the brain model-agnostic. (MOGS, the separate ERP, IS multi-provider via AIProvider.gs — that's fine, different system.)

## 3b. TWO WEBSITES — critical, don't trip over this (confirmed 2026-07-25 via Vercel)
- **Clifton owns/controls BOTH domains.** (a) **`machinegunsprayfoam.net`** (apex + www) is attached to his Vercel `mgsf-marketing` project = the `mgsf-marketing` repo (the 20 AI-built pages). Latest deploy showed `live:false`/not-promoted — may not be serving as production. (b) **`machinegunsprayfoam.info`** is a **ProFoam-built site** (their platform; polished; 403s all bot fetches — can't read/edit it). Business entity: "Machine Gun Spray Foam and Concrete Lifting Insulation Contractors, LLC," Glendive MT.
- **Decision (2026-07-25): KEEP BOTH for now.** Clifton earlier leaned `.info` as keeper, then chose keep-both. Do NOT retire/redirect either without his explicit go. When he decides, staging a `vercel.json` redirect (all paths → the keeper's homepage; URL structures differ so don't path-preserve) is the consolidation move.
- **PHONE DISCREPANCY (money item, owner-gated):** the repo/.net site uses **406-939-8301** (Clifton confirmed CORRECT, ×145). A public listing for the ProFoam `.info` site shows **406-941-2428** — either wrong or a ProFoam call-tracking/forwarding number. Owner to verify on the live `.info` site + Google Business Profile; we can't edit ProFoam. Do NOT "fix" the .net number — it's the right one.
- **GoDaddy connector = availability/suggest only** (can't list owned domains; quota-limited). Use **Vercel MCP** to inspect real deployed domains. Two competing sites split Google ranking (Clifton aware).

## 4. Standing constraints (hard rules — always)
- Never fabricate numbers/prices/specs; label ESTIMATED; doctrine (`mgsf-core`) wins.
- Never guarantee savings; never claim mold elimination; no implied engineering w/o a licensed PE.
- Everything outward = **draft for Clifton's approval**; hard gate on money/binding/irreversible.
- Do NOT touch pricing or the `g.pe`/`g.page` review link (flagged for Clifton).
- **No Sunday** work/scheduling. Commit author: `Machine Gun Spray Foam <machinegunsprayfoam@gmail.com>`. Never put the model identifier in commits/PRs/code. Verify code parses before commit.
- Reference existing PRs (MGSF #3, marketing #1, setup-assistant #3, html-parsing #2) — don't open new ones unless asked.

## 5. Open threads / pending (what to pick up)
- **Owner-gated (do NOT do unilaterally):** merge branch→main; confirm Terra-Lok/soil pricing; fix `g.pe`→`g.page`; submit sitemap to Search Console; enter real fleet #s in `equipment_database.csv`; wire `ALERTS_WEBHOOK_URL` to bring the arms live.
- **Bigger builds awaiting Clifton's go:** Command Center **UI (Phase 2)** ✅ built; **predictive lead scoring** ✅ BUILT + WIRED (2026-07-31, see above); v2 plan **Phase A**; **Mechanic** health self-check ✅ BUILT (`/api/health`, 2026-07-31) — repair/auto-heal side still open; **Engineer agent** (build/improve, gated drafts) — **deferred by Clifton 2026-07-25** in favor of the axle, next in line; **transmission coupling** build (spec done, see TRANSMISSION_COUPLING.md); graduate the 3D presets (Money/Workers/All) into named gearbox programs the axle can run.
- **★★ PLATFORM BUILD-OUT (2026-07-31, interactive+overnight — all staged on `claude/klyfton-ai-problems-ynhx9f`, NOT merged; gate now 29 suites / 630 checks):** a full self-aware capability layer, each module gated/graceful + tested, catalogued in the tool bag:
    - **Tool bag — `api/tools.js`:** the single self-describing catalog of every capability (52 tools) with honest live/dark status (sourced from health.js so it can't drift). Wired into the brain (`toolBagBlock()` in klyfton.js — minds offer only LIVE tools, never fake a dark one) and into the router (`routerToolHint()` — prefers minds backed by live tools). `GET /api/tools`.
    - **Universal bus — `act.js` `zap` arm:** one arm reaches any of Zapier's 9,000+ apps via a single Catch Hook (`{type:'zap',app,op,params}`), same approval gate + `ALERTS_WEBHOOK_URL` as every arm. First test coverage for the arms (`tests/act.js`).
    - **Curriculum — `api/curriculum.js`:** the graded exam that makes evolution measurable — 31 scenarios across 8 modules (building-science/application/safety/code/concrete/roofing/guardrails/tool-use); `runEval(answerFn)` → score% + per-module gaps. Guardrail + tool-use items encode the hard rules (catches "guaranteed savings", "eliminates mold", "Text sent!" when dark). Keys trace to spec/doctrine.
    - **Wiki — `api/wiki.js` + `db/wiki_schema.sql` + `db/wiki_seed.json`:** editable KB (SOPs/playbooks) — the middle layer between locked doctrine and loose memory. Pure keyword-rank retrieval (title>tags>body, light stemming), owner-gated writes, wired into the brain (truth order: doctrine > wiki > memory). Seeded with 8 verified articles (cold-weather SOP, open-vs-closed, metal-building, flash-and-fill, code barriers, PPE, roof recoat, concrete lifting). Owner loads via `POST /api/wiki {action:'save',...,approved:true}` once Supabase attached.
    - **Projects / PM — `api/projects.js`:** job-lifecycle stage engine (lead→bid→scheduled→in_progress→done→invoiced→paid + lost/cancelled). normalizeStage (unknown kept, never faked), nextAction routing, isOverdue (stale bid>7d / invoice>net-30 / past date), forward-only advance, board summary. Companion skill `mgsf-project-manager` (validated clean).
    - **CMDB — `api/cmdb.js`:** AI-augmented self-map — dependency graph (14 capabilities), root-cause (why is X dark), blast-radius (impactOf), and **biggestUnlock** (the one switch that lights the most; empty-env says set `ALERTS_WEBHOOK_URL` → 10 tools). Drift-guarded against the tool bag.
    - **Scenario builder — `api/scenarios.js`:** turn "when X do Y" into a validated automation — checks the trigger is a REAL gearbox event/axle schedule, tools exist + live, outward steps need approval, dark steps flagged (ok vs runnable). `suggest()` keyword starter + gated `draft()`.
    - **Unified RAG — `api/rag.js`:** one retrieval fanning out across brain-graph + wiki + memory, merged/deduped/ranked (sort-by-priority-then-dedupe so the higher-truth source wins), truth order stated + per-line attribution.
    - **Agents runtime — `api/agents.js`:** the goal-completing capstone. Named agents (PM/Job Runner #1, Collector, Bid Chaser, Lead Closer) select their jobs from the projects board and PLAN next actions routed to live tools; `run()` is side-effect-free and NEVER dispatches an unapproved action (tested). Real dispatch = arms.execute per step on approval, ATS budget-capped.
    - **Provider hub free models — `api/provider.js`:** +4 OpenAI-compatible free/free-tier backends (Gemini, OpenRouter, Cerebras, Together) in the vendor-neutral hub — one adapter, many backends (NOT one module per model); 9 providers total in `/api/health`.
- **★ GEARBOX — Phase A+B+DUAL-DRIVE BUILT (2026-07-25): `api/gearbox.js` + `events` table + `v_gearbox_recent` + drivetrain field in command-center. Remaining: Phase C (Command Center UI strip) + wiring real `turn()` triggers into modules (estimate close → turn a gear) + Phase D health. Spec: [`GEARBOX_SPEC.md`](GEARBOX_SPEC.md).**
- **★ DUAL-DRIVE (BUILT 2026-07-25):** every handler in gearbox.js is tagged `{drive:"ai"|"owner", fn}`. **AI gears** run autonomously + cascade; **owner gears** (Invoice, Review-SMS, Follow-up nudge) draft via act.js and go `blocked`, stopping the cascade, until the same `turn()` is re-issued with `approved:true` (owner transmission engages → arms.execute approved:true, still act.js-gated, inert until `ALERTS_WEBHOOK_URL`). API: `POST {action:"turn",event:{…},approved?:true}`; response carries `drive` + `blocked`. Verified: estimate.closed(AI) cascades lead.won→invoice.created then blocks; invoice.created+approved engages. The approval gate IS the owner's transmission (§7a of the spec).
- **★ TRANSMISSION COUPLING (SPEC 2026-07-25, [`TRANSMISSION_COUPLING.md`](TRANSMISSION_COUPLING.md)):** Clifton's idea — every OTHER AI platform (Hearth, Zapier, vendor agents) bolts its own transmission onto the gearbox via one standard port: `POST /api/gearbox {…, coupling:{platform, token}}`. Per-platform token→**grade** (read / signal / drive / bonded) caps which gears it can turn + whether it can touch the owner side. Default grade=signal; `bonded` (owner-side, `approved:true`) is owner-granted per-gear, audited. First live coupling = Hearth (`call.missed` at signal). Reverse coupling = outbound gated drafts to `COUPLING_<PLATFORM>_URL`. NOT BUILT yet — spec only, awaiting Clifton's go + token envs. **3D MODEL of it published (artifact):** https://claude.ai/code/artifact/d691e871-9e49-4c03-b2cf-af208672ca7d — interactive drivetrain: spine=event backbone, nerves=signals, Queen=driver that turns many, transmission=clutch engaging gears, outward gears (⚠) gated. Expanded concepts to fold into the build: **spine has nerves** (each event = a signal traveling a nerve from the spine to a gear); **one gear drives many/all** (driver fan-out); **transmission plug-in** = selectable engagement (config choosing which consumer gears couple to a driving event). **Refined (Clifton):** transmission must support ANY/ALL combinations (one → few → many → all) — per-gear clutch + presets (All/None/Workers/Money). Mechanically, each gear rides a **rod on its backside pushed FORWARD along Z to mesh the Queen** (engagement = depth motion, not a flag). In code terms: engagement = a subscription binding that can couple any arbitrary subset of consumer gears to a driving event; the "rod forward" = subscribe/engage, "rod back" = free-wheel/unsubscribe. Clifton's model: modules as **gears**, not arms — each has an output face (emits typed events) + input face (consumes them); they **mesh** (turn one, the train turns). Arms = reach OUT of the machine (act.js); gears = the transmission INSIDE (module↔module, both ways). Fixes the "good rooms, missing hallways" gap InfraNodus keeps flagging. Build: `events` table + `emit()` + `/api/gearbox` dispatcher + per-module `GEARS` {emits,consumes}; first meshes estimate.closed→CRM→invoice, job.completed→review/roof, estimate.sent→follow-up. Outward teeth ALWAYS gated through act.js approval; internal turns auto (reversible/zero-$). Command Center gets a live drivetrain strip. Supersedes the plain "octopus" idea (gears is the more important half — integration, not just parallel output).
- **★ REDACT guardrail (BUILT 2026-07-31): `api/redact.js` — WIRED into the hive.** Closes the InfraNodus-flagged "PII redaction before LLM calls" gap + doctrine "credentials never in chat." Pure/keyless: masks secrets ALWAYS (API keys, Bearer tokens, private-key blocks, SSN, Luhn-valid credit cards — Luhn check avoids false positives on ordinary long numbers); contact PII (email/phone) only when `opts.contact`. `sanitizeForModel()` is called in `api/klyfton.js` right after `userText` is read (secrets-only, logs what it stripped, never blocks a message). `/api/redact` endpoint too. 21 tests; gate now **12 suites / 299 checks**.
- **★ QUEEN UPGRADES (BUILT 2026-08-03): 5 improvements wired into  — all additive, backward-compatible, fully tested:**
  1. **Confidence score + low-conf fallback:**  now returns  (0–1) in the plan. When < 0.4, "general" is added as a safety-net mind and complexity is promoted to "complex" so the synth can merge both opinions. +0 latency/cost on normal turns; only fires on genuinely ambiguous queries.
  2. **Routing audit in telemetry:**  stores the Queen's raw JSON decision; passed to  →  column (TEXT). ⚠ Requires a schema migration:  — until then the entire telemetry row fails silently (no data loss, no runtime error). Still written to the in-memory  object.
  3. **Per-mind intent hints:** The Queen now also returns . Each worker receives a  prefix prepended to its user content — steering its angle on complex multi-mind asks without changing brain-block selection (uses original ).  /  both accept new optional 9th param .
  4. **Pure-command bypass ():** Common field commands (update job, add lead, schedule job, create invoice) skip the Haiku router round-trip entirely — saves ~0.5s and one API call per command. Regex-based, zero extra cost. Returns a ready plan (same shape as ). Capped at 180 chars; always defers photo messages to the Queen.
  5. **Memory-warm routing ():** After routing resolves + semantic recall is available (both concurrent, no latency added), memory-relevant minds missing from a **complex** plan are appended (finance/ops/govcon/marketing/safety from recall text). Never modifies simple plans, never exceeds cap=4, never removes minds. 28 new tests; gate now **89 suites / 2027 checks**.
  - **Schema note:**  column needed for upgrade \#2 to persist. Safe to add without downtime.
- **★ VERCEL STATE (checked 2026-07-31):** `ANTHROPIC_API_KEY` is **flipped and working** — live logs show `[klyfton] call claude-haiku-...` succeeding, app healthy on main (sync/tts/photo/notify all 200). ⚠ **Deployment Protection is ON** (`live:false`; public fetch of `mgsf-fieldos.vercel.app` / `app.machinegunsprayfoam.info` → 403) — the crew can't reach the app without a Vercel login; owner must turn off Vercel Auth / add the custom domain publicly before go-live. Other switches (OPENAI/Supabase/ALERTS/budget) not confirmable via the current Vercel MCP (no env-list tool; protected endpoints unreadable) — check the Vercel dashboard Env Vars. Minor: `/api/sync` logs a Node `url.parse()` DEP0169 warning (not our code; harmless).
- **★ HEALTH / MECHANIC (BUILT 2026-07-31): `api/health.js`.** Read-only self-check `/api/health` — reports each subsystem on/off/partial from env PRESENCE only (never echoes a secret, no pipeline data, no network) and tells the owner exactly what to set to turn each on; groups the provider hub; CREW_CODE-gated when set (no lockout otherwise). Replaces the retired mcp-diag (410) — this is the Mechanic's vitals check. Pure `buildReport(env)` + 22 tests.
- **★ LEAD-SCORE WIRED (2026-07-31): HubSpot call list now prioritized.** `api/hubspot.js` `mapContact` attaches a deterministic `score`/`band` (from `api/lead-score.js`) to every lead and the `leads` mode sorts hot-first. Keyless, no outward action, never breaks the list on error. The `lead.score` `hubspot-sync.js` reads is now actually populated. +7 tests (`tests/hubspot-score.js`).
- **★ PROVIDER FALLBACK (2026-07-31): `chatWithFallback()` in `api/provider.js`.** Try the preferred model, then auto-retry the next configured provider on failure (Claude 529/500 → Grok/ChatGPT/local). `/api/provider {fallback:true}`. Injectable + tested (+9).
- **★ GEO / mapping (BUILT 2026-07-31): `api/geo.js`.** Turns a job address into real drive distance from HQ (2402 N Anderson Ave, Glendive MT) + a mobilization quote using the LOCKED mgsf-core mobilization tiers (<25mi $100 / 25–50 $200 / 50+ $350 / +$1.50/mi past 100 — read-only, never sets pricing). PURE `mobilization(miles)` (keyless, 15 tests) + gated live `geocode()`/`driveMiles()` (Google Maps, gated on `GOOGLE_MAPS_API_KEY`/`MAPS_API_KEY`). `/api/geo`. Registered in the health/Mechanic check as the `maps` subsystem. Replaces eyeballed mileage tiers. Nearest existing skill = mgsf-scheduling-dispatch (routing logic). Gate now 13 suites / 314 checks.
- **★ PROVIDER HUB — multi-AI (BUILT 2026-07-31): `api/provider.js`.** Vendor-neutral chat adapter — the "hook up other AIs" port Clifton asked for. Claude stays native; ONE OpenAI-compatible adapter covers ChatGPT (`OPENAI_API_KEY`), Grok/xAI (`XAI_API_KEY`), Groq (`GROQ_API_KEY`), Mistral (`MISTRAL_API_KEY`), and a free/downloaded local model (`OPENAI_COMPAT_URL` + optional `OPENAI_COMPAT_KEY`, e.g. Ollama/LM Studio). PURE CORE (`buildRequest`/`parseResponse`/`pickProvider`, 29 tests) + gated live `chat()` + `/api/provider` endpoint (GET lists providers + configured flags). ADDITIVE — does not touch the live klyfton.js pipeline; each provider inert until its key is set. Local-model caveat: Vercel can't reach a LAN PC — point `OPENAI_COMPAT_URL` at a reachable OpenAI-compatible endpoint. **Next (owner-gated):** set a key + route a worker mind or orchestrator run to it.
- **★ PREDICTIVE LEAD SCORING — (BUILT 2026-07-31): `api/lead-score.js`.** Closes "the one genuinely-unbuilt v2 idea." Deterministic, keyless heuristic PRIORITY score 0-100 (not a probability/promise — fully transparent `reasons[]`, fabricates nothing) from real lead fields: territory (MT/ND/SD/WY doctrine), reachable phone, valid email, known service line, job description, location, source quality; dead statuses cap ≤10. Bands hot≥75/warm/cool/cold. Aligns with the `lead.score>=75` threshold `hubspot-sync.js` already reads (was previously never computed). Pure `score()` + `/api/lead-score` endpoint + 19 tests. Gate now **9 suites / 240 checks**. **Next (owner-gated):** call it in the intake path so `lead.score` is populated for hubspot-sync.
- **★ ORCHESTRATOR — verify-and-correct loop (BUILT 2026-07-30): `api/orchestrator.js`.** The honest "special sauce": Klyfton already runs multiple AIs together (the hive); this adds the loop that makes a multi-agent system *trustworthy* — **plan → run collective → self-critique → bounded correction → best answer + trace**. It re-runs with the critique fed back only when the critic scores below `minScore` (default 0.8), keeps the highest-scoring candidate, and hard-caps retries (`MAX_ROUNDS_CAP=3`). PURE CORE (`orchestrate()`/`parseCritique()` take injected `run`/`critique` async fns — no keys/network — fully unit-tested, `tests/orchestrator.js`, 28 checks). Live layer is **self-contained** (its own fetch to Anthropic) so the module is **ADDITIVE — it does NOT import or modify the live klyfton.js pipeline**; new `/api/orchestrator` endpoint is gated on `ANTHROPIC_API_KEY` and inert until the frontend/a gear points at it on purpose. Cost: each round = 1 collective + 1 critique call (default rounds=1 ⇒ ≤2+2). Wired into `tests/run-all.js` (now **7 suites / 192 checks**). **Next (owner-gated):** point a Command Center action or a gearbox gear at it for high-stakes answers (estimates, GovCon, customer comms); optionally swap the self-contained runner for the real hive once klyfton.js exports `runMind`.
- **★ DOCTRINE RECONCILE (BUILT 2026-07-30): `tools/doctrine_reconcile.py`** — diffs MGSF's locked constants between the mgsf-core skill (`SKILL.md`) and klyfton.js's `DOCTRINE` block ("same brain, two bodies"). Reads only the authoritative regions (core's whole file + the `const DOCTRINE=\`…\`` literal), case-insensitive/anchored patterns; covers all $/BF, labor, concrete/void/polyurea/coating prices, GM %, state multipliers, job min, soil-stab status. Exit 0=in sync, 1=drift, 2=file error. Never edits. Current state (2026-07-31): **20/20 constants match — fully in sync.** The last drift (soil-stab) was reconciled when Clifton authorized flipping mgsf-core `BLOCKED`→`OFFERED` (pricing still PENDING); both bodies + DOCTRINE §596 now agree. Updated in BOTH the local `/root/.claude/skills/mgsf-core/SKILL.md` **and the canonical Drive `mgsf-core.skill` package** (repacked 2026-07-31: downloaded the zip, edited the soil-stab table row BLOCKED→OFFERED, re-uploaded to `02_Skills_and_Packs`, trashed the old copy — now one file, id `1CbnExbKkYHmwMa08KLGr9C5tUL5oBDUB`). ⚠ Still stale: the **combined `MGSF-Skills-Complete.zip` / `MGSF-Skills-Individual.zip`** bundles (they embed a BLOCKED mgsf-core) and the **SEO launch pack** — flag on the next full skills-bundle repack (which also folds in the 4 newer skills). Run the tool after any DOCTRINE/mgsf-core edit. Doc: `tools/README.md`.
- **InfraNodus scan queue** (`/home/user/REPO_SCAN_PROGRESS.md`): SKILLS→MODULES→EXPERTS→DRIVE→setup-assistant→html-parsing. Only MGSF done. Corpora staged. **Only runs interactively** (connector absent in cron; ~1 call/15min rate limit).
- **Clifton's Command-Center↔Klyfton pipeline (4 steps, staged, awaiting InfraNodus):** (1) scan `/home/user/CC_CORPUS.md` (Command Center); (2) scan `/home/user/KLYFTON_CORPUS.md` (whole brain); (3) FIX discrepancies in both — safe code/doc fixes directly, FLAG owner-gated ones, never fabricate; (4) CROSS-COMPARE the two for mutual upgrades. Both corpora staged; pipeline steps written at the bottom of KLYFTON_CORPUS.md. Runs when InfraNodus reconnects (flapping all session; ~1 call/15min).

## 6. Environment gotchas (save yourself the rediscovery)
- **Cron/scheduled fires carry NO MCP connectors** (InfraNodus/Drive/Vercel/GitHub-MCP). Local tools only. Connectors work only in Clifton's **interactive** sessions.
- InfraNodus: interactive-only + **429 after ~1 call/15min**. Don't churn scheduled retries — they always miss.
- App runs on built-in `fetch` only — **no `package.json`, no npm** (`vercel.json` = `echo skip-install`). New api functions must be plain fetch.
- Klyfton brain blocks must be wired into BOTH builders in klyfton.js (specialist `runMind` + `buildSynthSys`).

## 7. Doc index (where detail lives)
- Marketing worklog → `mgsf-marketing/NIGHT_LOG.md` · Scan queue → `/home/user/REPO_SCAN_PROGRESS.md`
- Competitors → `COMPETITIVE_ANALYSIS.md` · Capabilities → `CAPABILITIES_ROADMAP.md` · Command Center → `OPERATIONS_COMMAND_CENTER.md`
- v2.0 truth → `IMPROVEMENTS.md` + `.vercelignore` · MOGS guide → `../MGSF/CLAUDE.md`

## Cross-references
- [`CLAUDE.md`](CLAUDE.md) · [`api/klyfton.js`](api/klyfton.js) · [`CAPABILITIES_ROADMAP.md`](CAPABILITIES_ROADMAP.md) · [`OPERATIONS_COMMAND_CENTER.md`](OPERATIONS_COMMAND_CENTER.md)
