#!/usr/bin/env node
// Shingle/metal roofing — pure takeoff() of api/roofing-shingle-calc.js. Run: `node tests/roofing-shingle-calc.js`.
// Deterministic, keyless. Covers squares geometry (area/100), bundles/square, waste, underlayment rolls,
// accessory linear-ft passthrough, and guardrails (ESTIMATE, ice-barrier note, no pricing, error on none).

const path = require("path");
const A = require(path.join(__dirname, "..", "api", "roofing-shingle-calc.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }
console.log("Shingle/metal roofing takeoff\n");

const r = A.takeoff({ roofArea: 2000, waste: 0.12, eaveRakeFt: 180, ridgeHipFt: 60 });
ok("squares = roofArea / 100", r.squares === 20);
ok("squaresWithWaste applies waste", r.squaresWithWaste === Math.round(20 * 1.12 * 100) / 100);
ok("bundles = ceil(squaresWaste × 3) default", r.bundles === Math.ceil(20 * 1.12 * 3));
ok("underlayment rolls @ ~10 sq/roll", r.underlaymentRolls.rolls === Math.ceil(20 * 1.12 / 10));
ok("accessory footage passes through (drip/starter/ridge)", r.accessories.dripEdgeFt === 180 && r.accessories.ridgeCapFt === 60);
ok("bundlesPerSquare override respected + clamped", A.takeoff({ roofArea: 100, bundlesPerSquare: 4, waste: 0 }).bundles === 4);
ok("ice-barrier (Zone 6/7) called out", /ICE-AND-WATER|ice-and-water/i.test(r.note) && /R905/.test(r.note));
ok("labeled ESTIMATE + ROOF-SURFACE input note", /ESTIMATE/.test(r.label) && /ROOF-SURFACE/.test(r.label));
ok("no roof area ⇒ error (asks for surface area)", A.takeoff({}).ok === false && /pitch/i.test(A.takeoff({}).note));
ok("no pricing", !/\$\d|"(price|cost|rate)"\s*:\s*\d/.test(JSON.stringify(r)));

console.log("\n" + (fail ? "✗ " : "✓ ") + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
