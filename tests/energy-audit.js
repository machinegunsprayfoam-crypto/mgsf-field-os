#!/usr/bin/env node
// Energy-audit analyzer — pure decision/math core of api/energy-audit.js. Run: `node tests/energy-audit.js`.
// Deterministic, keyless, no network. Covers per-period rating, annualization + measured-vs-ESTIMATE
// basis, base-load/seasonal disaggregation, GATED weather-normalization + savings (no input ⇒ skipped,
// never guessed), the physics conversion, and the guardrails (savings labeled ESTIMATE + never guaranteed).

const path = require("path");
const A = require(path.join(__dirname, "..", "api", "energy-audit.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 0.05 : t);

console.log("Energy-audit analyzer (utility-bill baseline for BPI reports)\n");

// ---- periods(): rate each bill; skip un-rateable ones instead of guessing ----
let p = A.periods([{ days: 30, usage: 300 }, { days: 30, usage: 600 }]);
ok("perDay = usage / days", near(p[0].perDay, 10) && near(p[1].perDay, 20));
ok("days computed from consecutive dates", A.periods([{ end: "2016-08-07", usage: 224 }], "2016-07-08")[0].days === 30);
ok("bad/zero-day period is skipped (not guessed)", A.periods([{ days: 0, usage: 300 }, { days: 30, usage: 300 }]).length === 1);

// ---- annualize(): total, per-day, and measured vs ESTIMATE basis ----
let a = A.annualize([{ days: 30, usage: 300 }, { days: 30, usage: 300 }, { days: 30, usage: 300 }]);
ok("annualUsage = perDay * 365", near(a.annualUsage, 3650));
ok("partial year ⇒ fullYear false + ESTIMATE basis", a.fullYear === false && /ESTIMATE/.test(a.basis));
let full = A.annualize(Array.from({ length: 12 }, () => ({ days: 30, usage: 100 })));
ok("≥330 days ⇒ fullYear true + measured basis", full.fullYear === true && full.basis === "measured");

// ---- disaggregate(): base-load vs seasonal via summer-minimum ----
const yr = [];
for (let i = 0; i < 3; i++) yr.push({ days: 30, usage: 60 });   // 3 low (summer) months: 2/day
for (let i = 0; i < 9; i++) yr.push({ days: 30, usage: 300 });  // 9 higher months: 10/day
const d = A.disaggregate(yr);
ok("base per-day = coolest-quarter average (2/day)", near(d.basePerDay, 2));
ok("baseAnnual = basePerDay * 365 (730)", near(d.baseAnnual, 730));
ok("annualUsage measured (2920)", near(d.annualUsage, 2920));
ok("seasonalAnnual = annual - base (2190)", near(d.seasonalAnnual, 2190));
ok("seasonalPct (75%)", near(d.seasonalPct, 75, 0.2));
ok("method names it an ESTIMATE", /ESTIMATE/.test(d.method));
ok("empty reads ⇒ zeros, no throw", A.disaggregate([]).seasonalAnnual === 0);

// ---- normalize(): GATED on real degree-days ----
let n = A.normalize(1000, 5000, 5500);
ok("normalizes seasonal to a typical HDD year", n.normalized === true && near(n.perHDD, 0.2, 0.001) && near(n.normalizedSeasonal, 1100));
ok("no actual HDD ⇒ not normalized (no invented climate #)", A.normalize(1000, 0, 5500).normalized === false);
ok("no typical HDD ⇒ not normalized", A.normalize(1000, 5000, 0).normalized === false);

// ---- estimateSavings(): GATED on a supplied reduction %, ESTIMATE, never a guarantee, clamped ----
let s = A.estimateSavings(2000, 25);
ok("savings = seasonal * reduction% (500)", s.estimated === true && near(s.unitsSaved, 500));
ok("savings labeled ESTIMATE", s.label === "ESTIMATE");
ok("savings disclaimer says NOT a guarantee", /not a guarantee/i.test(s.disclaimer));
ok("no reduction% ⇒ no number (not fabricated)", A.estimateSavings(2000).estimated === false && A.estimateSavings(2000, 0).estimated === false);
ok("reduction% clamped ≤90 (no 100%+ heating cut)", A.estimateSavings(2000, 150).unitsSaved === 1800);

// ---- siteEnergyMMBtu(): physics conversion ----
ok("mixed-fuel MMBtu (1000 kWh + 100 therms ≈ 13.412)", near(A.siteEnergyMMBtu(1000, 100), 13.412, 0.005));
ok("zero fuels ⇒ 0", A.siteEnergyMMBtu(0, 0) === 0);
ok("THERM_KWH constant ≈ 29.3", near(A.CONSTANTS.THERM_KWH, 29.3, 0.02));

// ---- analyze(): whole-report assembly, gating carried through, guardrails intact ----
const body = {
  electric: { start: "2016-07-08", reads: yr.map((x, i) => ({ end: "2016-" + String((i % 12) + 1).padStart(2, "0") + "-07", usage: x.usage, days: 30 })) },
  gas: { reads: [{ days: 30, usage: 224 }, { days: 30, usage: 60 }, { days: 30, usage: 300 }] },
  hdd: 6000, typicalHdd: 6600, reductionPct: 25,
};
const r = A.analyze(body);
ok("analyze returns per-fuel baselines", !!r.electric && !!r.gas && r.ok === true);
ok("analyze reports combined site energy (MMBtu)", typeof r.siteEnergyMMBtu === "number" && r.siteEnergyMMBtu > 0);
ok("analyze carries weather-normalization when HDD supplied", r.electric.weatherNormalized.normalized === true);
ok("analyze carries a savings ESTIMATE when reduction% supplied", r.electric.savings.estimated === true && r.electric.savings.label === "ESTIMATE");
ok("analyze output flags ESTIMATE + energy-only (no dollars)", r.basis === "ESTIMATE" && /no dollars/i.test(r.units));
ok("no bills ⇒ ok:false no_bills", A.analyze({}).ok === false && A.analyze({}).error === "no_bills");
// gating without inputs
const bare = A.analyze({ gas: { reads: [{ days: 30, usage: 224 }, { days: 30, usage: 60 }] } });
ok("no HDD ⇒ normalization skipped (honest)", bare.gas.weatherNormalized.normalized === false);
ok("no reduction% ⇒ savings skipped (honest)", bare.gas.savings.estimated === false);

console.log("\n" + (fail ? "✗" : "✓") + " " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
