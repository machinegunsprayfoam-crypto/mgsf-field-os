// Klyfton CONCRETE FLATWORK — takeoff for slabs / footings / flatwork (GC estimate, or check a sub).
// One of the sub-trade quantity engines. (Distinct from concrete-calc, which is our self-perform
// polyurethane LIFTING/void-fill; this is poured ready-mix concrete volume.)
//
// GROUNDED, NOT FABRICATED (hard rules): VOLUME is pure geometry (area × thickness → cubic yards) —
// solid. Bag yields (for small pours) are the standard published bag volumes, labeled ESTIMATE. It
// NEVER designs the structure: rebar SIZE/spacing, footing depth (frost line), and the mix design
// (strength, air entrainment for Zone 6/7 freeze-thaw) are a code/engineer call per ACI 318/332 +
// IRC + the AHJ — this only counts material. No pricing.
//
// Keyless, deterministic, no npm. POST { area | length+width, thickness, waste, bagSize? } · GET -> shape.

function num(v, d) { const n = parseFloat(v); return Number.isFinite(n) ? n : (d || 0); }
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
// Standard dry-mix bag yields (cubic feet of cured concrete per bag) — published, ESTIMATE.
const BAG_CUFT = { 40: 0.30, 50: 0.375, 60: 0.45, 80: 0.60, 90: 0.675 };

function takeoff(body) {
  body = body || {};
  const area = body.area != null ? Math.max(0, num(body.area)) : (Math.max(0, num(body.length)) * Math.max(0, num(body.width)));
  const thickIn = Math.max(0, num(body.thickness, 4));           // inches; 4" default slab
  const waste = clamp(num(body.waste, 0.1), 0, 0.5);             // 10% default (spillage, subgrade slop)
  if (area <= 0 || thickIn <= 0) return { ok: false, error: "need_area_and_thickness", note: "Enter area (or length×width) in ft and thickness in inches." };

  const volCuFt = area * (thickIn / 12);
  const volCuFtWaste = volCuFt * (1 + waste);
  const cubicYards = volCuFtWaste / 27;
  // ready-mix is ordered in 0.25-yd increments — round UP so you never run short mid-pour
  const yardsToOrder = Math.ceil(cubicYards * 4) / 4;

  const out = {
    ok: true,
    label: "ESTIMATE — volume is geometry (solid); order a hair over, never short. Rebar/mix/footing depth are an ACI/IRC + AHJ/engineer call — NOT designed here. No pricing.",
    inputs: { area: Math.round(area), thicknessIn: thickIn, wastePct: Math.round(waste * 100) },
    volumeCuFt: Math.round(volCuFt),
    cubicYards: Math.round(cubicYards * 100) / 100,
    yardsToOrder,                                                 // ready-mix truck order
    note: "For a truck order use yardsToOrder. Freeze-thaw (Zone 6/7) needs air-entrained mix + footings below frost — verify with the AHJ/engineer. Cure + control joints per ACI.",
  };
  // small pour? offer the bagged-mix count (ESTIMATE, standard bag yields)
  const bag = BAG_CUFT[num(body.bagSize, 80)] ? num(body.bagSize, 80) : 80;
  if (cubicYards <= 2) {
    out.bagOption = { bagSizeLb: bag, bagsNeeded: Math.ceil(volCuFtWaste / BAG_CUFT[bag]), note: "bagged mix — ESTIMATE @ " + BAG_CUFT[bag] + " cu ft/bag; practical only for small pours" };
  }
  return out;
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({ ok: true, service: "flatwork-calc", pure: true, priced: false,
      shape: { area: 0, length: 0, width: 0, thickness: 4, waste: 0.1, bagSize: 80 },
      note: "POST area (or length×width, ft) + thickness (in) → cubic yards to order (ready-mix) + optional bagged-mix count. Volume is geometry; rebar/mix/footings deferred to ACI/IRC + AHJ. No pricing." });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body; if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  try { res.status(200).json(takeoff(body || {})); }
  catch (e) { res.status(200).json({ ok: false, error: String((e && e.message) || e).slice(0, 160) }); }
};

module.exports.takeoff = takeoff;
module.exports.BAG_CUFT = BAG_CUFT;
