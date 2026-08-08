# PROJECT MEMORY — read this FIRST, every session

Single source of truth for the MGSF build so no session starts blind or re-derives what's
already known. If something here conflicts with a vague memory, **this file wins.** Keep it
current: when you finish a unit of work or make a decision, update the relevant section here in
the same commit. Doctrine numbers (`mgsf-core.skill`) still win over everything.

_Last updated: 2026-08-07 (pm)._

## ⚡ LATEST — 2026-08-07 pm (LIVE ON MAIN)
- **★ Council/cube shipped to production (PR #93).** 6-division cube, 34 specialists, 26-piece combo
  algebra (`api/combos.js`, 14 featured teams + `GET /api/combos`), 5 new arms, `calendar`/
  `labor-burden`/`break-even` tools (last two tap-to-use in Command Center → Owner Tools), cube-map.
- **★ DRIVE AUDIT (8/5–8/6) reconciled (PR #94).** New locked doctrine found: **PRICING_RULES v2
  supersedes v1**; `URGENT_roofing_rate` doc is **VOID** (2,600 roofing figure retracted → measured
  **3,750**); Estimating **Workbook V2 → V3**. Actions taken:
  - **`api/doctrine.js` = single source of truth** for locked numbers (mirrors mgsf-core v2). R-values
    reconciled to **closed 7.0 / open 3.8 / roofing 6.3** (were 6.5 in spf-takeoff, 7.1 in rvalue-calc —
    now both READ from doctrine; drift-guarded by `tests/doctrine.js`). Clifton approved "match doctrine."
  - **coating-calc requires a dry-mil spec** — refuses `no_mil_spec` rather than price with no mil behind it.
  - **yield-variance.reviewAgainstDoctrine()** flags measured-vs-doctrine yield drift (>8%) for review
    (detection only; never rewrites a locked number).
  - **Consensus UI** card in Owner Tools.
  - Gate **110 suites / 2673**. 
- **OWNER DECISIONS STILL OPEN (flagged, NOT changed — pricing is owner-only):** roofing product
  **NCFI 10-011 (3.0#, HFC-245fa, R-6.3/in, 62 psi) vs 10-016 (2.8#, HFO, R-6.7/in, 58 psi)** — CORRECTED
  2026-08-08 against the printed NCFI TDS (deep Drive scan): the old "10-011 = 25 psi" note was WRONG (it's
  62 psi), so BOTH are walkable-strength — the real tradeoff is R-6.3 HFC-245fa (higher psi/density) vs
  R-6.7 HFO (greener/higher R + Class II VR @1"), NOT walkable-vs-not. Sets roofing R (still UNCONFIRMED in
  doctrine.js until the pick). Also open: **set invoice
  prices** (implied are back-calculated); **concrete-lifting $10/lb sell rate** flagged ~45% light vs
  $12/SF market; **thermal-barrier (DC315) coating has no price** (bid lists it as an exclusion → price it).
  Manual Drive step waiting: rename+move Workbook V2 into 16_ARCHIVE (connector can't move/rename).
- **★ INFRANODUS GAP FILL (branch `claude/klyfton-ai-problems-ynhx9f`, staged).** Ran InfraNodus's
  content-gap methodology on the app's own brain graph (`api/brain-graph-data.js`; live connector was
  offline — no fabrication, used the real saved graph). Two structural holes found + closed as GROUNDED
  brain blocks (reasoning only, every number still defers to DOCTRINE/TDS):
  - **Gap #1 — Business Licensing was a structural island** (credentials known, but ~no edges to the
    service clusters). New **`CREDENTIAL_MAP`** block bridges credential → the service it unlocks / job
    class it gates: BPI→blower-door/energy-audit, applicator training→manufacturer-warranty foam, state
    registration→right-to-bid-per-state, SDVOSB+SAM→federal set-asides, prevailing-wage→public works,
    OSHA/resp→the spray work, GL+CPL+WC→commercial/GC jobs, surety→bonded work. "Verify with the
    board/AHJ/surety" throughout; no invented license #, bond amount, or fee.
  - **Gap #2 — Cost Efficiency ✕ Dew Point barely bridged** (pricing didn't connect to the weather).
    New **`SEASON_ECONOMICS`** block = the cost of the spray/coat window: coat-in-same-season roof gate,
    product cold-weather minimums (relative order; temps from the TDS), reschedule/mobilization cost,
    short-season capacity compression (Sunday always NO-GO), weather-risk buffer, and the move (sell
    weather-independent crawl/attic/injection off-season, reserve warm-dry days for exterior/roof).
  - Both added to `BRAIN_BLOCKS`/`BRAIN_ORDER` (after `GAP_BRIDGES`) and routed in
    `api/brain-graph-retrieve.js`: `CREDENTIAL_MAP`→Business Licensing cluster; `SEASON_ECONOMICS`→Dew
    Point + Cost Efficiency clusters; ALIAS words added (cert/certification/credential/registration/
    warranty/applicator/training; season/reschedule/mobilization/coating/coat). Gate **110 suites / 2679**
    (+6 routing/assembly assertions in `tests/brain-graph-retrieve.js` + `tests/klyfton.js`).
- **★ INFRANODUS RE-SCAN + PROOF pass (branch, staged).** InfraNodus connector came back online; ran a
  FRESH graph on the live brain (all blocks incl. the two above; representative down-sample of the 97k-char
  brain). **Result: the two prior gaps CLOSED** — Business Licensing went from isolated island → the largest,
  best-connected cluster ("Job Compliance", ~28%/24%); Cost✕Dew-Point no longer ranks. The re-scan surfaced
  3 new weak bridges that all converge on ONE hole: **MGSF's measurement/proof capability (BPI, blower door,
  QC) is a silo not wired to what it's WORTH or who REQUIRES it.** Closed with one grounded block:
  - **`PROOF_ECONOMICS`** — (1) the audit/test as revenue two ways (standalone diagnostic OR paid diagnostic
    that converts, credit-to-job close; ACH50/CAZ = the proof that justifies a premium); (2) gov/commercial
    specs that MANDATE air-barrier/leakage testing + commissioning (IECC C402.5, ABAA, USACE-type whole-building
    ~0.25 CFM/ft²@75Pa — "verify the solicitation spec") which a BPI-certified SDVOSB with its own blower door
    can self-deliver = a moat; (3) the money cost of no-proof/bad install (yield loss, callbacks, re-mobilization,
    warranty, failed inspection) → QC as cost-avoidance. Reasoning only; prices defer to DOCTRINE + the BPI
    audit-pricing doc; standards carry a verify pointer; no invented audit prices.
  - Added to `BRAIN_BLOCKS`/`BRAIN_ORDER` (after `SEASON_ECONOMICS`); routed in `brain-graph-retrieve.js` to
    3 clusters (Pressure Testing + Cost Efficiency + Business Licensing) with ALIAS words (audit/commissioning/
    verification/proof/testing/callback/rework/abaa). Gate **110 suites / 2683** (+4). Live InfraNodus graph
    `klyfton-brain-2026-08` still exists for the next re-scan.
- **★ CURRICULUM coverage for the 3 gap blocks (branch, staged).** The gap blocks were retrieval-tested but
  nothing verified Klyfton *reasons* with them. Added **7 graded scenarios** to `api/curriculum.js` (the eval
  bank) across 3 new modules — `credentials` (BPI→audit, CPL-for-foam, prevailing-wage gate), `season`
  (coat-in-same-season, off-season weather-independent backfill), `proof` (gov-mandated testing = edge,
  audit-as-conversion). Every answer key traces to the block text (no fabrication); include/avoid groups so a
  right answer passes and a banned/wrong one fails. Bank now **38 scenarios / 11 modules**; gate **110 suites
  / 2690** (+7). Makes the gap-fills MEASURABLE — the nightly runEval (needs a model key) now scores whether
  the new knowledge shows up in live answers, per module.
- **★ INFRANODUS RE-SCAN #3 + service→compliance bridge (branch, staged).** Connector back; re-scanned the
  live brain (now incl. all 3 bridge blocks). **PROOF pass confirmed closed** — "Energy Audit" (blower/BPI/
  proof/leakage) is now the #1, most-connected cluster (25%/26%), adjacent to Cost Management. **Signal is
  now lower** (2 of 3 new gaps point at a noisy grab-bag cluster) = diminishing returns as the brain gets
  well-connected; the big structural holes are closed. The one CLEAN gap: **services (foam/roof/lifting/void/
  soil) didn't bridge to compliance (state/prevailing-wage/federal)** — the brain knew both but not "this
  service on this job type triggers this obligation." Closed ECONOMICALLY by folding a **SERVICE → COMPLIANCE
  TRIGGER** section INTO the existing `CREDENTIAL_MAP` (NOT a 4th block — brain is ~100k chars and each block
  taxes every hive call): public concrete lift → prevailing wage + registration + bond (private driveway →
  none); commercial/federal roofing → air-barrier test + ESR + Davis-Bacon; occupied-space foam → thermal/
  ignition barrier; out-of-state → that state's registration (SD excise / ND WSI); removal → disposal/EPA;
  geotech/seawall → PE stamp. Reasoning only, "verify each trigger." Added ALIAS (public/municipal/dot/trigger)
  + 1 curriculum scenario (`cred-trigger-public`). Gate **110 suites / 2692** (+2). **RECOMMENDATION: the
  InfraNodus gap-mining loop has hit diminishing returns — stop here unless a specific new corpus (new Drive
  docs, real job data) is added; further blocks add token cost for thinner gains.**
- **★ BRAIN COST AUDIT + guardrail (branch, staged).** Measured what the growing brain actually costs per
  hive call. Findings: **full brain = ~102k chars**; **CORE (always sent) = 35k = 34%** (`BUSINESS` alone
  15k, then FEDERAL/TRADES_EXPERT/FOAM_SPECS); **retrieval-only pool = 66k (66%)**. BUT scoped queries pull
  **74–98%** of full — the retriever OVER-selects because `assembleBrainBlocks` uses `topClusters:6` out of
  only ~9 clusters, and each cluster maps to several overlapping blocks, so 6 clusters ≈ most blocks. So the
  3 new bridge blocks were correctly NON-core (load only when relevant), but overall per-call cost is still
  high because CORE is heavy + retrieval is loose.
  - **DONE (safe):** locked a cost/safety guardrail in `tests/klyfton.js` — a scoped query must assemble LESS
    than the full brain (retrieval must actually scope), CORE identity+doctrine+gates must NEVER be dropped,
    and trivial input must fall back to the full brain. Catches the regression where GraphRAG silently returns
    full-on-every-call (cost blowup) or drops a CORE block (strips identity/doctrine). Gate **110 / 2695** (+3).
  - **OWNER DECISION (flagged, NOT changed — brain is tuned/Claude-locked):** dropping `topClusters` 6→3-4 in
    `assembleBrainBlocks` (api/klyfton.js ~line 1257) would cut typical per-call tokens materially (toward the
    34% floor) — but it's a quality↔cost tradeoff (tighter scope risks dropping a relevant block). Recommend
    Clifton approve a test of 4 before flipping. Bigger lever if cost matters: trim/retrieval-route part of the
    15k `BUSINESS` core block. Both are owner calls, not autonomous changes.
- **★ DRIVE DEEP-SEARCH → real self-audit found + acted on (branch, staged).** Clifton pointed me at Drive.
  Found Klyfton's OWN weekly brain-audit `MGSF_Brain_Audit_2026-08-07` (first audit run against LIVE field-os
  data). It named 3 structural disconnects grounded in the real pipeline (far more actionable than the prose-
  graph gaps):
  1. **LEADS DIE AT THE HANDOFF** (thrice-confirmed) — capture works (9 leads in) but nothing hands them off
     to a call/response. Fix: the daily brief must emit a ready-to-act CALL LIST, not a lead count.
  2. **THE FUNNEL HAS NO MIDDLE** — 0 estimate / 0 job / 0 cost records ⇒ quoted-vs-actual margin is
     structurally unmeasurable. Fix: the lead→estimate→job rail (log every quote as an estimate on send).
  3. **ANALYSIS NEVER REACHES THE CUSTOMER** — reports never become an outbound touch. Fix: analysis output
     must end in a drafted message.
  - **DONE (disconnect #1 interim fix):** `api/daily-brief.js` now emits a **CALL LIST** — `callList()` pure
    helper + wired into `compose()`: leads needing a callback (uncontacted-first, clock starts at CAPTURE, then
    cold 7d+), each with name · phone · one-line ask · days waited; capped at 5, `stats.calls` added. Read-only
    (brief pushes YOU, never a customer). 12 new tests; gate **110 / 2707**.
  - **⏰ TIME-CRITICAL (owner action — surfaced to Clifton):** (a) lead **Alvin Newelham**, Sidney MT, duct-
    chase spray foam, voicemail 8/5, **406-480-6331**, still "New" — needs a callback. (b) **HICS Gates SDVOSB
    set-aside, Malmstrom AFB, DUE 08-12** — flagged best-fit set-aside. Other gov: 2× WAPA repeater roofs due
    08-21, BLM Missoula reno 09-04, crane support 08-28.
  - **NEXT BUILDS (disconnects #2/#3, not yet built):** lead→estimate→job rail (biggest — unlocks margin
    measurement); analysis-ends-in-a-draft. Both are real features for a future pass.
  - New Drive folder `LNSResourceManager` (8/6) is EMPTY (checked). `Ultimate_SprayFoam_Equipment_Costs_v2.xlsx`
    (8/6) is the equipment-cost sheet already flagged owner-only pricing-reconcile.
- **★ PIPELINE RAIL backbone (branch, staged) — audit disconnect #2 "the funnel has no middle".** Built
  `api/pipeline.js` (pure core + endpoint): `estimateRecord()` normalizes an estimator save into a record
  that CARRIES the bid breakdown (BF/sets/hours/material/labor/cost/sell); `advanceLead()` moves a lead
  forward without ever regressing (reusable form of the frontend auto-hallway rule); `jobFromEstimate()`
  converts a won estimate into a JOB that carries the bid forward in the EXACT shape
  `yield-variance.variance({bid,actual})` + `job-cost` consume; `railFor(customer,…)` = where they sit +
  the ONE next action; `funnelHealth(…)` quantifies the disconnect ("estimates exist but 0 converted",
  "jobs carry no bid → not measurable"). **Round-trip PROVEN in tests**: estimate → job.bid → yield-variance
  produces a real quoted-vs-actual margin delta — the loop closes. Pure/deterministic (no Date.now in core),
  never fabricates (missing bid field = null), no persistence (frontend/sync persists, same as job-cost).
  32 tests; gate **111 suites / 2739**.
  - **NEXT (wiring, follow-on PRs):** (a) thread the estimator's real breakdown into `saveEstimate()` +
    call `estimate` so the bid is captured on save; (b) add a "convert to job" path on Won; (c) surface
    `funnelHealth()` as a `business-audit` finding → flows into the daily brief's "Needs attention". Backbone
    first (this PR), wiring next — the contract is now concrete + tested.
- **★ RAIL WIRED into audit + brief + a latent-bug fix (branch, staged).** Made the pipeline backbone a
  LIVE consumer: `business-audit.audit()` now calls `pipeline.funnelHealth()` and emits a **Funnel** finding
  when estimates aren't converting to bid-carrying jobs ("N estimate(s) but 0 converted to a job" →
  convert-on-Won action). **Also fixed a latent wiring bug**: the daily brief filtered findings by
  `high|medium` severity, but `business-audit` emits `red|amber|green` — so **real audit findings had been
  silently dropped from the brief's "Needs attention" (it was always empty)**. Broadened the filter to accept
  both vocabularies; verified end-to-end (audit funnel/certs/AR findings now surface in the composed brief).
  4 new tests; gate **111 suites / 2743**. Remaining rail wiring (frontend estimator breakdown → save;
  convert-to-job button) is the follow-on.
