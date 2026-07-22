// Coating calculator — roof/wall coating gallons for SPF roofing & protective coats.
// Pure physics, no keys, no npm. Pairs with foam-calc: foam-calc sizes the foam, this sizes
// the coating that goes over it (silicone/acrylic roof coat, DC315 thermal barrier, polyurea, etc.).
//
// The math (industry-standard coverage):
//   1 US gallon spread 1 mil thick over 1,604 ft²  (at 100% solids).
//   wet mils needed = dry mils / (solids fraction)          [you can only apply wet material]
//   coverage (ft²/gal) = 1604 × solidsFraction / dryMils
//   gallons = area × (1+waste) / coverage
// Provide the product's rated coverage directly (coverageSqftPerGal) if the TDS gives it — then we
// use that and skip the solids math. Product specs are caller-supplied; we never invent a TDS number.
//
// POST { area, dryMils, solidsPct | coverageSqftPerGal, waste, gallonsPerUnit, costPerGal, coats }
// GET  -> shape + notes.

const SQFT_PER_GAL_MIL = 1604;   // ft² a gallon covers at 1 mil, 100% solids

function num(v, d) { const n = parseFloat(v); return Number.isFinite(n) ? n : d; }

function calc(body) {
  const area = Math.max(0, num(body.area, 0));                    // ft²
  const coats = Math.max(1, Math.round(num(body.coats, 1)));      // number of coats
  const dryMils = Math.max(0, num(body.dryMils, 0));              // dry film thickness per the spec
  const solidsPct = Math.min(100, Math.max(1, num(body.solidsPct, 100)));
  const waste = Math.min(0.6, Math.max(0, num(body.waste, 0.1))); // overspray/rough-surface loss
  const unit = Math.max(1, num(body.gallonsPerUnit, 5));          // pail size (gal) to order in
  const costPerGal = num(body.costPerGal, null);
  let coverage = num(body.coverageSqftPerGal, null);              // from TDS, optional

  // Derive coverage from solids + dry mils if not given directly.
  if (coverage == null) {
    if (dryMils > 0) coverage = SQFT_PER_GAL_MIL * (solidsPct / 100) / dryMils;
    else return { ok: false, error: "need_dryMils_or_coverage" };
  }
  if (!(coverage > 0)) return { ok: false, error: "bad_coverage" };

  const totalArea = area * coats;
  const gallonsExact = totalArea * (1 + waste) / coverage;
  const gallons = Math.ceil(gallonsExact - 1e-9);
  const units = Math.ceil(gallons / unit - 1e-9);                 // pails/kits to order
  const wetMils = solidsPct < 100 ? dryMils / (solidsPct / 100) : dryMils;

  const out = {
    ok: true, label: "ESTIMATE",
    inputs: { area, coats, dryMils: dryMils || undefined, solidsPct: coverage && !body.coverageSqftPerGal ? solidsPct : undefined, waste },
    coverageSqftPerGal: Math.round(coverage),
    wetMils: dryMils ? Math.round(wetMils * 100) / 100 : undefined,
    totalAreaSqft: Math.round(totalArea),
    gallonsExact: Math.round(gallonsExact * 10) / 10,
    gallonsToOrder: gallons,
    unitsToOrder: units,
    unitSizeGal: unit,
    note: "Coverage is theoretical (1 gal/mil/1604 ft²). Rough/granulated SPF and cold weather eat more — that's the waste%.",
  };
  if (costPerGal != null && costPerGal >= 0) {
    out.costPerGal = costPerGal;
    out.materialCost = Math.round(gallons * costPerGal);
  }
  return out;
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({ ok: true, configured: true,
      shape: { area: 0, coats: 1, dryMils: 0, solidsPct: 100, coverageSqftPerGal: 0, waste: 0.1, gallonsPerUnit: 5, costPerGal: 0 },
      notes: "Give dryMils + solidsPct (from the product TDS) OR coverageSqftPerGal directly. Returns wet mils, gallons, and pails/kits to order." });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  try { res.status(200).json(calc(body)); }
  catch (e) { res.status(200).json({ ok: false, error: String(e).slice(0, 140) }); }
};

module.exports.calc = calc;
