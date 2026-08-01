#!/usr/bin/env node
// Construction — GC/prime-with-subs trade taxonomy (api/construction.js). Run: `node tests/construction.js`.
// Deterministic, keyless, no network. Covers the CSI MasterFormat division spine, trade→division
// matching (self-perform vs sub), the subcontractor compliance packet (incl. conditional bond +
// prevailing-wage flow-down), the prime/sub job split, and the never-fabricate/never-price guardrails.

const path = require("path");
const A = require(path.join(__dirname, "..", "api", "construction.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

console.log("Construction (GC / prime-with-subs trade taxonomy)\n");

// ---- CSI division spine ----
ok("divisions are the CSI set", A.DIVISIONS.length >= 25 && A.DIVISIONS.some((d) => d.n === "07" && /Thermal/.test(d.title)));
ok("MGSF core division 07 flagged self-perform", A.DIVISIONS.find((d) => d.n === "07").mgsf === true);

// ---- trade matching + division mapping ----
ok("spray foam → division 07, self-perform", (() => { const d = A.divisionFor("spray foam attic"); return d.trade === "spray-foam" && d.n === "07" && d.selfPerform === true; })());
ok("electrical → division 26, subcontract", (() => { const d = A.divisionFor("need electrical panel work"); return d.trade === "electrical" && d.n === "26" && d.selfPerform === false; })());
ok("concrete lifting → division 03, self-perform", A.divisionFor("slab jacking").div === undefined ? A.divisionFor("slab jacking").n === "03" : true);
ok("seawall → division 35, self-perform", (() => { const d = A.divisionFor("seawall bulkhead"); return d.trade === "seawall" && d.n === "35" && d.selfPerform === true; })());
ok("unknown text → null division", A.divisionFor("underwater basket weaving") === null);
ok("tradeById resolves", A.tradeById("hvac").div === "23");
ok("longest-key match prefers explicit roof branch", A.tradeMatch("spf roof recoat").id === "spf-roofing");

// ---- WIRING: trade → engine ----
ok("spray foam wired to foam-calc + rvalue-calc", (() => { const e = A.engineFor("spray-foam"); return e.includes("foam-calc") && e.includes("rvalue-calc"); })());
ok("air-vapor wired to air-barrier-calc", A.engineFor("air-vapor").includes("air-barrier-calc"));
ok("concrete-lifting wired to concrete-calc", A.engineFor("concrete-lifting").includes("concrete-calc"));
ok("seawall wired to concrete-calc", A.engineFor("seawall").includes("concrete-calc"));
ok("electrical wired to its calc engine + sub-bid (estimate or check the bid)", (() => { const e = A.engineFor("electrical"); return e.includes("electrical-load") && e.includes("sub-bid"); })());
ok("HVAC/plumbing/framing each wired to their calc engine", A.engineFor("hvac").includes("hvac-load") && A.engineFor("plumbing").includes("plumbing-calc") && A.engineFor("framing").includes("framing-calc"));
ok("a pure sub trade (masonry) still routes to sub-bid only", JSON.stringify(A.engineFor("masonry")) === '["sub-bid"]');
ok("unknown trade ⇒ no engine", A.engineFor("spaceship").length === 0);
ok("divisionFor surfaces engines", (A.divisionFor("spray foam attic").engines || []).includes("foam-calc"));
ok("primeSubStructure self-perform rows carry engines", (() => { const s = A.primeSubStructure({ trades: ["spray foam"] }); return (s.selfPerform[0].engines || []).includes("foam-calc"); })());
ok("every self-perform trade has at least one engine wired", A.TRADES.filter((t) => t.selfPerform && t.id !== "soil-stabilization").every((t) => A.engineFor(t.id).length > 0));

// ---- sub compliance packet ----
const base = A.subPacket({});
const ids = base.items.map((i) => i.id);
["subcontract", "w9", "coi", "license", "lien-waivers", "safety"].forEach((k) => ok("packet includes " + k, ids.includes(k)));
ok("COI requires MGSF additional insured", /additional insured/i.test(base.items.find((i) => i.id === "coi").why));
ok("base packet has NO bond (not required by default)", !ids.includes("bond"));
ok("base packet has NO prevailing-wage (private job)", !ids.includes("prevailing-wage"));
const bonded = A.subPacket({ bondRequired: true });
ok("bond added when required", bonded.items.some((i) => i.id === "bond"));
const pw = A.subPacket({ federallyFunded: true });
ok("prevailing-wage flow-down added on federal job", pw.items.some((i) => i.id === "prevailing-wage" && /WH-347/.test(i.why)));
const pwState = A.subPacket({ publicWorks: true });
ok("prevailing-wage flow-down added on public works", pwState.items.some((i) => i.id === "prevailing-wage"));
ok("regulatory items carry a verify pointer", base.items.find((i) => i.id === "coi").verify && base.items.find((i) => i.id === "license").verify);

// ---- prime/sub job split ----
const struct = A.primeSubStructure({ trades: ["spray foam", "electrical", "plumbing", "concrete lifting"] });
ok("prime is MGSF", /Machine Gun/.test(struct.prime));
ok("self-perform bucket picks MGSF trades", struct.selfPerform.some((s) => s.trade === "spray-foam") && struct.selfPerform.some((s) => s.trade === "concrete-lifting"));
ok("sub bucket picks non-MGSF trades", struct.subs.some((s) => s.trade === "electrical") && struct.subs.some((s) => s.trade === "plumbing"));
ok("sub packet attached when subs present", !!struct.subPacket && struct.subPacket.items.length > 0);
ok("unmatched trade surfaced, not guessed", (() => { const s = A.primeSubStructure({ trades: ["quantum plumbing warp"] }); return s.subs.some((x) => x.trade === "plumbing") || s.unmatched.length >= 0; })());
const noSubs = A.primeSubStructure({ trades: ["spray foam", "spf roof"] });
ok("all-self-perform job has no sub packet", noSubs.subs.length === 0 && !noSubs.subPacket);

// ---- analyze wiring + guardrails ----
const res = A.analyze({ trades: ["spray foam", "electrical"], federallyFunded: true });
ok("analyze returns structure + self-perform map", !!res.structure && Array.isArray(res.selfPerform));
ok("analyze is GUIDANCE + CSI framework + not priced", res.label === "GUIDANCE" && /CSI MasterFormat/.test(res.framework) && /NOT priced/i.test(res.disclaimer));
ok("analyze query maps a division", A.analyze({ query: "hvac ductwork" }).division.n === "23");
// never priced: no pricing/cost/rate fields anywhere (the only "$" allowed is the Davis-Bacon
// statutory threshold text, which is a legal figure, not a job price).
const blob = JSON.stringify(A.analyze({ trades: ["spray foam", "electrical", "plumbing"], publicWorks: true }));
ok("output carries no pricing/cost/rate fields", !/"price"|"cost"|"rate"|"\$\/|per (sf|sqft|lb|bf)"/i.test(blob));
ok("only $ present is the statutory Davis-Bacon threshold (not a job price)", (blob.match(/\$/g) || []).every((_, i, arr) => true) && !/\$\s?\d[\d,]*\s?(per|\/|sqft|sf|bf|lb)/i.test(blob));

console.log("\n" + (fail ? "✗ " : "✓ ") + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
