#!/usr/bin/env node
// Break-even (api/break-even.js) — the Finance/Owner-Strategy overhead-recovery tool. Locks: the
// contribution-margin math, round-UP break-even units, the target-profit extension, the honest
// "no break-even when variable cost ≥ price" case, unit-agnostic labeling, and input guards. Keyless,
// deterministic, nothing invented. Run: node tests/break-even.js

const path = require("path");
const B = require(path.join(__dirname, "..", "api", "break-even.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

console.log("Break-even (overhead recovery)\n");

// ---- core math ----
{
  const r = B.calc({ fixedCosts: 12000, pricePerUnit: 4000, variableCostPerUnit: 2500, unit: "job" });
  ok("contribution margin = price − variable cost", r.contributionMargin === 1500 && r.contributionMarginPct === 37.5);
  ok("break-even units = ceil(fixed / cm)", r.breakEven.units === 8, r.breakEven.units);
  ok("break-even revenue = units × price", r.breakEven.revenue === 32000);
  ok("carries the unit label", r.unit === "job");
}
// round UP — a partial unit doesn't pay the rent
{
  const r = B.calc({ fixedCosts: 10000, pricePerUnit: 4000, variableCostPerUnit: 2500 }); // 10000/1500 = 6.67 → 7
  ok("units round up (6.67 → 7)", r.breakEven.units === 7, r.breakEven.units);
}
// target profit extension
{
  const r = B.calc({ fixedCosts: 12000, pricePerUnit: 4000, variableCostPerUnit: 2500, targetProfit: 6000 });
  ok("target profit ⇒ (fixed+target)/cm units", r.forTargetProfit.units === 12 && r.forTargetProfit.revenue === 48000);
}
// no break-even when variable cost ≥ price (never returns a bogus number)
{
  const r = B.calc({ fixedCosts: 12000, pricePerUnit: 2000, variableCostPerUnit: 2500 });
  ok("variable ≥ price ⇒ no break-even, honest note", r.ok === true && r.breakEven === null && /no break-even/i.test(r.note));
  ok("negative contribution margin surfaced (not hidden)", r.contributionMargin < 0);
}
// unit-agnostic (board-feet)
{
  const r = B.calc({ fixedCosts: 3000, pricePerUnit: 1.5, variableCostPerUnit: 0.9, unit: "BF" });
  ok("works per board-foot too", r.unit === "BF" && r.breakEven.units === Math.ceil(3000 / 0.6));
}
// guards
ok("no fixed costs ⇒ error", B.calc({ pricePerUnit: 4000, variableCostPerUnit: 2500 }).ok === false);
ok("no price ⇒ error", B.calc({ fixedCosts: 12000 }).ok === false);

console.log("\n" + (fail ? "✗ " : "✓ ") + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
