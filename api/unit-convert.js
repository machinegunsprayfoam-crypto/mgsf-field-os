// Unit converter for the trade — the conversions a spray-foam/coating/BPI crew actually needs.
// Pure math, no keys, no npm. One endpoint, many conversions via `kind`.
//
// POST { kind, value, ...opts }  ->  { ok, kind, input, result, ... }
//   bf_from_area   { area, thickness }        area(ft²) × thickness(in) = board feet
//   area_from_bf   { boardFeet, thickness }   board feet ÷ thickness = coverable area
//   sets_from_bf   { boardFeet, yieldPerSet } board feet ÷ yield = sets
//   gal_from_area  { area, mils, solidsPct }  coating gallons at dry mils (1 gal=1604 ft²/mil)
//   c_to_f / f_to_c{ value }                  temperature
//   pa_to_inwc / inwc_to_pa { value }         pressure (BPI blower door): 1 in.w.c. = 248.84 Pa
//   mil_to_in / in_to_mil   { value }         film thickness
//   r_to_u / u_to_r         { value }         R-value <-> U-factor (U = 1/R)
// GET -> the list of kinds.

function num(v, d) { const n = parseFloat(v); return Number.isFinite(n) ? n : d; }
const round = (n, p = 2) => Math.round(n * Math.pow(10, p)) / Math.pow(10, p);
const PA_PER_INWC = 248.84;
const SQFT_PER_GAL_MIL = 1604;

function convert(body) {
  const kind = String(body.kind || "").toLowerCase();
  const v = num(body.value, null);
  switch (kind) {
    case "bf_from_area": {
      const area = Math.max(0, num(body.area, 0)), th = Math.max(0, num(body.thickness, 0));
      return { boardFeet: round(area * th, 0) };
    }
    case "area_from_bf": {
      const bf = Math.max(0, num(body.boardFeet, 0)), th = Math.max(0.01, num(body.thickness, 1));
      return { areaSqft: round(bf / th, 0) };
    }
    case "sets_from_bf": {
      const bf = Math.max(0, num(body.boardFeet, 0)), y = Math.max(1, num(body.yieldPerSet, 4000));
      return { setsExact: round(bf / y, 2), setsToOrder: Math.ceil(bf / y - 1e-9) };
    }
    case "gal_from_area": {
      const area = Math.max(0, num(body.area, 0)), mils = Math.max(0.01, num(body.mils, 1)), solids = Math.min(100, Math.max(1, num(body.solidsPct, 100)));
      const coverage = SQFT_PER_GAL_MIL * (solids / 100) / mils;
      return { coverageSqftPerGal: round(coverage, 0), gallons: round(area / coverage, 1) };
    }
    case "c_to_f": return { f: v == null ? null : round(v * 9 / 5 + 32, 1) };
    case "f_to_c": return { c: v == null ? null : round((v - 32) * 5 / 9, 1) };
    case "pa_to_inwc": return { inwc: v == null ? null : round(v / PA_PER_INWC, 4) };
    case "inwc_to_pa": return { pa: v == null ? null : round(v * PA_PER_INWC, 2) };
    case "mil_to_in": return { inches: v == null ? null : round(v / 1000, 4) };
    case "in_to_mil": return { mils: v == null ? null : round(v * 1000, 1) };
    case "r_to_u": return { u: v ? round(1 / v, 4) : null };
    case "u_to_r": return { r: v ? round(1 / v, 2) : null };
    default: return { error: "unknown_kind" };
  }
}

const KINDS = ["bf_from_area", "area_from_bf", "sets_from_bf", "gal_from_area", "c_to_f", "f_to_c", "pa_to_inwc", "inwc_to_pa", "mil_to_in", "in_to_mil", "r_to_u", "u_to_r"];

module.exports = async (req, res) => {
  if (req.method === "GET") { res.status(200).json({ ok: true, configured: true, kinds: KINDS }); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  try {
    const out = convert(body);
    if (out.error) { res.status(200).json({ ok: false, error: out.error, kinds: KINDS }); return; }
    res.status(200).json({ ok: true, kind: String(body.kind || "").toLowerCase(), input: body, ...out });
  } catch (e) { res.status(200).json({ ok: false, error: String(e).slice(0, 140) }); }
};

module.exports.convert = convert;
