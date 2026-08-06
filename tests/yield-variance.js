#!/usr/bin/env node
// Regression suite for the bid→actual variance engine (api/yield-variance.js). Locks the invariants
// that make the feedback loop TRUSTWORTHY: correct deltas/%s, real yield (BF/set) and productivity
// (BF/hr), actual-vs-bid margin at the same sell price, overrun flags, and — critically — it never
// fabricates a figure the crew didn't log (missing → null). Keyless, deterministic. Run: node tests/yield-variance.js

const path = require("path");
const yv = require(path.join(__dirname, "..", "api", "yield-variance.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

console.log("Bid→actual variance invariants\n");

// A bid vs a job that ran over on foam and labor.
const BID = { boardFeet: 12000, sets: 3, laborHours: 16, material: 11784, labor: 2048, sell: 30000 };
// cost = 11784+2048 = 13832 ; margin bid = (30000-13832)/30000 = 53.9%
const ACT = { boardFeet: 13200, sets: 4, laborHours: 20, material: 13096, labor: 2560 };
// actual cost = 15656 ; margin actual = (30000-15656)/30000 = 47.8%

// ---- deltas + percentages ----
(() => {
  const o = yv.variance({ bid: BID, actual: ACT });
  ok("BF variance delta = +1200", o.variances.boardFeet.delta === 1200, o.variances.boardFeet.delta);
  ok("BF variance pct = +10%", o.variances.boardFeet.pct === 10, o.variances.boardFeet.pct);
  ok("sets over by 1", o.variances.sets.delta === 1);
  ok("labor hours over by 4 (+25%)", o.variances.laborHours.delta === 4 && o.variances.laborHours.pct === 25, o.variances.laborHours.pct);
  ok("cost variance = 15656 - 13832 = +1824", o.variances.cost.delta === 1824, o.variances.cost.delta);
})();

// ---- efficiency truths ----
(() => {
  const o = yv.variance({ bid: BID, actual: ACT });
  ok("real yield = 13200/4 = 3300 BF/set", o.efficiency.realYield === 3300, o.efficiency.realYield);
  ok("bid yield = 12000/3 = 4000 BF/set", o.efficiency.bidYield === 4000, o.efficiency.bidYield);
  ok("real productivity = 13200/20 = 660 BF/hr", o.efficiency.realProductivity === 660, o.efficiency.realProductivity);
  ok("bid productivity = 12000/16 = 750 BF/hr", o.efficiency.bidProductivity === 750, o.efficiency.bidProductivity);
})();

// ---- margin at the same sell price ----
(() => {
  const o = yv.variance({ bid: BID, actual: ACT });
  ok("bid margin ≈ 53.9%", o.margin.bidPct === 53.9, o.margin.bidPct);
  ok("actual margin ≈ 47.8%", o.margin.actualPct === 47.8, o.margin.actualPct);
  ok("margin delta ≈ -6.1 pts", o.margin.deltaPts === -6.1, o.margin.deltaPts);
})();

// ---- flags + verdict ----
(() => {
  const o = yv.variance({ bid: BID, actual: ACT });
  ok("flags foam overrun", o.flags.some((f) => /over bid/i.test(f) && /Foam/i.test(f)));
  ok("flags labor overrun", o.flags.some((f) => /Labor/i.test(f)));
  ok("flags margin under bid", o.flags.some((f) => /under the bid margin/i.test(f)));
  ok("flags optimistic yield", o.flags.some((f) => /Real yield/i.test(f)));
  ok("verdict names it came under bid margin", /under bid margin/i.test(o.verdict));
})();

// ---- derive actual material from sets × costPerSet when material not logged ----
(() => {
  const o = yv.variance({ bid: BID, actual: { sets: 4, laborHours: 20, laborRate: 128, costPerSet: 3274 } });
  // material = 4×3274 = 13096 ; labor = 20×128 = 2560 ; cost = 15656
  ok("material derived from sets×costPerSet", o.variances.material.actual === 13096, o.variances.material.actual);
  ok("labor derived from hours×rate", o.variances.labor.actual === 2560, o.variances.labor.actual);
  ok("actual cost derived", o.actualCost === 15656, o.actualCost);
})();

// ---- derive actual BF from sets × bfPerSet, marked derived ----
(() => {
  const o = yv.variance({ bid: BID, actual: { sets: 4, bfPerSet: 3300, laborHours: 20 } });
  ok("actual BF derived from sets×bfPerSet", o.variances.boardFeet.actual === 13200);
  ok("derivation flagged", o.efficiency.actualBFDerived === true);
})();

// ---- on-bid job: no overrun flags, on-bid verdict ----
(() => {
  const o = yv.variance({ bid: BID, actual: { boardFeet: 12000, sets: 3, laborHours: 16, material: 11784, labor: 2048 } });
  ok("on-bid: margin delta ~0", Math.abs(o.margin.deltaPts) <= 1);
  ok("on-bid: no flags", o.flags.length === 0, JSON.stringify(o.flags));
  ok("on-bid: verdict says on-bid", /on-bid/i.test(o.verdict));
})();

// ---- never fabricates: missing actuals => nulls, guidance verdict ----
(() => {
  const o = yv.variance({ bid: BID, actual: {} });
  ok("no actual BF => null (not invented)", o.variances.boardFeet.actual === null && o.variances.boardFeet.delta === null);
  ok("no actual cost => null", o.actualCost === null);
  ok("no actual margin => null", o.margin.actualPct === null);
  ok("verdict guides to log actuals", /log actual/i.test(o.verdict));
})();

// ---- conditions/notes passthrough, bounded; empty body safe ----
(() => {
  const o = yv.variance({ bid: BID, actual: { sets: 3, conditions: "cold substrate 25F", notes: "off-ratio at start" } });
  ok("conditions passthrough", o.conditions === "cold substrate 25F");
  ok("notes passthrough", o.notes === "off-ratio at start");
  let threw = false, e = null;
  try { e = yv.variance({}); } catch { threw = true; }
  ok("empty body: no throw, ok:true", threw === false && e.ok === true);
})();

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