- **★ BUILD HELPERS — repo agents + skill (branch, staged).** Encoded the workflows that worked this
  session into `.claude/` so every future session/cron builds the same disciplined way (no `.claude/` existed
  before). Agents: **gate-keeper** (runs `tests/run-all.js` + `node -c` → PASS/FAIL, never rubber-stamps,
  never edits), **brain-block-author** (grounded brain block end-to-end: block + BRAIN_ORDER + retriever
  wiring + curriculum + tests, non-fabrication doctrine baked in), **field-os-reviewer** (reviews a diff vs
  this repo's hard rules — module pattern, doctrine-wins, no secrets, no Sunday scheduling, 1:1 test
  registration, never-merge-without-OK). Skill: **klyfton-module** (the add-an-api-module-right checklist:
  pure-core + gated-live, test+SUITES, env docs, reference modules). All frontmatter house-spec valid; gate
  still **111 / 2743**. Cross-referenced in CLAUDE.md.
- **★ RAIL FRONT-END: estimate now CAPTURES the bid (branch, staged).** Wired the estimator save to the
  pipeline rail: at render the app stashes `window._lastEstimateBid` (BF/sets/laborHours/material/labor/cost/
  sell/cell, summed straight from the scope results — never fabricated), and `saveEstimate()` attaches it as
  `est.bid`. So a saved estimate now carries the full bid, not just value+gm — the data a WON job needs to be
  compared to actuals (yield-variance). Additive + backward-compatible (no stash ⇒ no bid, save never
  blocks); proven in the vm-sandbox frontend test. SW cache v80→v81. Gate **111 / 2748** (+5).
  - **RAIL NOW CLOSED END-TO-END (Won → job, branch, staged).** `updateLeadStatus()` Won-transition now
    calls new `_jobFromWonLead(l)` (frontend mirror of `pipeline.jobFromEstimate`): finds the customer's
    winning estimate, creates a `Scheduled` job that CARRIES `est.bid` + links `estimateId`, idempotent (one
    job per estimate), fully guarded (no estimate ⇒ no job; never blocks the status change). So the full loop
    is live: **estimate saved (carries bid) → Won → job (carries bid) → actuals logged → yield-variance
    compares actual vs bid.** Disconnect #2 is closed in the app. SW cache v81→v82. Gate **111 / 2754** (+6).
    Remaining to actually SEE margin in prod: crew uses it + `CREW_CODE`/KV live (owner-side).
