#!/usr/bin/env node
// Klyfton telemetry — the pure rollup of agent-run history. Run: `node tests/telemetry.js`.
// Deterministic, keyless, no network (the live read is gated).

const path = require("path");
const T = require(path.join(__dirname, "..", "api", "telemetry.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

async function main() {
  console.log("Klyfton telemetry — rollup\n");

  const DAY = 86400000, NOW = 1750000000000;
  const runs = [
    { agent: "collector", outcome: "dispatched", at: NOW },
    { agent: "collector", outcome: "blocked", at: NOW },
    { agent: "collector", outcome: "needs_approval", at: NOW - DAY },
    { agent: "pm", outcome: "skipped", at: NOW - DAY },
    { agent: "pm", outcome: "dispatched", at: NOW - 2 * DAY },
  ];
  const r = T.rollup(runs);

  ok("total counts all rows", r.total === 5);
  ok("distinct agents counted", r.agents === 2);
  ok("byAgent collector totals", r.byAgent.collector.total === 3 && r.byAgent.collector.dispatched === 1 && r.byAgent.collector.blocked === 1 && r.byAgent.collector.drafts === 1);
  ok("byAgent pm totals", r.byAgent.pm.total === 2 && r.byAgent.pm.skipped === 1 && r.byAgent.pm.dispatched === 1);
  ok("byOutcome tallies", r.byOutcome.dispatched === 2 && r.byOutcome.blocked === 1 && r.byOutcome.skipped === 1);
  ok("byDay buckets by date (3 distinct days)", Object.keys(r.byDay).length === 3);
  ok("empty ⇒ zeros, no throw", (() => { const e = T.rollup([]); return e.total === 0 && e.agents === 0; })());
  ok("dayOf formats an epoch ms to YYYY-MM-DD", /^\d{4}-\d{2}-\d{2}$/.test(T.dayOf(NOW)));
  ok("dayOf bad input ⇒ 'unknown'", T.dayOf(undefined) === "unknown");

  // gated read
  const rep = await T.report({});
  ok("report unconfigured ⇒ configured:false + empty rollup", rep.configured === false && rep.rollup.total === 0);

  console.log("\n" + (fail ? "✗" : "✓") + " " + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
}
main();
