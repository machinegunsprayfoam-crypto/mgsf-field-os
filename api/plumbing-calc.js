// Klyfton PLUMBING — fixture-unit load + drain/supply pipe sizing + water-heater sizing by the IPC
// method (fixture units → pipe size). For GC work: size DWV + water supply, or check a sub plumber's plan.
//
// LIFE-SAFETY / NOT A DESIGN (hard rule): ESTIMATE + planning aid only. A LICENSED PLUMBER and the AHJ
// must design, stamp, and permit. Fixture-unit values are IPC-typical (Table 604.3 WSFU / Ch. 7 DFU) —
// they differ IPC vs UPC and by edition; verify the AHJ's adopted code. Never fabricated. No pricing.
//
// Keyless, deterministic, no npm.
// POST { action:"fixtures"|"drain"|"supply"|"waterheater", fixtures:[{type,count}], dfu?, wsfu?, hasWC?, ... }

function num(v, d) { const n = parseFloat(v); return Number.isFinite(n) ? n : d; }
function clean(s, max) { return String(s == null ? "" : s).trim().slice(0, max || 24); }
function round(n, p) { const f = Math.pow(10, p == null ? 1 : p); return Math.round(num(n, 0) * f) / f; }

// IPC-typical fixture units. wsfu = water-supply (Table 604.3), dfu = drainage (Ch. 7). wc = water closet.
const FIXTURES = {
  "water-closet":   { label: "Water closet (tank)", wsfu: 2.5, dfu: 3, wc: true },
  "lavatory":       { label: "Lavatory", wsfu: 1.0, dfu: 1 },
  "bathtub":        { label: "Bathtub / tub-shower", wsfu: 4.0, dfu: 2 },
  "shower":         { label: "Shower stall", wsfu: 2.0, dfu: 2 },
  "kitchen-sink":   { label: "Kitchen sink", wsfu: 1.4, dfu: 2 },
  "dishwasher":     { label: "Dishwasher", wsfu: 1.4, dfu: 2 },
  "clothes-washer": { label: "Clothes washer", wsfu: 1.4, dfu: 2 },
  "laundry-sink":   { label: "Laundry sink", wsfu: 1.4, dfu: 2 },
  "hose-bibb":      { label: "Hose bibb", wsfu: 2.5, dfu: 0 },
  "floor-drain":    { label: "Floor drain", wsfu: 0, dfu: 2 },
};
const IPC_NOTE = "IPC-typical values (differ IPC vs UPC + by edition) — verify the AHJ's adopted code. ESTIMATE + planning aid; a licensed plumber + the AHJ must design, stamp, and permit.";

// Building-drain sizing — IPC Table 710.1 typical caps at 1/4\"-per-ft slope (verify full table + slope).
const DRAIN = [{ size: '1.5"', dfu: 3 }, { size: '2"', dfu: 21 }, { size: '3"', dfu: 42 }, { size: '4"', dfu: 216 }, { size: '6"', dfu: 720 }];
// Rough WSFU → peak GPM (Hunter's-curve approximation, flush-tank). Size per IPC 604 w/ pressure + length.
const HUNTER = [[6, 5], [10, 8], [20, 14], [30, 20], [40, 25], [60, 33], [80, 40], [100, 44], [150, 55], [200, 65]];

function fixtureUnits(list) {
  const arr = Array.isArray(list) ? list : [];
  let wsfu = 0, dfu = 0, wc = 0; const items = [];
  for (const f of arr) {
    const key = clean(f && f.type, 30).toLowerCase(); const def = FIXTURES[key]; const cnt = Math.max(0, Math.round(num(f && f.count, 1)));
    if (!def || !cnt) { if (key) items.push({ type: key, unmatched: true }); continue; }
    wsfu += def.wsfu * cnt; dfu += def.dfu * cnt; if (def.wc) wc += cnt;
    items.push({ type: key, label: def.label, count: cnt, wsfu: round(def.wsfu * cnt, 1), dfu: def.dfu * cnt });
  }
  return { wsfu: round(wsfu, 1), dfu, waterClosets: wc, items };
}

function drainSize(dfu, opts) {
  opts = opts || {};
  const d = Math.max(0, num(dfu, 0));
  let pick = DRAIN.find((x) => x.dfu >= d) || DRAIN[DRAIN.length - 1];
  // A water closet needs a minimum 3" drain regardless of DFU count.
  if (opts.hasWC && (pick.size === '1.5"' || pick.size === '2"')) pick = DRAIN.find((x) => x.size === '3"');
  return { dfu: d, recommendedDrain: pick.size, basis: "IPC Table 710.1 (1/4\"/ft slope)", wcRule: opts.hasWC ? "Water closet present ⇒ 3\" minimum drain." : undefined, note: IPC_NOTE };
}

