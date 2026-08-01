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

// ---- generic fallback (honest, not fabricated) ----
const gen = A.pack("masonry");
ok("uncurated trade ⇒ generic pack, curated:false", gen.curated === false && gen.ok === true);
ok("generic code/license say 'verify with the AHJ / state'", /verify/i.test(gen.code) && /verify/i.test(gen.license));
ok("generic still carries materials from construction", Array.isArray(gen.materials));

// ---- guardrails ----
ok("labeled GUIDANCE + verify", /GUIDANCE/.test(el.label) && /verify/i.test(el.label));
ok("unknown trade ⇒ error + list", A.pack("spaceship").ok === false && Array.isArray(A.pack("spaceship").trades));
ok("no pricing anywhere in a pack", !/\$\d|"(price|cost|rate)"\s*:\s*\d/.test(JSON.stringify(el)));

console.log("\n" + (fail ? "✗ " : "✓ ") + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