- **★ RAIL FIXES from the field-os-reviewer agent (branch, staged).** Ran the new `field-os-reviewer`
  subagent over the whole rail (money path) — verdict FIX-FIRST, and it caught real bugs the gate missed:
  1. **BLOCKER** — `_jobFromWonLead` deduped on CUSTOMER NAME, so a repeat customer winning a SECOND estimate
     got NO job, silently (the ordinary book-of-business case). **Fixed**: dedupe on `estimateId` only.
     Added a repeat-customer REGRESSION test that would have caught it.
  2. **SHOULD-FIX** — rail jobs lacked `jobNum`/`name` → UI rendered "MGSF-???" / "undefined" everywhere.
     **Fixed**: `_jobFromWonLead` now sets `jobNum:nextJobNum()` + `name`; mirrored `name`(+opts.jobNum) in
     `api/pipeline.js jobFromEstimate`.
  3. **NIT** — auto-job stamped today's date (Sunday risk + win-date≠work-date). **Fixed**: `date:''` (needs
     scheduling) + a separate `wonDate` stamp.
  Nits left (documented, low): name-string linkage (pre-existing convention), $0-bid exclusion, fixed-amber
  funnel severity. Gate **111 / 2759**. SW cache v82→v83. The reviewer agent earned its keep on its first run.
