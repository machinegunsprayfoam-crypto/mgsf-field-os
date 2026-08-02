#!/usr/bin/env node
// Predictive cost (api/predictive-cost.js) — harvested from the parked MOGS PredictiveCosting, rebuilt
// for field-os over the crew's OWN logged job actuals. Covers the least-squares math + R² confidence,
// the two degenerate cases the original divided-by-zero on (n<2, zero x-variance), history extraction
// from real completed jobs only (never invents a data point; never uses sell price as cost), and the
// honest "insufficient history" path. Run: `node tests/predictive-cost.js`. Deterministic, keyless, no network.

const path = require("path");
const P = require(path.join(__dirname, "..", "api", "predictive-cost.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }
const finite = (x) => typeof x === "number" && Number.isFinite(x);

console.log("Predictive cost (regression over logged job history)\n");

// ---- linearPredict: a perfect line y = 5x + 500 ----
(() => {
  const hist = [{ area: 500, cost: 3000 }, { area: 1000, cost: 5500 }, { area: 1500, cost: 8000 }, { area: 2000, cost: 10500 }];
  const r = P.linearPredict(hist, 1200);
  ok("perfect linear fit → R² = 1", r.r_squared === 1, String(r.r_squared));
  ok("perfect linear fit → high confidence", r.confidence === "high");
  ok("predicts on the line (5*1200+500=6500)", r.predicted === 6500, String(r.predicted));
  ok("method = regression", r.method === "regression");
  ok("samples counted", r.samples === 4);
})();

// ---- accepts {x,y} pairs too ----
ok("accepts {x,y} pairs", P.linearPredict([{ x: 1, y: 10 }, { x: 2, y: 20 }, { x: 3, y: 30 }], 4).predicted === 40);

// ---- degenerate: n=1 → mean, low, NO NaN (the original divided by zero here) ----
(() => {
  const r = P.linearPredict([{ area: 800, cost: 4200 }], 1000);
  ok("n=1 → predicts the one cost (mean), no NaN", finite(r.predicted) && r.predicted === 4200, String(r.predicted));
  ok("n=1 → low confidence, method mean", r.confidence === "low" && r.method === "mean");
})();

// ---- degenerate: all x identical (zero variance) → mean, no NaN/Infinity ----
(() => {
  const r = P.linearPredict([{ area: 1000, cost: 5000 }, { area: 1000, cost: 7000 }, { area: 1000, cost: 6000 }], 1000);
  ok("all-x-equal → no NaN/Infinity", finite(r.predicted) && finite(r.slope));
  ok("all-x-equal → mean cost (6000), low confidence", r.predicted === 6000 && r.confidence === "low", String(r.predicted));
})();

// ---- empty history ----
(() => { const r = P.linearPredict([], 1000); ok("empty history → predicted 0, confidence none, samples 0", r.predicted === 0 && r.confidence === "none" && r.samples === 0); })();

// ---- prediction never negative (steep negative slope extrapolated past zero) ----
ok("prediction clamped ≥ 0", P.linearPredict([{ x: 1, y: 100 }, { x: 2, y: 60 }, { x: 3, y: 20 }], 10).predicted >= 0);

// ---- noisy data → medium/low, R² in [0,1] ----
(() => {
  const r = P.linearPredict([{ x: 1, y: 50 }, { x: 2, y: 12 }, { x: 3, y: 47 }, { x: 4, y: 15 }], 5);
  ok("noisy fit → R² within [0,1]", r.r_squared >= 0 && r.r_squared <= 1, String(r.r_squared));
  ok("scattered (zigzag) data → not high confidence", r.confidence !== "high", "r2=" + r.r_squared);
})();

// ---- costBreakdown ----
(() => {
  const b = P.costBreakdown({ laborHours: 40, laborRate: 80, material: 2000, equipment: 500, other: 100 });
  ok("costBreakdown labor = hrs*rate", b.labor === 3200);
  ok("costBreakdown total sums parts", b.total === 3200 + 2000 + 600);
  ok("costBreakdown percents sum ~100", Math.abs(b.breakdown.laborPercent + b.breakdown.materialPercent + b.breakdown.miscPercent - 100) <= 1);
  ok("costBreakdown zero-total guard (no NaN)", P.costBreakdown({}).breakdown.laborPercent === 0);
})();

// ---- extractHistory: only settled jobs with size + real cost, matching service ----
(() => {
  const jobs = [
    { service: "spray foam", status: "completed", area: 1000, material: 3000, labor: 2000 },      // ✓ x=1000 y=5000
    { service: "spray foam", status: "paid", sqft: 1500, material: 4000, labor: 3000, other: 500 },// ✓ x=1500 y=7500
    { service: "spray foam", status: "scheduled", area: 900, material: 2000 },                      // ✗ not settled
    { service: "roofing", status: "completed", area: 2000, material: 8000 },                        // ✗ wrong service
    { service: "spray foam", status: "completed", material: 3000, labor: 1000 },                    // ✗ no size dim
    { service: "spray foam", status: "completed", area: 1200, value: 9000 },                        // ✗ has sell value but NO cost
  ];
  const h = P.extractHistory(jobs, { service: "spray foam" });
  ok("extractHistory keeps only settled + sized + real-cost matching jobs", h.length === 2, "len=" + h.length);
  ok("extractHistory cost = summed parts, not sell value", h.every((p) => p.y === 5000 || p.y === 7500));
  ok("extractHistory never uses sell `value` as cost", !h.some((p) => p.y === 9000));
})();

// ---- predictFromJobs: honest insufficient path vs real prediction ----
(() => {
  const thin = [{ service: "foam", status: "completed", area: 1000, material: 5000 }];
  const r1 = P.predictFromJobs(thin, { service: "foam", size: 1200 });
  ok("insufficient history → ok:false with reason + count", r1.ok === false && r1.reason === "insufficient_history" && r1.samples === 1, JSON.stringify(r1));
  const rich = [
    { service: "foam", status: "completed", area: 500, material: 1500, labor: 1500 },
    { service: "foam", status: "completed", area: 1000, material: 3000, labor: 3000 },
    { service: "foam", status: "completed", area: 1500, material: 4500, labor: 4500 },
  ];
  const r2 = P.predictFromJobs(rich, { service: "foam", size: 1200 });
  ok("enough history → ok:true with prediction + formatted", r2.ok === true && finite(r2.prediction.predicted) && typeof r2.formatted === "string");
  ok("formatted is advisory, not a committed price", /ADVISORY|review/i.test(r2.formatted) && /doctrine/i.test(r2.formatted));
})();

// ---- MIN_SAMPLES exported and sane ----
ok("MIN_SAMPLES is a small positive int", Number.isInteger(P.MIN_SAMPLES) && P.MIN_SAMPLES >= 2);

console.log("\n" + (fail ? "✗ " : "✓ ") + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
