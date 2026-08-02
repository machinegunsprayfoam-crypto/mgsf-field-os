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
ok("analyze output flags ESTIMATE + energy-savings-in-units + costs not MGSF pricing", r.basis === "ESTIMATE" && /no \$/.test(r.units) && /not MGSF pricing/i.test(r.units));
ok("no input at all ⇒ ok:false no_input", A.analyze({}).ok === false && A.analyze({}).error === "no_input");

// ---- geometry(): derived numbers, ESTIMATE, missing inputs omitted (not guessed) ----
let g = A.geometry({ conditionedArea: 2500, wallHeight: 8, length: 40, width: 32, floors: 2, bedrooms: 4, occupants: 2, yearBuilt: 1936 });
ok("volume = area × wall height (feeds ACH50)", near(g.volume, 20000, 1));
ok("footprint = length × width", near(g.footprint, 1280, 1));
ok("wall area = perimeter × height × floors", near(g.wallAreaEst, 2 * (40 + 32) * 8 * 2, 1));
ok("bedrooms/occupants/yearBuilt carried", g.bedrooms === 4 && g.occupants === 2 && g.yearBuilt === 1936);
ok("wall height defaults to 8 when absent", near(A.geometry({ conditionedArea: 1000 }).volume, 8000, 1));
ok("missing dims ⇒ no footprint/wallArea (not guessed)", A.geometry({ conditionedArea: 1000 }).footprint === undefined);
ok("no area ⇒ no volume", A.geometry({ length: 40, width: 32 }).volume === undefined);

// ---- concernsToMeasures(): map complaints to measures; CO=safety; unmatched=assessment ----
const cm = A.concernsToMeasures([
  { summary: "Cold feet in the kitchen", detail: "floor above the garage is always cold" },
  { summary: "House feels drafty", detail: "no insulation in the walls" },
  { summary: "Gas bills too high", detail: "much higher than the previous home" },
  { summary: "CO monitor", detail: "the CO alarm has gone off a few times" },
  { summary: "The paint is a nice blue", detail: "we like the color" },
]);
ok("cold floor over garage ⇒ floor/cantilever foam", /floor|cantilever/i.test(cm[0].measures[0].measure));
ok("drafty + no wall insulation ⇒ air-seal AND wall insulation", cm[1].measures.some((m) => /air-seal/i.test(m.measure)) && cm[1].measures.some((m) => /wall/i.test(m.measure)));
ok("high gas bills ⇒ heating-load / envelope measure", /heating load|envelope|air-seal/i.test(cm[2].measures[0].measure));
ok("CO concern ⇒ SAFETY (CAZ), flagged, not an upsell", cm[3].measures[0].safety === true && /CAZ|combustion/i.test(cm[3].measures[0].measure) && cm[3].hasSafety === true);
ok("unmatched concern ⇒ 'assessment needed' (never invented)", /assessment needed/i.test(cm[4].measures[0].measure));
ok("no measure guarantees savings", JSON.stringify(cm).toLowerCase().indexOf("guarantee") === -1);
ok("no mold-elimination claim anywhere", !/mold/i.test(JSON.stringify(cm)));
ok("null/non-array concerns ⇒ [] no throw", A.concernsToMeasures(null).length === 0 && A.concernsToMeasures([null]).length === 0);

// ---- analyze() wiring: building + concerns + top-level CAZ safety flag ----
const full2 = A.analyze({ building: { conditionedArea: 2500, wallHeight: 8, bedrooms: 4 }, concerns: [{ summary: "CO alarm", detail: "goes off" }, { summary: "drafty", detail: "" }] });
ok("analyze carries geometry", full2.geometry && near(full2.geometry.volume, 20000, 1));
ok("analyze carries recommendations", Array.isArray(full2.recommendations) && full2.recommendations.length === 2);
ok("analyze raises a top-level CAZ safetyFlag when a CO concern is present", /CAZ|combustion/i.test(full2.safetyFlag || ""));
ok("building/concerns alone (no bills) is valid input", full2.ok === true);
// gating without inputs
const bare = A.analyze({ gas: { reads: [{ days: 30, usage: 224 }, { days: 30, usage: 60 }] } });
ok("no HDD ⇒ normalization skipped (honest)", bare.gas.weatherNormalized.normalized === false);
ok("no reduction% ⇒ savings skipped (honest)", bare.gas.savings.estimated === false);

