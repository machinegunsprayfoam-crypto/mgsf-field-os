// Job costing / margin — the "should I take this job, and at what price" math in one place.
//
// Rolls material + labor + drive + overhead into a true cost, then works backward from a target
// gross margin to a sell price, and reports the ACTUAL margin at a given sell so a bid can be
// sanity-checked. Pure arithmetic — no keys, no npm. POST a job; GET returns the defaults.
//
// This mirrors the estimator's own margin logic so Klyfton AI and any external caller (Zapier,
// a proposal builder) reach the same number the app shows. We never invent prices — every dollar
// figure is caller-supplied; we only do the arithmetic.

function num(v, d) { const n = parseFloat(v); return Number.isFinite(n) ? n : d; }

// Federal mileage-style default; owner can override per request.
const DEFAULT_MILE_RATE = 0.67;   // $/mile round-trip vehicle cost
const DEFAULT_OVERHEAD = 0.12;    // 12% of direct cost for shop/insurance/admin
const DEFAULT_TARGET_GM = 0.45;   // 45% target gross margin

function calc(body) {
  const material = Math.max(0, num(body.material, 0));
  const laborHours = Math.max(0, num(body.laborHours, 0));
  const laborRate = Math.max(0, num(body.laborRate, 0));
  const laborFlat = Math.max(0, num(body.laborFlat, 0));         // optional flat labor instead of hrs×rate
  const miles = Math.max(0, num(body.miles, 0));                 // round-trip miles
  const mileRate = Math.max(0, num(body.mileRate, DEFAULT_MILE_RATE));
  const overheadPct = Math.min(1, Math.max(0, num(body.overheadPct, DEFAULT_OVERHEAD)));
  const targetGm = Math.min(0.95, Math.max(0, num(body.targetGm, DEFAULT_TARGET_GM)));
  const sellGiven = num(body.sell, null);                        // optional — check margin at this price

  const labor = laborFlat > 0 ? laborFlat : laborHours * laborRate;
  const drive = miles * mileRate;
  const directCost = material + labor + drive;
  const overhead = directCost * overheadPct;
  const totalCost = directCost + overhead;

  // Price from target margin: sell = cost / (1 - GM)
  const suggestedSell = targetGm < 1 ? Math.round(totalCost / (1 - targetGm)) : 0;

  const out = {
    ok: true,
    breakdown: {
      material: Math.round(material),
      labor: Math.round(labor),
      drive: Math.round(drive),
      directCost: Math.round(directCost),
      overhead: Math.round(overhead),
      totalCost: Math.round(totalCost),
    },
    targetGm,
    suggestedSell,
    suggestedProfit: Math.round(suggestedSell - totalCost),
  };

  // If a sell price is supplied, report the actual margin and a go/no-go read.
  if (sellGiven != null && sellGiven > 0) {
    const profit = sellGiven - totalCost;
    const actualGm = sellGiven > 0 ? profit / sellGiven : 0;
    out.atSell = {
      sell: Math.round(sellGiven),
      profit: Math.round(profit),
      actualGm: Math.round(actualGm * 1000) / 10,   // percent, 1 decimal
      goNoGo: actualGm >= targetGm ? "GO" : (actualGm >= targetGm * 0.66 ? "THIN" : "NO-GO"),
    };
  }
  return out;
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({ ok: true, configured: true, defaults: { mileRate: DEFAULT_MILE_RATE, overheadPct: DEFAULT_OVERHEAD, targetGm: DEFAULT_TARGET_GM } });
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
