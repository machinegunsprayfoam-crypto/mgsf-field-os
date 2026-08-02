// Klyfton EXCAVATION / EARTHWORK — cut/fill volume takeoff (GC estimate, or check a sub's haul count).
// One of the sub-trade quantity engines.
//
// GROUNDED, NOT FABRICATED (hard rules): BANK volume is pure geometry (area × depth → cubic yards) —
// solid. Swell (loose/haul) and compaction (fill shrink) factors VARY BY SOIL and are only reliable
// from a geotech report — here they're standard typical ESTIMATES, exposed as overridable inputs and
// clearly labeled. Bearing capacity, shoring design, and dewatering are NOT computed. This is a
// quantity + haul aid, not a geotechnical or safety design. No pricing.
//
// SAFETY (non-negotiable, surfaced not computed): call 811 to locate utilities BEFORE any dig; a trench
// ≥5 ft deep needs a protective system (slope/shore/box) + a competent person per OSHA 1926 Subpart P.
//
// Keyless, deterministic, no npm. POST { area|length+width, depth(ft), trench?, swellPct, compactionPct, truckYd } · GET -> shape.

function num(v, d) { const n = parseFloat(v); return Number.isFinite(n) ? n : (d || 0); }
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

function takeoff(body) {
  body = body || {};
  const trench = body.trench === true;
  const depthFt = Math.max(0, num(body.depth, 0)) + Math.max(0, num(body.depthIn, 0)) / 12;
  // area: given, or L×W (area dig); trench: L×W(=trench width)×depth
  const area = body.area != null ? Math.max(0, num(body.area)) : (Math.max(0, num(body.length)) * Math.max(0, num(body.width)));
  const swell = clamp(num(body.swellPct, 0.25), 0, 1);          // typical common soil ~25% — ESTIMATE
  const shrink = clamp(num(body.compactionPct, 0.15), 0, 0.6);  // typical fill shrink ~15% — ESTIMATE
  const truckYd = clamp(num(body.truckYd, 10), 1, 30);          // end-dump ~10-12 cy — ESTIMATE
  if (area <= 0 || depthFt <= 0) return { ok: false, error: "need_area_and_depth", note: "Enter area (or length×width) in ft and depth in ft (depthIn optional)." };

  const bankCuFt = area * depthFt;
  const bankCuYd = bankCuFt / 27;
  const looseCuYd = bankCuYd * (1 + swell);                     // hauled-out (loose) volume
  const truckLoads = Math.ceil(looseCuYd / truckYd);
  const fillBankCuYd = bankCuYd * (1 + shrink);                 // bank/borrow yards to PLACE this as compacted fill

  const out = {
    ok: true,
    label: "ESTIMATE — bank volume is geometry (solid); swell/compaction VARY BY SOIL (verify with a geotech). Not a shoring/bearing/dewatering design. No pricing.",
    safety: "Call 811 (utility locate) BEFORE any dig. Trench ≥5 ft deep needs a protective system (slope/shore/box) + a competent person — OSHA 1926 Subpart P.",
    inputs: { area: Math.round(area), depthFt: Math.round(depthFt * 100) / 100, mode: trench ? "trench" : "area", swellPct: Math.round(swell * 100), compactionPct: Math.round(shrink * 100) },
    bankCubicYards: Math.round(bankCuYd * 100) / 100,            // in-place (cut) volume
    looseCubicYards: Math.round(looseCuYd * 100) / 100,          // loose (haul-out) volume
    truckLoads: { loads: truckLoads, truckYd, note: "@ ~" + truckYd + " cy/load — ESTIMATE" },
    fillBankYardsToPlaceCompacted: Math.round(fillBankCuYd * 100) / 100,
    note: "bankCubicYards = what you cut in place; looseCubicYards = what you haul (swelled); fillBankYards = bank/borrow needed to place this volume as compacted fill. Compaction spec + bearing per the geotech/spec.",
  };
  return out;
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({ ok: true, service: "excavation-calc", pure: true, priced: false,
      shape: { area: 0, length: 0, width: 0, depth: 0, depthIn: 0, trench: false, swellPct: 0.25, compactionPct: 0.15, truckYd: 10 },
      note: "POST area (or length×width, ft) + depth (ft) → bank/loose cubic yards + truck loads + fill-borrow yards. Bank volume is geometry; swell/compaction are soil-dependent ESTIMATES (verify geotech). 811 + OSHA Subpart P are safety, not computed. No pricing." });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body; if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  try { res.status(200).json(takeoff(body || {})); }
  catch (e) { res.status(200).json({ ok: false, error: String((e && e.message) || e).slice(0, 160) }); }
};

module.exports.takeoff = takeoff;
