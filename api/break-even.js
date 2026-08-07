// Break-even — how much work MGSF has to book to cover its fixed costs. The per-job tools (job-cost,
// true-profit) answer "did THIS job make money"; this answers the owner-level question the Finance and
// Owner-Strategy minds get: "how many jobs — or board-feet, or sq ft of lift — do we need this month
// just to keep the lights on, and how many past that to hit a profit target?" Pure math, keyless,
// deterministic, unit-agnostic (a "unit" is whatever the caller counts: a job, a BF, a square).
//
// contribution margin/unit = pricePerUnit − variableCostPerUnit   (what each unit throws off toward fixed costs)
// break-even units          = fixedCosts / contribution margin     (round UP — a partial unit doesn't pay the rent)
// units for a target profit  = (fixedCosts + targetProfit) / contribution margin
//
// Every number is the caller's — nothing invented. If variable cost ≥ price, there IS no break-even
// (each unit loses money); we say so plainly rather than return a bogus figure.
//
// POST { fixedCosts, pricePerUnit, variableCostPerUnit, targetProfit?, unit? }
// GET  -> shape.

function num(v, d) { const n = parseFloat(v); return Number.isFinite(n) ? n : d; }
function money(n) { return Math.round(n * 100) / 100; }

function calc(body) {
  body = body || {};
  const fixedCosts = Math.max(0, num(body.fixedCosts, 0));
  const price = Math.max(0, num(body.pricePerUnit, 0));
  const varCost = Math.max(0, num(body.variableCostPerUnit, 0));
  const targetProfit = Math.max(0, num(body.targetProfit, 0));
  const unit = (typeof body.unit === "string" && body.unit.trim()) ? body.unit.trim().slice(0, 24) : "job";

  if (!fixedCosts) return { ok: false, error: "need_fixedCosts", note: "Enter the fixed costs (overhead) to cover over the period." };
  if (!price) return { ok: false, error: "need_pricePerUnit", note: "Enter the price per " + unit + "." };

  const cm = money(price - varCost);
  const cmPct = price > 0 ? Math.round((cm / price) * 1000) / 10 : 0;
  if (cm <= 0) {
    return { ok: true, breakEven: null, unit,
      contributionMargin: cm, contributionMarginPct: cmPct,
      note: "No break-even at this price — the variable cost per " + unit + " is at or above the price, so every " + unit + " loses money. Raise the price or cut the per-" + unit + " cost first." };
  }

  const beUnits = Math.ceil(fixedCosts / cm);
  const beRevenue = money(beUnits * price);
  const out = {
    ok: true, unit, currency: "USD",
    fixedCosts: money(fixedCosts), pricePerUnit: money(price), variableCostPerUnit: money(varCost),
    contributionMargin: cm, contributionMarginPct: cmPct,
    breakEven: { units: beUnits, revenue: beRevenue },
    note: "Break-even is where contribution margin (" + cm + "/" + unit + ") covers fixed costs. Units rounded up — a partial " + unit + " doesn't pay the overhead. All figures are yours; nothing invented.",
  };
  if (targetProfit > 0) {
    const tUnits = Math.ceil((fixedCosts + targetProfit) / cm);
    out.forTargetProfit = { targetProfit: money(targetProfit), units: tUnits, revenue: money(tUnits * price) };
  }
  return out;
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({ ok: true, configured: true,
      shape: { fixedCosts: 0, pricePerUnit: 0, variableCostPerUnit: 0, targetProfit: "(optional)", unit: "job | BF | sqft" },
      note: "Overhead-recovery break-even: how many units cover fixed costs (and how many hit a profit target). Unit-agnostic; all figures owner-entered; no break-even is reported when variable cost ≥ price." });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  try { res.status(200).json(calc(body || {})); }
  catch (e) { res.status(200).json({ ok: false, error: String(e).slice(0, 140) }); }
};

module.exports.calc = calc;
