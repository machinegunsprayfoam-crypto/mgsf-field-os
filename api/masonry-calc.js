// Klyfton MASONRY — takeoff for a CMU-block or brick wall (GC estimate, or check a mason's count).
// One of the sub-trade quantity engines.
//
// GROUNDED, NOT FABRICATED (hard rules): units-per-wall is the standard published coverage per unit
// type (NCMA/BIA), applied to wall area — labeled ESTIMATE; mortar + grout are standard rules-of-thumb,
// overridable. It NEVER designs the wall: reinforcing SIZE/spacing, grouted-cell schedule, and
// structural/seismic are a TMS 402/602 + IBC/IRC + engineer call — this only counts material. No pricing.
//
// Keyless, deterministic, no npm. POST { wallArea | length+height, unit, waste, groutedCellPct } · GET -> shape.

function num(v, d) { const n = parseFloat(v); return Number.isFinite(n) ? n : (d || 0); }
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// Units per SQ FT of wall face (with standard 3/8" joint) + mortar bags per 100 units — published, ESTIMATE.
const UNITS = {
  "cmu-8":    { label: "CMU 8x8x16", perSqft: 1.125, mortarBagsPer100: 3.0, cellCuFtPer100: 8.3 },  // 8" block
  "cmu-12":   { label: "CMU 12x8x16", perSqft: 1.125, mortarBagsPer100: 3.5, cellCuFtPer100: 12.5 },
  "brick-mod":{ label: "Modular brick", perSqft: 6.86, mortarBagsPer100: 0.7, cellCuFtPer100: 0 },   // ~7 brick/sqft
  "brick-std":{ label: "Standard brick", perSqft: 6.55, mortarBagsPer100: 0.7, cellCuFtPer100: 0 },
};

function takeoff(body) {
  body = body || {};
  const area = body.wallArea != null ? Math.max(0, num(body.wallArea)) : (Math.max(0, num(body.length)) * Math.max(0, num(body.height)));
  const key = UNITS[String(body.unit || "cmu-8").toLowerCase()] ? String(body.unit).toLowerCase() : "cmu-8";
  const u = UNITS[key];
  const waste = clamp(num(body.waste, 0.05), 0, 0.4);           // 5% default — block breakage is low
  if (area <= 0) return { ok: false, error: "no_wall_area", note: "Enter wallArea (or length×height) of the wall FACE in sq ft." };

  const units = Math.ceil(area * u.perSqft * (1 + waste));
  const mortarBags = Math.ceil((units / 100) * u.mortarBagsPer100);
  const out = {
    ok: true,
    label: "ESTIMATE — unit count uses standard coverage per unit type; mortar/grout are rules-of-thumb (verify per your unit + joint). Reinforcing/structural = TMS 402/602 + AHJ/engineer, NOT designed here. No pricing.",
    inputs: { wallArea: Math.round(area), unit: u.label, wastePct: Math.round(waste * 100) },
    units,
    mortarBags: { bags: mortarBags, note: "type-N/S/M mortar — ESTIMATE @ " + u.mortarBagsPer100 + " bags/100 units; mortar TYPE per the load (TMS 602)" },
    note: "Control/expansion joints, flashing + weep holes at veneer base, and cold-weather protection (<40°F) per the drawings/AHJ.",
  };
  // grouted cells (reinforced CMU)? offer grout volume
  const grPct = clamp(num(body.groutedCellPct, 0), 0, 1);
  if (u.cellCuFtPer100 > 0 && grPct > 0) {
    const groutCuFt = (units / 100) * u.cellCuFtPer100 * grPct;
    out.grout = { cubicYards: Math.round((groutCuFt / 27) * 100) / 100, groutedCellPct: Math.round(grPct * 100), note: "grout for filled cells — ESTIMATE; grout SIZE/spacing per the engineer/TMS" };
  }
  return out;
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({ ok: true, service: "masonry-calc", pure: true, priced: false,
      units: Object.keys(UNITS), shape: { wallArea: 0, length: 0, height: 0, unit: "cmu-8", waste: 0.05, groutedCellPct: 0 },
      note: "POST wall FACE area (or length×height, ft) + unit type → block/brick count + mortar bags (+ grout for filled cells). Standard coverage, ESTIMATE. Reinforcing/structural deferred to TMS 402/602 + AHJ. No pricing." });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body; if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  try { res.status(200).json(takeoff(body || {})); }
  catch (e) { res.status(200).json({ ok: false, error: String((e && e.message) || e).slice(0, 160) }); }
};

module.exports.takeoff = takeoff;
module.exports.UNITS = UNITS;
