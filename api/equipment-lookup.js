// Klyfton EQUIPMENT LOOKUP — the AI helper that finds an HVAC / water-heater unit's real specs
// from its make + model and auto-loads them, so the auditor never hand-keys a nameplate. This is
// the OptiMiser/Snugg "enter make & model → specs load" helper, rebuilt for MGSF.
//
// GROUNDED, NEVER FABRICATED (doctrine golden rule #1):
//   • Live path FORCES a web_search and only marks a spec value `verified:true` when the model
//     returns a real source URL. No source ⇒ not verified.
//   • If the specific model can't be found, it returns found:false — it does NOT invent a real
//     unit's AFUE/SEER/nameplate. Out-of-range values are dropped.
//   • Keyless, deterministic TYPICAL-BY-VINTAGE fallback (US federal minimum-efficiency eras —
//     public engineering fact) is always offered, clearly labeled ESTIMATE — never claimed to be
//     the looked-up unit's actual spec.
//
// Gated live layer (module pattern): absent ANTHROPIC_API_KEY ⇒ configured:false (still returns
// the vintage ESTIMATE so the panel stays useful). No npm; global fetch only.
//
// POST { make, model, type?, year? } -> { ok, configured, found, verified, equipment:{}, sources:[], fallback:{} }
// GET                                 -> shape + supported types + the vintage table

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const WEB_TOOL = { type: "web_search_20260209", name: "web_search", max_uses: 3 };

function _env(re) { for (const k of Object.keys(process.env)) { if (re.test(k) && process.env[k]) return process.env[k]; } return undefined; }
function clean(s, max) { return String(s == null ? "" : s).trim().slice(0, max || 120); }
function numOr(v, d) { const n = parseFloat(v); return Number.isFinite(n) ? n : d; }
function round(n, p) { const f = Math.pow(10, p || 0); return Math.round(n * f) / f; }

// ---- Supported equipment + per-spec sanity ranges [min, max, unit]. Anything outside ⇒ dropped
// as unverifiable (a real nameplate never reads AFUE 250%). Ranges are deliberately generous.
const TYPES = {
  furnace:      { combustion: true,  label: "Furnace",           specs: { afue: [30, 100, "%"], inputBtu: [10000, 300000, "BTU/hr"], outputBtu: [8000, 280000, "BTU/hr"], stages: [1, 3, ""] } },
  boiler:       { combustion: true,  label: "Boiler",            specs: { afue: [30, 100, "%"], inputBtu: [10000, 400000, "BTU/hr"] } },
  water_heater: { combustion: null,  label: "Water heater",      specs: { uef: [0.3, 4.5, "UEF"], ef: [0.3, 4.5, "EF"], gallons: [2, 120, "gal"], inputBtu: [3000, 250000, "BTU/hr"], gpm: [0.5, 15, "GPM"] } },
  ac:           { combustion: false, label: "Central AC",        specs: { seer2: [8, 30, "SEER2"], seer: [8, 42, "SEER"], eer: [6, 20, "EER"], capacityBtu: [6000, 120000, "BTU"], tons: [0.5, 20, "tons"] } },
  heat_pump:    { combustion: false, label: "Heat pump",         specs: { seer2: [8, 30, "SEER2"], seer: [8, 42, "SEER"], hspf2: [4, 14, "HSPF2"], hspf: [5, 16, "HSPF"], capacityBtu: [6000, 120000, "BTU"], tons: [0.5, 20, "tons"], cop: [1, 6, ""] } },
  mini_split:   { combustion: false, label: "Ductless mini-split", specs: { seer2: [10, 45, "SEER2"], hspf2: [5, 16, "HSPF2"], capacityBtu: [6000, 60000, "BTU"], cop: [1, 6, ""] } },
};
const TYPE_ALIASES = {
  furnace: "furnace", gasfurnace: "furnace", boiler: "boiler",
  waterheater: "water_heater", dhw: "water_heater", tankless: "water_heater", heatpumpwaterheater: "water_heater", hpwh: "water_heater",
  ac: "ac", centralac: "ac", airconditioner: "ac", condenser: "ac",
  heatpump: "heat_pump", hp: "heat_pump", minisplit: "mini_split", ductless: "mini_split",
};
function normType(t) { const k = String(t == null ? "" : t).toLowerCase().replace(/[^a-z]/g, ""); return TYPE_ALIASES[k] || (TYPES[k] ? k : null); }

