#!/usr/bin/env node
// Air/vapor barrier engine — pure core of api/air-barrier-calc.js. Run: `node tests/air-barrier-calc.js`.
// Deterministic, keyless, no network. Covers fluid gallons (coverage rate + wet-mil path), membrane
// area/rolls, waste clamps, the cold-climate vapor-control rule, the CAZ combustion flag, and the
// guardrails: coverage owner-entered (not guessed), ESTIMATE, no pricing, not a code ruling.

const path = require("path");
const A = require(path.join(__dirname, "..", "api", "air-barrier-calc.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 0.5 : t);

console.log("Air/vapor barrier engine (fluid + membrane + vapor rule)\n");

// ---- fluid: coverage rate ----
const f = A.fluidApplied(1000, { coverageSqftPerGal: 100, waste: 0 });
ok("gallons = area / coverage", f.gallons === 10 && f.method === "fluid");
ok("waste applied to area", A.fluidApplied(1000, { coverageSqftPerGal: 100, waste: 0.1 }).gallons === 11);
ok("pails counted when unit size given (ceil)", A.fluidApplied(1000, { coverageSqftPerGal: 100, waste: 0, unitSize: 5 }).unitsToOrder === 2);
// ---- fluid: wet-mil path (1604 / mils) ----
const wm = A.fluidApplied(1604, { wetMils: 2, waste: 0 });
ok("wet-mil coverage = 1604 / mils", wm.coverageSqftPerGal === 802 && near(wm.gallons, 2));
ok("wet-mil basis labeled", /wet mil/.test(wm.coverageBasis));
ok("no coverage given ⇒ needs prompt, no guess", A.fluidApplied(1000, {}).needs && A.fluidApplied(1000, {}).gallons === undefined);

// ---- membrane ----
const m = A.membrane(1000, { waste: 0.15, rollSqft: 200 });
ok("membrane area + overlap waste", m.areaWithWaste === 1150 && m.method === "membrane");
ok("rolls counted (ceil)", m.rollsToOrder === 6);
ok("membrane default overlap 15%", A.membrane(1000, {}).wastePct === 15);
ok("no roll size ⇒ needs prompt", A.membrane(1000, {}).needs && A.membrane(1000, {}).rollsToOrder === undefined);
ok("waste clamped ≤60%", A.membrane(1000, { waste: 9 }).wastePct === 60);

// ---- vapor guidance (cold-climate rule) ----
const v6 = A.vaporGuidance(6, {});
ok("Zone 6 ⇒ interior vapor retarder required", /Interior vapor retarder/i.test(v6.vaporControl) && /Zone 6/.test(v6.vaporControl));
ok("closed-cell self-retarder note", /closed-cell/i.test(v6.note) && /Class II/.test(v6.note));
ok("vapor carries verify-AHJ (not a ruling)", /AHJ/.test(v6.verify) && /not a code ruling/i.test(v6.verify));
ok("warm zone ⇒ no blanket requirement", !/typically required/i.test(A.vaporGuidance(2, {}).vaporControl));

// ---- CAZ combustion flag ----
ok("combustion ⇒ CAZ safety flag", /CAZ/.test(A.vaporGuidance(6, { combustion: true }).safetyFlag));
ok("no combustion ⇒ no safety flag", A.vaporGuidance(6, {}).safetyFlag === undefined);

// ---- calc wiring + guardrails ----
const c = A.calc({ method: "fluid", area: 2000, coverageSqftPerGal: 100, zone: 7, combustion: true });
ok("calc returns material + vapor + zone", c.ok === true && c.gallons === 22 && c.vapor.zone === 7);
ok("combustion job surfaces top-level safetyFlag", /CAZ/.test(c.safetyFlag));
ok("ESTIMATE label + pricing deferred", /ESTIMATE/.test(c.label) && c.pricing.deferred === true);
ok("no area ⇒ error", A.calc({ method: "fluid" }).ok === false);
ok("unknown method defaults to fluid", A.calc({ area: 500, coverageSqftPerGal: 100 }).method === "fluid");
ok("no pricing anywhere", !/\$\d|"(price|cost|rate)"\s*:\s*\d/.test(JSON.stringify(c)));

console.log("\n" + (fail ? "✗ " : "✓ ") + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
