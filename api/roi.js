// Spray-foam ROI / payback — the customer-facing "what does this save me" close. Pure math, no keys.
// Every dollar figure is caller-supplied; the savings % is an input with a labeled default RANGE —
// we never promise a number we can't back up. Pairs with the Sales expert (diagnostics-led close).
//
// POST { annualEnergyCost, savingsPct, projectCost, years, monthlyFinancePayment }
// GET  -> shape + notes.

function num(v, d) { const n = parseFloat(v); return Number.isFinite(n) ? n : d; }

function calc(body) {
  const annualEnergyCost = Math.max(0, num(body.annualEnergyCost, 0));
  // Foam air-sealing typically cuts heating/cooling 15–50% depending on the house. Default 25% (conservative).
  const savingsPct = Math.min(90, Math.max(1, num(body.savingsPct, 25)));
  const projectCost = Math.max(0, num(body.projectCost, 0));
  const years = Math.min(50, Math.max(1, Math.round(num(body.years, 10))));
  const monthlyFinance = num(body.monthlyFinancePayment, null);   // e.g. a Hearth payment, optional

  const annualSavings = annualEnergyCost * (savingsPct / 100);
  const monthlySavings = annualSavings / 12;
  const paybackYears = annualSavings > 0 ? projectCost / annualSavings : null;
  const horizonSavings = annualSavings * years;
  const netOverHorizon = horizonSavings - projectCost;

  const out = {
    ok: true, label: "ESTIMATE",
    inputs: { annualEnergyCost, savingsPct, projectCost, years },
    annualSavings: Math.round(annualSavings),
    monthlySavings: Math.round(monthlySavings),
    paybackYears: paybackYears != null ? Math.round(paybackYears * 10) / 10 : null,
    horizonSavings: Math.round(horizonSavings),
    netOverHorizon: Math.round(netOverHorizon),
    note: "Savings % is an assumption (foam air-sealing ~15–50%; default 25%). Base it on the actual bill + blower-door numbers, not a promise.",
  };

  // Financing angle: if the monthly savings beats the loan payment, it pays for itself month one.
  if (monthlyFinance != null && monthlyFinance >= 0) {
    const net = monthlySavings - monthlyFinance;
    out.financing = {
      monthlyFinancePayment: Math.round(monthlyFinance),
      monthlyNet: Math.round(net),
      cashFlowPositive: net >= 0,
      pitch: net >= 0
        ? `Energy savings (~$${Math.round(monthlySavings)}/mo) cover the ~$${Math.round(monthlyFinance)}/mo payment — cash-flow positive from day one.`
        : `Payment ~$${Math.round(monthlyFinance)}/mo vs ~$${Math.round(monthlySavings)}/mo saved — nets ~$${Math.round(-net)}/mo until payoff, then all savings.`,
    };
  }
  return out;
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({ ok: true, configured: true,
      shape: { annualEnergyCost: 0, savingsPct: 25, projectCost: 0, years: 10, monthlyFinancePayment: 0 },
      notes: "Customer payback. Savings % defaults to a conservative 25% — set it from the real bill + audit." });
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
