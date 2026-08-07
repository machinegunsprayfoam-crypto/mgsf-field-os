#!/usr/bin/env node
// Regression suite for the SPF takeoff engine (api/spf-takeoff.js) — the real multi-area estimator.
// Locks the money-critical invariants: BF = SF × inches (NEVER ÷12 — the bug that once under-quoted
// 12×), multi-area independent depths/cell/condition, R-target → practical lift + delivered R,
// doctrine per-BF costs (open $0.122 / closed $0.982 / roofing $0.680), condition + scarf waste,
// assumed-depth FLAGGED (never a silent bid assumption), and the price build (GM target × state
// multiplier, job minimum, backward GM check). Keyless, deterministic. Run: node tests/spf-takeoff.js

const path = require("path");
const t = require(path.join(__dirname, "..", "api", "spf-takeoff.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

console.log("SPF takeoff engine invariants\n");

// ---- the money-critical formula: BF = SF × inches, NEVER ÷12 ----
(() => {
  const o = t.takeoff({ areas: [{ name: "Shop ceiling", sqft: 2400, cell: "closed", targetR: 30 }] });
  const a = o.areas[0];
  ok("R-30 closed → 4.5\" practical lift (30÷7.0=4.29, round up to 0.5\")", a.inches === 4.5, a.inches);
  ok("delivered R ≈ 31.5", a.deliveredR === 31.5, a.deliveredR);
  ok("BF = 2400 × 4.5 = 10800 (NOT ÷12)", a.boardFeet === 10800, a.boardFeet);
  ok("basis reported as targetR", a.basis === "targetR");
  ok("formula string states the rule", /SF × inches|square feet × inches/i.test(o.formula) && /never ÷12|÷12/i.test(o.formula));
})();

// ---- applied BF = BF × (1+waste) × (1+buffer); doctrine closed-cell $/BF ----
(() => {
  const o = t.takeoff({ areas: [{ sqft: 2400, cell: "closed", inches: 5 }] });
  const a = o.areas[0];
  // 12000 × 1.12 × 1.05 = 14112
  ok("default waste 12% + buffer 5% → applied 14112 BF", a.appliedBoardFeet === 14112, a.appliedBoardFeet);
  ok("closed-cell material = 14112 × $0.982 = $13857.98", a.material === 13857.98, a.material);
  ok("crew hours = 14112 ÷ 850 ≈ 16.6", a.crewHours === 16.6, a.crewHours);
  ok("sets to order = ceil(14112 ÷ 4000) = 4", a.setsToOrder === 4, a.setsToOrder);
})();

// ---- open-cell uses its own R/inch + $/BF ----
(() => {
  const o = t.takeoff({ areas: [{ sqft: 1000, cell: "open", targetR: 21 }] });
  const a = o.areas[0];
  // 21 ÷ 3.6 = 5.833 → round up to 6.0"
  ok("open R-21 → 6\" (21÷3.6=5.83 up to 0.5\")", a.inches === 6, a.inches);
  ok("open BF = 1000 × 6 = 6000", a.boardFeet === 6000);
  // applied 6000×1.176=7056 ; ×0.122 = 860.83
  ok("open-cell material at $0.122/BF", a.material === 860.83, a.material);
})();

// ---- multi-area: independent depths/cells, summed ----
(() => {
  const o = t.takeoff({ areas: [
    { name: "Attic", sqft: 1500, cell: "open", inches: 10 },
    { name: "Rim joist", sqft: 200, cell: "closed", inches: 3 },
    { name: "Walls", sqft: 1800, cell: "closed", targetR: 21 },
  ] });
  ok("3 areas returned", o.areas.length === 3);
  ok("attic BF = 1500×10 = 15000", o.areas[0].boardFeet === 15000);
  ok("rim BF = 200×3 = 600", o.areas[1].boardFeet === 600);
  ok("walls R-21 closed → 3.0\" (21÷7.0=3.0 exact)", o.areas[2].inches === 3.0, o.areas[2].inches);
  ok("totals.boardFeet sums each area", o.totals.boardFeet === (15000 + 600 + 1800 * 3.0), o.totals.boardFeet);
  ok("totals carry material + labor hours", o.totals.material > 0 && o.totals.laborHours > 0);
})();

// ---- condition-based waste + scarfing ----
(() => {
  const clean = t.takeoff({ areas: [{ sqft: 1000, cell: "closed", inches: 2 }] }).areas[0];
  const rough = t.takeoff({ areas: [{ sqft: 1000, cell: "closed", inches: 2, condition: "rough overhead" }] }).areas[0];
  ok("clean waste = 0.12", clean.wasteFactor === 0.12, clean.wasteFactor);
  ok("rough+overhead adds 0.05+0.03 → 0.20", rough.wasteFactor === 0.2, rough.wasteFactor);
  ok("rough area uses more foam than clean", rough.appliedBoardFeet > clean.appliedBoardFeet);
  const scarf = t.takeoff({ areas: [{ sqft: 1000, cell: "closed", inches: 2, scarf: true }] }).areas[0];
  ok("scarf:true adds 0.05 → 0.17", scarf.wasteFactor === 0.17, scarf.wasteFactor);
  // per-area override
  const ov = t.takeoff({ areas: [{ sqft: 1000, cell: "closed", inches: 2, waste: 0.20, buffer: 0 }] }).areas[0];
  ok("per-area waste/buffer override honored", ov.wasteFactor === 0.2 && ov.appliedBoardFeet === 2400);
})();

// ---- never a silent bid assumption: no depth AND no R-target => defaulted + FLAGGED ----
(() => {
  const o = t.takeoff({ areas: [{ name: "Crawl", sqft: 500, cell: "closed" }] });
  ok("assumed depth basis", o.areas[0].basis === "assumed");
  ok("assumed depth is FLAGGED (confirm)", o.flags.some((f) => /assumed/i.test(f) && /Crawl/i.test(f)));
})();

// ---- roofing: cost rate applies, but sets deferred (yield not locked) ----
(() => {
  const a = t.takeoff({ areas: [{ sqft: 3000, cell: "roofing", inches: 1.5 }] }).areas[0];
  ok("roofing BF = 3000×1.5 = 4500", a.boardFeet === 4500);
  ok("roofing sets deferred (not fabricated)", a.setsToOrder === null && /order by board-feet/i.test(a.setsNote || ""));
})();

// ---- price build: GM target × state multiplier, backward GM check ----
(() => {
  const o = t.takeoff({ areas: [{ sqft: 2400, cell: "closed", targetR: 30 }], state: "MT", segment: "commercial" });
  ok("price present when state+segment given", !!o.price);
  ok("commercial GM target = 50", o.price.gmTarget === 50);
  ok("MT multiplier = 1.00", o.price.stateMultiplier === 1.0);
  ok("backward GM check lands ~50%", o.price.gmActualPct >= 49.5 && o.price.gmActualPct <= 50.5, o.price.gmActualPct);
  ok("job minimum NOT applied on a real job", o.price.jobMinimumApplied === false);
  // ND multiplier lifts the price vs MT
  const nd = t.takeoff({ areas: [{ sqft: 2400, cell: "closed", targetR: 30 }], state: "ND", segment: "commercial" });
  ok("ND (×1.05) prices higher than MT", nd.price.price > o.price.price);
})();

// ---- job minimum floor ----
(() => {
  const o = t.takeoff({ areas: [{ sqft: 10, cell: "closed", inches: 1 }], state: "MT", segment: "commercial" });
  ok("tiny job floored at $1200 minimum", o.price.price === 1200 && o.price.jobMinimumApplied === true, o.price.price);
})();

// ---- quantities-only when segment/state absent (no fabricated price) ----
(() => {
  const o = t.takeoff({ areas: [{ sqft: 1000, cell: "closed", inches: 2 }] });
  ok("no price without segment+state", o.price === undefined && !!o.priceNote);
  ok("but quantities are complete", o.totals.boardFeet === 2000 && o.totals.cost > 0);
})();

// ---- unit helpers ----
(() => {
  ok("practicalInches rounds up to 0.5\"", t.practicalInches(4.6154) === 5 && t.practicalInches(2) === 2 && t.practicalInches(2.1) === 2.5);
  ok("conditionWaste sums tokens", t.conditionWaste("rough overhead") === 0.08 && t.conditionWaste("clean") === 0 && t.conditionWaste("") === 0);
  ok("mobilization doctrine tiers", t.mobilization(10) === 100 && t.mobilization(40) === 200 && t.mobilization(75) === 350 && t.mobilization(150) === 425);
})();

// ---- graceful: empty body never throws ----
(() => {
  let threw = false, o = null;
  try { o = t.takeoff({}); } catch { threw = true; }
  ok("empty: no throw", threw === false);
  ok("empty: zero totals, ok:true", o && o.ok === true && o.totals.boardFeet === 0);
})();

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
