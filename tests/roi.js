#!/usr/bin/env node
// ROI financing-decision + clamp coverage. Run: `node tests/roi.js`.
// calc-invariants covers the savings/payback/horizon identities; THIS suite covers the
// customer-facing FINANCING decision (cash-flow-positive close), input clamps (savingsPct
// 1–90, years 1–50), the divide-by-zero-safe payback, and ESTIMATE labeling. Pure, keyless.

const path = require("path");
const { calc } = require(path.join(__dirname, "..", "api", "roi.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }
const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 0.01 : tol);

console.log("ROI — financing decision + clamps\n");

// ---- financing decision: cash-flow positive when monthly savings ≥ payment ----
(() => {
  // annualEnergyCost 4800 @ 25% ⇒ 1200/yr ⇒ $100/mo saved
  const pos = calc({ annualEnergyCost: 4800, savingsPct: 25, projectCost: 9000, years: 10, monthlyFinancePayment: 80 });
  ok("financing present when payment given", !!pos.financing);
  ok("savings > payment ⇒ cashFlowPositive", pos.financing.cashFlowPositive === true, JSON.stringify(pos.financing));
  ok("monthlyNet = savings − payment", pos.financing.monthlyNet === 20, pos.financing.monthlyNet);
  ok("positive pitch mentions cash-flow positive", /cash-flow positive/i.test(pos.financing.pitch), pos.financing.pitch);

  const neg = calc({ annualEnergyCost: 4800, savingsPct: 25, projectCost: 9000, years: 10, monthlyFinancePayment: 150 });
  ok("payment > savings ⇒ NOT cashFlowPositive", neg.financing.cashFlowPositive === false, JSON.stringify(neg.financing));
  ok("negative monthlyNet", neg.financing.monthlyNet === -50, neg.financing.monthlyNet);

  const even = calc({ annualEnergyCost: 4800, savingsPct: 25, projectCost: 9000, years: 10, monthlyFinancePayment: 100 });
  ok("net exactly 0 ⇒ cashFlowPositive (>=0)", even.financing.cashFlowPositive === true, even.financing.monthlyNet);

  ok("no financing block when payment omitted", calc({ annualEnergyCost: 4800, savingsPct: 25, projectCost: 9000 }).financing === undefined);
})();

// ---- core identities (one direct check each) ----
(() => {
  const r = calc({ annualEnergyCost: 4000, savingsPct: 25, projectCost: 8000, years: 10 });
  ok("annualSavings = cost × pct", r.annualSavings === 1000, r.annualSavings);
  ok("payback = projectCost / annualSavings", near(r.paybackYears, 8, 0.05), r.paybackYears);
  ok("horizonSavings = annualSavings × years", r.horizonSavings === 10000, r.horizonSavings);
  ok("netOverHorizon = horizon − projectCost", r.netOverHorizon === 2000, r.netOverHorizon);
})();

// ---- input clamps ----
(() => {
  ok("savingsPct clamped to 90 (200 → 90)", calc({ annualEnergyCost: 1000, savingsPct: 200 }).inputs.savingsPct === 90);
  ok("savingsPct clamped to 1 (0 → 1)", calc({ annualEnergyCost: 1000, savingsPct: 0 }).inputs.savingsPct === 1);
  ok("years clamped to 50 (100 → 50)", calc({ annualEnergyCost: 1000, savingsPct: 25, years: 100 }).inputs.years === 50);
  ok("years clamped to 1 (0 → 1)", calc({ annualEnergyCost: 1000, savingsPct: 25, years: 0 }).inputs.years === 1);
})();

// ---- divide-by-zero-safe payback + monotonicity ----
(() => {
  const noEnergy = calc({ annualEnergyCost: 0, savingsPct: 25, projectCost: 8000, years: 10 });
  ok("payback null when no savings (no divide-by-zero)", noEnergy.paybackYears === null, noEnergy.paybackYears);
  const lo = calc({ annualEnergyCost: 4000, savingsPct: 25, projectCost: 8000, years: 10 });
  const hi = calc({ annualEnergyCost: 4000, savingsPct: 50, projectCost: 8000, years: 10 });
  ok("higher savings% ⇒ shorter payback", hi.paybackYears < lo.paybackYears, lo.paybackYears + " -> " + hi.paybackYears);
})();

// ---- labeling: estimate, not a promise; no NaN/Infinity ----
(() => {
  const r = calc({ annualEnergyCost: 4000, savingsPct: 25, projectCost: 8000, years: 10, monthlyFinancePayment: 60 });
  ok("labeled ESTIMATE", r.label === "ESTIMATE", r.label);
  ok("note frames savings % as an assumption, not a promise", /assumption|not a promise/i.test(r.note), r.note);
  ok("no NaN/Infinity anywhere", !/NaN|Infinity/.test(JSON.stringify(r)));
})();

console.log("\n" + (fail ? "✗" : "✓") + " " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
