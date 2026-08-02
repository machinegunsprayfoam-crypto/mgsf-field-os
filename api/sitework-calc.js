// Klyfton SITEWORK / PAVING — material takeoff for asphalt paving + aggregate base (GC estimate, or
// check a paving sub). One of the sub-trade quantity engines. (Site CONCRETE slabs = flatwork-calc.)
//
// GROUNDED, NOT FABRICATED (hard rules): VOLUME is pure geometry (area × thickness). Tonnage uses the
// material DENSITY, which varies by mix/aggregate — here it's the standard typical value, exposed as an
// overridable input and labeled ESTIMATE (verify the mix design / DOT spec). It does NOT design the
// pavement section, subgrade, or drainage. No pricing.
//
// SAFETY / CODE surfaced (not computed): call 811 before subsurface work; positive drainage away from
// structures; subgrade + base compaction per the geotech/DOT spec; SWPPP/erosion control if disturbing
// ≥1 acre (EPA/state); ADA slopes where public.
//
// Keyless, deterministic, no npm. POST { material, area|length+width, thickness(in), waste, densityLbCf|tonsPerCy } · GET -> shape.

function num(v, d) { const n = parseFloat(v); return Number.isFinite(n) ? n : (d || 0); }
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

function takeoff(body) {
  body = body || {};
  const material = /base|aggregate|gravel/i.test(String(body.material || "")) ? "base" : "asphalt";
  const area = body.area != null ? Math.max(0, num(body.area)) : (Math.max(0, num(body.length)) * Math.max(0, num(body.width)));
  const thickIn = Math.max(0, num(body.thickness, material === "asphalt" ? 2 : 6)); // 2" HMA lift / 6" base default
  const waste = clamp(num(body.waste, 0.05), 0, 0.4);           // spread/compaction allowance
  if (area <= 0 || thickIn <= 0) return { ok: false, error: "need_area_and_thickness", note: "Enter area (or length×width) in ft and thickness in inches." };

  const volCuFt = area * (thickIn / 12) * (1 + waste);
  const volCuYd = volCuFt / 27;
  const out = {
    ok: true, material,
    label: "ESTIMATE — volume is geometry (solid); tonnage uses a TYPICAL density that varies by mix/aggregate (verify the mix design / DOT spec). Pavement section + subgrade + drainage NOT designed here. No pricing.",
    codeSafety: "811 locate before subsurface work · positive drainage away from structures · subgrade + base compaction per geotech/DOT · SWPPP if ≥1 acre disturbed · ADA slopes where public.",
    inputs: { area: Math.round(area), thicknessIn: thickIn, wastePct: Math.round(waste * 100) },
    cubicYards: Math.round(volCuYd * 100) / 100,
  };
  if (material === "asphalt") {
    const density = clamp(num(body.densityLbCf, 145), 100, 200); // HMA ~145 lb/cf compacted — ESTIMATE
    out.tons = Math.round((volCuFt * density / 2000) * 100) / 100;
    out.densityNote = "HMA @ ~" + density + " lb/cu ft compacted — ESTIMATE, verify the mix design";
    out.note = "Order asphalt by TONS. Lift thickness + # of lifts per the DOT/spec; tack coat between lifts.";
  } else {
    const tonsPerCy = clamp(num(body.tonsPerCy, 1.4), 1.0, 2.0); // crushed aggregate base ~1.4 tons/cy — ESTIMATE
    out.tons = Math.round((volCuYd * tonsPerCy) * 100) / 100;
    out.densityNote = "crushed aggregate base @ ~" + tonsPerCy + " tons/cu yd — ESTIMATE, verify the material";
    out.note = "Order base by TONS or cubic yards. Compact in lifts to the spec'd density; proof-roll the subgrade first.";
  }
  return out;
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({ ok: true, service: "sitework-calc", pure: true, priced: false,
      shape: { material: "asphalt|base", area: 0, length: 0, width: 0, thickness: 2, waste: 0.05, densityLbCf: 145, tonsPerCy: 1.4 },
      note: "POST material (asphalt|base) + area (or length×width, ft) + thickness (in) → cubic yards + TONS to order. Volume is geometry; density is a typical ESTIMATE (verify mix/DOT). Pavement section/subgrade/drainage not designed; 811 + SWPPP + ADA surfaced. No pricing. (Site concrete = flatwork-calc.)" });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body; if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  try { res.status(200).json(takeoff(body || {})); }
  catch (e) { res.status(200).json({ ok: false, error: String((e && e.message) || e).slice(0, 160) }); }
};

module.exports.takeoff = takeoff;
