#!/usr/bin/env node
// Trade pack — per-trade toolbox (api/trade-pack.js). Run: `node tests/trade-pack.js`. Deterministic,
// keyless. Covers curated packs (code/permit/license/safety/checklist) for the named trades, the
// generic honest fallback, calculators pulled from construction wiring, and the guardrails: GUIDANCE
// (verify AHJ/state), no pricing, nothing fabricated.

const path = require("path");
const A = require(path.join(__dirname, "..", "api", "trade-pack.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

console.log("Trade pack (per-trade toolbox)\n");

// ---- curated packs carry the right code + real detail ----
const el = A.pack("electrical");
ok("electrical cites NEC", /NEC/.test(el.code) && el.curated === true);
ok("electrical calculators include electrical-load (not sub-bid)", el.calculators.includes("electrical-load") && !el.calculators.includes("sub-bid"));
ok("electrical has safety + checklist arrays", el.safety.length > 0 && el.checklist.length > 0);
ok("plumbing cites IPC", /IPC/.test(A.pack("plumbing").code));
ok("HVAC cites Manual J + ASHRAE 62.2", /Manual J/.test(A.pack("hvac").code) && /62\.2/.test(A.pack("hvac").checklist.join(" ")));
ok("framing cites IRC span tables", /IRC/.test(A.pack("framing").code) && /span tables/i.test(A.pack("framing").checklist.join(" ")));
ok("electrical license flags the state board + verify", /verify/i.test(el.license) && /board/i.test(el.license));
ok("electrical permit names inspections + verify AHJ", /rough-in/i.test(el.permit) && /AHJ/.test(el.permit));

// ---- MGSF self-perform pack ----
const sf = A.pack("spray-foam");
ok("spray-foam pack: self-perform + points to skills", sf.selfPerform === true && /skills/i.test(sf.note));
ok("spray-foam calculators include foam-calc + rvalue-calc", sf.calculators.includes("foam-calc") && sf.calculators.includes("rvalue-calc"));

// ---- newly curated sub trades cite the right governing code ----
ok("masonry cites TMS 402/602", /TMS 402\/602/.test(A.pack("masonry").code) && A.pack("masonry").curated === true);
ok("drywall cites GA-216", /GA-216/.test(A.pack("drywall").code) && A.pack("drywall").curated === true);
ok("fire suppression cites NFPA 13", /NFPA 13/.test(A.pack("fire").code) && A.pack("fire").curated === true);
ok("excavation cites OSHA Subpart P + 811", /Subpart P/.test(A.pack("excavation").code) && /811/.test(A.pack("excavation").permit));
ok("concrete-flatwork cites ACI 318", /ACI 318/.test(A.pack("concrete-flatwork").code) && A.pack("concrete-flatwork").curated === true);
ok("roofing-shingle cites IRC R905 + ice barrier", /R905/.test(A.pack("roofing-shingle").code) && /ice/i.test(A.pack("roofing-shingle").code));
ok("metal cites AISC/AISI", /AISC|AISI/.test(A.pack("metal").code) && A.pack("metal").curated === true);
ok("doors-windows cites egress + safety glazing", /R310/.test(A.pack("doors-windows").code) && /R308/.test(A.pack("doors-windows").code));
ok("sitework cites 811 locate", /811/.test(A.pack("sitework").code) || /811/.test(A.pack("sitework").permit));
ok("seawall flags USACE/marine permits", /USACE/.test(A.pack("seawall").permit) && A.pack("seawall").curated === true);
ok("air-vapor cites ASTM air-barrier + Zone 6/7 vapor rule", /E2178|E2357/.test(A.pack("air-vapor").code) && /Zone 6\/7/.test(A.pack("air-vapor").code));
ok("soil-stabilization defers to a geotech engineer", /geotech/i.test(A.pack("soil-stabilization").code));

// ---- every construction trade now has a curated pack (no honest-but-thin fallbacks left) ----
const construction = require(path.join(__dirname, "..", "api", "construction.js"));
const uncurated = (construction.TRADES || []).map((t) => t.id).filter((id) => !A.PACKS[id]);
ok("every construction trade is curated", uncurated.length === 0, uncurated.join(","));

// ---- generic fallback still exists + is honest for any future/unknown-but-real trade ----
ok("GENERIC fallback stays honest (verify AHJ/state, never fabricated)", /verify/i.test(A.GENERIC.code) && /verify/i.test(A.GENERIC.license) && Array.isArray(A.GENERIC.safety));

// ---- guardrails ----
ok("labeled GUIDANCE + verify", /GUIDANCE/.test(el.label) && /verify/i.test(el.label));
ok("unknown trade ⇒ error + list", A.pack("spaceship").ok === false && Array.isArray(A.pack("spaceship").trades));
ok("no pricing anywhere in ANY pack", (construction.TRADES || []).every((t) => !/\$\d|"(price|cost|rate)"\s*:\s*\d/.test(JSON.stringify(A.pack(t.id)))));

console.log("\n" + (fail ? "✗ " : "✓ ") + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
