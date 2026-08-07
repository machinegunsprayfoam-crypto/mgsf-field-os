#!/usr/bin/env node
// Doctrine single-source (api/doctrine.js) — the locked MGSF numbers, mirrored from mgsf-core /
// PRICING_RULES v2 (2026-08-05). Pins the values so a change is deliberate + reviewable, and GUARDS
// that the estimator modules (spf-takeoff, rvalue-calc) read their R-values FROM doctrine so they can
// never silently drift apart again (the bug: takeoff had closed-cell R 6.5, rvalue-calc 7.1, doctrine
// 7.0). Keyless, deterministic. Run: node tests/doctrine.js

const path = require("path");
const D = require(path.join(__dirname, "..", "api", "doctrine.js"));
const TK = require(path.join(__dirname, "..", "api", "spf-takeoff.js"));
const RV = require(path.join(__dirname, "..", "api", "rvalue-calc.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

console.log("Doctrine single-source + drift guard\n");

// ---- pinned locked values (2026-08-05) — a change here is a deliberate doctrine edit ----
ok("closed-cell R = 7.0/in (published, no derate)", D.R_PER_INCH.closed === 7.0);
ok("open-cell R = 3.8/in", D.R_PER_INCH.open === 3.8);
ok("roofing R = 6.3/in, flagged UNCONFIRMED", D.R_PER_INCH.roofing === 6.3 && D.ROOFING_R_CONFIRMED === false);
ok("measured yields: closed 4200, roofing 3750 BF", D.YIELD_BF.closed === 4200 && D.YIELD_BF.roofing === 3750);
ok("waste factor 0.90 (applied in engine)", D.WASTE_FACTOR === 0.90);
ok("per-BF cost: closed 0.982, roofing 0.680", D.COST_PER_BF.closed === 0.982 && D.COST_PER_BF.roofing === 0.680);
ok("labor $80 installer / $48 helper", D.LABOR.installer === 80 && D.LABOR.helper === 48);
ok("GM targets + $1200 job min", D.GM_TARGET.residential === 0.55 && D.GM_TARGET.commercial === 0.50 && D.JOB_MIN === 1200);
ok("carries provenance (source + locked date)", /mgsf-core/.test(D.source) && D.lockedDate === "2026-08-05");

// ---- DRIFT GUARD: estimator modules must read their R-values FROM doctrine (identical objects) ----
ok("spf-takeoff R_PER_INCH === doctrine", JSON.stringify(TK.R_PER_INCH) === JSON.stringify(D.R_PER_INCH),
  "takeoff=" + JSON.stringify(TK.R_PER_INCH) + " doctrine=" + JSON.stringify(D.R_PER_INCH));
ok("spf-takeoff COST_PER_BF === doctrine", JSON.stringify(TK.COST_PER_BF) === JSON.stringify(D.COST_PER_BF));
ok("rvalue-calc closed R === doctrine", RV.R_PER_INCH.closed === D.R_PER_INCH.closed, RV.R_PER_INCH.closed);
ok("rvalue-calc open R === doctrine", RV.R_PER_INCH.open === D.R_PER_INCH.open, RV.R_PER_INCH.open);

// ---- the reconciliation actually changed the estimator output (7.0 not the old 6.5) ----
ok("takeoff now sizes R-30 closed at 4.5in (7.0/in), not the old 5.0in (6.5/in)", (function () {
  const t = TK.takeoff({ areas: [{ name: "attic", sqft: 1000, cell: "closed", targetR: 30 }] });
  return t.areas[0].inches === 4.5;
})());

console.log("\n" + (fail ? "✗ " : "✓ ") + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
