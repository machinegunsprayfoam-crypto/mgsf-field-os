#!/usr/bin/env node
// Photo-estimate — pure decision core of api/photo-estimate.js. Run: `node tests/photo-estimate.js`.
// Deterministic, keyless, no network. Covers the area-source logic (provided vs measured via
// measure.js), missing-input detection, the measure→foam-calc stitch, the verify prompts, and the
// hard guardrails: quantities are ESTIMATE/draft only and a customer PRICE is NEVER computed here.

const path = require("path");
const A = require(path.join(__dirname, "..", "api", "photo-estimate.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

console.log("Photo-estimate (photo → draft quantity estimate)\n");

// ---- area provided directly ----
const prov = A.estimate({ service: "spray foam", area: 1000, type: "closed", thickness: 2 });
ok("provided area ⇒ areaSource 'provided'", prov.areaSource === "provided" && prov.area === 1000);
ok("foam quantities computed when area present", prov.foam && prov.foam.boardFeet === 2000 && prov.foam.setsToOrder != null);
ok("ok:true when area resolvable", prov.ok === true && prov.missing.length === 0);

// ---- area from measurements (measure.js stitch) ----
const wall = A.estimate({ service: "spray foam", measure: { mode: "wall", perimeter: 100, height: 10 }, type: "closed", thickness: 2 });
ok("wall measure ⇒ net area + 'measured (wall)'", wall.area === 1000 && wall.areaSource === "measured (wall)");
const roof = A.estimate({ service: "spf roofing", measure: { mode: "roof", footprint: 1000, pitchRise: 6 }, type: "closed", thickness: 2 });
ok("roof measure ⇒ uses roof area with waste", roof.area != null && /measured \(roof\)/.test(roof.areaSource));
ok("measure object echoed back", wall.measure && wall.measure.mode === "wall");

// ---- missing input ----
const none = A.estimate({ service: "spray foam" });
ok("no area + no measure ⇒ missing area, ok:false", none.ok === false && none.missing.some((m) => /area/i.test(m)) && none.foam == null);

// ---- verify prompts ----
ok("default thickness ⇒ verify thickness note", A.estimate({ area: 500 }).verify.some((v) => /thickness/i.test(v)));
ok("no costPerSet ⇒ verify material-cost note", A.estimate({ area: 500 }).verify.some((v) => /cost/i.test(v)));
ok("visionNotes ⇒ verify confirm-photo note", A.estimate({ area: 500, visionNotes: "metal building, ~2000sf" }).verify.some((v) => /photo read/i.test(v)));

// ---- guardrails: draft only, ESTIMATE, price NEVER computed ----
ok("draftOnly + ESTIMATE label", prov.draftOnly === true && /ESTIMATE/.test(prov.label));
ok("pricing is deferred to doctrine (never computed here)", prov.pricing && prov.pricing.deferred === true && /mgsf-estimator/i.test(prov.pricing.how));
ok("service defaults when omitted", A.estimate({ area: 500 }).service === "spray foam insulation");
// no COMPUTED customer price anywhere (quantities only; the only "$" allowed is the doctrine
// deferral note's job-minimum reference, which is guidance, not a computed bid).
const blob = JSON.stringify(prov);
ok("no computed price/sellPrice/total field", !/"(price|sellPrice|total|quote|bid)"\s*:\s*\d/i.test(blob));
ok("only $ present is the doctrine deferral note (not a bid figure)", !/\$\d[\d,]*\s*(bid|quote|total|price)/i.test(blob));
// owner's real per-set cost is used by foam-calc but a bid price is still NOT produced here
const withCost = A.estimate({ area: 1000, type: "closed", thickness: 2, costPerSet: 1600 });
ok("costPerSet flows to foam-calc but pricing still deferred", withCost.foam != null && withCost.pricing.deferred === true);

console.log("\n" + (fail ? "✗ " : "✓ ") + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
