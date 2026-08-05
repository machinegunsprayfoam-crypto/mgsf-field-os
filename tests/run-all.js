#!/usr/bin/env node
// Runs every brain/estimator test suite and reports one combined result. `node tests/run-all.js`.
// Exit 0 only if all suites pass — usable as a pre-commit / pre-deploy gate. Keyless, no npm.

const { execFileSync } = require("child_process");
const path = require("path");

const SUITES = [
  ["calc-invariants", "estimator math invariants"],
  ["calc-money", "commission / payment-schedule / unit-convert math"],
  ["brain-retrieve", "GraphRAG routing"],
  ["brain-graph-sync", "brain graph baked into 3 files (data.js / brain-graph.json / brain-graph.js viz) stays byte-identical + structurally valid — guards boot-viz↔retriever drift after a re-scan"],
  ["frontend-wiring", "index.html UI integrity: every inline on{click,…} handler resolves to a defined function (no dead buttons) + every switchModule('x') target has a mod-x container (no dead nav) — guards the single-file app's button/tab wiring"],
  ["brain-assembly", "brain block selection (live wiring)"],
  ["brain-context", "live-data grounding (gated)"],
  ["missed-call", "speed-to-lead / missed-call recovery"],
  ["orchestrator", "verify-and-correct loop (plan/run/critique/retry)"],
  ["provider", "vendor-neutral AI hub (Claude/ChatGPT/Grok/local)"],
  ["lead-score", "deterministic lead prioritization"],
  ["hubspot-score", "call-list scoring integration"],
  ["health", "Mechanic self-check (subsystem status)"],
  ["redact", "secret/PII redaction guardrail"],
  ["geo", "mobilization-by-distance (locked doctrine tiers)"],
  ["dew-point", "spray-safety GO/CAUTION/NO-GO flag + 5°F margin"],
  ["bpi-calc", "blower-door tightness bands + ASHRAE 62.2 target"],
  ["roi", "financing cash-flow decision + savings clamps"],
  ["measure", "roof/wall takeoff: wall path, mode routing, clamps"],
  ["ats", "budget throttle: fuel→battery transfer thresholds + plan downshift"],
  ["memory", "semantic memory: gated behavior + backfill/schema-check"],
  ["curriculum", "learning curriculum: bank integrity + grader + guardrail enforcement + eval wiring"],
  ["tools", "tool bag: self-describing capability catalog + honest live-status (sourced from health)"],
  ["openapi", "OpenAPI 3.1 spec GENERATED from the tool bag — guards anti-drift (every catalogued api/ tool has a route) + honesty (no fabricated schemas, no secrets)"],
  ["act", "arms: outward-action classify + approval gate + universal Zapier bus"],
  ["wiki", "knowledge base: pure retrieval ranking + gated/graceful store + owner-gated writes"],
  ["projects", "job-lifecycle PM: stage engine + next-action routing + overdue detection + board"],
  ["cmdb", "AI-augmented CMDB: dependency graph + root-cause + blast-radius + biggest-unlock"],
  ["wiki-seed", "wiki starter articles: valid + hard-rule-clean + retrievable"],
  ["scenarios", "AI scenario builder: validate against real triggers/tools + approval + dark-tool guard"],
  ["rag", "unified RAG: fan-out across brain/wiki/memory + merge/dedupe/rank + truth-order context"],
  ["agents", "agents runtime: goal-driven job selection + planning + approval/dark-tool guards"],
  ["boot", "boot manifest: live self-map (components/deps/tools/brain/agents) computed from env"],
  ["guard", "access guard: dormant-safe CREW_CODE gate (no lockout until set, then enforced)"],
  ["idempotency", "idempotency: deterministic key + no double-send (check before, commit after success)"],
  ["telemetry", "telemetry: runtime rollup of agent runs by agent/outcome/day"],
  ["reqlog", "request log + per-key usage: route normalization drops query secrets, redacted errors, latency percentiles, armed-but-idle key detection — and NEVER estimates spend"],
  ["inventory-reorder", "reorder sweep: qty<=reorderAt rule + short-fall + per-supplier grouping/draft"],
  ["near-wall", "near-the-wall guard: skip-synth-under-time-pressure decision + fullest-answer fallback"],
  ["follow-up", "lead follow-up sweep: 3/7/30-day cadence + open-only filter + value/quiet ordering + drafts"],
  ["estimate-followup", "estimate reheat sweep: 2/7/21-day cadence + closed/won filter + total ordering + drafts"],
  ["roof-maintenance", "roof upkeep schedule/sweep: base-date + inspection/re-coat cadence + due windows + order"],
  ["invoice-remind", "AR reminders: overdue tone ladder + settled/unpaid filter (paid-substring guard) + ordering"],
  ["energy-audit", "utility-bill baseline: annualize + base/seasonal disaggregation + gated normalize/savings (ESTIMATE, no $)"],
  ["equipment-lookup", "AI make/model → specs: grounded (forced web_search), verified-only-with-source, never-guess, vintage ESTIMATE fallback"],
  ["gov-programs", "state-gov + workforce helper: MT/ND/SD/WY registration + preference, Davis-Bacon/state prevailing-wage applicability, WOTC/OJT/apprenticeship — GUIDANCE w/ verify pointers"],
  ["construction", "GC/prime-with-subs: CSI MasterFormat trade taxonomy, self-perform vs sub split, sub compliance packet (COI/license/lien/bond/prevailing-wage flow-down) — GUIDANCE, no pricing"],
  ["subs", "subcontractor roster: per-doc + overall compliance readiness (ready/expiring/blocked), COI/license expiry boundaries, expiring-sweep ordering — required set derived from construction packet"],
  ["blueprint", "blueprint reader (vision): title-block/legend/scope extraction, scope→CSI-trade + prime/sub routing, dimensions-only-as-printed, unreadable path — never fabricates a measurement, not a measurement tool"],
  ["photo-estimate", "photo→draft estimate stitch: area source (provided vs measure.js), missing-input detection, measure→foam-calc quantities, verify prompts — draft/ESTIMATE only, price never computed"],
  ["concrete-calc", "concrete lifting/void/seawall quantity engine: void geometry → cured pounds (×density) → sets (only w/ set weight), waste clamp, soil blocked — ESTIMATE, price deferred"],
  ["sub-bid", "subcontractor bid leveling: scope baseline (required/union), gap detection, low/high/spread, cheapest-but-incomplete trap, mixed-trade/missing-amount warnings — advisory, never auto-accepts"],
  ["prime-assembler", "GC prime rollup: self-perform (doctrine-deferred) + leveled sub bids + suggested choice + compliance gate + subs subtotal + owner-vs-deferred markup + proposal skeleton — never fabricates MGSF price, never auto-awards"],
  ["change-order", "change-order doc build: delta = sum of changes (incl. credits), new total = original + delta, OWNER-INPUT markers, negative-$ format, optional sections — amounts caller-supplied, no doctrine pricing"],
  ["axle", "axle programs: workers/money/all on-demand presets + tick logic (Sunday guard, owner-gear blocks) — from Copilot PR #77, folded in"],
  ["engineer", "engineer agent: platform assessment (health+cmdb+curriculum → ranked findings) + suggestions + gated AI plan — from Copilot PR #77, folded in"],
  ["warranty-cert", "warranty certificate build: term/expiry math (addYears, termYears clamp+round), OWNER-INPUT marker, optional/default sections — workmanship only (no savings guarantee, no mold claim), no pricing"],
  ["job-cost", "job-cost margin math: material+labor+drive+overhead → totalCost, laborFlat override, price-from-target-GM (sell=cost/(1−GM)), actual-margin + GO/THIN/NO-GO at a supplied sell, clamps/defaults — all dollars caller-supplied, no doctrine pricing"],
  ["predictive-cost", "predictive costing (harvested from parked MOGS): least-squares size→cost regression over the crew's OWN completed logged jobs + R² confidence; guards n<2 / zero-x-variance (mean fallback, no NaN); extracts history from settled jobs only (never sell price as cost, never invents a point); honest insufficient-history path; advisory, sets no doctrine price"],
  ["portal", "customer portal (last unbuilt MGCC/MOGS module): token-gated read-only customer view — HMAC(id,PORTAL_SECRET) tokens (deterministic/tamper-evident/stateless), owner link-gen is CREW_CODE-gated; safeView is a strict ALLOWLIST (no cost/material/labor/margin/notes/other-customer leak — security-tested); plain-English status; quote = sell value never a cost"],
  ["rvalue-calc", "R-value / code-min engine: installed R (foam + flash-and-batt) vs IECC 2021 Zone 6/7 minimums, meets/short + add-thickness — R/inch + code both ESTIMATE/verify, no pricing"],
  ["air-barrier-calc", "air/vapor barrier engine: fluid gallons (coverage/wet-mil) + membrane rolls, cold-climate vapor-control rule (Zone 5-8), CAZ combustion flag — coverage owner-entered, no pricing"],
  ["electrical-load", "electrical: NEC 220 dwelling service load + 310.16 ampacity + voltage drop — ESTIMATE/licensed-electrician+AHJ, no pricing"],
  ["plumbing-calc", "plumbing: IPC fixture units → drain/supply sizing + water-heater sizing — ESTIMATE/licensed-plumber+AHJ, no pricing"],
  ["hvac-load", "HVAC: Zone 6/7 rule-of-thumb load + tonnage/CFM + ASHRAE 62.2 ventilation — NOT a Manual J, no pricing"],
  ["framing-calc", "carpentry: stud/plate/sheathing + joist/rafter takeoff + board-feet — spans deferred to IRC tables, no pricing"],
  ["trade-estimate", "per-trade estimator: line-item material (qty×cost) + labor (hrs×rate) from OWNER rates, owner markup/tax, unpriced-line handling, MGSF-doctrine deferral, proposal transform — never fabricates a rate, DRAFT"],
  ["trade-rates", "per-trade rate memory: rate map + applyRates fills MISSING rates only (never overrides owner input), trade-scoped — owner-entered, nothing fabricated"],
  ["trade-pack", "per-trade toolbox: curated code/permit/license/safety/checklist for named trades + honest generic fallback, calculators from construction wiring — GUIDANCE (verify AHJ/state), no pricing"],
  ["daily-brief", "morning brief compose: active/dead filter + open-invoice threshold + AR/pipeline sums + overdue/cold"],
  ["weather", "spray-window go/no-go: parseWind/cToF/worst + assessHour conservative ladder (rain %, cold/hot, dew-point spread, wind/overspray) GO→CAUTION→NOGO — thresholds only, no fabrication"],
  ["reviews", "review-request draft: first-name greeting + fallbacks, OWNER-INPUT review-link marker (never invents a link), draftOnly (never sends), brand voice"],
  ["capability-statement", "SDVOSB one-pager build: verified public identity (legal name/UEI/NAICS), OWNER-INPUT markers for unverified past-performance/bonding, no EIN, overrides fill — never fabricated"],
  ["infranodus", "content-gap helpers: isConfigured reflects the key (INACTIVE default), defensive normalize (field-name fallbacks, unknown⇒[]), HTML→text reducer — never fabricates topics/gaps"],
  ["brain-graph-retrieve", "GraphRAG-lite routing: tokenize (stopwords+MGSF aliases), score (ranked/non-negative clusters), retrieve (ALWAYS identity blocks, sensible routing, safe non-empty default) — routes, invents no facts"],
  ["proposal-pdf", "branded proposal PDF: valid %PDF/%%EOF bytes, caller-supplied items+customer render, money formatter, OWNER-INPUT markers for empty customer/items — every dollar caller-supplied"],
  ["hubspot", "contact→lead mapper: name fallback chain (first+last→email→Unknown), phone→mobilephone fallback, field trim, priority score/band attached — empty fields map empty, no fabrication"],
  ["gearbox", "internal drivetrain: _evt shape, AI-gear cascade (estimate.closed→lead.won→invoice.created), OWNER approval gate (blocked+reverse mile, never sent / approved+forward mile), roof/spf branch, depth/cycle guard"],
  ["klyfton", "Queen router pure exports: shouldSkipSynth time-budget guard, bestAnswer (fullest worker answer), routerToolHint LIVE/OFF status, toolBagBlock, assembleBrainBlocks — no network/no synth"],
  ["mcp", "MCP Phase-1 status-filter contract: \"all\"/\"any\"/omit = wildcards (never literal statuses), filter-miss answers noMatch note (statuses_present) vs empty-store not_tracked_yet, case-insensitive match, tombstone exclusion, limit/sort, review-window honesty, gated configured:false — KV stubbed, no network"],
  ["smoke", "live smoke-test scaffold: pure plan() of which real-service checks run vs skip"],
  ["alerts", "Alert Nerve (telepathy phase 1, staged dark): deterministic rules over real KV data (GOV_DEADLINE tiers, NEW_LEAD_STALE first-seen bootstrap, ESTIMATE_AGING 5/10, STORE_NUMB 24h throttle) + Twilio delivery discipline (batch >2 → one SMS, 5/day cap, quiet-hours queue+drain, Sunday day-of-only, injection-guarded recipient, header-only cron auth, not_configured honesty)"],
  ["meta-suites", "harness integrity: tests/*.js and the SUITES registry stay 1:1 in sync (no silently-skipped suite, no dead reference)"],
  ["business-audit", "business audit: ranked findings from records (pipeline/stale bids/close rate/cold leads/AR aging/overdue jobs/concentration/margin), severity-sorted, margin only graded when a target is supplied — no fabricated numbers, no pricing"],
  ["job-workflow", "job workflow / wiring map: trades → ordered construction phases + dependency edges (the wiring) + inspection gates + prime/sub tags + the MGSF never-cover-foam-before-inspection rule; dependency resolves to nearest present phase; GUIDANCE, no pricing/durations"],
  ["estimate-crm-hallway", "estimate → CRM auto-hallway (index.html): saving an estimate creates/updates the matching lead + advances stage to Estimate Sent — idempotent (no dup), case-insensitive match, never regresses a Won/Lost/Follow-Up lead, guards blank names"],
  ["drywall-calc", "drywall takeoff: area→sheets by sheet size + waste (solid geometry) + GA-216 screw scaling + transparent/overridable mud+tape ESTIMATES; board type deferred to AHJ; no pricing"],
  ["flatwork-calc", "concrete flatwork takeoff: area×thickness→cubic yards (0.25-yd round-up) + bagged-mix for small pours (solid geometry); rebar/mix/footings deferred to ACI/IRC + AHJ; no pricing"],
  ["roofing-shingle-calc", "shingle/metal roofing takeoff: roof-surface area→squares (geometry) + bundles/underlayment/accessories (ESTIMATE); ice-barrier + fastening per IRC/AHJ; no pricing"],
  ["masonry-calc", "masonry takeoff: wall area × unit coverage→block/brick count + mortar + grout for filled cells (standard coverage, ESTIMATE); reinforcing/structural deferred to TMS 402/602 + engineer; no pricing"],
  ["excavation-calc", "excavation/earthwork takeoff: area×depth→bank cubic yards (geometry) + swell (loose/haul) + compaction (fill) + truck loads; soil factors are ESTIMATE (verify geotech); 811 + OSHA Subpart P surfaced; no pricing"],
  ["sitework-calc", "sitework/paving takeoff: asphalt tonnage (area×thickness×density) + aggregate base (cy + tons); density is a typical ESTIMATE (verify mix/DOT); 811/drainage/SWPPP/ADA surfaced; section/subgrade not designed; no pricing"],
];

let totalPass = 0, totalFail = 0, suitesFailed = 0;
console.log("MGSF brain/estimator test gate\n");
for (const [file, desc] of SUITES) {
  let out = "", failedRun = false;
  try { out = execFileSync("node", [path.join(__dirname, file + ".js")], { encoding: "utf8" }); }
  catch (e) { failedRun = true; out = (e.stdout || "") + (e.stderr || ""); }
  const m = out.match(/(\d+) passed, (\d+) failed/);
  const p = m ? +m[1] : 0, f = m ? +m[2] : (failedRun ? 1 : 0);
  totalPass += p; totalFail += f;
  const bad = failedRun || f > 0;
  if (bad) suitesFailed++;
  console.log((bad ? "  ✗ " : "  ✓ ") + file.padEnd(16) + " " + (m ? m[0] : (failedRun ? "RUN ERROR" : "(no result)")) + "  — " + desc);
}
console.log("\n" + (suitesFailed ? "✗ " : "✓ ") + SUITES.length + " suites, " + totalPass + " checks passed, " + totalFail + " failed"
  + (suitesFailed ? " (" + suitesFailed + " suite(s) failing)" : " — all green"));
process.exit(suitesFailed ? 1 : 0);
