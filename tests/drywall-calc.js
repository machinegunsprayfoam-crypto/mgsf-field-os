#!/usr/bin/env node
// Drywall takeoff — pure takeoff() core of api/drywall-calc.js. Run: `node tests/drywall-calc.js`.
// Deterministic, keyless, no network. Covers the SOLID geometry (area→sheets by sheet size + waste),
// wall+ceiling summing vs a single area, sheet-size table + bad-size fallback, waste clamp, the GA-216
// screw-spacing scaling, the transparent/overridable consumable ESTIMATES (mud/tape coverage), and the
// guardrails: ESTIMATE label, no pricing, no-area error, board-type left to the AHJ.

const path = require("path");
const A = require(path.join(__dirname, "..", "api", "drywall-calc.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

console.log("Drywall takeoff\n");

// ---- solid geometry: sheets = ceil(area*(1+waste)/sheetSqft) ----
const r = A.takeoff({ wallArea: 1200, ceilingArea: 800 });          // 2000 sqft, 4x8=32, 10% waste
ok("wall + ceiling sum into area", r.inputs.area === 2000);
ok("default sheet 4x8 (32 sqft)", r.inputs.sheet === "4x8" && r.inputs.sheetSqft === 32);
ok("sheets = ceil(2000*1.1/32) = 69", r.sheetsToOrder === 69);
ok("areaWithWaste = 2200", r.areaWithWaste === 2200);
ok("default waste 10%", r.inputs.wastePct === 10);

// ---- single area input + larger sheet ----
const big = A.takeoff({ area: 2000, sheet: "4x12", waste: 0 });     // 48 sqft; 2000/48=41.7→42
ok("4x12 sheet (48 sqft), 0 waste ⇒ 42", big.inputs.sheetSqft === 48 && big.sheetsToOrder === 42);

// ---- bad sheet size falls back to 4x8 (never NaN) ----
const bad = A.takeoff({ area: 100, sheet: "9x9" });
ok("unknown sheet size ⇒ falls back to 4x8", bad.inputs.sheet === "4x8" && Number.isFinite(bad.sheetsToOrder));

// ---- waste clamp ----
ok("waste clamps to ≤ 0.6", A.takeoff({ area: 100, waste: 5 }).inputs.wastePct === 60);
ok("negative waste clamps to 0", A.takeoff({ area: 100, waste: -1 }).inputs.wastePct === 0);

// ---- screws scale with GA-216 o.c. + sheet size ----
const oc12 = A.takeoff({ area: 320, sheet: "4x8", waste: 0, screwOC: 12 });  // 10 sheets @ 40/sheet
const oc16 = A.takeoff({ area: 320, sheet: "4x8", waste: 0, screwOC: 16 });  // 10 sheets @ 32/sheet
ok("tighter screw o.c. ⇒ more screws", oc12.consumables.screws > oc16.consumables.screws);
ok("16\" o.c. 4x8 ≈ 32 screws/sheet (10 sheets ⇒ 320)", oc16.consumables.screws === 320);

// ---- consumables are transparent + overridable ESTIMATES ----
const cov = A.takeoff({ area: 1000, mudCoverageSqftPerGal: 100, tapeFtPerSqft: 0.5 });
ok("mud gallons honor the supplied coverage (1000/100=10)", cov.consumables.jointCompoundGallons === 10);
ok("tape ft honor the supplied rate (1000*0.5=500)", cov.consumables.tapeFeet === 500);
ok("consumables carry ESTIMATE notes", /ESTIMATE/.test(cov.consumables.mudNote) && /ESTIMATE/.test(cov.consumables.screwsNote));

// ---- guardrails ----
ok("labeled ESTIMATE + geometry-solid distinction", /ESTIMATE/.test(r.label) && /geometry/.test(r.label));
ok("no area ⇒ error (never fabricates)", A.takeoff({}).ok === false && A.takeoff({ area: 0 }).ok === false);
ok("board TYPE deferred to AHJ (not chosen here)", /AHJ/.test(r.note) && /type-x/i.test(r.note));
ok("no pricing anywhere", !/\$\d|"(price|cost|rate)"\s*:\s*\d/.test(JSON.stringify(r)));

console.log("\n" + (fail ? "✗ " : "✓ ") + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
