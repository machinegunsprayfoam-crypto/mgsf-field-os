// Klyfton SUB-BID — subcontractor bid intake + LEVELING for prime jobs. When MGSF runs as prime and
// collects quotes from subs for a trade, the cheapest number is a trap if it excludes scope the others
// include. Bid leveling normalizes the quotes to EQUAL scope so the owner compares apples-to-apples.
//
// GROUNDED, NEVER FABRICATED (doctrine): amounts are the SUBS' own quotes, entered by the owner — this
// module never invents a number and never generates an MGSF price (that's doctrine, separate). It only
// does arithmetic on entered quotes (low/high/spread) and set math on entered scope (who's missing what).
// It NEVER auto-accepts a bid — it flags, the owner decides.
//
// Keyless, deterministic, no npm. POST { bids:[{sub,trade,amount,scopeIncluded[],exclusions[],notes}], requiredScope?[] }

function num(v, d) { const n = parseFloat(v); return Number.isFinite(n) ? n : d; }
function clean(s, max) { return String(s == null ? "" : s).trim().slice(0, max || 120); }
function round(n, p) { const f = Math.pow(10, p == null ? 2 : p); return Math.round(num(n, 0) * f) / f; }
function normItem(s) { return clean(s, 80).toLowerCase(); }
function money(n) { return "$" + round(n, 2).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }

function cleanBid(b) {
  b = b || {};
  const scope = Array.isArray(b.scopeIncluded || b.scope) ? (b.scopeIncluded || b.scope).map((x) => clean(x, 80)).filter(Boolean) : [];
  const excl = Array.isArray(b.exclusions) ? b.exclusions.map((x) => clean(x, 80)).filter(Boolean) : [];
  const amount = num(b.amount != null ? b.amount : b.bid, null);
  return { sub: clean(b.sub || b.name, 120), trade: clean(b.trade, 60), amount, scopeIncluded: scope, exclusions: excl, notes: clean(b.notes, 200) || undefined };
}

// The scope baseline to level against: an owner-supplied requiredScope, else the UNION of all bids' scope.
function normalizeScope(bids, requiredScope) {
  if (Array.isArray(requiredScope) && requiredScope.length) {
    const seen = new Set(), out = [];
    for (const s of requiredScope) { const c = clean(s, 80); const k = normItem(c); if (c && !seen.has(k)) { seen.add(k); out.push(c); } }
    return { scope: out, basis: "owner-provided required scope" };
  }
  const seen = new Set(), out = [];
  for (const b of bids) for (const s of (b.scopeIncluded || [])) { const k = normItem(s); if (!seen.has(k)) { seen.add(k); out.push(s); } }
  return { scope: out, basis: "union of all bids' included scope" };
}

function level(bidsRaw, opts) {
  opts = opts || {};
  const bids = (Array.isArray(bidsRaw) ? bidsRaw : []).map(cleanBid).filter((b) => b.sub);
  if (!bids.length) return { ok: false, error: "no_bids", note: "POST bids:[{sub,trade,amount,scopeIncluded[]}]" };
  const warnings = [];
  const trades = Array.from(new Set(bids.map((b) => b.trade).filter(Boolean)));
  if (trades.length > 1) warnings.push("Bids span multiple trades (" + trades.join(", ") + ") — level within ONE trade/scope at a time.");
  const { scope: baseline, basis } = normalizeScope(bids, opts.requiredScope);
  const baseKeys = baseline.map(normItem);

  const priced = bids.filter((b) => b.amount != null && b.amount >= 0);
  const missingAmount = bids.filter((b) => b.amount == null).map((b) => b.sub);
  if (missingAmount.length) warnings.push("No amount entered for: " + missingAmount.join(", ") + " — can't rank until priced.");

  const rows = bids.map((b) => {
    const have = new Set((b.scopeIncluded || []).map(normItem));
    const gaps = baseline.filter((s) => !have.has(normItem(s)));   // required/union items this bid doesn't include
    const complete = gaps.length === 0;
    const row = { sub: b.sub, trade: b.trade || undefined, amount: b.amount, amountLabel: b.amount != null ? money(b.amount) : "—",
      scopeGaps: gaps, exclusions: b.exclusions, complete, notes: b.notes };
    return row;
  });
  // rank the priced bids low→high; annotate the classic trap
  const rankable = priced.slice().sort((a, b) => a.amount - b.amount);
  rankable.forEach((b, i) => { const r = rows.find((x) => x.sub === b.sub); if (r) r.rank = i + 1; });

  const summary = priced.length ? {
    count: priced.length, low: { sub: rankable[0].sub, amount: round(rankable[0].amount) },
    high: { sub: rankable[rankable.length - 1].sub, amount: round(rankable[rankable.length - 1].amount) },
    spread: round(rankable[rankable.length - 1].amount - rankable[0].amount),
    spreadPct: rankable[0].amount > 0 ? round(((rankable[rankable.length - 1].amount - rankable[0].amount) / rankable[0].amount) * 100, 1) : null,
  } : null;

  // advisory only — never auto-accept
  let recommendation = "Owner decides — leveling is advisory.";
  if (rankable.length) {
    const lowest = rows.find((x) => x.rank === 1);
    const lowestComplete = rankable.map((b) => rows.find((x) => x.sub === b.sub)).find((r) => r && r.complete);
    if (lowest && lowest.complete) recommendation = "Lowest bid (" + lowest.sub + ", " + lowest.amountLabel + ") also covers the full scope.";
    else if (lowest) recommendation = "Lowest bid (" + lowest.sub + ", " + lowest.amountLabel + ") is MISSING scope: " + lowest.scopeGaps.join(", ") +
      (lowestComplete ? ". Lowest FULL-scope bid is " + lowestComplete.sub + " (" + lowestComplete.amountLabel + ") — level before comparing." : ". Get the missing scope priced before comparing.");
  }
  if (rows.some((r) => !r.complete)) warnings.push("Not equal scope — some bids miss items others include. Level (add the missing scope) before choosing on price.");

  return { ok: true, label: "GUIDANCE — sub quotes are owner-entered; leveling is advisory, never auto-accepted",
    trade: trades.length === 1 ? trades[0] : undefined, scopeBaseline: baseline, scopeBasis: basis, bids: rows, summary, recommendation, warnings };
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({ ok: true, service: "sub-bid", pure: true, priced: false,
      note: "POST { bids:[{sub,trade,amount,scopeIncluded:[],exclusions:[],notes}], requiredScope?:[] }. Levels sub quotes to equal scope: low/high/spread + who's missing which scope item, so the cheapest-but-incomplete bid never wins by accident. Amounts are the subs' own quotes (owner-entered), NOT MGSF pricing. Advisory only — owner decides." });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  try { res.status(200).json(level(body.bids || body, { requiredScope: body.requiredScope })); }
  catch (e) { res.status(200).json({ ok: false, error: String((e && e.message) || e).slice(0, 140) }); }
};

module.exports.cleanBid = cleanBid;
module.exports.normalizeScope = normalizeScope;
module.exports.level = level;