// ---- TYPICAL-BY-VINTAGE (US federal minimum-efficiency history — public engineering fact, ESTIMATE).
// Buckets are "installed before <year>". Values are typical RANGES, never a specific unit's spec.
const VINTAGE = {
  furnace: [
    { before: 1992, afue: [55, 70], note: "atmospheric / standing pilot" },
    { before: 2013, afue: [78, 80], note: "≈78% federal-minimum era" },
    { before: 9999, afue: [80, 98], note: "80% standard or 90–98% condensing (2013+)" },
  ],
  boiler: [
    { before: 2012, afue: [75, 84], note: "cast-iron atmospheric era" },
    { before: 9999, afue: [82, 96], note: "82% min / 90%+ condensing" },
  ],
  water_heater: [
    { before: 2015, ef: [0.55, 0.62], note: "pre-2015 storage" },
    { before: 9999, uef: [0.60, 3.5], note: "0.6–0.7 storage; 2.0–3.5 heat-pump" },
  ],
  ac: [
    { before: 2006, seer: [8, 10], note: "SEER 8–10 era" },
    { before: 2015, seer: [13, 14], note: "13 SEER minimum" },
    { before: 9999, seer2: [13.4, 20], note: "SEER2 ≥13.4 (North), high-eff to ~20" },
  ],
  heat_pump: [
    { before: 2015, seer: [10, 13], hspf: [6.8, 8], note: "older split HP" },
    { before: 9999, seer2: [14.3, 20], hspf2: [7.5, 10], note: "SEER2 ≥14.3 / HSPF2 ≥7.5" },
  ],
  mini_split: [
    { before: 9999, seer2: [16, 30], hspf2: [8, 12], note: "typical ductless range" },
  ],
};
function yr(v) { const n = Math.round(numOr(v, 0)); return n >= 1900 && n <= 2100 ? n : null; }
function typicalByVintage(type, year) {
  const t = normType(type); if (!t || !VINTAGE[t]) return null;
  const buckets = VINTAGE[t];
  const b = (year ? buckets.find((x) => year < x.before) : null) || buckets[buckets.length - 1];
  const { before, note, ...specs } = b;
  return { type: t, label: TYPES[t].label, basis: year ? ("installed ~" + year) : "current-era typical", note, specs, source: "typical-by-vintage", verified: false, estimate: true };
}

// ---- Pure: coerce/validate one equipment result against the type's sane ranges.
function parseEquipment(type, raw) {
  const t = normType(type) || normType(raw && raw.type);
  if (!t) return { found: false, reason: "unknown_type" };
  const schema = TYPES[t].specs;
  const rawSpecs = (raw && (raw.specs || raw)) || {};
  const specs = {}; let kept = 0;
  for (const key of Object.keys(schema)) {
    const [lo, hi] = schema[key];
    const v = numOr(rawSpecs[key], null);
    if (v != null && v >= lo && v <= hi) { specs[key] = round(v, 2); kept++; }
  }
  // Derived niceties (labeled): furnace output from input×AFUE; tons↔BTU for cooling.
  if (t === "furnace" && specs.inputBtu && specs.afue && specs.outputBtu == null) specs.outputBtu = round(specs.inputBtu * specs.afue / 100, 0);
  if ((t === "ac" || t === "heat_pump") && specs.capacityBtu && specs.tons == null) specs.tons = round(specs.capacityBtu / 12000, 1);
  if ((t === "ac" || t === "heat_pump") && specs.tons && specs.capacityBtu == null) specs.capacityBtu = round(specs.tons * 12000, 0);
  const combustion = TYPES[t].combustion === true || (TYPES[t].combustion === null && isCombustionFuel(raw && raw.fuel));
  const eq = { type: t, label: TYPES[t].label, brand: clean(raw && raw.brand, 60) || undefined, model: clean(raw && raw.model, 60) || undefined,
    serial: clean(raw && raw.serial, 60) || undefined, fuel: clean(raw && raw.fuel, 40) || undefined, specs, combustion };
  const mfg = mfgDate(raw && raw.manufactureDate);
  if (mfg) eq.manufactureDate = mfg;
  return { found: kept > 0, equipment: eq };
}
function isCombustionFuel(f) { return /gas|propane|lp|oil|wood|pellet|diesel|kerosene/i.test(String(f || "")); }
// Manufacture date decoded from a serial is brand-specific and error-prone — only accept a value
// that carries a plausible 4-digit year (1970–2035); anything else is dropped (never guessed).
function mfgDate(v) { const s = clean(v, 40); if (!s) return null; const m = s.match(/(19[7-9]\d|20[0-3]\d)/); return m ? s : null; }

