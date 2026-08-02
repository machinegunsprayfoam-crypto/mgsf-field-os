#!/usr/bin/env node
// Equipment-lookup — pure core of api/equipment-lookup.js. Run: `node tests/equipment-lookup.js`.
// Deterministic, keyless, no network (the live Anthropic call is injected via opts.call). Covers
// type normalization, typical-by-vintage ESTIMATE, spec range validation + derived values, response
// parsing, verified-only-with-a-source, the not-configured branch, and the never-fabricate guardrails.

const path = require("path");
const A = require(path.join(__dirname, "..", "api", "equipment-lookup.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

console.log("Equipment-lookup (AI make/model → specs, grounded)\n");

// ---- normType: aliases + junk ----
ok("normType furnace", A.normType("Furnace") === "furnace");
ok("normType heat pump alias", A.normType("heat pump") === "heat_pump");
ok("normType mini-split alias", A.normType("Mini-Split") === "mini_split");
ok("normType tankless → water_heater", A.normType("tankless") === "water_heater");
ok("normType unknown → null", A.normType("spaceship") === null);
ok("normType empty → null", A.normType("") === null);

// ---- typicalByVintage: buckets by install year, labeled ESTIMATE, never verified ----
const oldF = A.typicalByVintage("furnace", 1985);
ok("old furnace bucket picked", oldF && oldF.specs.afue[0] === 55, oldF && JSON.stringify(oldF.specs));
ok("vintage is ESTIMATE + unverified", oldF.estimate === true && oldF.verified === false);
ok("vintage source labeled", oldF.source === "typical-by-vintage");
const newF = A.typicalByVintage("furnace", 2020);
ok("new furnace bucket picked", newF && newF.specs.afue[1] === 98);
ok("no year ⇒ current-era typical", A.typicalByVintage("furnace").basis === "current-era typical");
ok("unknown type ⇒ null vintage", A.typicalByVintage("spaceship", 2000) === null);

// ---- parseEquipment: keep in-range specs, drop impossible ones (no fabrication) ----
let pe = A.parseEquipment("furnace", { specs: { afue: 96, inputBtu: 80000 } });
ok("valid furnace parsed", pe.found === true && pe.equipment.specs.afue === 96);
ok("output derived from input×AFUE", pe.equipment.specs.outputBtu === 76800, pe.equipment.specs.outputBtu);
ok("furnace flagged combustion", pe.equipment.combustion === true);
let bad = A.parseEquipment("furnace", { specs: { afue: 250, inputBtu: 80000 } });
ok("impossible AFUE 250 dropped", bad.equipment.specs.afue === undefined && bad.found === true);
let none = A.parseEquipment("furnace", { specs: { afue: 250 } });
ok("no valid specs ⇒ found:false", none.found === false);
let ac = A.parseEquipment("ac", { specs: { tons: 3 } });
ok("AC tons → capacityBtu derived", ac.equipment.specs.capacityBtu === 36000);
ok("AC not combustion", ac.equipment.combustion === false);
let hpwh = A.parseEquipment("water_heater", { fuel: "electric", specs: { uef: 3.2, gallons: 50 } });
ok("HPWH UEF>1 accepted", hpwh.equipment.specs.uef === 3.2);
ok("electric WH not combustion", hpwh.equipment.combustion === false);
let gasWh = A.parseEquipment("water_heater", { fuel: "Natural Gas", specs: { uef: 0.64, gallons: 40 } });
ok("gas WH flagged combustion (fuel-driven)", gasWh.equipment.combustion === true);
ok("unknown type ⇒ found:false", A.parseEquipment("spaceship", { specs: {} }).found === false);

// ---- isCombustionFuel ----
ok("propane is combustion", A.isCombustionFuel("Propane") === true);
ok("electric is not combustion", A.isCombustionFuel("Electric") === false);

// ---- extractJson: pull JSON + citation URLs out of an Anthropic response shape ----
const resp = { content: [
  { type: "text", text: 'Here: {"found":true,"type":"furnace","brand":"Trane","specs":{"afue":96,"inputBtu":80000},"sources":["https://trane.com/spec.pdf"]}' },
  { type: "web_search_tool_result", content: [{ url: "https://ahridirectory.org/x" }] },
] };
const ej = A.extractJson(resp);
ok("extractJson parses embedded object", ej.obj && ej.obj.found === true);
ok("extractJson collects sources (json + tool)", ej.sources.includes("https://trane.com/spec.pdf") && ej.sources.includes("https://ahridirectory.org/x"));

// ---- parseAiResult: verified only when a source is present ----
const r1 = A.parseAiResult(resp, "furnace");
ok("found + verified when sourced", r1.found === true && r1.verified === true && r1.equipment.specs.afue === 96);
const noSrc = { content: [{ type: "text", text: '{"found":true,"type":"furnace","specs":{"afue":96,"inputBtu":80000}}' }] };
ok("found but UNVERIFIED without a source", A.parseAiResult(noSrc, "furnace").verified === false);
const notFound = { content: [{ type: "text", text: '{"found":false}' }] };
ok("found:false honored (no guess)", A.parseAiResult(notFound, "furnace").found === false);
const garbage = { content: [{ type: "text", text: "no idea sorry" }] };
ok("unparseable ⇒ found:false", A.parseAiResult(garbage, "furnace").found === false);

// ---- buildPayload: forces web_search, demands JSON, forbids guessing ----
const pay = A.buildPayload("Trane", "S9V2", "furnace");
ok("payload includes web_search tool", pay.tools.some((t) => t.name === "web_search"));
ok("payload system forbids guessing", /NEVER guess/i.test(pay.system));
ok("payload user carries make+model", /Trane/.test(pay.messages[0].content) && /S9V2/.test(pay.messages[0].content));

// ---- lookup(): not-configured branch never fabricates but still offers ESTIMATE ----
(async () => {
  const nc = await A.lookup({ make: "Trane", model: "S9V2", type: "furnace", year: 1990 }, { key: "" });
  ok("no key ⇒ configured:false", nc.configured === false && nc.ok === true);
  ok("no key ⇒ found:false (no fabrication)", nc.found === false);
  ok("no key ⇒ still returns vintage fallback", nc.fallback && nc.fallback.source === "typical-by-vintage");

  // injected AI call (found + sourced)
  const okCall = async () => resp;
  const live = await A.lookup({ make: "Trane", model: "S9V2", type: "furnace" }, { key: "k", call: okCall });
  ok("configured live ⇒ found + verified", live.configured === true && live.found === true && live.verified === true);
  ok("live carries sources", Array.isArray(live.sources) && live.sources.length > 0);

  // injected AI call that throws ⇒ graceful, fallback still present
  const boom = async () => { throw new Error("anthropic_529"); };
  const failed = await A.lookup({ make: "X", model: "Y", type: "ac", year: 2005 }, { key: "k", call: boom });
  ok("live error ⇒ ok:true, found:false, error surfaced", failed.ok === true && failed.found === false && /529/.test(failed.error));
  ok("live error ⇒ fallback still offered", failed.fallback && failed.fallback.type === "ac");

  // no make/model ⇒ rejected
  const empty = await A.lookup({}, { key: "k" });
  ok("no make/model/serial ⇒ error", empty.ok === false && empty.error === "need_make_model");

  // ---- serial numbers ----
  ok("mfgDate keeps a value with a plausible year", A.mfgDate("2015-06") === "2015-06" && A.mfgDate("June 2018") === "June 2018");
  ok("mfgDate drops a value with no plausible year (no guess)", A.mfgDate("W12345") === null && A.mfgDate("") === null);
  const serialResp = { content: [{ type: "text", text: '{"found":true,"type":"furnace","brand":"Trane","serial":"1815ABCDEF","manufactureDate":"2018 (week 15)","specs":{"afue":96,"inputBtu":80000},"sources":["https://trane.com/spec.pdf"]}' }] };
  const pr = A.parseAiResult(serialResp, "furnace");
  ok("serial parsed from AI result", pr.equipment.serial === "1815ABCDEF");
  ok("manufacture date kept when it has a plausible year", pr.equipment.manufactureDate === "2018 (week 15)");
  const badMfg = { content: [{ type: "text", text: '{"found":true,"type":"furnace","serial":"X1","manufactureDate":"unknown","specs":{"afue":96,"inputBtu":80000},"sources":["https://x.com"]}' }] };
  ok("implausible manufacture date dropped", A.parseAiResult(badMfg, "furnace").equipment.manufactureDate === undefined);
  ok("buildPayload includes serial + forbids guessing the mfg date", (() => { const p = A.buildPayload("Trane", "S9V2", "furnace", null, "1815ABC"); return /1815ABC/.test(p.messages[0].content) && /NEVER guess[\s\S]*manufacture date/i.test(p.system); })());
  // user serial is authoritative — carried back even when the model isn't found
  const notFoundSerial = await A.lookup({ make: "Weird", model: "ZZZ", serial: "SN-USER-1", type: "ac" }, { key: "k", call: async () => ({ content: [{ type: "text", text: '{"found":false}' }] }) });
  ok("serial echoed back even when model not found", notFoundSerial.found === false && notFoundSerial.equipment && notFoundSerial.equipment.serial === "SN-USER-1");
  // serial-only (no make/model) is a valid lookup
  const serialOnly = await A.lookup({ serial: "SN-ONLY" }, { key: "" });
  ok("serial-only is accepted (not rejected)", serialOnly.ok === true && serialOnly.equipment.serial === "SN-ONLY");

  console.log("\n" + (fail ? "✗ " : "✓ ") + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
