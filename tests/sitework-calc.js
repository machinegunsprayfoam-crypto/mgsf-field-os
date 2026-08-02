#!/usr/bin/env node
// Sitework/paving — pure takeoff() of api/sitework-calc.js. Run: `node tests/sitework-calc.js`.
// Deterministic, keyless. Covers volume geometry (area×thickness→cubic yards), asphalt tonnage
// (density lb/cf), aggregate-base tonnage (tons/cy), material select + defaults, overridable density,
// and guardrails (ESTIMATE, 811/drainage/SWPPP/ADA surfaced, no pricing, error on missing input).

const path = require("path");
const A = require(path.join(__dirname, "..", "api", "sitework-calc.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }
console.log("Sitework / paving takeoff\n");

// asphalt: 10000 sqft × 2in × 145 lb/cf × 1.05 waste / 2000
const a = A.takeoff({ material: "asphalt", area: 10000, thickness: 2, waste: 0.05 });
ok("asphalt tonnage = vol × density / 2000", a.tons === Math.round((10000 * (2 / 12) * 1.05 * 145 / 2000) * 100) / 100);
ok("asphalt cubic yards (geometry)", a.cubicYards === Math.round((10000 * (2 / 12) * 1.05 / 27) * 100) / 100);
ok("default material = asphalt, default 2in lift", A.takeoff({ area: 100 }).material === "asphalt" && A.takeoff({ area: 100 }).inputs.thicknessIn === 2);
ok("asphalt density overridable + clamped", A.takeoff({ area: 100, thickness: 2, densityLbCf: 500 }).densityNote.includes("200"));

// base: 10000 sqft × 6in → cy × 1.4 tons/cy
const b = A.takeoff({ material: "base", area: 10000, thickness: 6, waste: 0 });
ok("base recognized (aggregate/gravel keywords too)", b.material === "base" && A.takeoff({ material: "gravel base", area: 1, thickness: 6 }).material === "base");
ok("base default thickness 6in", b.inputs.thicknessIn === 6);
ok("base tonnage = cy × tonsPerCy", b.tons === Math.round((10000 * (6 / 12) / 27) * 1.4 * 100) / 100);
ok("base tonsPerCy overridable", A.takeoff({ material: "base", area: 100, thickness: 6, tonsPerCy: 1.6 }).densityNote.includes("1.6"));

ok("length×width == area", A.takeoff({ length: 100, width: 100, thickness: 2 }).inputs.area === 10000);
ok("labeled ESTIMATE + defers section/subgrade/drainage", /ESTIMATE/.test(a.label) && /NOT designed/.test(a.label));
ok("code/safety surfaces 811 + drainage + SWPPP + ADA", /811/.test(a.codeSafety) && /drainage/.test(a.codeSafety) && /SWPPP/.test(a.codeSafety) && /ADA/.test(a.codeSafety));
ok("no area/thickness ⇒ error", A.takeoff({}).ok === false && A.takeoff({ area: 100, thickness: 0 }).ok === false);
ok("no pricing", !/\$\d|"(price|cost|rate)"\s*:\s*\d/.test(JSON.stringify(a)));

console.log("\n" + (fail ? "✗ " : "✓ ") + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
