#!/usr/bin/env node
// Electrical load — pure core of api/electrical-load.js (NEC Article 220 dwelling calc). Run:
// `node tests/electrical-load.js`. Deterministic, keyless. Covers the 220.42 general demand ladder,
// the standard service calc + next-size rounding, 310.16 ampacity + 240.4(D) breaker caps, voltage
// drop, and the guardrails: ESTIMATE, licensed-electrician + AHJ verify, no pricing.

const path = require("path");
const A = require(path.join(__dirname, "..", "api", "electrical-load.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 0.5 : t);

console.log("Electrical load (NEC 220 dwelling service)\n");

// ---- 220.42 general demand ladder ----
ok("first 3000 VA @ 100%", A.generalDemand(3000) === 3000);
ok("3001–120k @ 35%", near(A.generalDemand(10500), 3000 + 7500 * 0.35));   // 5625
ok(">120k tier @ 25%", near(A.generalDemand(130000), 3000 + 117000 * 0.35 + 10000 * 0.25)); // 46450

// ---- standard service calc ----
const s = A.service({ area: 2000, smallAppliance: 2, laundry: 1, dryerVA: 5000, rangeVA: 8000, acVA: 3600, heatVA: 10000 });
ok("general net = 5625 for 2000 ft²", s.breakdown.generalNet === 5625);
ok("climate = larger of A/C vs heat (10000)", /larger of A\/C/.test(String(s.breakdown.climateNet)) && s.totalVA === 5625 + 5000 + 8000 + 10000);
ok("amps = total / 240", near(s.calculatedAmps, (5625 + 5000 + 8000 + 10000) / 240));
ok("rounds up to next standard service (125A)", s.recommendedService === "125A");
ok("4+ fixed appliances ⇒ 75% demand", /75%/.test(String(A.service({ area: 1500, applianceVA: 8000, applianceCount: 4 }).breakdown.applianceNet)));
ok("dryer floored at 5000 VA", A.service({ area: 1500, dryerVA: 3000 }).breakdown.dryerNet === 5000);
ok("no area ⇒ error", A.service({}).ok === false);

// ---- 310.16 ampacity + 240.4(D) ----
ok("12 AWG: 75°C = 25 A, breaker cap 20 A", (() => { const a = A.ampacity({ awg: "12" }); return a.ampacity75C === 25 && /20A/.test(a.smallConductorBreakerMax); })());
ok("4/0: 75°C = 230 A", A.ampacity({ awg: "4/0" }).ampacity75C === 230);
ok("8 AWG has no small-conductor cap", A.ampacity({ awg: "8" }).smallConductorBreakerMax === undefined);
ok("unknown AWG ⇒ error + list", A.ampacity({ awg: "99" }).ok === false);

// ---- voltage drop ----
const v = A.vdrop({ awg: "2", amps: 100, lengthFt: 100, volts: 240 });
ok("1φ Vd = 2·L·I·R/1000", near(v.voltageDrop, 2 * 100 * 100 * 0.194 / 1000, 0.02));
ok("drop % computed + within-recommended flag", v.dropPct > 0 && /branch|watch|upsize/.test(v.withinRecommended));
ok("3φ uses 1.732 multiplier", near(A.vdrop({ awg: "2", amps: 100, lengthFt: 100, volts: 208, phase: 3 }).voltageDrop, 1.732 * 100 * 100 * 0.194 / 1000, 0.02));

// ---- guardrails ----
ok("service labeled ESTIMATE + NEC method", /ESTIMATE/.test(s.label) && /NEC 220/.test(s.method));
ok("defers to licensed electrician + AHJ", /licensed electrician/i.test(s.note) && /AHJ/.test(s.note));
ok("no pricing anywhere", !/\$\d|"(price|cost|rate)"\s*:\s*\d/.test(JSON.stringify(s)));

console.log("\n" + (fail ? "✗ " : "✓ ") + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
