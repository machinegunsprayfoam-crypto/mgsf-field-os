#!/usr/bin/env node
// Concrete flatwork — pure takeoff() of api/flatwork-calc.js. Run: `node tests/flatwork-calc.js`.
// Deterministic, keyless. Covers volume geometry (area×thickness→cubic yards), 0.25-yd round-up,
// length×width, waste clamp, bagged-mix option for small pours, and guardrails (ESTIMATE, no pricing,
// rebar/mix/footing deferred to ACI/AHJ, error on missing input).

const path = require("path");
const A = require(path.join(__dirname, "..", "api", "flatwork-calc.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }
console.log("Concrete flatwork takeoff\n");

const r = A.takeoff({ area: 400, thickness: 4, waste: 0.1 });
ok("volume cu ft = area × thickness/12 (400×0.333≈133)", r.volumeCuFt === 133);
ok("cubic yards = volWaste/27", r.cubicYards === Math.round((400 * (4 / 12) * 1.1 / 27) * 100) / 100);
ok("yardsToOrder rounds UP to 0.25 (never short)", r.yardsToOrder === 5.5);
ok("length×width == area", A.takeoff({ length: 20, width: 20, thickness: 4 }).inputs.area === 400);
ok("thickness default 4in", A.takeoff({ area: 100 }).inputs.thicknessIn === 4);
ok("waste clamps ≤ 0.5", A.takeoff({ area: 100, waste: 5 }).inputs.wastePct === 50);
ok("small pour ⇒ bag option (80lb default)", (() => { const s = A.takeoff({ area: 20, thickness: 4 }); return s.bagOption && s.bagOption.bagsNeeded === 13 && s.bagOption.bagSizeLb === 80; })());
ok("large pour ⇒ no bag option (truck)", A.takeoff({ area: 400, thickness: 6 }).bagOption === undefined);
ok("labeled ESTIMATE + defers structural", /ESTIMATE/.test(r.label) && /engineer/i.test(r.label));
ok("no area/thickness ⇒ error", A.takeoff({}).ok === false && A.takeoff({ area: 100, thickness: 0 }).ok === false);
ok("no pricing", !/\$\d|"(price|cost|rate)"\s*:\s*\d/.test(JSON.stringify(r)));

console.log("\n" + (fail ? "✗ " : "✓ ") + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
