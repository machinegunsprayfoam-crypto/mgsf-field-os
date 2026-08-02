#!/usr/bin/env node
// Job-cost — pure margin/pricing arithmetic core of api/job-cost.js. Run: `node tests/job-cost.js`.
// Deterministic, keyless, no network. Covers the cost roll-up (material + labor + drive + overhead
// → totalCost), laborFlat-overrides-hrs×rate, price-from-target-margin (sell = cost / (1 − GM)),
// the actual-margin + GO/THIN/NO-GO read at a supplied sell, input clamping, and the applied
// defaults. Every dollar is CALLER-SUPPLIED — this file tests arithmetic only, no doctrine pricing.

const path = require("path");
const A = require(path.join(__dirname, "..", "api", "job-cost.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

console.log("Job cost (margin / bid math)\n");

// ---- cost roll-up (clean inputs so the math is exact) ----
// material 800 + laborFlat 1200 + drive 0, overhead 10%, target GM 50%
const c = A.calc({ material: 800, laborFlat: 1200, overheadPct: 0.1, targetGm: 0.5 });
ok("labor uses laborFlat when > 0", c.breakdown.labor === 1200);
ok("directCost = material + labor + drive", c.breakdown.directCost === 2000);
ok("overhead = directCost × overheadPct", c.breakdown.overhead === 200);
ok("totalCost = directCost + overhead", c.breakdown.totalCost === 2000 + 200);
ok("suggestedSell = totalCost / (1 − GM)", c.suggestedSell === 4400);          // 2200 / 0.5
ok("suggestedProfit = suggestedSell − totalCost", c.suggestedProfit === 2200);
ok("targetGm echoed back", c.targetGm === 0.5);
ok("no atSell when no sell supplied", c.atSell === undefined);

// ---- labor from hours × rate when no flat ----
const h = A.calc({ material: 0, laborHours: 8, laborRate: 25, overheadPct: 0, targetGm: 0 });
ok("labor = hours × rate when laborFlat absent", h.breakdown.labor === 200);
ok("targetGm 0 ⇒ suggestedSell = totalCost", h.suggestedSell === 200);         // 200 / (1-0)

// ---- drive cost + default mile rate ----
const d = A.calc({ material: 0, miles: 10 });                                  // default mileRate 0.67
ok("drive = miles × default mileRate (rounded)", d.breakdown.drive === 7);     // round(6.7)
ok("default targetGm applied when absent", d.targetGm === 0.45);

// ---- atSell: actual margin + GO / THIN / NO-GO ladder (totalCost 2200, targetGm 0.5) ----
const go   = A.calc({ material: 800, laborFlat: 1200, overheadPct: 0.1, targetGm: 0.5, sell: 5000 });
ok("atSell profit = sell − totalCost", go.atSell.profit === 2800);
ok("actualGm reported as percent (1 dp)", go.atSell.actualGm === 56);          // 2800/5000 = 56.0%
ok("GO when actualGm ≥ targetGm", go.atSell.goNoGo === "GO");

const thin = A.calc({ material: 800, laborFlat: 1200, overheadPct: 0.1, targetGm: 0.5, sell: 4000 });
ok("THIN when 0.66×target ≤ actualGm < target", thin.atSell.actualGm === 45 && thin.atSell.goNoGo === "THIN"); // 1800/4000

const nogo = A.calc({ material: 800, laborFlat: 1200, overheadPct: 0.1, targetGm: 0.5, sell: 2500 });
ok("NO-GO when actualGm < 0.66×target", nogo.atSell.goNoGo === "NO-GO");       // 300/2500 = 12%

// ---- clamps + junk-input safety (no throw, sane numbers) ----
const clamp = A.calc({ material: -100, laborHours: -5, laborRate: -50, miles: -10, overheadPct: 2, targetGm: 2 });
ok("negative money inputs clamp to 0", clamp.breakdown.directCost === 0);
ok("overheadPct clamps to ≤ 1", clamp.breakdown.overhead === 0);              // directCost 0 anyway
ok("targetGm clamps to ≤ 0.95", clamp.targetGm === 0.95);
const junk = A.calc({ material: "abc", laborFlat: "x", overheadPct: 0, targetGm: 0 });
ok("non-numeric money ⇒ 0 (no NaN)", junk.breakdown.totalCost === 0 && junk.ok === true);

// ---- sell ≤ 0 ⇒ no atSell read ----
ok("sell of 0 ⇒ no atSell", A.calc({ material: 100, sell: 0 }).atSell === undefined);

console.log("\n" + (fail ? "✗ " : "✓ ") + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