// ---- Pure: pull the model's JSON + collected web sources out of an Anthropic response object.
function extractJson(data) {
  const content = (data && data.content) || [];
  const sources = [];
  let jsonText = "";
  for (const block of content) {
    if (block && block.type === "text" && block.text) {
      jsonText += block.text;
      // capture inline citation URLs the search tool attaches
      const cits = block.citations || [];
      for (const c of cits) { if (c && c.url) sources.push(c.url); }
    }
    if (block && block.type === "web_search_tool_result") {
      const arr = (block.content && block.content.length) ? block.content : [];
      for (const r of arr) { if (r && r.url) sources.push(r.url); }
    }
  }
  let obj = null;
  const m = jsonText.match(/\{[\s\S]*\}/);
  if (m) { try { obj = JSON.parse(m[0]); } catch (e) { obj = null; } }
  if (obj && Array.isArray(obj.sources)) for (const u of obj.sources) { if (u) sources.push(String(u)); }
  return { obj, sources: uniq(sources).slice(0, 8) };
}
function uniq(a) { const s = new Set(), o = []; for (const x of a) { const k = String(x); if (!s.has(k)) { s.add(k); o.push(x); } } return o; }

// ---- Pure: turn a parsed Anthropic response into our result shape.
function parseAiResult(data, type) {
  const { obj, sources } = extractJson(data);
  if (!obj || obj.found === false) return { found: false, verified: false, sources };
  const parsed = parseEquipment(type || obj.type, obj);
  if (!parsed.found) return { found: false, verified: false, sources };
  const verified = sources.length > 0; // a value is only trustworthy if a real source backs it
  return { found: true, verified, equipment: parsed.equipment, sources };
}

function buildPayload(make, model, type, modelId, serial) {
  const t = normType(type);
  const sys =
    "You find real HVAC / water-heater equipment specifications from a make and model number. " +
    "You MUST use web_search to locate the manufacturer spec sheet, submittal, or AHRI listing for the EXACT model. " +
    "Return ONLY a JSON object, no prose: " +
    '{"found":true|false,"type":"furnace|boiler|water_heater|ac|heat_pump|mini_split","brand":"","model":"","serial":"","manufactureDate":"","fuel":"","specs":{...},"sources":["url"]}. ' +
    "Spec keys by type — furnace/boiler: afue,inputBtu,outputBtu,stages; water_heater: uef,ef,gallons,inputBtu,gpm; ac: seer2,seer,eer,capacityBtu,tons; heat_pump: seer2,seer,hspf2,hspf,capacityBtu,tons,cop; mini_split: seer2,hspf2,capacityBtu,cop. " +
    "Values are NUMBERS only (no units, no % sign). If a serial number is given, echo it back in \"serial\" and, ONLY if that brand's serial-date scheme is documented in a cited source, decode the manufacture date into \"manufactureDate\" (include a 4-digit year); otherwise leave manufactureDate empty. " +
    "RULES: include only spec values you actually found in a cited source, and list those source URLs in sources[]. " +
    "If you cannot find the specific model, return {\"found\":false}. NEVER guess, estimate, or infer a real unit's nameplate values or manufacture date — an unfound model is found:false, not a guess.";
  const user = "Find the specs for: make=\"" + make + "\", model=\"" + model + "\"" + (t ? (", type=\"" + t + "\"") : "") + (serial ? (", serial=\"" + serial + "\"") : "") + ".";
  return {
    model: modelId || _env(/EQUIP_MODEL$/i) || "claude-haiku-4-5",
    max_tokens: 1024,
    system: sys,
    tools: [WEB_TOOL],
    messages: [{ role: "user", content: user }],
  };
}

