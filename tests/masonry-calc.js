#!/usr/bin/env node
// Masonry — pure takeoff() of api/masonry-calc.js. Run: `node tests/masonry-calc.js`.
// Deterministic, keyless. Covers unit count (wall area × per-sqft coverage + waste) by unit type,
// mortar bags, grout for filled cells, bad-unit fallback, and guardrails (ESTIMATE, defer structural
// to TMS 402/602 + engineer, no pricing, error on none).

const path = require("path");
const A = require(path.join(__dirname, "..", "api", "masonry-calc.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }
console.log("Masonry takeoff\n");

const r = A.takeoff({ wallArea: 800, unit: "cmu-8", waste: 0.05 });
ok("CMU-8 count = ceil(area × 1.125 × waste) (800→945)", r.units === 945);
ok("mortar bags = ceil(units/100 × rate)", r.mortarBags.bags === Math.ceil((945 / 100) * 3.0));
ok("length×height == wall area", A.takeoff({ length: 40, height: 20, unit: "cmu-8" }).inputs.wallArea === 800);
ok("brick unit uses brick coverage (~6.86/sqft)", (() => { const b = A.takeoff({ wallArea: 100, unit: "brick-mod", waste: 0 }); return b.units === Math.ceil(100 * 6.86); })());
ok("bad unit ⇒ falls back to CMU-8", A.takeoff({ wallArea: 100, unit: "moon-rock" }).inputs.unit === "CMU 8x8x16");
ok("grouted cells ⇒ grout volume", (() => { const g = A.takeoff({ wallArea: 800, unit: "cmu-8", groutedCellPct: 0.5 }); return g.grout && g.grout.cubicYards > 0 && g.grout.groutedCellPct === 50; })());
ok("no grout when groutedCellPct 0", A.takeoff({ wallArea: 800, unit: "cmu-8" }).grout === undefined);
ok("brick has no grout even if requested (no cells)", A.takeoff({ wallArea: 100, unit: "brick-mod", groutedCellPct: 1 }).grout === undefined);
ok("labeled ESTIMATE + defers structural to TMS", /ESTIMATE/.test(r.label) && /TMS 402\/602/.test(r.label));
ok("no wall area ⇒ error", A.takeoff({}).ok === false);
ok("no pricing", !/\$\d|"(price|cost|rate)"\s*:\s*\d/.test(JSON.stringify(r)));

console.log("\n" + (fail ? "✗ " : "✓ ") + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
