#!/usr/bin/env node
// Plumbing — pure core of api/plumbing-calc.js (IPC fixture units → sizing). Run: `node tests/plumbing-calc.js`.
// Deterministic, keyless. Covers fixture-unit summing (WSFU/DFU), drain sizing + the WC-min-3" rule,
// supply GPM/size, water-heater sizing (tank + tankless temp-rise), and the guardrails: ESTIMATE,
// licensed-plumber + AHJ verify, IPC-edition verify, no pricing.

const path = require("path");
const A = require(path.join(__dirname, "..", "api", "plumbing-calc.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

console.log("Plumbing (IPC fixture units → sizing)\n");

// ---- fixture units ----
const fu = A.fixtureUnits([{ type: "water-closet", count: 2 }, { type: "lavatory", count: 2 }, { type: "shower", count: 1 }, { type: "kitchen-sink", count: 1 }]);
ok("WSFU summed (2×2.5 + 2×1 + 2 + 1.4)", fu.wsfu === 10.4);
ok("DFU summed (2×3 + 2×1 + 2 + 2)", fu.dfu === 12);
ok("water closets counted", fu.waterClosets === 2);
ok("unmatched fixture surfaced, not counted", (() => { const r = A.fixtureUnits([{ type: "hot-tub-9000", count: 1 }]); return r.items.some((i) => i.unmatched) && r.wsfu === 0; })());
ok("zero count ignored", A.fixtureUnits([{ type: "lavatory", count: 0 }]).dfu === 0);

// ---- drain sizing + WC rule ----
ok("small DFU ⇒ small drain", A.drainSize(3, {}).recommendedDrain === '1.5"');
ok("21 DFU ⇒ 2\"", A.drainSize(21, {}).recommendedDrain === '2"');
ok("42 DFU ⇒ 3\"", A.drainSize(42, {}).recommendedDrain === '3"');
ok("water closet forces 3\" minimum", A.drainSize(3, { hasWC: true }).recommendedDrain === '3"' && /3\"/.test(A.drainSize(3, { hasWC: true }).wcRule));
ok("drain cites IPC Table 710.1", /710\.1/.test(A.drainSize(20, {}).basis));

// ---- supply demand ----
const sup = A.supplyDemand(20);
ok("WSFU → peak GPM (Hunter approx)", sup.peakGPM > 0 && /Hunter/.test(sup.basis));
ok("supply size scales with GPM", A.supplyDemand(5).roughSupplySize === '3/4"' && /1/.test(A.supplyDemand(60).roughSupplySize));

// ---- water heater ----
const tank = A.waterHeater({ kind: "tank", bedrooms: 3, baths: 2 });
ok("tank: FHR + tank gallons", tank.peakHourFHR > 0 && tank.recommendedTankGal >= 40);
const tl = A.waterHeater({ kind: "tankless", simultaneousFixtures: 3, incomingF: 40, targetF: 120 });
ok("tankless: required GPM + cold-climate temp rise", tl.requiredGPM === 6 && tl.tempRiseF === 80);
ok("tankless note warns cold groundwater cuts rated GPM", /cold groundwater|rise/i.test(tl.note));

// ---- analyze wiring + guardrails ----
const full = A.analyze({ fixtures: [{ type: "water-closet", count: 1 }, { type: "lavatory", count: 1 }] });
ok("analyze returns loads + drain + supply", full.wsfu === 3.5 && !!full.drain && !!full.supply);
ok("analyze drain applies WC rule automatically", full.drain.recommendedDrain === '3"');
ok("labeled ESTIMATE + defers to licensed plumber + AHJ", /ESTIMATE/.test(full.label) && /licensed plumber/i.test(full.note) && /AHJ/.test(full.note));
ok("IPC-edition verify present", /verify the AHJ/i.test(full.note));
ok("no pricing anywhere", !/\$\d|"(price|cost|rate)"\s*:\s*\d/.test(JSON.stringify(full)));
// flat per-type counts drive the same calc (so a simple form works)
const flat = A.analyze({ wc: 2, lav: 2, shower: 1, ksink: 1 });
ok("flat counts build fixtures[] (WSFU matches explicit array)", flat.wsfu === A.fixtureUnits([{ type: "water-closet", count: 2 }, { type: "lavatory", count: 2 }, { type: "shower", count: 1 }, { type: "kitchen-sink", count: 1 }]).wsfu);

console.log("\n" + (fail ? "✗ " : "✓ ") + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
