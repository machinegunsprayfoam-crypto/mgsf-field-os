#!/usr/bin/env node
// Brain self-check — estimator/calculator invariants. Run: `node tests/calc-invariants.js`
//
// This is the "catch its own drift" harness from BRAIN_ROADMAP.md #5. It asserts each calculator's
// INTERNAL math identities and monotonicity — NOT specific doctrine prices (those live in mgsf-core and
// must never be fabricated here). If someone breaks the math, an identity fails and this exits non-zero.
// Keyless, no npm, deterministic. Safe to run anytime / in a pre-commit or CI step.

const path = require("path");
const A = f => require(path.join(__dirname, "..", "api", f));
let pass = 0, fail = 0;
const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 0.5 : tol);
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail ? "  [" + detail + "]" : "")); } }
function noBadNums(name, o) {
  // Only NaN/Infinity are universally invalid. Negatives are legitimate for some outputs
  // (dew-point temps/margins, ROI net-over-horizon) — positivity is asserted specifically where it matters.
  let bad = null;
  (function walk(v) { if (bad !== null) return; if (typeof v === "number") { if (!Number.isFinite(v)) bad = v; }
    else if (v && typeof v === "object") Object.values(v).forEach(walk); })(o);
  ok(name + ": no NaN/Infinity", bad === null, bad === null ? "" : "found " + bad);
}

console.log("Brain self-check — calculator invariants\n");

// ---- foam-calc: board-feet identity, waste, sets = ceil(exact), linear in area ----
(() => {
  const f = A("foam-calc.js").calc({ area: 2400, thickness: 2, foamType: "closed" });
  ok("foam: ok", f.ok === true);
  ok("foam: boardFeet = area×thickness", f.boardFeet === 2400 * 2, f.boardFeet);
  ok("foam: withWaste = bf×(1+waste)", near(f.boardFeetWithWaste, f.boardFeet * (1 + f.inputs.waste)));
  ok("foam: setsExact = bfWithWaste/yield", near(f.setsExact, f.boardFeetWithWaste / f.inputs.yieldPerSet, 0.02));
  ok("foam: setsToOrder = ceil(setsExact)", f.setsToOrder === Math.ceil(f.setsExact));
  const f2 = A("foam-calc.js").calc({ area: 4800, thickness: 2, foamType: "closed" });
  ok("foam: linear in area (2× area ⇒ 2× bf)", f2.boardFeet === 2 * f.boardFeet, f2.boardFeet);
  noBadNums("foam", f);
})();

// ---- coating-calc: positive, linear in area ----
(() => {
  const c = A("coating-calc.js").calc({ area: 3000, dryMils: 20, solidsPct: 100, coats: 1 });
  ok("coating: ok", c.ok === true, JSON.stringify(c).slice(0, 80));
  const gal = c.gallonsExact != null ? c.gallonsExact : (c.gallons != null ? c.gallons : c.gallonsToOrder);
  ok("coating: gallons > 0", gal > 0, gal);
  const c2 = A("coating-calc.js").calc({ area: 6000, dryMils: 20, solidsPct: 100, coats: 1 });
  const gal2 = c2.gallonsExact != null ? c2.gallonsExact : (c2.gallons != null ? c2.gallons : c2.gallonsToOrder);
  ok("coating: linear in area (2× area ⇒ ~2× gallons)", near(gal2, gal * 2, gal * 0.05), gal + "->" + gal2);
  noBadNums("coating", c);
})();

// ---- job-cost: cost buildup identity + margin identity ----
(() => {
  const j = A("job-cost.js").calc({ material: 3000, laborHours: 20, laborRate: 50, miles: 100, overheadPct: 0.12, targetGm: 0.45 });
  ok("job-cost: ok", j.ok === true);
  const b = j.breakdown;
  ok("job-cost: directCost = material+labor+drive", near(b.directCost, b.material + b.labor + b.drive), JSON.stringify(b));
  ok("job-cost: totalCost = directCost+overhead", near(b.totalCost, b.directCost + b.overhead));
  ok("job-cost: sell = totalCost/(1-targetGm)", near(j.suggestedSell, b.totalCost / (1 - j.targetGm), 2));
  ok("job-cost: profit = sell - totalCost", near(j.suggestedProfit, j.suggestedSell - b.totalCost, 2));
  ok("job-cost: realized GM ≈ targetGm", near((j.suggestedSell - b.totalCost) / j.suggestedSell, j.targetGm, 0.01));
  noBadNums("job-cost", j);
})();

