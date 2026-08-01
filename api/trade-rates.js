// Klyfton TRADE RATES — per-trade rate memory so the crew (incl. Clifton's nephews) don't re-type
// their usual material costs + labor rates every job. Saves OWNER-ENTERED rates keyed by trade + item
// and applies them to a new estimate's line items.
//
// NEVER FABRICATES A RATE (doctrine): every stored rate was entered by the owner. applyRates() only
// FILLS a line that's missing a rate — it NEVER overrides a rate the owner typed this time. Writes are
// Supabase-gated + owner-approved; inert + graceful without Supabase. No pricing doctrine here (these
// are the owner's own working rates for trades WITHOUT locked doctrine pricing).
//
// Pure core (rateKey/toRateMap/applyRates) is deterministic + unit-tested. POST { action:"list"|"save"|"apply", ... }

function _kvEnv(re) { for (const k of Object.keys(process.env)) { if (re.test(k) && process.env[k]) return process.env[k]; } return undefined; }
const SB_URL = _kvEnv(/SUPABASE_URL$/i);
const SB_KEY = _kvEnv(/SUPABASE_SERVICE_ROLE_KEY$/i) || _kvEnv(/SERVICE_ROLE_KEY$/i) || _kvEnv(/SUPABASE_SECRET/i);
const SB_ON = !!(SB_URL && SB_KEY);

function clean(s, max) { return String(s == null ? "" : s).trim().slice(0, max || 120); }
function num(v, d) { const n = parseFloat(v); return Number.isFinite(n) ? n : d; }
function norm(s) { return clean(s, 120).toLowerCase().replace(/\s+/g, " ").trim(); }

// Build a lookup map from saved rate rows: key "trade|item" → {unitCost, laborRate, unit}.
function rateKey(trade, item) { return norm(trade) + "|" + norm(item); }
function toRateMap(rows) {
  const m = {};
  for (const r of (Array.isArray(rows) ? rows : [])) {
    if (!r || !r.item) continue;
    m[rateKey(r.trade, r.item)] = { unitCost: num(r.unit_cost != null ? r.unit_cost : r.unitCost, null), laborRate: num(r.labor_rate != null ? r.labor_rate : r.laborRate, null), unit: clean(r.unit, 20) || undefined };
  }
  return m;
}

// Fill missing rates on line items from the saved map. NEVER overrides a rate the owner already typed.
function applyRates(lineItems, rateMap, trade) {
  const map = rateMap || {}; const out = []; let filled = 0;
  for (const li of (Array.isArray(lineItems) ? lineItems : [])) {
    const line = Object.assign({}, li);
    const saved = map[rateKey(trade, line.desc)];
    if (saved) {
      if ((line.unitCost == null || line.unitCost === "") && saved.unitCost != null) { line.unitCost = saved.unitCost; line._filledCost = true; filled++; }
      if ((line.laborRate == null || line.laborRate === "") && saved.laborRate != null) { line.laborRate = saved.laborRate; line._filledLabor = true; filled++; }
      if ((line.unit == null || line.unit === "") && saved.unit) line.unit = saved.unit;
    }
    out.push(line);
  }
  return { lineItems: out, filled, note: filled ? (filled + " rate(s) pre-filled from your saved rates — edit any that changed.") : "No saved rates matched — enter this job's rates (they can be saved after)." };
}

async function sbFetch(pathStr, opts) {
  return fetch(SB_URL.replace(/\/$/, "") + pathStr, { ...opts, headers: { apikey: SB_KEY, authorization: "Bearer " + SB_KEY, "content-type": "application/json", ...(opts && opts.headers) } });
}
async function list(trade) {
  if (!SB_ON) return { configured: false, rates: [] };
  try {
    const q = trade ? ("&trade=eq." + encodeURIComponent(clean(trade, 40))) : "";
    const r = await sbFetch("/rest/v1/trade_rates?select=trade,item,unit,unit_cost,labor_rate,updated_at&order=trade.asc,item.asc" + q + "&limit=1000");
    if (!r.ok) return { configured: true, ok: false, rates: [], status: r.status };
    const rows = await r.json();
    return { configured: true, ok: true, rates: Array.isArray(rows) ? rows : [] };
  } catch (e) { return { configured: true, ok: false, rates: [], error: String(e).slice(0, 120) }; }
}
async function save(trade, rates, opts) {
  if (!SB_ON) return { configured: false, ok: false, reason: "not_configured" };
  if (!(opts && opts.approved)) return { configured: true, ok: false, reason: "needs_approval", note: "Rate saves are owner-approved — resend with approved:true." };
  const rows = (Array.isArray(rates) ? rates : []).map((r) => ({
    trade: clean(trade || r.trade, 40), item: clean(r.item || r.desc, 120),
    unit: clean(r.unit, 20), unit_cost: num(r.unitCost != null ? r.unitCost : r.unit_cost, null), labor_rate: num(r.laborRate != null ? r.laborRate : r.labor_rate, null),
    updated_at: new Date().toISOString(),
  })).filter((r) => r.item && (r.unit_cost != null || r.labor_rate != null));   // only save lines that actually carry a rate
  if (!rows.length) return { configured: true, ok: false, reason: "nothing_to_save", note: "No line had a unit cost or labor rate to save." };
  try {
    const r = await sbFetch("/rest/v1/trade_rates?on_conflict=trade,item", { method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(rows) });
    if (!r.ok) return { configured: true, ok: false, status: r.status, detail: (await r.text()).slice(0, 160) };
    return { configured: true, ok: true, saved: rows.length };
  } catch (e) { return { configured: true, ok: false, error: String(e).slice(0, 120) }; }
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({ ok: true, service: "trade-rates", configured: SB_ON,
      note: "Per-trade rate memory. POST {action:'list'|'save'|'apply', trade, rates|lineItems, approved?}. Rates are OWNER-ENTERED, saved by trade+item, and only FILL missing rates on a new estimate (never override what you typed). Writes need Supabase + approved:true. No fabricated rates." });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  const action = clean(body.action, 12) || "list";
  try {
    if (action === "apply") {
      const l = await list(body.trade);
      res.status(200).json({ ok: true, configured: l.configured, ...applyRates(body.lineItems, toRateMap(l.rates), body.trade) });
      return;
    }
    if (action === "save") { res.status(200).json(await save(body.trade, body.rates || body.lineItems, { approved: !!body.approved })); return; }
    res.status(200).json(await list(body.trade));
  } catch (e) { res.status(200).json({ ok: false, error: String((e && e.message) || e).slice(0, 140) }); }
};

module.exports.rateKey = rateKey;
module.exports.toRateMap = toRateMap;
module.exports.applyRates = applyRates;
