// Klyfton AIR/VAPOR BARRIER — the quantity + code-guidance engine for the air-vapor self-perform
// trade that had none. Covers fluid-applied barriers (gallons from coverage) and sheet/membrane
// (area + overlap → rolls), plus the cold-climate vapor-control rule for Zone 6/7 (MT/ND/SD/WY).
//
// GROUNDED, NOT FABRICATED (doctrine + hard rules):
//   • Gallons/area are deterministic from the coverage rate or wet-mil the OWNER enters (from the TDS)
//     — never a guessed product rate. SETS/units only when a unit size is given.
//   • Vapor-retarder guidance is the published IRC/IECC cold-climate rule (Zones 5–8 → interior vapor
//     control), flagged "verify the AHJ." Sales-grade guidance, NOT a code ruling.
//   • Air-sealing a combustion home ⇒ CAZ combustion-safety flag (same hard rule as the BPI side).
//   • No pricing; ESTIMATE labels throughout.
//
// Keyless, deterministic, no npm. POST { method, area, coverageSqftPerGal|wetMils, waste, unitSize, zone?, combustion? }

function num(v, d) { const n = parseFloat(v); return Number.isFinite(n) ? n : d; }
function clean(s, max) { return String(s == null ? "" : s).trim().slice(0, max || 24); }
function round(n, p) { const f = Math.pow(10, p == null ? 2 : p); return Math.round(num(n, 0) * f) / f; }

const SQFT_PER_GAL_MIL = 1604;   // ft² a gallon covers at 1 wet mil (industry standard)
const METHODS = ["fluid", "membrane"];

// Fluid-applied: gallons from a TDS coverage rate, or from a target wet-mil. Owner-supplied only.
function fluidApplied(area, opts) {
  opts = opts || {};
  const a = Math.max(0, num(area, 0));
  const waste = Math.min(0.5, Math.max(0, num(opts.waste, 0.1)));
  let coverage = num(opts.coverageSqftPerGal, null);
  let basis = "coverage rate (owner/TDS)";
  if (coverage == null && opts.wetMils != null) { const wm = Math.max(0.1, num(opts.wetMils, 0)); coverage = round(SQFT_PER_GAL_MIL / wm); basis = "target " + wm + " wet mil (1604 ÷ mils)"; }
  const out = { method: "fluid", area: round(a), wastePct: round(waste * 100, 0), areaWithWaste: round(a * (1 + waste)) };
  if (coverage == null || coverage <= 0) { out.needs = "coverageSqftPerGal (from the product TDS) or a target wetMils"; return out; }
  out.coverageSqftPerGal = round(coverage); out.coverageBasis = basis;
  out.gallons = round(out.areaWithWaste / coverage);
  const unit = num(opts.unitSize, null); // e.g. 5-gal pail
  if (unit && unit > 0) { out.unitSize = round(unit); out.unitsToOrder = Math.ceil(out.gallons / unit); }
  return out;
}

// Sheet/membrane: area + overlap/waste; rolls if the roll coverage is given.
function membrane(area, opts) {
  opts = opts || {};
  const a = Math.max(0, num(area, 0));
  const waste = Math.min(0.6, Math.max(0, num(opts.waste != null ? opts.waste : opts.overlapPct, 0.15))); // laps + trim, default 15%
  const out = { method: "membrane", area: round(a), wastePct: round(waste * 100, 0), areaWithWaste: round(a * (1 + waste)) };
  const roll = num(opts.rollSqft, null);
  if (roll && roll > 0) { out.rollSqft = round(roll); out.rollsToOrder = Math.ceil(out.areaWithWaste / roll); }
  else out.needs = "rollSqft (coverage per roll, from the product) to get roll count";
  return out;
}

// Cold-climate vapor control (IRC R702.7 / IECC). Zones 5–8 → interior vapor retarder on the warm side.
function vaporGuidance(zone, opts) {
  opts = opts || {};
  const z = Math.round(num(zone, 6));
  const cold = z >= 5;
  const g = {
    zone: z,
    vaporControl: cold
      ? "Interior vapor retarder (Class I or II) typically required on the warm-in-winter (interior) side in Climate Zone " + z + " (IRC R702.7 / IECC)."
      : "Vapor-retarder class varies by zone/assembly — verify the AHJ.",
    note: "Closed-cell SPF at roughly ≥1.5–2\" is itself a Class II vapor retarder, so a separate interior retarder is often not needed with closed-cell — verify the assembly + AHJ. Open-cell needs a separate vapor retarder in cold climates.",
    verify: "Vapor-retarder class + placement is an assembly + AHJ call — confirm with mgsf-codes-permits / the building official. Sales-grade guidance, not a code ruling.",
  };
  if (opts.combustion) g.safetyFlag = "Combustion-safety (CAZ) testing required before tightening a home with atmospheric gas/propane/oil appliances — air-sealing can worsen backdrafting/CO.";
  return g;
}

function calc(body) {
  body = body || {};
  const method = METHODS.indexOf(clean(body.method, 12)) >= 0 ? clean(body.method, 12) : "fluid";
  const area = num(body.area, null);
  if (area == null || area <= 0) return { ok: false, error: "need_area", note: "POST { method:'fluid|membrane', area(SF), coverageSqftPerGal|wetMils (fluid) or rollSqft (membrane), zone?, combustion? }" };
  const material = method === "membrane" ? membrane(area, body) : fluidApplied(area, body);
  const vapor = vaporGuidance(body.zone, body);
  const out = { ok: true, label: "ESTIMATE — quantities only (owner prices via doctrine)", ...material, vapor,
    verify: ["Confirm the product's coverage/wet-mil against the TDS.", "Confirm vapor-retarder class + placement with the AHJ (cold-climate assembly).", "Nothing here is a price."] };
  if (vapor.safetyFlag) out.safetyFlag = vapor.safetyFlag;
  out.pricing = { deferred: true, how: "Price via mgsf-estimator doctrine (locked rates, GM, mobilization). Never quote from this draft directly." };
  return out;
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({ ok: true, service: "air-barrier-calc", pure: true, priced: false, methods: METHODS,
      note: "POST { method:'fluid|membrane', area(SF), coverageSqftPerGal|wetMils (fluid) or rollSqft (membrane), waste?, unitSize?, zone?(default 6), combustion? }. Fluid → gallons (+ pails); membrane → area+overlap (+ rolls). Adds the cold-climate vapor-control rule (Zone 5–8 interior retarder) + a CAZ flag for combustion homes. Coverage rates are owner/TDS-entered; no pricing (deferred to doctrine); sales-grade guidance, not a code ruling." });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  try { res.status(200).json(calc(body || {})); }
  catch (e) { res.status(200).json({ ok: false, error: String((e && e.message) || e).slice(0, 140) }); }
};

module.exports.fluidApplied = fluidApplied;
module.exports.membrane = membrane;
module.exports.vaporGuidance = vaporGuidance;
module.exports.calc = calc;