// ---- roi: savings, payback, horizon identities + monotonic payback ----
(() => {
  const r = A("roi.js").calc({ annualEnergyCost: 4000, savingsPct: 25, projectCost: 8000, years: 10 });
  ok("roi: ok", r.ok === true);
  ok("roi: annualSavings = cost×pct", near(r.annualSavings, 4000 * 25 / 100));
  ok("roi: payback = projectCost/annualSavings", r.annualSavings > 0 && near(r.paybackYears, 8000 / r.annualSavings, 0.05), r.paybackYears);
  ok("roi: horizon = annualSavings×years", near(r.horizonSavings, r.annualSavings * r.inputs.years));
  ok("roi: net = horizon - projectCost", near(r.netOverHorizon, r.horizonSavings - 8000));
  const r2 = A("roi.js").calc({ annualEnergyCost: 4000, savingsPct: 50, projectCost: 8000, years: 10 });
  ok("roi: higher savings ⇒ shorter payback", r2.paybackYears < r.paybackYears, r.paybackYears + "->" + r2.paybackYears);
  noBadNums("roi", r);
})();

// ---- measure: sloped-area geometry ----
(() => {
  const m = A("measure.js").calc({ mode: "roof", footprint: 2000, pitch: 6 });
  ok("measure: ok", m.ok === true);
  ok("measure: roofArea = footprint×slopeFactor", near(m.roofAreaSqft, 2000 * m.slopeFactor, 1), m.roofAreaSqft);
  ok("measure: withWaste = area×(1+waste)", near(m.roofAreaWithWaste, m.roofAreaSqft * (1 + m.inputs.waste), 1));
  ok("measure: squares = area/100", near(m.squares, m.roofAreaSqft / 100, 0.1));
  ok("measure: slopeFactor ≥ 1", m.slopeFactor >= 1);
  noBadNums("measure", m);
})();

// ---- bpi: ACH50 identity ----
(() => {
  const bp = A("bpi-calc.js").calc({ cfm50: 1800, volume: 16000 });
  ok("bpi: ok", bp.ok === true);
  ok("bpi: ach50 = cfm50×60/volume", near(bp.ach50, 1800 * 60 / 16000, 0.02), bp.ach50);
  ok("bpi: naturalACH = ach50/nFactor", near(bp.naturalACH, bp.ach50 / bp.inputs.nFactor, 0.02));
  const bp2 = A("bpi-calc.js").calc({ cfm50: 3600, volume: 16000 });
  ok("bpi: 2× cfm ⇒ 2× ach50", near(bp2.ach50, bp.ach50 * 2, 0.05));
  noBadNums("bpi", bp);
})();

// ---- dew-point: physical invariant (dew point ≤ air temp) + monotonic in humidity ----
(() => {
  const d = A("dew-point.js").calc({ airTempF: 60, humidityPct: 70, substrateTempF: 45 });
  ok("dew-point: ok", d.ok === true, JSON.stringify(d).slice(0, 80));
  const dpF = d.dewPointF != null ? d.dewPointF : (d.dewpointF != null ? d.dewpointF : (d.dewPoint && d.dewPoint.f));
  if (dpF != null) {
    ok("dew-point: dewpoint ≤ air temp", dpF <= 60 + 0.5, dpF);
    const d2 = A("dew-point.js").calc({ airTempF: 60, humidityPct: 90, substrateTempF: 45 });
    const dpF2 = d2.dewPointF != null ? d2.dewPointF : (d2.dewpointF != null ? d2.dewpointF : (d2.dewPoint && d2.dewPoint.f));
    ok("dew-point: higher humidity ⇒ higher dewpoint", dpF2 > dpF, dpF + "->" + dpF2);
  } else { ok("dew-point: exposes a dew point value", false, "no dewPointF field: " + Object.keys(d).join(",")); }
  noBadNums("dew-point", d);
})();

console.log("\n" + pass + " passed, " + fail + " failed.");
process.exit(fail ? 1 : 0);