// live Anthropic call (with web_search pause_turn loop). Injectable via opts.call for tests.
async function callAI(key, payload) {
  let data;
  for (let i = 0; i < 4; i++) {
    const r = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(payload),
    });
    if (!r.ok) { const e = new Error("anthropic_" + r.status); e.detail = (await r.text()).slice(0, 200); throw e; }
    data = await r.json();
    if (data.stop_reason === "pause_turn") { payload = { ...payload, messages: payload.messages.concat([{ role: "assistant", content: data.content }]) }; continue; }
    break;
  }
  return data;
}

async function lookup(body, opts) {
  opts = opts || {};
  const make = clean(body.make, 60), model = clean(body.model, 60), serial = clean(body.serial, 60);
  const type = normType(body.type), year = yr(body.year);
  if (!make && !model && !serial) return { ok: false, error: "need_make_model", note: "POST { make, model, serial?, type?, year? }" };
  const fallback = typicalByVintage(type, year);
  const key = opts.key || _env(/ANTHROPIC_API_KEY$/i);
  // The user-entered serial is authoritative — always carry it back, even when the model isn't found.
  const withSerial = (eq) => { const e = eq || {}; if (serial && !e.serial) e.serial = serial; return e; };
  if (!key) return { ok: true, configured: false, found: false, verified: false, equipment: serial ? withSerial({ type: type || undefined }) : undefined, query: { make, model, serial, type, year }, fallback, note: "AI lookup needs ANTHROPIC_API_KEY. Showing typical-by-vintage ESTIMATE only — verify the nameplate." };
  try {
    const call = opts.call || callAI;
    const data = await call(key, buildPayload(make, model, type, opts.model, serial));
    const r = parseAiResult(data, type);
    return { ok: true, configured: true, found: r.found, verified: r.verified, equipment: (r.found || serial) ? withSerial(r.equipment) : undefined, sources: r.sources, query: { make, model, serial, type, year }, fallback,
      note: r.found ? (r.verified ? "Specs from cited source(s) — confirm against the nameplate." : "Model matched but no source cited — treat as UNVERIFIED; confirm the nameplate.") : "Model not found — enter the nameplate manually. Typical-by-vintage ESTIMATE shown as a placeholder only." };
  } catch (e) {
    return { ok: true, configured: true, found: false, verified: false, equipment: serial ? withSerial({ type: type || undefined }) : undefined, error: String((e && e.message) || e).slice(0, 140), query: { make, model, serial, type, year }, fallback, note: "Lookup failed — showing typical-by-vintage ESTIMATE. Verify the nameplate." };
  }
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({ ok: true, service: "equipment-lookup", grounded: true, fabricates: false,
      types: Object.keys(TYPES).map((k) => ({ id: k, label: TYPES[k].label, combustion: TYPES[k].combustion, specs: Object.keys(TYPES[k].specs) })),
      vintage: VINTAGE,
      note: "POST { make, model, serial?, type?, year? }. Forces a web_search; only marks specs verified when a real source is cited; returns found:false rather than guess a unit's nameplate. A serial number is captured/echoed for asset + warranty tracking and (only if the brand's serial-date scheme is cited) decoded to a manufacture date. Keyless typical-by-vintage ESTIMATE always offered. Verify against the nameplate." });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  try { res.status(200).json(await lookup(body || {}, {})); }
  catch (e) { res.status(200).json({ ok: false, error: String((e && e.message) || e).slice(0, 140) }); }
};

// pure exports for the brain + tests
module.exports.normType = normType;
module.exports.typicalByVintage = typicalByVintage;
module.exports.parseEquipment = parseEquipment;
module.exports.extractJson = extractJson;
module.exports.parseAiResult = parseAiResult;
module.exports.buildPayload = buildPayload;
module.exports.lookup = lookup;
module.exports.isCombustionFuel = isCombustionFuel;
module.exports.mfgDate = mfgDate;
module.exports.TYPES = TYPES;
module.exports.VINTAGE = VINTAGE;
