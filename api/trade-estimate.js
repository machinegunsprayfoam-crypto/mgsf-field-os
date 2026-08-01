// Klyfton TRADE ESTIMATE — turns a trade's QUANTITIES (from its engine) into a priced DRAFT estimate
// using OWNER-ENTERED rates. This is the per-trade estimator: material (qty × unit cost) + labor
// (hours × rate) per line, subtotal, owner markup/OH&P, owner tax → total.
//
// NEVER FABRICATES A RATE (doctrine + hard rules): every dollar comes from a number the owner enters.
// A line with no rate is shown as UNPRICED (contributes 0) — never guessed. Markup and tax apply ONLY
// when the owner enters them, else deferred. MGSF's own self-perform trades (foam/roofing/coatings/
// concrete) have LOCKED doctrine pricing — those defer to the main mgsf-estimator, not here; this
// estimator is for the trades without locked pricing (electrical/plumbing/HVAC/carpentry + subs) and
// for planning. DRAFT only — owner reviews + approves before it goes to a customer.
//
// Keyless, deterministic, no npm. POST { trade?, lineItems:[{desc,qty,unit,unitCost,laborHours,laborRate}], markupPct?, taxPct? }

let construction = null;
try { construction = require("./construction"); } catch (e) { construction = null; }

function num(v, d) { const n = parseFloat(v); return Number.isFinite(n) ? n : d; }
function clean(s, max) { return String(s == null ? "" : s).trim().slice(0, max || 120); }
function round(n, p) { const f = Math.pow(10, p == null ? 2 : p); return Math.round(num(n, 0) * f) / f; }
function money(n) { return "$" + round(n, 2).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }

function isMgsfSelfPerform(trade) {
  const id = clean(trade, 40).toLowerCase(); if (!id || !construction) return false;
  const t = (construction.TRADES || []).find((x) => x.id === id);
  return !!(t && t.selfPerform);
}

// Price one line from owner-entered rates. Material and/or labor; missing ⇒ that part is 0 (not guessed).
function priceLine(li) {
  li = li || {};
  const qty = num(li.qty, null), unitCost = num(li.unitCost, null);
  const hours = num(li.laborHours, null), rate = num(li.laborRate, null);
  const material = (qty != null && unitCost != null) ? round(qty * unitCost) : 0;
  const labor = (hours != null && rate != null) ? round(hours * rate) : 0;
  const priced = material > 0 || labor > 0 || (qty != null && unitCost === 0) || (hours != null && rate === 0);
  const out = { desc: clean(li.desc, 160) || "(line item)", qty: qty != null ? qty : undefined, unit: clean(li.unit, 20) || undefined,
    unitCost: unitCost != null ? unitCost : undefined, laborHours: hours != null ? hours : undefined, laborRate: rate != null ? rate : undefined,
    material, labor, lineTotal: round(material + labor), priced };
  if (!priced) out.unpriced = "Enter a unit cost and/or a labor rate — not estimated.";
  return out;
}

function estimate(body) {
  body = body || {};
  const trade = clean(body.trade, 40);
  const lines = (Array.isArray(body.lineItems) ? body.lineItems : []).map(priceLine);
  if (!lines.length) return { ok: false, error: "no_line_items", note: "POST lineItems:[{desc,qty,unit,unitCost,laborHours,laborRate}] with your own rates." };

  const subtotalMaterial = round(lines.reduce((s, l) => s + l.material, 0));
  const subtotalLabor = round(lines.reduce((s, l) => s + l.labor, 0));
  const subtotal = round(subtotalMaterial + subtotalLabor);
  const unpriced = lines.filter((l) => !l.priced).length;

  const markupPct = num(body.markupPct, null);
  const markup = markupPct != null && markupPct >= 0 ? { pct: round(markupPct, 2), amount: round(subtotal * markupPct / 100), source: "owner-entered" }
    : { deferred: true, how: "Enter your markup / OH&P % — not assumed." };
  const taxPct = num(body.taxPct, null); // owner's rate, applied to materials
  const tax = taxPct != null && taxPct >= 0 ? { pct: round(taxPct, 2), amount: round(subtotalMaterial * taxPct / 100), on: "materials", source: "owner-entered" }
    : { deferred: true, how: "Enter your material tax % if applicable — not assumed." };

  const total = round(subtotal + (markup.amount || 0) + (tax.amount || 0));

  const out = {
    ok: true, label: "ESTIMATE — DRAFT (your rates; owner reviews + approves before sending)", trade: trade || undefined,
    lineItems: lines,
    subtotalMaterial, subtotalLabor, subtotal, subtotalLabel: money(subtotal),
    markup, tax, total, totalLabel: money(total),
    unpricedLines: unpriced,
    note: "All rates are OWNER-ENTERED — nothing is fabricated. Markup/tax apply only when you enter them. DRAFT: review before it goes to a customer.",
    verify: ["Confirm your material unit costs (supplier quote) + labor rate/hours.", "Add your markup / OH&P and any tax.", "This is a draft — nothing is sent."],
  };
  if (unpriced) out.warning = unpriced + " line(s) have no rate entered — they count as $0 until you price them.";
  if (isMgsfSelfPerform(trade)) out.doctrineNote = "'" + trade + "' is an MGSF self-perform trade with LOCKED doctrine pricing — price it in the main Estimator (mgsf-estimator doctrine), not here. This owner-rate estimator is for trades without locked pricing.";
  return out;
}

