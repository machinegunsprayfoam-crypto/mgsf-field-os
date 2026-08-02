#!/usr/bin/env node
// R-value / code-min engine — pure core of api/rvalue-calc.js. Run: `node tests/rvalue-calc.js`.
// Deterministic, keyless, no network. Covers installed-R math (foam + flash-and-batt), the labeled/
// overridable R/inch defaults, the IECC 2021 Zone 6/7 code table, the meets/short decision + the
// "add this much foam" math, and the guardrails: ESTIMATE not a ruling, verify AHJ+TDS, no pricing.

const path = require("path");
const A = require(path.join(__dirname, "..", "api", "rvalue-calc.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 0.05 : t);

console.log("R-value / code-min engine (IECC Zone 6/7 assembly check)\n");

// ---- installed R ----
const cc = A.installedR({ type: "closed", thickness: 3 });
ok("closed-cell R = thickness × 7.1 (NCFI default)", near(cc.foamR, 21.3) && cc.total === 21.3);
ok("R/inch default labeled ESTIMATE + verify TDS", /ESTIMATE/.test(cc.rPerInchSource) && /TDS/.test(cc.rPerInchSource));
const oc = A.installedR({ type: "open", thickness: 5 });
ok("open-cell R = thickness × 3.7", near(oc.foamR, 18.5));
ok("owner rPerInch overrides + flagged", (() => { const r = A.installedR({ type: "closed", thickness: 2, rPerInch: 6.5 }); return r.foamR === 13 && r.rPerInchSource === "owner-entered"; })());
const fb = A.installedR({ type: "closed", thickness: 2, battR: 13 });
ok("flash-and-batt adds batt R", fb.foamR === 14.2 && fb.total === 27.2);

// ---- code table (IECC 2021 Zone 6/7) ----
ok("Zone 6 ceiling min R-60", A.codeMin(6, "ceiling").min === 60);
ok("Zone 6 wall min R-20", A.codeMin(6, "wall").min === 20);
ok("Zone 6 floor R-30, Zone 7 floor R-38 (the real difference)", A.codeMin(6, "floor").min === 30 && A.codeMin(7, "floor").min === 38);
ok("slab R-10 both zones", A.codeMin(6, "slab").min === 10 && A.codeMin(7, "slab").min === 10);
ok("attic alias → ceiling", A.codeMin(6, "attic").assembly === "ceiling");
ok("unknown assembly ⇒ null", A.codeMin(6, "spaceship") === null);
ok("zone defaults to 6 when bad", A.codeMin(99, "wall").zone === "6");

// ---- check: meets / short + add-thickness ----
const meet = A.check({ assembly: "wall", zone: 6, type: "closed", thickness: 3 }); // 21.3 ≥ 20
ok("wall R-21.3 meets Zone 6 R-20", meet.meets === true && /Meets/.test(meet.note));
const short = A.check({ assembly: "ceiling", zone: 6, type: "open", thickness: 5 }); // 18.5 < 60
ok("ceiling short of R-60 flagged", short.meets === false && short.shortfallR === round(60 - 18.5));
ok("add-thickness math = shortfall / R-per-inch", near(short.addThicknessIn, (60 - 18.5) / 3.7, 0.02));
ok("no thickness ⇒ meets:null + prompt", A.check({ assembly: "wall" }).meets === null);
ok("unknown assembly ⇒ error, lists assemblies", (() => { const r = A.check({ assembly: "xyz", thickness: 3 }); return r.ok === false && Array.isArray(r.assemblies); })());
function round(n) { return Math.round(n * 10) / 10; }

// ---- guardrails: ESTIMATE not a ruling, verify pointers, no pricing ----
ok("labeled ESTIMATE + not a code ruling", /ESTIMATE/.test(meet.label) && /NOT a code ruling/i.test(meet.label));
ok("code carries IECC basis + verify-AHJ", /IECC 2021/.test(meet.code.basis) && /AHJ/.test(meet.code.verify));
ok("wall paths documents ci / U-factor alternatives", /continuous|U-factor/i.test(A.codeMin(6, "wall").paths));
ok("no pricing anywhere in output", !/\$\d|"(price|cost|rate)"\s*:/.test(JSON.stringify(meet)));

console.log("\n" + (fail ? "✗ " : "✓ ") + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