// ---- MEASURE_CATALOG + catalogFor() ----
ok("catalog is a non-empty array", Array.isArray(A.MEASURE_CATALOG) && A.MEASURE_CATALOG.length >= 20);
ok("catalog ids are unique", new Set(A.MEASURE_CATALOG.map((m) => m.id)).size === A.MEASURE_CATALOG.length);
ok("catalog has the core foam/air-seal measures flagged mgsf:true", ["air-sealing", "attic-insulation", "wall-insulation", "crawl-encapsulation"].every((id) => A.catalogFor(id) && A.catalogFor(id).mgsf === true));
ok("a non-MGSF measure (windows) is mgsf:false", A.catalogFor("windows").mgsf === false);
ok("catalogFor(unknown) ⇒ null", A.catalogFor("nope") === null);

// ---- applyIncentive(): owner-entered cost/incentive math ----
ok("incentive = cost*pct% + flat$", (function () { const r = A.applyIncentive({ cost: 1000, incentivePct: 10, incentiveDollar: 200 }); return r.incentive === 300 && r.netCost === 700; })());
ok("incentive capped by incentiveCap", (function () { const r = A.applyIncentive({ cost: 1000, incentivePct: 50, incentiveCap: 300 }); return r.incentive === 300 && r.netCost === 700; })());
ok("incentive never exceeds the cost", (function () { const r = A.applyIncentive({ cost: 100, incentiveDollar: 500 }); return r.incentive === 100 && r.netCost === 0; })());
ok("pct clamped ≤100", A.applyIncentive({ cost: 1000, incentivePct: 150 }).netCost === 0);
ok("no cost ⇒ zeros, no throw", A.applyIncentive({}).netCost === 0);

// ---- prioritize(): NEAT-style cost-effectiveness ranking ----
const ranked = A.prioritize([
  { id: "attic-insulation", cost: 2000, incentiveDollar: 500, annualSavingsUnits: 100 }, // net 1500 → 15/unit
  { id: "windows", cost: 8000, annualSavingsUnits: 100 },                                // net 8000 → 80/unit
  { id: "lighting", cost: 200 },                                                          // no savings → last
]);
ok("most cost-effective first (attic before windows)", ranked[0].id === "attic-insulation" && ranked[1].id === "windows");
ok("measures without a savings figure fall to the end", ranked[2].id === "lighting");
ok("ranks are 1..n", ranked.map((x) => x.rank).join(",") === "1,2,3");
ok("catalog enrichment: name + category + mgsf lane", ranked[0].name === "Attic insulation" && ranked[0].category === "envelope" && ranked[0].mgsf === true);
ok("costPerUnitSaved computed for scored, null for unscored", ranked[0].costPerUnitSaved === 15 && ranked[2].costPerUnitSaved === null);
ok("unknown id keeps supplied name, category 'other'", (function () { const r = A.prioritize([{ id: "zzz", name: "Custom thing", cost: 100 }]); return r[0].name === "Custom thing" && r[0].category === "other" && r[0].mgsf === false; })());

// ---- analyze() wiring: measures + totals + program cap; measures alone is valid input ----
const mres = A.analyze({ measures: [{ id: "air-sealing", cost: 1000, incentivePct: 20 }] });
ok("analyze carries ranked measures + totals", Array.isArray(mres.measures) && mres.measuresTotal.cost === 1000 && mres.measuresTotal.incentive === 200 && mres.measuresTotal.netCost === 800);
ok("measures alone (no bills) is valid input", mres.ok === true);
const capped = A.analyze({ measures: [{ id: "a", cost: 1000, incentiveDollar: 400 }, { id: "b", cost: 1000, incentiveDollar: 400 }], programCap: 500 });
ok("program cap limits total incentive", capped.measuresTotal.incentiveAfterCap === 500 && capped.measuresTotal.netCostAfterCap === 1500);