// Turn a computed estimate into the proposal-pdf payload shape ({items:[{desc,qty,unit,amount}]}).
// Priced lines become items; owner markup + tax become their own line items so the PDF total matches.
// Pure — no fabricated dollars, no Date() (proposal-pdf defaults the date).
function toProposal(est, opts) {
  opts = opts || {};
  const items = [];
  for (const l of (est.lineItems || [])) { if (l.priced) items.push({ desc: l.desc, qty: l.qty, unit: l.unit, amount: l.lineTotal }); }
  if (est.markup && est.markup.amount != null) items.push({ desc: "Markup / OH&P (" + est.markup.pct + "%)", amount: est.markup.amount });
  if (est.tax && est.tax.amount != null) items.push({ desc: "Tax (" + est.tax.pct + "% materials)", amount: est.tax.amount });
  const cust = opts.customer || {};
  return {
    customer: { name: clean(cust.name, 80), address: clean(cust.address, 120), cityStateZip: clean(cust.cityStateZip, 80), email: clean(cust.email, 120), phone: clean(cust.phone, 40) },
    proposalNo: clean(opts.proposalNo, 24) || undefined, date: /^\d{4}-\d{2}-\d{2}$/.test(opts.date || "") ? opts.date : undefined,
    items,
    notes: clean(opts.notes, 600) || (est.trade ? (est.trade + " — estimate at the rates provided.") : "Estimate at the rates provided."),
    terms: clean(opts.terms, 600) || "This is a DRAFT proposal at the rates entered. Prices valid for the stated period. Buyer has a 3-day right of cancellation. Scope excludes anything not listed above.",
    validDays: num(opts.validDays, 30),
    _meta: { total: est.total, unpricedLines: est.unpricedLines, note: "Send to /api/proposal-pdf. Owner reviews before it goes to a customer." },
  };
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({ ok: true, service: "trade-estimate", pure: true, ownerPriced: true,
      note: "POST { trade?, lineItems:[{desc,qty,unit,unitCost,laborHours,laborRate}], markupPct?, taxPct? }. Prices a trade's quantities from YOUR entered rates (material qty×cost + labor hours×rate), + owner markup + owner tax → total. Never fabricates a rate; unpriced lines show as $0 until priced. MGSF self-perform trades defer to the doctrine estimator. DRAFT — review before sending." });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  try {
    const est = estimate(body);
    if (clean(body.action, 12) === "proposal") {
      if (!est.ok) { res.status(200).json(est); return; }
      res.status(200).json({ ok: true, proposal: toProposal(est, body.proposal || body), estimate: { total: est.total, totalLabel: est.totalLabel } });
      return;
    }
    res.status(200).json(est);
  } catch (e) { res.status(200).json({ ok: false, error: String((e && e.message) || e).slice(0, 140) }); }
};

module.exports.priceLine = priceLine;
module.exports.estimate = estimate;
module.exports.toProposal = toProposal;
module.exports.isMgsfSelfPerform = isMgsfSelfPerform;
