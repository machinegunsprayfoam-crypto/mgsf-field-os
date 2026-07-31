#!/usr/bin/env node
// Measure (roof/wall takeoff) coverage. Run: `node tests/measure.js`.
// calc-invariants covers only the roof slope math; THIS suite covers the untested WALL path
// (gross/net/openings clamp), mode inference/routing, the waste clamp, pitch aliasing, and
// known slope factors. Pure geometry, keyless, deterministic.

const path = require("path");
const { calc } = require(path.join(__dirname, "..", "api", "measure.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }
const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 0.01 : tol);

console.log("Measure — roof/wall takeoff\n");

// ---- roof: known slope factors ----
(() => {
  ok("flat (rise 0) ⇒ slopeFactor 1.0", calc({ mode: "roof", footprint: 1000, rise: 0 }).slopeFactor === 1, calc({ mode: "roof", footprint: 1000, rise: 0 }).slopeFactor);
  ok("6:12 ⇒ slopeFactor ≈ 1.118", near(calc({ mode: "roof", footprint: 1000, rise: 6 }).slopeFactor, 1.118, 0.001));
  ok("12:12 ⇒ slopeFactor ≈ 1.414", near(calc({ mode: "roof", footprint: 1000, rise: 12 }).slopeFactor, 1.414, 0.001));
  const flat = calc({ mode: "roof", footprint: 2000, rise: 0 });
  ok("flat roof area = footprint", flat.roofAreaSqft === 2000, flat.roofAreaSqft);
  ok("squares = area / 100", near(flat.squares, 20, 0.1), flat.squares);
})();

// ---- roof: waste clamp (0–0.6) + pitch aliasing (rise == pitchRise) ----
(() => {
  ok("waste clamped to 0.6 (1 → 0.6)", calc({ mode: "roof", footprint: 1000, rise: 0, waste: 1 }).inputs.waste === 0.6);
  ok("waste clamped to 0 (−0.5 → 0)", calc({ mode: "roof", footprint: 1000, rise: 0, waste: -0.5 }).inputs.waste === 0);
  ok("withWaste = area × (1+waste)", calc({ mode: "roof", footprint: 1000, rise: 0, waste: 0.2 }).roofAreaWithWaste === 1200);
  const a = calc({ mode: "roof", footprint: 1500, rise: 6 }).roofAreaSqft;
  const b = calc({ mode: "roof", footprint: 1500, pitchRise: 6 }).roofAreaSqft;
  ok("pitchRise aliases rise", a === b, a + " vs " + b);
})();

// ---- wall path (untested by calc-invariants) ----
(() => {
  const w = calc({ mode: "wall", perimeter: 200, height: 10, gableArea: 50, openings: 80 });
  ok("gross = perimeter×height + gables", w.grossAreaSqft === 200 * 10 + 50, w.grossAreaSqft);
  ok("net = gross − openings", w.netAreaSqft === (2050 - 80), w.netAreaSqft);
  const clamp = calc({ mode: "wall", perimeter: 10, height: 8, openings: 500 });   // openings > gross
  ok("net clamped ≥ 0 when openings exceed gross", clamp.netAreaSqft === 0, clamp.netAreaSqft);
})();

// ---- mode inference / routing ----
(() => {
  ok("no mode + perimeter/height ⇒ wall", calc({ perimeter: 100, height: 9 }).mode === "wall");
  ok("no mode + footprint ⇒ roof", calc({ footprint: 1200 }).mode === "roof");
  ok("neither ⇒ error", calc({}).ok === false);
  ok("explicit mode wins over inference", calc({ mode: "roof", footprint: 1000, perimeter: 100 }).mode === "roof");
})();

// ---- labeling + no bad numbers ----
(() => {
  ok("roof labeled ESTIMATE", calc({ mode: "roof", footprint: 1000, rise: 4 }).label === "ESTIMATE");
  ok("wall labeled ESTIMATE", calc({ mode: "wall", perimeter: 100, height: 9 }).label === "ESTIMATE");
  ok("no NaN/Infinity anywhere", !/NaN|Infinity/.test(JSON.stringify(calc({ mode: "roof", footprint: 1000, rise: 7 }))));
})();

console.log("\n" + (fail ? "✗" : "✓") + " " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
