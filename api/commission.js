// Sales commission calculator — figure what a rep/closer earns on a job. Pure math, no keys, no npm.
// Handles flat-% of revenue, % of gross margin, and simple tiered rates. All dollars caller-supplied.
//
// POST { basis:"revenue"|"margin", revenue, cost, rate, tiers, draw }
//   basis  - pay on revenue or on gross margin (revenue - cost). Default "margin".
//   rate   - flat commission % (used if no tiers).
//   tiers  - [{ upTo, rate }] applied progressively on the commission base (upTo null = remainder).
//   draw   - a draw already paid this period to subtract from the commission owed (optional).
// GET -> shape.

function num(v, d) { const n = parseFloat(v); return Number.isFinite(n) ? n : d; }
const money = (n) => Math.round((Number(n) || 0) * 100) / 100;

function calc(body) {
  const basis = String(body.basis || "margin").toLowerCase() === "revenue" ? "revenue" : "margin";
  const revenue = Math.max(0, num(body.revenue, 0));
  const cost = Math.max(0, num(body.cost, 0));
  const grossMargin = Math.max(0, revenue - cost);
  const base = basis === "revenue" ? revenue : grossMargin;
  const draw = Math.max(0, num(body.draw, 0));

  let commission = 0;
  const breakdown = [];
  const tiers = Array.isArray(body.tiers) ? body.tiers : null;

  if (tiers && tiers.length) {
    let remaining = base, floor = 0;
    for (const t of tiers) {
      const rate = Math.max(0, num(t && t.rate, 0));
      const upTo = t && t.upTo != null ? Math.max(floor, num(t.upTo, floor)) : Infinity;
      const band = Math.max(0, Math.min(remaining, upTo - floor));
      if (band <= 0) { floor = upTo; continue; }
      const amt = money(band * rate / 100);
      commission += amt;
      breakdown.push({ band: money(band), rate, amount: amt });
      remaining -= band; floor = upTo;
      if (remaining <= 0) break;
    }
  } else {
    const rate = Math.max(0, num(body.rate, 0));
    commission = money(base * rate / 100);
    breakdown.push({ band: money(base), rate, amount: commission });
  }
  commission = money(commission);
  const netPayable = money(commission - draw);

  return {
    ok: true, label: "ESTIMATE",
    basis, revenue: money(revenue), cost: money(cost),
    grossMargin: money(grossMargin),
    marginPct: revenue > 0 ? Math.round((grossMargin / revenue) * 1000) / 10 : 0,
    commissionBase: money(base),
    commission, breakdown,
    draw: draw ? money(draw) : undefined,
    netPayable,
    note: "Commission on " + (basis === "revenue" ? "revenue" : "gross margin (revenue − cost)") + ". Dollars are your inputs — nothing invented.",
  };
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({ ok: true, configured: true,
      shape: { basis: "margin", revenue: 0, cost: 0, rate: 0, tiers: [{ upTo: 0, rate: 0 }], draw: 0 } });
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
