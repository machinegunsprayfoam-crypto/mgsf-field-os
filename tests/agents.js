#!/usr/bin/env node
// Klyfton agents runtime — goal selection + planning + the approval/dark-tool guards. Run:
// `node tests/agents.js`. Pure/deterministic on nowMs, keyless, no network. The critical property:
// an agent PLANS and stages drafts — it never dispatches an unapproved action.

const path = require("path");
const A = require(path.join(__dirname, "..", "api", "agents.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

const DAY = 86400000;
const NOW = 1750000000000;

const JOBS = [
  { customer: "Sam", status: "quote sent", stageAt: NOW - 10 * DAY }, // bid, overdue
  { customer: "Deb", status: "new lead" },                            // lead
  { customer: "Ray", status: "invoiced", stageAt: NOW - 50 * DAY },   // invoiced, overdue
  { customer: "Kay", status: "invoiced", stageAt: NOW - 5 * DAY },    // invoiced, NOT overdue
  { customer: "Lou", status: "paid" },                               // terminal
  { customer: "Moe", status: "in progress" },                        // open
];

console.log("Klyfton agents — roster + planning + guards\n");

// ---- roster ----
ok("exports AGENTS/plan/run", A.AGENTS && typeof A.plan === "function" && typeof A.run === "function");
ok("PM is agent #1", !!A.AGENTS.pm && /project manager|job runner/i.test(A.AGENTS.pm.label));
ok("roster has collector, bid-chaser, lead-closer", ["collector", "bid-chaser", "lead-closer"].every((k) => A.AGENTS[k]));

// ---- unknown agent ----
ok("unknown agent ⇒ error + roster", (() => { const p = A.plan("nope", JOBS, NOW, {}); return p.ok === false && Array.isArray(p.agents); })());

// ---- PM plans every OPEN job (skips terminal) ----
const pm = A.plan("pm", JOBS, NOW, {});
ok("PM plans open jobs only (skips paid)", pm.ok && pm.count === 5 && !pm.steps.find((s) => s.who === "Lou"), pm.count);
ok("PM step carries who/stage/action/tool", pm.steps.every((s) => s.who && s.stage && s.action));

// ---- Collector targets ONLY overdue invoices ----
const col = A.plan("collector", JOBS, NOW, {});
ok("Collector selects only the overdue invoice (Ray, not Kay)", col.count === 1 && col.steps[0].who === "Ray", JSON.stringify(col.steps.map((s) => s.who)));

// ---- Bid Chaser targets ONLY stale bids ----
const bc = A.plan("bid-chaser", JOBS, NOW, {});
ok("Bid Chaser selects the stale bid (Sam)", bc.count === 1 && bc.steps[0].who === "Sam");

// ---- Lead Closer targets leads ----
const lc = A.plan("lead-closer", JOBS, NOW, {});
ok("Lead Closer selects the new lead (Deb)", lc.count === 1 && lc.steps[0].who === "Deb");

// ---- tool routing + live/dark ----
ok("collector step routes to invoice-remind", col.steps[0].tool === "invoice-remind");
ok("with no webhook, the invoice-remind step is dark (blocked)", col.steps[0].live === false && !!col.steps[0].blockedBy);
const colLit = A.plan("collector", JOBS, NOW, { ALERTS_WEBHOOK_URL: "https://h/x" });
ok("wiring the webhook makes the collector step live", colLit.steps[0].live === true);

// ---- primaryTool mapping ----
ok("primaryTool strips arm: prefix ⇒ arms", A.primaryTool("arm:create_invoice") === "arms");
ok("primaryTool takes first of a slash list", A.primaryTool("missed-call / follow-up") === "missed-call");
ok("primaryTool dash ⇒ null", A.primaryTool("—") === null);

// ---- the SAFETY property: run() never dispatches without approval ----
const preview = A.run("pm", JOBS, NOW, {}, {});
ok("run without approval ⇒ willDispatch empty (nothing sent)", Array.isArray(preview.willDispatch) && preview.willDispatch.length === 0);
ok("run preview note says nothing sent", /nothing sent/i.test(preview.note));
const approved = A.run("collector", JOBS, NOW, { ALERTS_WEBHOOK_URL: "https://h/x" }, { approved: true });
ok("approved run lists only LIVE steps as dispatchable", approved.willDispatch.length === 1 && approved.willDispatch[0].live === true);
ok("empty jobs ⇒ empty plan, no throw", A.plan("pm", [], NOW, {}).count === 0);

console.log("\n" + (fail ? "✗" : "✓") + " " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