function supplyDemand(wsfu) {
  const w = Math.max(0, num(wsfu, 0));
  let gpm = HUNTER[HUNTER.length - 1][1];
  for (const [fu, g] of HUNTER) { if (w <= fu) { gpm = g; break; } }
  const size = gpm <= 8 ? '3/4"' : gpm <= 18 ? '1"' : gpm <= 33 ? '1-1/4"' : gpm <= 45 ? '1-1/2"' : '2"';
  return { wsfu: round(w, 1), peakGPM: gpm, roughSupplySize: size, basis: "Hunter's-curve approximation",
    note: "Rough only — actual supply size per IPC Table 604 depends on pressure, developed length, and fixture flow. " + IPC_NOTE };
}

// Rough water-heater sizing. Tankless: simultaneous fixtures × flow, at the cold-climate temp rise.
// Tank: first-hour rating should meet peak-hour demand (rough by bedrooms/baths).
function waterHeater(body) {
  const kind = /tankless/i.test(clean(body.kind, 12)) ? "tankless" : "tank";
  const beds = Math.max(0, Math.round(num(body.bedrooms, 0)));
  const baths = Math.max(1, num(body.baths, 1));
  if (kind === "tankless") {
    const simFix = Math.max(1, Math.round(num(body.simultaneousFixtures, 2)));
    const gpmPerFix = num(body.gpmPerFixture, 2.0);          // typical 1.5–2.5 gpm/fixture
    const incoming = num(body.incomingF, 40);                // cold-climate groundwater ~40°F
    const target = num(body.targetF, 120);
    const rise = Math.max(0, target - incoming);
    return { ok: true, kind, label: "ESTIMATE — tankless sizing", requiredGPM: round(simFix * gpmPerFix, 1), tempRiseF: rise,
      note: "Need a tankless rated for ~" + round(simFix * gpmPerFix, 1) + " GPM AT a " + rise + "°F rise (cold groundwater cuts a tankless's rated GPM — check the unit's GPM-at-rise curve). " + IPC_NOTE };
  }
  // Tank: rough first-hour-rating target by bedrooms + baths (DOE-style peak-hour).
  const fhr = Math.round((beds + 1) * 12 + baths * 10);
  const tankGal = fhr <= 40 ? 40 : fhr <= 55 ? 50 : fhr <= 80 ? 66 : 80;
  return { ok: true, kind, label: "ESTIMATE — tank sizing", peakHourFHR: fhr, recommendedTankGal: tankGal,
    note: "Rough peak-hour first-hour-rating target ≈ " + fhr + " gal/hr → ~" + tankGal + "-gal tank. Confirm against the unit's FHR + the household's real peak draw. " + IPC_NOTE };
}

// Convenience: build the fixtures[] array from flat per-type counts (so a simple form can drive it).
function fixturesFromFlat(body) {
  const map = { wc: "water-closet", lav: "lavatory", shower: "shower", tub: "bathtub", ksink: "kitchen-sink", dishwasher: "dishwasher", washer: "clothes-washer", floordrain: "floor-drain", hosebibb: "hose-bibb" };
  const out = []; for (const k in map) { const c = num(body[k], 0); if (c > 0) out.push({ type: map[k], count: c }); }
  return out;
}

function analyze(body) {
  body = body || {};
  if (!Array.isArray(body.fixtures)) { const flat = fixturesFromFlat(body); if (flat.length) body.fixtures = flat; }
  const action = clean(body.action, 16) || "fixtures";
  if (action === "drain") return { ok: true, ...drainSize(body.dfu != null ? body.dfu : (fixtureUnits(body.fixtures).dfu), { hasWC: body.hasWC || (fixtureUnits(body.fixtures).waterClosets > 0) }) };
  if (action === "supply") return { ok: true, ...supplyDemand(body.wsfu != null ? body.wsfu : fixtureUnits(body.fixtures).wsfu) };
  if (action === "waterheater") return waterHeater(body);
  // default: fixtures → both loads + both sizes
  const fu = fixtureUnits(body.fixtures);
  return { ok: true, label: "ESTIMATE — IPC fixture-unit load", ...fu,
    drain: drainSize(fu.dfu, { hasWC: fu.waterClosets > 0 }), supply: supplyDemand(fu.wsfu), note: IPC_NOTE };
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({ ok: true, service: "plumbing-calc", pure: true, priced: false, code: "IPC (verify AHJ edition)",
      fixtures: Object.keys(FIXTURES).map((k) => ({ type: k, label: FIXTURES[k].label, wsfu: FIXTURES[k].wsfu, dfu: FIXTURES[k].dfu })),
      actions: ["fixtures (WSFU+DFU load + both sizes)", "drain (DFU → drain size)", "supply (WSFU → GPM + size)", "waterheater"],
      note: "POST { action, fixtures:[{type,count}] | dfu | wsfu | (waterheater inputs) }. ESTIMATE + planning aid only — a LICENSED PLUMBER + the AHJ must design, stamp, and permit. IPC-typical values; verify the adopted edition. No pricing." });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  try { res.status(200).json(analyze(body || {})); }
  catch (e) { res.status(200).json({ ok: false, error: String((e && e.message) || e).slice(0, 140) }); }
};

module.exports.fixtureUnits = fixtureUnits;
module.exports.drainSize = drainSize;
module.exports.supplyDemand = supplyDemand;
module.exports.waterHeater = waterHeater;
module.exports.analyze = analyze;
module.exports.FIXTURES = FIXTURES;
