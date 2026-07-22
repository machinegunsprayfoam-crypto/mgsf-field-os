// Foam yield calculator — turns a wall/roof area + thickness into board-feet, sets/kits, and
// (optionally) material cost, so a bid never guesses "how many sets do I need."
//
// Pure physics + arithmetic. No API keys, no npm deps (global fetch only, though it makes no
// outbound calls). POST a job; GET returns the defaults so the app can show the knobs.
//
// The math:
//   board-feet (BF) = area(SF) × thickness(in)          [1 BF = 1 SF at 1" thick]
//   sets needed     = ceil( BF × (1+waste) / yieldPerSet )
// Yields are NOMINAL manufacturer figures at ideal conditions and are labeled ESTIMATE — cold
// substrate, off-ratio, and picture-framing all cut real yield, which is what the waste% covers.
// Cost is only returned when the caller passes costPerSet (from their own pricing) — we never
// invent a price.

// Nominal board-feet per set (2-drum ~55gal set). Owner-overridable per request.
const YIELDS = {
  closed: 4000,   // ~2.0 lb closed-cell, nominal 4,000 BF/set at 100% yield
  open:   16000,  // ~0.5 lb open-cell, nominal 16,000 BF/set
};
// Typical field waste (trim, overspray, picture-framing, cold-start off-ratio).
const DEFAULT_WASTE = 0.15;

function num(v, d) { const n = parseFloat(v); return Number.isFinite(n) ? n : d; }

function calc(body) {
  const type = (String(body.type || "closed").toLowerCase().indexOf("open") === 0) ? "open" : "closed";
  const area = Math.max(0, num(body.area, 0));                 // SF
  const thickness = Math.max(0, num(body.thickness, type === "closed" ? 2 : 3.5)); // inches
  const waste = Math.min(0.6, Math.max(0, num(body.waste, DEFAULT_WASTE)));
  const yieldPerSet = Math.max(1, num(body.yieldPerSet, YIELDS[type]));
  const costPerSet = num(body.costPerSet, null);              // optional — from owner pricing

  const boardFeet = area * thickness;
  const bfWithWaste = boardFeet * (1 + waste);
  const setsExact = yieldPerSet ? bfWithWaste / yieldPerSet : 0;
  const sets = Math.ceil(setsExact - 1e-9);                    // round up to whole sets to order
  const bfPerSet = yieldPerSet;

  const out = {
    ok: true,
    label: "ESTIMATE",
    type,
    inputs: { area, thickness, waste, yieldPerSet },
    boardFeet: Math.round(boardFeet),
    boardFeetWithWaste: Math.round(bfWithWaste),
    setsExact: Math.round(setsExact * 100) / 100,
    setsToOrder: sets,
    note: type === "closed"
      ? "Closed-cell nominal 4,000 BF/set — real yield drops on cold substrate; waste% covers it."
      : "Open-cell nominal 16,000 BF/set — high expansion, trim waste is real.",
  };
  if (costPerSet != null && costPerSet >= 0) {
    out.costPerSet = costPerSet;
    out.materialCost = Math.round(sets * costPerSet);
    out.materialCostExact = Math.round(setsExact * costPerSet);
  }
  return out;
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({ ok: true, configured: true, defaults: { yields: YIELDS, waste: DEFAULT_WASTE } });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  try { res.status(200).json(calc(body)); }
  catch (e) { res.status(200).json({ ok: false, error: String(e).slice(0, 140) }); }
};

// Exported for unit reasoning / reuse by other functions.
module.exports.calc = calc;
