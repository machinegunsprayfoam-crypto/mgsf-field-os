// Klyfton SHINGLE/METAL ROOFING — takeoff for a shingle or metal-panel roof (GC estimate, or check a
// sub). One of the sub-trade quantity engines. (SPF/coated roofs = our self-perform coating-calc; this
// is shingle/panel roofing we sub.)
//
// GROUNDED, NOT FABRICATED (hard rules): SQUARES are geometry (roof surface area ÷ 100) — solid.
// Bundles/square, underlayment coverage, and accessory rules are the standard published values, exposed
// as OVERRIDABLE assumptions and labeled ESTIMATE. Input is the ROOF-SURFACE area (already pitch-
// adjusted — use measure.js slope factor first if you only have footprint). Wind fastening + ice-barrier
// extent are code (IRC R905 / product listing) — verify the AHJ. No pricing.
//
// Keyless, deterministic, no npm. POST { roofArea, waste, bundlesPerSquare, eaveRakeFt, ridgeHipFt } · GET -> shape.

function num(v, d) { const n = parseFloat(v); return Number.isFinite(n) ? n : (d || 0); }
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

function takeoff(body) {
  body = body || {};
  const area = Math.max(0, num(body.roofArea != null ? body.roofArea : body.area));   // ROOF SURFACE sqft
  const waste = clamp(num(body.waste, 0.12), 0, 0.4);            // 12% default (cuts/valleys/starter)
  const bundlesPerSq = clamp(num(body.bundlesPerSquare, 3), 3, 5); // 3 = architectural (standard); 3-tab also ~3
  const undlySqPerRoll = clamp(num(body.underlaymentSqPerRoll, 10), 2, 15); // synthetic ~10 sq/roll; #15 felt ~4
  if (area <= 0) return { ok: false, error: "no_roof_area", note: "Enter roofArea = the ROOF-SURFACE area in sq ft (pitch-adjusted — run measure.js first if you only have footprint)." };

  const squares = area / 100;
  const squaresWaste = squares * (1 + waste);
  const bundles = Math.ceil(squaresWaste * bundlesPerSq);
  const underlaymentRolls = Math.ceil(squaresWaste / undlySqPerRoll);
  const eaveRake = Math.max(0, num(body.eaveRakeFt));            // linear ft of eave+rake → drip edge + starter
  const ridgeHip = Math.max(0, num(body.ridgeHipFt));           // linear ft of ridge+hip → ridge cap

  const out = {
    ok: true,
    label: "ESTIMATE — squares are geometry (solid); bundles/underlayment/accessories are standard rules-of-thumb (verify the product coverage). Input is ROOF-SURFACE area. No pricing.",
    inputs: { roofArea: Math.round(area), wastePct: Math.round(waste * 100), bundlesPerSquare: bundlesPerSq },
    squares: Math.round(squares * 100) / 100,
    squaresWithWaste: Math.round(squaresWaste * 100) / 100,
    bundles,
    underlaymentRolls: { rolls: underlaymentRolls, note: "@ ~" + undlySqPerRoll + " sq/roll — ESTIMATE (synthetic ~10, #15 felt ~4)" },
    accessories: {
      dripEdgeFt: eaveRake || null, starterFt: eaveRake || null, ridgeCapFt: ridgeHip || null,
      note: eaveRake || ridgeHip ? "linear-ft items from your eave/rake + ridge/hip inputs" : "add eaveRakeFt + ridgeHipFt for drip edge / starter / ridge-cap footage",
    },
    note: "Zone 6/7: ICE-AND-WATER barrier required at eaves/valleys (IRC R905.1.2). Fastener count/pattern per the product's wind rating + AHJ. Metal panels: order by panel coverage per the profile.",
  };
  return out;
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({ ok: true, service: "roofing-shingle-calc", pure: true, priced: false,
      shape: { roofArea: 0, waste: 0.12, bundlesPerSquare: 3, underlaymentSqPerRoll: 10, eaveRakeFt: 0, ridgeHipFt: 0 },
      note: "POST roofArea (ROOF-SURFACE sq ft, pitch-adjusted) → squares + bundles + underlayment rolls + accessory footage. Squares are geometry; the rest are ESTIMATE rules-of-thumb. Ice-barrier + fastening per IRC/AHJ. No pricing." });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body; if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  try { res.status(200).json(takeoff(body || {})); }
  catch (e) { res.status(200).json({ ok: false, error: String((e && e.message) || e).slice(0, 160) }); }
};

module.exports.takeoff = takeoff;
