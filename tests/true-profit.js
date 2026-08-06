#!/usr/bin/env node
// Regression suite for the fully-loaded true-profit engine (api/true-profit.js). Locks: it composes
// on job-cost for the base, ADDS equipment wear + insurance + rig opportunity cost, and reports the
// headline profit-PER-DAY / per-rig-hour that exposes "destroys the week" jobs — without fabricating
// any adder (loaded components default 0 and the output lists what was/wasn't counted). Verdicts:
// GO / THIN / NO-GO. Keyless, deterministic. Run: node tests/true-profit.js

const path = require("path");
const tp = require(path.join(__dirname, "..", "api", "true-profit.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

// Base: material 10000 + laborFlat 3000 + drive(100×0.67=67) = 13067 direct; +12% overhead = 14635 totalCost.
const JOB = { material: 10000, laborFlat: 3000, miles: 100, sell: 30000, days: 2, rigHours: 16, rigWearPerHr: 15, insurancePerDay: 30 };

console.log("Fully-loaded true-profit invariants\n");

// ---- composition + loaded adders ----
(() => {
  const o = tp.trueProfit(JOB);
  ok("base totalCost from job-cost = 14635", o.breakdown.base.totalCost === 14635, o.breakdown.base.totalCost);
  ok("equipment wear = 16 × $15 = 240", o.breakdown.equipmentWear === 240, o.breakdown.equipmentWear);
  ok("insurance = $30 × 2 days = 60", o.breakdown.insurance === 60, o.breakdown.insurance);
  ok("opportunity = 0 (no rate given)", o.breakdown.opportunity === 0);
  ok("loaded adders = 300", o.breakdown.loadedAdders === 300, o.breakdown.loadedAdders);
  ok("fully-loaded cost = 14635 + 300 = 14935", o.breakdown.fullyLoadedCost === 14935, o.breakdown.fullyLoadedCost);
})();

// ---- transparency: which loaded components counted ----
(() => {
  const o = tp.trueProfit(JOB);
  ok("included lists wear + insurance", o.loaded.included.includes("equipment wear") && o.loaded.included.includes("insurance allocation"));
  ok("skipped lists opportunity cost", o.loaded.skipped.includes("rig opportunity cost"));
})();

// ---- profit, per-day, per-hour ----
(() => {
  const o = tp.trueProfit(JOB);
  ok("fully-loaded profit = 30000 - 14935 = 15065", o.atSell.fullyLoadedProfit === 15065, o.atSell.fullyLoadedProfit);
  ok("true GM ≈ 50.2%", o.atSell.trueGmPct === 50.2, o.atSell.trueGmPct);
  ok("profit/day = 15065 ÷ 2 = 7533", o.atSell.profitPerDay === 7533, o.atSell.profitPerDay);
  ok("profit/rig-hour = 15065 ÷ 16 = 942", o.atSell.profitPerRigHour === 942, o.atSell.profitPerRigHour);
  ok("vsBaseProfit = the $300 the loaded adders shaved off", o.atSell.vsBaseProfit === 300, o.atSell.vsBaseProfit);
  ok("verdict GO (true GM ≥ 45% target)", o.atSell.verdict === "GO");
  ok("flags note what wasn't counted", o.atSell.flags.some((f) => /Not counted/i.test(f)));
})();

// ---- 'destroys the week': profit/day below the owner floor ----
(() => {
  // 5-day tie-up, no adders, sell 30000: profit 15365 → 3073/day, below a 4000/day floor.
  const o = tp.trueProfit({ material: 10000, laborFlat: 3000, miles: 100, sell: 30000, days: 5, rigWearPerHr: 0, insurancePerDay: 0, minDayProfit: 4000 });
  ok("profit/day = 3073", o.atSell.profitPerDay === 3073, o.atSell.profitPerDay);
  ok("flags below-day-floor", o.atSell.flags.some((f) => /below your \$4000\/day floor/i.test(f)));
})();

// ---- under-target once fully loaded → THIN ----
(() => {
  const o = tp.trueProfit({ material: 10000, laborFlat: 3000, miles: 100, sell: 26000, rigWearPerHr: 0, insurancePerDay: 0 });
  // cost 14635, profit 11365, GM 43.7% < 45%
  ok("true GM ≈ 43.7%", o.atSell.trueGmPct === 43.7, o.atSell.trueGmPct);
  ok("verdict THIN (under target)", o.atSell.verdict === "THIN");
  ok("flags under-target", o.atSell.flags.some((f) => /under the 45% target/i.test(f)));
})();

// ---- fully-loaded LOSS → NO-GO ----
(() => {
  const o = tp.trueProfit({ material: 10000, laborFlat: 3000, miles: 100, sell: 12000 });
  ok("loss: negative fully-loaded profit", o.atSell.fullyLoadedProfit < 0);
  ok("loss: verdict NO-GO", o.atSell.verdict === "NO-GO");
  ok("loss: flags walk away", o.atSell.flags.some((f) => /LOSS/i.test(f)));
})();

// ---- opportunity cost counts when a rig day-rate is given ----
(() => {
  const o = tp.trueProfit({ material: 10000, laborFlat: 3000, miles: 100, sell: 30000, days: 2, rigWearPerHr: 0, insurancePerDay: 0, rigDayRate: 500 });
  ok("opportunity = 500 × 2 = 1000", o.breakdown.opportunity === 1000);
  ok("opportunity included", o.loaded.included.includes("rig opportunity cost"));
})();

// ---- no sell → costs only, no atSell (never fabricates a price) ----
(() => {
  const o = tp.trueProfit({ material: 10000, laborFlat: 3000, miles: 100 });
  ok("no sell → no atSell block", o.atSell === undefined);
  ok("but fully-loaded cost still computed", o.breakdown.fullyLoadedCost > 0);
})();

// ---- empty body: no throw ----
(() => {
  let threw = false, o = null;
  try { o = tp.trueProfit({}); } catch { threw = true; }
  ok("empty: no throw, ok:true", threw === false && o.ok === true);
  ok("empty: zero fully-loaded cost", o.breakdown.fullyLoadedCost === 0);
})();

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
