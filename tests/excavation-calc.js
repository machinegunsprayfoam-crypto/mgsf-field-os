#!/usr/bin/env node
// Excavation/earthwork — pure takeoff() of api/excavation-calc.js. Run: `node tests/excavation-calc.js`.
// Deterministic, keyless. Covers bank volume geometry (area×depth→cubic yards), swell (loose/haul),
// compaction (fill), truck loads, trench L×W×D, depthIn, and guardrails (ESTIMATE, 811 + OSHA Subpart P
// safety surfaced, no pricing, error on missing input).

const path = require("path");
const A = require(path.join(__dirname, "..", "api", "excavation-calc.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }
console.log("Excavation / earthwork takeoff\n");

const r = A.takeoff({ area: 1000, depth: 3, swellPct: 0.25, compactionPct: 0.15 });
ok("bank cy = area × depth / 27 (1000×3/27≈111.11)", r.bankCubicYards === 111.11);
ok("loose cy = bank × (1+swell) (×1.25)", r.looseCubicYards === Math.round(111.111 * 1.25 * 100) / 100);
ok("fill-borrow = bank × (1+shrink) (×1.15)", r.fillBankYardsToPlaceCompacted === Math.round(111.111 * 1.15 * 100) / 100);
ok("truck loads = ceil(loose / truckYd)", r.truckLoads.loads === Math.ceil(r.looseCubicYards / 10));
ok("length×width == area", A.takeoff({ length: 50, width: 20, depth: 3 }).inputs.area === 1000);
ok("trench L×W×D (50×2×6/27≈22.22)", A.takeoff({ length: 50, width: 2, depth: 6, trench: true }).bankCubicYards === 22.22);
ok("depthIn adds to depth (2ft + 6in = 2.5ft)", A.takeoff({ area: 108, depth: 2, depthIn: 6 }).inputs.depthFt === 2.5);
ok("swell/compaction overridable + clamped", A.takeoff({ area: 100, depth: 1, swellPct: 2, compactionPct: 2 }).inputs.swellPct === 100);
ok("SAFETY surfaces 811 + OSHA Subpart P", /811/.test(r.safety) && /Subpart P/.test(r.safety));
ok("labeled ESTIMATE + defers soil factors to geotech", /ESTIMATE/.test(r.label) && /geotech/i.test(r.label));
ok("no area/depth ⇒ error", A.takeoff({}).ok === false && A.takeoff({ area: 100 }).ok === false);
ok("no pricing", !/\$\d|"(price|cost|rate)"\s*:\s*\d/.test(JSON.stringify(r)));

console.log("\n" + (fail ? "✗ " : "✓ ") + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
