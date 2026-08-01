#!/usr/bin/env node
// Runs every brain/estimator test suite and reports one combined result. `node tests/run-all.js`.
// Exit 0 only if all suites pass — usable as a pre-commit / pre-deploy gate. Keyless, no npm.

const { execFileSync } = require("child_process");
const path = require("path");

const SUITES = [
  ["calc-invariants", "estimator math invariants"],
  ["calc-money", "commission / payment-schedule / unit-convert math"],
  ["brain-retrieve", "GraphRAG routing"],
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
  ["daily-brief", "morning brief compose: active/dead filter + open-invoice threshold + AR/pipeline sums + overdue/cold"],
  ["smoke", "live smoke-test scaffold: pure plan() of which real-service checks run vs skip"],
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
