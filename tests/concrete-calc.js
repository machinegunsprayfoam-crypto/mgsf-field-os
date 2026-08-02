#!/usr/bin/env node
// Concrete-calc — pure quantity engine for lifting/void/seawall (api/concrete-calc.js).
// Run: `node tests/concrete-calc.js`. Deterministic, keyless, no network. Covers void geometry from
// each input shape, cured pounds = volume×density, sets only-with-set-weight, the labeled/overridable
// density default, waste clamp, and the guardrails: ESTIMATE only, price never computed, soil blocked.

const path = require("path");
const A = require(path.join(__dirname, "..", "api", "concrete-calc.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 0.01 : t);

console.log("Concrete-calc (lifting / void / seawall quantity engine)\n");

// ---- voidVolume: each input shape ----
ok("volume provided passes through", A.voidVolume({ volumeCuFt: 50 }).volumeCuFt === 50);
ok("area × lift inches ÷12", near(A.voidVolume({ area: 120, avgLiftInches: 2 }).volumeCuFt, 20));
ok("length × width × depth (ft)", near(A.voidVolume({ length: 10, width: 4, depth: 0.5 }).volumeCuFt, 20));
ok("depthInches converted to ft", near(A.voidVolume({ length: 10, width: 4, depthInches: 6 }).volumeCuFt, 20));
ok("seawall wall × height × gap in", near(A.voidVolume({ wallLength: 20, wallHeight: 6, avgGapInches: 3 }).volumeCuFt, 30));
ok("no dims ⇒ null", A.voidVolume({}) === null);

// ---- material: pounds, density default (labeled), sets only with set weight ----
const m = A.material(100, { waste: 0 });
ok("pounds = volume × default density (4.0)", near(m.poundsCured, 400));
ok("default density labeled ESTIMATE + verify TDS", /ESTIMATE/.test(m.densitySource) && /TDS/.test(m.densitySource));
ok("no set weight ⇒ no sets, honest note", m.setsToOrder === undefined && /not invented/i.test(m.setsNote));
const m2 = A.material(100, { waste: 0, density: 5, lbsPerSet: 100 });
ok("owner density overrides default", m2.density === 5 && near(m2.poundsCured, 500));
ok("owner density flagged owner-entered", m2.densitySource === "owner-entered");
ok("sets computed from set weight (ceil to order)", m2.setsExact === 5 && m2.setsToOrder === 5);
ok("sets round UP", A.material(100, { waste: 0, density: 5, lbsPerSet: 90 }).setsToOrder === 6);
// waste
ok("default waste 10% applied", near(A.material(100, {}).volumeWithWaste, 110));
ok("waste clamped 0–50%", A.material(100, { waste: 9 }).wastePct === 50);

// ---- calc: mode dispatch + guardrails ----
const lift = A.calc({ mode: "lift", area: 120, avgLiftInches: 2 });
ok("lift mode computes volume + pounds", lift.ok === true && near(lift.volumeCuFt, 20) && lift.poundsCured > 0);
ok("ESTIMATE label + quantities only", /ESTIMATE/.test(lift.label));
ok("pricing deferred, never computed", lift.pricing && lift.pricing.deferred === true && /doctrine/i.test(lift.pricing.how));
ok("lift carries over-lift caution", lift.verify.some((v) => /over-lift/i.test(v)));
const sea = A.calc({ mode: "seawall", wallLength: 20, wallHeight: 6, avgGapInches: 3 });
ok("seawall mode: closed-cell/marine caution", sea.verify.some((v) => /marine|hydrophobic|closed-cell/i.test(v)));
const soil = A.calc({ mode: "soil", volumeCuFt: 50 });
ok("soil mode BLOCKED (Terra-Lok pending), geometry only", soil.blocked === true && /Terra-Lok/.test(soil.blockedReason) && soil.volumeCuFt === 50 && soil.volumeWithWaste === 55);
ok("no dims ⇒ error, not a guess", A.calc({ mode: "void" }).ok === false);
ok("unknown mode defaults to void", A.calc({ volumeCuFt: 10 }).mode === "void");
// never a price
const blob = JSON.stringify(A.calc({ mode: "lift", area: 200, avgLiftInches: 3, density: 4, lbsPerSet: 100 }));
ok("output carries no computed price", !/"(price|total|sellPrice|quote)"\s*:\s*\d/i.test(blob) && !/\$\d/.test(blob));

console.log("\n" + (fail ? "✗ " : "✓ ") + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