- **★ #2 MEASURED-YIELD WRITEBACK (branch, staged).** Closed the loop at the rail's END: `api/job-actuals.js`
  now computes `doctrineYieldReview(rec)` — for a SINGLE-cell session it takes real yield (BF÷sets) and calls
  `yield-variance.reviewAgainstDoctrine` to flag when measured field yield diverges >8% from the locked
  doctrine yield (closed 4200 / roofing 3750). Attached to the normalize output; DETECTION ONLY (never
  rewrites a locked number — owner's call), never fabricates (mixed-cell/no-BF ⇒ insufficient). So now:
  log actuals → measured yield vs doctrine surfaces automatically. 5 tests; gate **111 / 2764**. (List item #2.)
- **★ #4 RAIL EXPOSED TO THE HIVE (branch, staged).** Added `pipeline` to the tool catalog (`api/tools.js`,
  category pm) so Klyfton can reason over the rail (railFor/funnelHealth/convert). OpenAPI guard auto-derives
  the `/api/pipeline` route; tools + openapi suites green. Gate **111 / 2764**. (List item #4.)
  - **#24 (cert reminders) — already covered, no build needed:** `business-audit.js` already emits Compliance
    cert-expiry findings (expired/≤60d red, ≤120d amber, missing-expiry amber), and the #103 brief severity
    fix means those now actually reach the daily brief's "Needs attention." So cert reminders surface today via
    the audit→brief path (once KV/CREW_CODE live). Marked done rather than duplicate it.
- **★ #5 CONVERT-TO-JOB button (branch, staged).** Explicit rail conversion on the lead detail modal (shown
  for Won leads): `convertLeadToJob(id)` reuses `_jobFromWonLead` (idempotent/guarded) for leads the auto-hook
  misses (imported-Won, won-before-the-hook, repeat customer with a NEW estimate). Unlike the auto-path it
  INFORMS on skip ("no convertible estimate — save one first, or a job already exists") — no silent no-op.
  5 tests; SW cache v83→v84; gate **111 / 2769**. (List item #5.)
  - **#1 (analysis→drafted message) already largely built** — `estimate-followup.js` drafts stale-estimate
    reheats + `follow-up.js` chases quiet leads, both draft-only; the #103 fix routes audit findings to the
    brief. Not duplicating; the remaining nicety is surfacing a "N drafts ready" count (deferred, low value).
- **★ #3 RAIL/FUNNEL TILE on the dashboard (branch, staged).** The Pipeline Health card now leads with a
  **Funnel line** (`funnelCounts()`, mirrors `api/pipeline.funnelHealth`): "N leads → E estimates → J jobs ·
  $X quoted", plus an amber warning when estimates aren't converting to jobs (the funnel-middle gap, visible
  at a glance, not just in the brief). Pure helper, 5 tests; SW cache v84→v85; gate **111 / 2774**. (List #3.)
  Recommended trio (#2/#4/#5) + #3 all shipped; #24 confirmed already-covered; #1 already largely built.
- **★ #6 QUOTED-MARGIN reading (branch, staged).** `business-audit.js` Margin section now uses the rail's
  captured bids: when no ACTUAL cost+revenue jobs exist yet, it grades blended **quoted** GM =
  (bid.sell−bid.cost)/bid.sell across bid-carrying estimates+jobs vs the doctrine target, clearly labeled
  "bids, not actuals" (actual margin still wins once logged). Flags "bidding light" when quoting under target.
  Uses only real quoted numbers, never fabricates. Chains to the brief (severity → "Needs attention"). 4 tests;
  gate **111 / 2778**. (List #6.) So margin is now visible from the moment a bid is saved, not only after a
  job's actuals — the rail earns its keep even pre-go-live-data.
_Earlier 8/07 detail below._

_Last updated: 2026-08-07._

## 1. What this is / repos
- **mgsf-field-os** — Klyfton AI (the app): `api/klyfton.js` = Queen router → worker minds → synthesizer/critic hive; `public/index.html` = single-file app; Supabase brain; **Vercel PRO**, auto-deploys **from `main`**.
- **mgsf-marketing** — the public site (20 pages), Vercel, cleanUrls.
- **MGSF** — MOGS (Apps Script ERP/CRM/estimator over Google Sheets).
- Work branch (all three): **`claude/klyfton-ai-problems-ynhx9f`**. **Never merge to main without Clifton's OK.**

## 2. Current build state
**★ DEPLOYED TO MAIN 2026-07-27 (Clifton's go):** field-os branch fast-forward-merged to main + live on Vercel (prod deploy READY, commit ad06190). LIVE now: 3D brain-graph boot screen, GraphRAG block-selection in the brain (both builders, safe full-brain fallback), live-data grounding (brainContext, pipeline-gated), warranty-cert button, + all prior staged subsystems (Command Center, ATS, axle, gearbox, memory, act.js[inert until ALERTS_WEBHOOK_URL], crons now on their Mon-Sat schedule). HUBSPOT_TOKEN + KV set in Vercel. Smoke test `/api/brain-context` = {configured:true, source:kv, 12 open leads / 11 cold}. **Hardening flag:** read endpoints (`/api/brain-context`, `/api/command-center`) return aggregate pipeline data UNAUTHENTICATED (noindex, but public) — existing app posture; consider gating behind CREW_CODE.
**Klyfton backend (field-os) — shipped to branch, not merged:**
- **★ THE CUBE — 6-DIVISION COUNCIL, 12→34 SPECIALISTS (2026-08-07, Clifton-approved, supersedes the
  dodecahedron below):** Clifton asked for "way more arms/helpers/specialists" and a 4-row Rubik's
  cube. Restructured the flat roster into a hierarchical **6-division "cube"** (room to grow to 96
  slots) in `api/klyfton.js`: each specialist now carries {name, division, webUses, tag, focus} and a
  `DIVISIONS` array defines the 6 faces — **Estimating & Takeoff · Field & Production · Sales & Growth
  · Finance & Admin · Compliance & Risk · GovCon & Strategy**. Roster grew **12 → 34** real
  specialists (old merged "sales" split back into marketing/lead-hunter/proposal/customer-comms/
  reviews/appointment; new coverage: SPF/lift/roof takeoff, photo-bid, value-eng, equipment-rig,
  quality, ar-collections, cashflow, payroll, bookkeeping, contracts-liens, licensing, warranty,
  capability, teaming, owner-strategy). `route()` builds its menu dynamically from DIVISIONS via
  `specialistMenu()` (no drift); hive cap stays 4. `MEMORY_MIND_MAP` re-pointed to new keys;
  `command-center.js` ROSTER now lists all 34 + core tagged by division. **Arms grew too**
  (`api/act.js` +5): send_proposal, request_review, send_payment_link, collections_notice, post_social
  (all approval-gated, inert until ALERTS_WEBHOOK_URL). **Visual:** `public/cube-map.html` — interactive
  4×4×4 cube (6 division-colored faces × 16 cells = 96 slots, 34 filled + open capacity, click a cell →
  dossier, live-activity glow from /api/command-center, demo fallback). Linked from Command Center →
  Agents; SW cache v74→v75. Published as a private Claude artifact. Gate **104/2538 green.** Honest
  note: this is a COVERAGE + structure upgrade (broader roster, cleaner hierarchical routing, more
  outward actions), not a per-answer horsepower change (same 4-mind cap, same models).
- **★ OVERLAP COMBOS + true-cubie cube-map (2026-08-07, Clifton's "2-color blocks" insight):** Clifton
  pointed out the whole reason he picked the cube — the pieces that carry 2 colors (edges) and 3 colors
  (corners) are where divisions OVERLAP = cross-functional work; "build on those blocks" for "faster
  results per turn." Made it real: **`COMBOS`** in `api/klyfton.js` — 10 pre-wired cross-functional
  TEAMS (8 edge = 2 divisions, 2 corner = 3): go-no-go bid, federal bid package, priced-to-margin,
  code-compliant bid, quote→proposal, govcon pricing, bonded & insured job, safe & legal install,
  deposit-to-close, true job profit. **`matchCombo(text)`** is a fast-path (like isActionCommand): a
  clearly cross-functional ask fires the right 2-3 specialists together in ONE turn, skipping the Haiku
  router (faster + complete). Each combo needs TWO topic signals so it never hijacks a plain single-mind
  ask. Wired into both routing paths after isActionCommand; exported + tested (tests/klyfton.js 48→59).
  **Visual rewrite:** `public/cube-map.html` now renders REAL cubies (4×4×4 = 8 corners/3-color +
  24 edges/2-color + 24 face-centers/1-color); opposite faces chosen (est⟷gov, field⟷money,
  risk⟷growth) so every defined combo's divisions actually meet at an edge/corner. Click a 1-color
  piece → its division; a 2-/3-color overlap → its combo (or "open overlap — room to build"); side
  panel lists all 10 overlap plays + the 6 divisions. SW cache v75→v76. Artifact updated (same URL).
  Gate **104/2548 green.**
- **★ CUBE CAPABILITY ALGEBRA — every combination enumerated (2026-08-07, Clifton: "an algorithm for
  every combination of the cube and its capabilities"):** new **`api/combos.js`** — the pure algebra of
  the cube. Maps the 6 divisions to 6 faces on 3 opposite-face AXES and enumerates **all 26 pieces**
  (6 faces + 12 edges + 8 corners), giving EVERY combination a capability: featured plays (the 10,
  with tuned triggers) override; every other overlap gets an **auto-generated "suggested"** team (the
  lead of each division) so nothing is ever undefined. Exports enumerate()/all()/capabilityFor()/
  edges()/corners()/adjacent()/matchText()/planFor()/setKey(); `GET /api/combos` returns the whole cube
  + axes. New structure: **division LEADS** (each division's center piece / captain) and the **3 AXES
  as business tensions** (opposite faces never overlap: est↔gov = commercial vs government work,
  field↔money = do-the-work vs count-it, risk↔growth = caution vs growth). klyfton.js now consumes
  combos.FEATURED (single source; inline COMBOS removed), matchCombo delegates to combos.matchText,
  and a new **`convenePlan(key)`** + `body.convene` fast-path lets the app/cube run any chosen overlap
  team directly. `tests/combos.js` (28 checks incl. a DRIFT GUARD that combos' division rosters ==
  klyfton SPECIALISTS grouping) registered in SUITES. cube-map.html now fills EVERY overlap (featured
  or "suggested"), shows the 3 axes/tensions and each division's lead. SW cache v76→v77. Artifact
  updated (same URL). Gate **105 suites / 2577 checks green.**
- **★ OVERNIGHT (2026-08-07, unattended, Clifton "build everything without me — bedtime"):** 3 bounded,
  verified, staged passes (never merged to main):
  (1) **`api/calendar.js`** — the Scheduling/Dispatch mind's missing "calendar" tool, now real: pure,
  keyless .ics (iCalendar) generator (all-day or timed, RFC5545 escaping/folding, deterministic
  DTSTAMP), with a **hard Sunday refusal** (family-time doctrine, no override). Registered in the tool
  catalog (ops, keyless→live). `tests/calendar.js` (22).
  (2) **Combos 10→14 featured** — promoted the strongest suggested overlaps to tuned one-turn teams:
  Win-Rate Play (corner est×money×growth), True Takeoff (est×field), Book to Capacity (field×growth),
  Teaming Outreach (gov×growth). New test invariant: featured corners must be valid one-per-axis, and
  no featured "edge" may be an accidental opposite-face pair (only the documented axis play True Job
  Profit spans opposite faces). cube-map mirrors all 14 + labels opposite pairs "axis". SW v77→v78.
  (3) **`tests/samgov.js` (15)** — locked the previously-untested GovCon lead pipeline: exported +
  pinned the pure `normalize()` (raw SAM notice → clean shape, primary-POC preference, id fallback,
  safe-on-missing) and `oppToLead()` (→ Government lead card, notes join, value 0 never fabricated).
  Gate after overnight: **107 suites / 2621 checks green.** NOTE: the cube ARTIFACT republish hit a
  transient claude.ai 403 during these passes — the in-app `public/cube-map.html` is current; the
  artifact will refresh on the next successful publish (owner or next session).
- **★ THE DODECAHEDRON — 12-FACE COUNCIL (2026-08-07, Clifton-approved):** restructured the hive's
  `SPECIALISTS` (api/klyfton.js) from the old ad-hoc set into a clean, non-overlapping **12-face**
  roster (+ Klyfton general core = the 13th): 1 Estimator · 2 Building-Science (folds old
  spray-conditions + foam TDS) · 3 Concrete-Lifting (new) · 4 Roofing-Coatings (new; owns coating
  TDS) · 5 Safety-OSHA (keeps SDS) · 6 Code-Permits · 7 Finance-JobCost · 8 Scheduling-Dispatch
  (was "ops") · 9 GovCon · 10 Sales-Comms (merges old marketing+lead-hunter+proposal+customer into
  one 4-lane revenue voice) · 11 Insurance-Bonding (new) · 12 Project-Manager (new). No loss of the
  old Materials mind's TDS/SDS reach (foam TDS→building, coating TDS→roofing, SDS→safety). Router
  prompt (mind keys + routing rules), `ACTION_CMD_PATTERNS` (ops→scheduling), `MEMORY_MIND_MAP`
  (ops→scheduling, marketing→sales), and `api/command-center.js` ROSTER all updated to match (ROSTER
  keys === SPECIALISTS `name`s so live leaderboard stats merge). tests/klyfton.js updated. Gate
  **104/2531 green.**
- **★ 3D DODECAHEDRON BRAIN-MAP (2026-08-07):** `public/brain-map.html` — interactive canvas render of
  the council; 12 pentagon faces = the 12 minds, center = Queen/synth. Real geometry (20 verts, 12
  faces from the edge graph, back-face culled), drag-rotate, click-to-focus dossier, tactical
  command-console HUD (dark hero + light field theme). Lights faces by LIVE `/api/command-center`
  activity, demo-pulse fallback off-grid (honest LIVE/STANDBY/DEMO chip, never fabricates run counts).
  Linked from Command Center → Agents; added to SW offline cache (klyfton-v73→v74). Also published as
  a private Claude artifact for Clifton to open immediately.
- **✅ ALERT NERVE — telepathy phase 1 (STAGED DARK 2026-08-04, Clifton-approved):** `api/alerts.js` —
  deterministic, read-only rules over the SAME KV collections MCP reads; no LLM; only writes its own
  `alert:*` keys. RULES (pure, injected clock, America/Denver days): GOV_DEADLINE (Government + New +
  "Due YYYY-MM-DD" in notes → 10-day / 3-day / day-of tiers, once per lead, late-start fires ONE not
  the ladder), NEW_LEAD_STALE (first-seen bootstrap via `alert:seen:<id>` — first look is NOT stale;
  24h / 72h tiers), ESTIMATE_AGING (open crossing 5 then 10 days), STORE_NUMB (KV read failure, max
  once/24h). DELIVERY: Twilio REST via fetch (no SDK); recipient is ALWAYS `OWNER_SMS`/`ALERT_SMS_TO`
  env — never a number from store data (injection-guard-tested); copy plainspoken ≤300 no emoji;
  >2 pending → ONE combined SMS "+N more"; cap 5 SMS/day (`alert:sent:<yyyymmdd>`); quiet hours
  21:00–06:00 MT queue → next-run drain; **Sundays only GOV day-of may send** (house rule); Twilio
  unset → still evaluates + `alert:recent` ring buffer (200), answers `sms:"not_configured"` — never
  claims sent. First configured run sends one self-test SMS (single-shot `alert:selftest`). TRIGGERS:
  Vercel cron daily 13:00 UTC (7am MT) — **header-only auth** `x-cron-secret === CRON_SECRET` (or the
  Bearer Vercel crons send), fail-closed, 401 + `Bearer realm="mgsf-alerts"` challenge, query-string
  secret read by NOTHING; + `maybeRunAlerts()` piggyback at the end of the MCP POST handler
  (30-min debounce via `alert:last_check`, errors swallowed — can never break an MCP request).
  ENV: reused existing names (TWILIO_* trio, OWNER_SMS, CRON_SECRET) — spec's `ALERT_TO_PHONE`
  deliberately NOT invented (house reuse rule). `tests/alerts.js` (59 checks) registered. Gate
  **92/2171 green.** Landed on the branch via the GitHub API (Zapier bridge) after the scheduled
  session's git proxy refused pushes — file-level commits, content byte-identical to the verified
  local build. **GO-LIVE:** set TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_PHONE_NUMBER +
  OWNER_SMS + CRON_SECRET in Vercel → redeploy → next authenticated cron hit self-tests.
- **✅ MCP status-filter fix (2026-08-04, found live by the outreach agent):** `api/mcp.js` treated `status:"all"` (the spec's documented default) as a literal status — consumers passing it got `not_tracked_yet` while 6 live leads sat in KV. Fix: `"all"`/`"any"`/omit are wildcards on `list_leads` + `list_estimates`; a filter that matches nothing now answers `count:0` + `statuses_present` note (empty-store `not_tracked_yet` reserved for a truly empty collection; review-window miss same contract); server `1.1.1-phase1`. New `tests/mcp.js` (19 checks, KV stubbed via fetch) registered. Gate 91/2112 green. READ-ONLY surface unchanged — no Phase-2 gate impact.
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
- **Phone calls = handled by Hearth AI** (owner's service, confirmed 2026-08-05). Inbound voice/booking is therefore **NOT an MGSF/Klyfton gap** — do **not** recommend Twilio (or any telephony/STT) for call handling. Twilio is only relevant if the owner wants *programmatic SMS text-back*, which is optional and separate. (Distinct from **Hearth financing** — the `$0-down` partner on the marketing site; don't conflate the two functions.)

## 5. Open threads / pending (what to pick up)
- **★ HEARTH BRIDGE — receivers BUILT (2026-08-06, on `claude/klyfton-ai-problems-ynhx9f`, not merged).** **CONFIRMED (real email sample 2026-08-06): Hearth is ONE company** doing BOTH the AI receptionist (phone number **(605) 349-2884**) AND financing (gethearth.com) — all notifications come from **`noreply@gethearth.com`** (footer "Notifications from Hearth"). Receptionist notifications route to email + SMS only (no webhook field; 406-941-2428 / 406-550-3408 / 406-939-8301 + clifton@ / daniel@ already in Company Notification Preferences). This supersedes the TRANSMISSION_COUPLING spec's "Hearth call.missed" note. **The real call email** = subject "New call from {name}", branded HEARTH, sections: header "NEW CALL FROM {NAME} · {LEGITIMATE|SOLICITATION|SPAM}", THE LEAD (name / phone · city / urgency + "Appointment requested"), CALL DETAILS (Duration, Summary), THE JOB (type + description), QUALIFYING QUESTIONS (incl. "Address: …"), SUGGESTED NEXT MOVE (title + priority), "View Activity" button. It's a FULLY-QUALIFIED lead, not a bare missed call — the receptionist answers ($0-down financing link mentioned in its script).
    - **`api/hearth-lead.js` (NEW, primary):** parses that email SERVER-SIDE (Zapier just forwards `{subject, body}` raw; parse logic lives in tested code, not a fragile Zapier template) → structured CRM-ready lead + owner alert + suggested next move + callback task. `parseHearthEmail()` pure; `classify()` Legitimate→actionable, Solicitation/Spam→filtered (no lead). Also accepts pre-parsed fields (they win). Draft-only, never writes CRM/messages, never invents a field. Fixture = the real email. `tests/hearth-lead.js` 40 checks.
    - **Bridge A (receptionist → speed-to-lead):** `api/missed-call.js` made **field-tolerant** (pick() aliases: caller/name/from_name, phone/from/number/caller_number, service/reason, at/time; case-insensitive; canonical wins). Point the receptionist's notification (via a Zapier Email Parser → POST) at `/api/missed-call`. Drafts speed-to-lead text + owner alert + callback task. Draft-only.
    - **Bridge B (financing → hot lead):** `api/financing-event.js` (NEW) — POST a Hearth financing email (parser) → `classify(status)` hot/warm/cold + owner alert + **suggested** CRM stage/priority. `money()` never fabricates an amount; field-tolerant (customer/borrower_name, email, phone, amount/loan_amount, status/stage). Draft-only — never writes CRM/messages. GET `?event=1` fires webhook.
    - **Financing CTA in proposals:** `api/gearbox.js` `estimate.ready` now emits a gated proposal email via pure `proposalEmail(payload)` that appends the Hearth link **only when a price exists** ("monthly-payment options"). Link = `HEARTH_FINANCING_URL` env override, default short link `l.gethearth.com/v1/r/wUBj57Wj`. Doctrine-clean (no quoted rate/guarantee).
    - **PENDING (owner):** (a) Vercel **Protection Bypass for Automation** secret (or turn Deployment Protection off) — else Zapier's POST hits the 403 wall; (b) add the parser email to the receptionist's Notification Emails; (c) set `ALERTS_WEBHOOK_URL` (or send SMS/CRM directly in the Zap).
- **★ STRIPE BRIDGE — money-loop closer BUILT (2026-08-06, same branch, not merged).** Clifton's Stripe acct = `acct_1bshbnkenkdaynlf` (receipts from `receipts+acct_...@stripe.com`). Chose **webhooks over email parsing** (signed/structured/real-time). `api/stripe-webhook.js`: pure `verifySignature()` (HMAC-SHA256 over `t.rawBody`, constant-time, replay tolerance, **fail-closed** — rejects unsigned/!configured), `parseEvent()` (cents→dollars, customer, paid flag; never invents an amount), `summarize()` (owner alert + suggested "mark Paid"). On a verified payment it fires the alert + turns the gearbox. **Gearbox gained `payment.received` gear** → emits `job.completed` → review.requested(draft) [+ roof-maint], closing **lead→…→paid→review**. Records/notifies/drafts only — never charges/refunds/writes truth. `tests/stripe-webhook.js` 25 checks + gearbox +4. **PENDING (owner):** set `STRIPE_WEBHOOK_SECRET` in Vercel + add the endpoint (`<app>/api/stripe-webhook`) in Stripe Dashboard → Webhooks (events: checkout.session.completed, invoice.paid, charge.succeeded). ⚠ Vercel raw-body: verification needs the exact bytes — if Vercel pre-parses the body the receiver fails-closed; may need a body-preserving config on that route. Stripe MCP connector exists but needs owner auth. Gate at build: **96 suites / 2315 checks** green.
- **★ OWNER ROADMAP (2026-08-06, Clifton's 5 highest-leverage asks) — in progress on the branch/PR #89:**
    1. **Kill the "Loading…" tax** on core tools — estimator + job log usable the second the page opens, offline-first, local defaults; everything else loads in background. *(next up — frontend)*
    2. **SPF takeoff engine** — ✅ BUILT `api/spf-takeoff.js` (multi-area, cell type, R-target→lift, condition/scarf waste, price@GM×state; doctrine-grounded; 41 checks). REMAINING: wire into the Estimate Builder UI (multi-area entry).
    3. **Bid→actual feedback loop** — ✅ ENGINE BUILT `api/yield-variance.js` (real yield BF/set, productivity BF/hr, margin actual-vs-bid, overrun flags; never fabricates unlogged actuals; 32 checks). REMAINING: actuals-storage schema + the <90s Field-Mode logging UI.
    4. **True Field Mode** — big-target phone view (clock-in, weather, JSA, material log, photos, sign-off) syncing back. *(frontend, not started)*
    5. **Finish-or-kill thin modules** — ✅ AUDITED (2026-08-06): **all five are BUILT & functional** (BPI audit, subs roster, blueprint reader, trade calculators, scenario builder). They only *feel* thin because of the "Loading…" placeholders (#1) + dormant-pending-env states (subs→Supabase). **DO NOT DELETE any as "empty" — they work.** #5 collapses into #1 (fix the loading tax → they feel complete).
- **★ INTELLIGENCE ENGINES (2026-08-06, on branch/PR #89, gate 101 suites / 2473) — from Clifton's Foam-Guru-parity vision. Pattern: tested pure backend cores; UIs follow.**
    - `api/spf-takeoff.js` — multi-area SPF takeoff (roadmap #2 engine). 41 checks.
    - `api/yield-variance.js` — bid→actual variance (roadmap #3 engine). 32 checks.
    - `api/true-profit.js` — fully-loaded job profit (composes job-cost; +wear/insurance/rig-opportunity; profit-PER-DAY; GO/THIN/NO-GO; lists what's counted). 29 checks.
    - `api/job-risk.js` — "Should We Take It?" pre-accept score (distance/weather/access/substrate/margin/past-variance/crew → TAKE/RAISE PRICE/WALK; assessed-only denominator). 23 checks.
    - `sysCache` (index.html) — offline-first last-good cache; applied to subs roster (roll to trades/BPI/CRM next).
    - **BIG "already built" finding for the vision:** portal (`portal.html`), follow-up/estimate-followup/roof-maintenance sequences, photo-estimate + blueprint reader, predictive-cost (least-squares), dew-point/spray-weather, Alert Nerve cert/deadline radar, samgov + capability-statement, inventory-reorder, change-order engine, role-based views — ALL exist. Don't rebuild; extend/wire.
    - `api/scorecards.js` — crew/rig scorecards (per-crew+rig yield/productivity/margin, adherence ranking, winter-vs-summer, insights; composes yield-variance). 18 checks.
    - **UI SHIPPED (index.html, additive — old estimator PRESERVED):** `mod-takeoff` = multi-area SPF estimator (add-a-row, client-side doctrine math, "Save bid baseline"); `mod-fieldlog` = 90-second rig-side actuals capture (sets+lots, conditions, equipment, spray-vs-onsite time, live productive% + chain-of-custody, POSTs to /api/job-actuals). Old estimator = `mod-estimate` iframe, untouched + reachable; full snapshot at `backups/index.html.2026-08-06.bak`.
    - **★ YIELD-INTELLIGENCE LOOP now COMPLETE end-to-end:** takeoff(bid) → field log(actuals) → job-actuals(spine) → yield-variance → true-profit → job-risk → scorecards + chain-of-custody. All tested, doctrine-grounded, gate 103 suites / 2510.
    - **REMAINING roadmap gaps (further builds):** true offline (Service Worker + IndexedDB + sync/photo queue), weather-window optimizer + travel clustering, roll sysCache across trades/BPI/CRM, hands-free voice logging, push notifications, GPS/timestamped photos, good/better/best proposals + deposit flow. Note: many "menu" items already exist (see above) — audit before building.
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