// ---- summarizeEquipment(): document existing systems, combustion drives CAZ (no fabrication) ----
const se = A.summarizeEquipment([{ type: "furnace", make: "Trane", model: "S9V2", fuel: "Natural Gas", specs: { afue: 96 }, verified: true }, { type: "ac", make: "", model: "" }]);
ok("equipment with make/model kept; empty dropped", se.list.length === 1 && se.list[0].make === "Trane");
ok("gas furnace ⇒ hasCombustion", se.hasCombustion === true && se.list[0].combustion === true);
ok("verified flag preserved", se.list[0].verified === true);
const seSerial = A.summarizeEquipment([{ type: "furnace", make: "Trane", model: "S9V2", serial: "1815ABC", manufactureDate: "2018", fuel: "Natural Gas" }]);
ok("serial + manufacture date carried through", seSerial.list[0].serial === "1815ABC" && seSerial.list[0].manufactureDate === "2018");
const seElec = A.summarizeEquipment([{ type: "heat_pump", make: "Mitsubishi", model: "MSZ", fuel: "electric" }]);
ok("electric heat pump ⇒ not combustion", seElec.hasCombustion === false);
ok("non-array equipment ⇒ empty", A.summarizeEquipment(null).list.length === 0);
// analyze wiring: equipment alone is valid input; a combustion unit raises the CAZ safety flag
const eqRes = A.analyze({ equipment: [{ type: "furnace", make: "Lennox", model: "SL280", fuel: "Natural Gas" }] });
ok("equipment alone is valid input", eqRes.ok === true && Array.isArray(eqRes.equipment) && eqRes.equipment.length === 1);
ok("combustion equipment raises CAZ safety flag", /CAZ/.test(eqRes.safetyFlag || ""));

// ---- suggestSizing(): post-retrofit right-sizing, ESTIMATE, never a guarantee ----
const sz = A.suggestSizing({ currentOutputBtu: 76000, reductionPct: 25, hasCooling: true });
ok("sizing anchors on installed output", /installed unit/.test(sz.basis));
ok("reduction applied to load", sz.reductionAppliedPct === 25 && sz.postRetrofitLoadBtu.high < sz.currentLoadBtu.high);
ok("recommends a standard furnace input size", [40, 60, 80, 100, 120].includes(sz.recommendedFurnaceInputMBH), sz.recommendedFurnaceInputMBH);
ok("recommends standard cooling tons when cooling present", [1.5, 2, 2.5, 3, 3.5, 4, 5].includes(sz.recommendedCoolingTons));
ok("sizing is ESTIMATE + Manual J caveat + no guarantee", sz.label === "ESTIMATE" && /Manual J/.test(sz.note) && /[Nn]ot a guarantee/.test(sz.note));
ok("reduction clamped ≤50%", A.suggestSizing({ currentOutputBtu: 80000, reductionPct: 999 }).reductionAppliedPct === 50);
const szArea = A.suggestSizing({ floorArea: 2000, reductionPct: 30 });
ok("sizing falls back to floor-area × climate factor", /floor-area/.test(szArea.basis) && szArea.postRetrofitLoadBtu.high > 0);
ok("no anchor ⇒ null sizing", A.suggestSizing({ reductionPct: 30 }) === null);
// equipHeatOutput: pull heating output, detect cooling
const eho = A.equipHeatOutput([{ type: "furnace", specs: { inputBtu: 80000, afue: 95 } }, { type: "ac", specs: { tons: 3 } }]);
ok("equipHeatOutput derives output + flags cooling", eho.output === 76000 && eho.hasCooling === true);
// analyze wiring: sizing appears only with a retrofit signal + an anchor
const szRes = A.analyze({ building: { conditionedArea: 2000 }, reductionPct: 25, concerns: [{ summary: "drafty, no wall insulation" }] });
ok("analyze emits sizing when work planned + anchor present", szRes.sizing && szRes.sizing.label === "ESTIMATE");
const noWork = A.analyze({ building: { conditionedArea: 2000 } });
ok("no retrofit signal ⇒ no sizing", noWork.sizing === undefined);

console.log("\n" + (fail ? "✗" : "✓") + " " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
