#!/usr/bin/env node
// ATS (Automatic Transfer Switch) — budget throttle decision logic. Run: `node tests/ats.js`.
// ats.js flips Klyfton from FUEL (full hive) to BATTERY (1 cheap mind) as the monthly budget
// runs low, before the hard cap. It controls SPEND, so its thresholds must be right. It had
// zero coverage. Pure, keyless, deterministic (default transfer 80% when ATS_TRANSFER_PCT unset).

const path = require("path");
const ats = require(path.join(__dirname, "..", "api", "ats.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

console.log("ATS — budget fuel→battery transfer\n");

const T = ats.TRANSFER_PCT;
ok("default transfer point is 80%", T === 0.80, T);

// ---- no budget ⇒ never downshift (zero behavior change when unconfigured) ----
(() => {
  const d = ats.decide({ spent: 999999, budget: 0 });
  ok("no budget ⇒ not tracking", d.tracking === false, JSON.stringify(d).slice(0, 60));
  ok("no budget ⇒ stays on fuel", d.source === "fuel" && d.downshift === null);
  ok("missing inputs ⇒ no throw, fuel", ats.decide({}).source === "fuel");
  ok("null arg ⇒ no throw", (() => { try { return ats.decide(null).source === "fuel"; } catch (e) { return false; } })());
})();

// ---- fuel ok: below the transfer point ----
(() => {
  const d = ats.decide({ spent: 100, budget: 1000 });   // 10%
  ok("10% used ⇒ fuel/ok", d.source === "fuel" && d.level === "ok" && d.downshift === null, d.reason);
  ok("pctUsed = spent/budget", Math.abs(d.pctUsed - 0.1) < 1e-9, d.pctUsed);
  ok("remaining = budget − spent", d.remaining === 900, d.remaining);
  const just = ats.decide({ spent: 799, budget: 1000 });  // 79.9% — still fuel
  ok("just under 80% ⇒ still fuel", just.source === "fuel", just.pctUsed);
})();

// ---- transfer to battery: at/above the transfer point, below 100% ----
(() => {
  const at = ats.decide({ spent: 800, budget: 1000 });    // exactly 80%
  ok("exactly 80% ⇒ battery/low (>= transfer)", at.source === "battery" && at.level === "low", at.reason);
  ok("battery low downshifts to 1 mind", at.downshift && at.downshift.maxMinds === 1, JSON.stringify(at.downshift));
  ok("battery model is the cheap model", at.downshift.model === ats.BATTERY_MODEL, at.downshift.model);
  const mid = ats.decide({ spent: 950, budget: 1000 });   // 95%
  ok("95% ⇒ battery/low with remaining", mid.source === "battery" && mid.level === "low" && mid.remaining === 50, mid.remaining);
})();

// ---- fuel empty: at/above 100% ----
(() => {
  const full = ats.decide({ spent: 1000, budget: 1000 });
  ok("100% ⇒ battery/empty", full.source === "battery" && full.level === "empty", full.reason);
  ok("empty ⇒ remaining 0", full.remaining === 0, full.remaining);
  const over = ats.decide({ spent: 1500, budget: 1000 });
  ok("over budget ⇒ still empty, remaining 0 (no negative)", over.level === "empty" && over.remaining === 0, over.remaining);
})();

// ---- negative/garbage inputs are clamped, never throw ----
(() => {
  const neg = ats.decide({ spent: -50, budget: 1000 });
  ok("negative spent clamped to 0 ⇒ fuel/ok", neg.source === "fuel" && neg.pctUsed === 0, neg.pctUsed);
})();

// ---- applyToPlan: on battery, coast on a single mind; never mutate input ----
(() => {
  const plan = { minds: ["estimator", "materials", "safety"], complexity: "hive" };
  const battery = ats.decide({ spent: 900, budget: 1000 });
  const coasted = ats.applyToPlan(plan, battery);
  ok("battery ⇒ plan trimmed to 1 mind", coasted.minds.length === 1, coasted.minds.length);
  ok("battery ⇒ complexity becomes simple", coasted.complexity === "simple", coasted.complexity);
  ok("applyToPlan does NOT mutate the input plan", plan.minds.length === 3, plan.minds.length);
  const fuel = ats.decide({ spent: 100, budget: 1000 });
  ok("fuel ⇒ plan unchanged (no downshift)", ats.applyToPlan(plan, fuel) === plan);
  const small = { minds: ["estimator"], complexity: "simple" };
  ok("plan already ≤ maxMinds ⇒ unchanged", ats.applyToPlan(small, battery) === small);
  ok("null plan/state ⇒ safe", ats.applyToPlan(null, battery) === null && ats.applyToPlan(plan, null) === plan);
})();

console.log("\n" + (fail ? "✗" : "✓") + " " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
