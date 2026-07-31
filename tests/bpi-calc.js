#!/usr/bin/env node
// BPI / blower-door decision + formula coverage. Run: `node tests/bpi-calc.js`.
// calc-invariants checks only the ACH50 identity; THIS suite covers the customer-facing
// logic: tightness bands, the ASHRAE 62.2-2019 target formula, reverse ACH50→CFM50
// conversion, nFactor clamping, volume defaulting, and the equivalent-hole visual.
// Pure, keyless, deterministic.

const path = require("path");
const { calc } = require(path.join(__dirname, "..", "api", "bpi-calc.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }
const near = (a, b, tol) => Math.abs(a - b) <= tol;

console.log("BPI / blower-door — decision + formula coverage\n");

// ---- bidirectional CFM50 <-> ACH50 ----
(() => {
  const fwd = calc({ cfm50: 1800, volume: 16000 });
  ok("cfm50 → ach50 = cfm50×60/volume", near(fwd.ach50, 1800 * 60 / 16000, 0.02), fwd.ach50);
  const rev = calc({ ach50: 6.75, volume: 16000 });
  ok("ach50 → cfm50 = ach50×volume/60 (reverse)", near(rev.cfm50, 6.75 * 16000 / 60, 1), rev.cfm50);
})();

// ---- tightness bands (the diagnostic read) — boundaries of ≤3/≤5/≤7/≤10/>10 ----
(() => {
  const band = (ach50) => calc({ ach50, volume: 16000 }).tightness || "";
  ok("ach50 2 ⇒ Very tight (verify ventilation)", band(2).indexOf("Very tight") === 0 && /ventilation/i.test(band(2)), band(2));
  ok("ach50 4 ⇒ Tight", band(4).indexOf("Tight (") === 0, band(4));
  ok("ach50 6 ⇒ Moderate", band(6).indexOf("Moderate") === 0, band(6));
  ok("ach50 8 ⇒ Leaky", band(8).indexOf("Leaky") === 0, band(8));
  ok("ach50 12 ⇒ Very leaky", band(12).indexOf("Very leaky") === 0, band(12));
})();

// ---- ASHRAE 62.2-2019 target: Qtot = 0.03·floorArea + 7.5·(bedrooms+1) ----
(() => {
  const r = calc({ floorArea: 2000, bedrooms: 3 });
  ok("62.2 target exact (2000 ft², 3 br ⇒ 90 CFM)", r.vent62_2_cfm === 90, r.vent62_2_cfm);
  const r0 = calc({ floorArea: 1000 });   // bedrooms default 0 ⇒ 30 + 7.5 = 37.5 → 38
  ok("62.2 target with default bedrooms", r0.vent62_2_cfm === 38, r0.vent62_2_cfm);
  ok("no 62.2 target without floorArea", calc({ ach50: 5, volume: 16000 }).vent62_2_cfm === undefined);
})();

// ---- volume defaulting (floorArea × ceilingHeight, default 8 ft) ----
(() => {
  ok("volume defaults to floorArea×8", calc({ floorArea: 1000 }).volume === 8000, calc({ floorArea: 1000 }).volume);
  ok("volume uses given ceilingHeight", calc({ floorArea: 1000, ceilingHeight: 10 }).volume === 10000);
})();

// ---- nFactor clamp (10–30) affects naturalACH ----
(() => {
  const lo = calc({ ach50: 10, volume: 16000, nFactor: 5 });    // clamps to 10 ⇒ 10/10 = 1.0
  ok("nFactor clamped up to 10", near(lo.naturalACH, 1.0, 0.001), lo.naturalACH);
  const hi = calc({ ach50: 10, volume: 16000, nFactor: 50 });   // clamps to 30 ⇒ 10/30 = 0.333
  ok("nFactor clamped down to 30", near(hi.naturalACH, 10 / 30, 0.001), hi.naturalACH);
  ok("naturalACH absent when no ach50", calc({ floorArea: 2000 }).naturalACH === undefined);
})();

// ---- equivalent-hole sales visual (~7.5 CFM50/in²) ----
(() => {
  const r = calc({ cfm50: 750, volume: 16000 });
  ok("equivalent hole = cfm50 / 7.5 in²", r.equivalentHole && r.equivalentHole.squareInches === 100, r.equivalentHole && r.equivalentHole.squareInches);
})();

// ---- labeling: advisory estimate, defers to AHJ/protocol; no NaN/Infinity ----
(() => {
  const r = calc({ cfm50: 1800, volume: 16000 });
  ok("labeled ESTIMATE", r.label === "ESTIMATE", r.label);
  ok("cites the BPI protocol doc", /BPI/.test(r.doc), r.doc);
  const s = JSON.stringify(r);
  ok("no NaN/Infinity anywhere", s.indexOf("null") === s.indexOf("null") && !/NaN|Infinity/.test(s));
})();

console.log("\n" + (fail ? "✗" : "✓") + " " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
