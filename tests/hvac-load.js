#!/usr/bin/env node
// HVAC load — pure core of api/hvac-load.js. Run: `node tests/hvac-load.js`. Deterministic, keyless.
// Covers the rule-of-thumb load ranges by tightness, tonnage/CFM math (÷12000, ×400), ASHRAE 62.2
// ventilation, and the guardrails: NOT a Manual J, licensed-HVAC + AHJ, don't-oversize, no pricing.

const path = require("path");
const A = require(path.join(__dirname, "..", "api", "hvac-load.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 1 : t);

console.log("HVAC load (Zone 6/7 rule of thumb)\n");

// ---- load estimate ----
const L = A.loadEstimate({ area: 2000, tightness: "typical" });
ok("heating range = area × [25,35]", L.heatingBtu.low === 50000 && L.heatingBtu.high === 70000);
ok("cooling range = area × [20,28]", L.coolingBtu.low === 40000 && L.coolingBtu.high === 56000);
ok("cooling tons = coolingBtu / 12000", near(L.coolingTons.low, 40000 / 12000, 0.1) && near(L.coolingTons.high, 56000 / 12000, 0.1));
ok("airflow = tons × 400 CFM", near(L.airflowCfm.high, L.coolingTons.high * 400, 5));
ok("tighter envelope ⇒ lower load", A.loadEstimate({ area: 2000, tightness: "tight" }).heatingBtu.high < L.heatingBtu.high);
ok("leaky envelope ⇒ higher load", A.loadEstimate({ area: 2000, tightness: "leaky" }).heatingBtu.high > L.heatingBtu.high);
ok("bad tightness defaults to typical", A.loadEstimate({ area: 1000, tightness: "xyz" }).tightness === "typical");
ok("no area ⇒ error", A.loadEstimate({}).ok === false);

// ---- tonnage ----
const t = A.tonnage(36000);
ok("36000 BTU ⇒ 3 tons", t.tons === 3);
ok("3 tons ⇒ 1200 CFM", t.cfm === 1200);

// ---- ASHRAE 62.2 ventilation ----
const v = A.ventilation({ area: 2000, bedrooms: 3 });
ok("Qtot = 0.03·area + 7.5·(beds+1)", v.ventilationCfm === round(0.03 * 2000 + 7.5 * 4));
ok("ventilation needs area", A.ventilation({}).ok === false);
function round(n) { return Math.round(n * 10) / 10; }

// ---- guardrails ----
ok("NOT a Manual J label", /NOT a Manual J/i.test(L.label) && /Manual J/.test(L.note));
ok("defers to licensed HVAC + AHJ", /licensed HVAC/i.test(L.note) && /AHJ/.test(L.note));
ok("warns oversizing short-cycles", /short-cycle/i.test(L.note));
ok("analyze routes actions", A.analyze({ action: "ventilation", area: 1000, bedrooms: 2 }).ventilationCfm > 0 && A.analyze({ action: "tonnage", coolingBtu: 24000 }).tons === 2);
ok("no pricing anywhere", !/\$\d|"(price|cost|rate)"\s*:\s*\d/.test(JSON.stringify(L)));

console.log("\n" + (fail ? "✗ " : "✓ ") + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
