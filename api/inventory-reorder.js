// Inventory reorder sweep — server-side "what do we need to reorder, and from whom." Reads the same
// KV inventory the app syncs to, flags every item at/below its reorder point (matching the client's
// exact rule qty <= reorderAt), and groups the shortfall by supplier so one order covers each vendor.
// No keys beyond KV, no npm. Lets a cron / Zapier check stock and draft supplier orders automatically.
// Draft/report only — it never places an order.
//
// GET  /api/inventory-reorder?sweep=1   -> read app inventory from KV and return the reorder list
// POST { inventory:[{item,qty,unit,reorderAt,supplier}] }  -> score a supplied list
// GET  (no query) -> shape + note.

function _kvEnv(suffixRe, excludeRe) {
  for (const k of Object.keys(process.env)) { if (excludeRe && excludeRe.test(k)) continue; if (suffixRe.test(k) && process.env[k]) return process.env[k]; }
  return undefined;
}
const KV_URL = _kvEnv(/KV_REST_API_URL$/i) || _kvEnv(/REST_API_URL$/i) || _kvEnv(/UPSTASH_REDIS_REST_URL$/i);
const KV_TOKEN = _kvEnv(/KV_REST_API_TOKEN$/i, /READ_ONLY/i) || _kvEnv(/REST_API_TOKEN$/i, /READ_ONLY/i);
const KV_ON = !!(KV_URL && KV_TOKEN);
async function kvGet(col) {
  try {
    const r = await fetch(KV_URL + "/get/" + encodeURIComponent("mgsf:" + col), { headers: { Authorization: "Bearer " + KV_TOKEN } });
    if (!r.ok) return [];
    const j = await r.json(); if (!j || j.result == null) return [];
    const p = JSON.parse(j.result); return Array.isArray(p) ? p : [];
  } catch { return []; }
}

// Fire the app's event webhook so a daily cron sweep auto-drafts supplier orders via Zapier
// (Gmail/Slack) with no manual step. Dormant unless ALERTS_WEBHOOK_URL is set. Mirrors notify.js.
const WEBHOOK = process.env.ALERTS_WEBHOOK_URL || process.env.NOTIFY_WEBHOOK_URL || "";
const SECRET = process.env.WEBHOOK_SECRET || process.env.ALERTS_WEBHOOK_SECRET || "";
async function fireWebhook(event, message, extra) {
  if (!WEBHOOK) return false;
  try {
    const payload = Object.assign({ event, message, at: new Date().toISOString() }, extra || {});
    if (SECRET) payload.token = SECRET;
    const hdrs = { "content-type": "application/json", "x-klyfton-event": event };
    if (SECRET) hdrs["x-klyfton-token"] = SECRET;
    const r = await fetch(WEBHOOK, { method: "POST", headers: hdrs, body: JSON.stringify(payload) });
    return r.ok;
  } catch { return false; }
}

function num(v, d) { const n = parseFloat(v); return Number.isFinite(n) ? n : d; }
function clean(s, max) { return String(s == null ? "" : s).trim().slice(0, max || 80); }

function sweep(inventory) {
  const low = [];
  for (const it of Array.isArray(inventory) ? inventory : []) {
    if (!it) continue;
    const item = clean(it.item || it.name, 80);
    if (!item) continue;
    const qty = num(it.qty, 0);
    const reorderAt = num(it.reorderAt, 0);
    if (reorderAt <= 0) continue;                 // no reorder point set → not tracked
    if (qty > reorderAt) continue;                // healthy stock (matches client rule qty <= reorderAt)
    low.push({
      item, qty, unit: clean(it.unit, 16),
      reorderAt,
      short: Math.max(0, reorderAt - qty),         // how far below the line
      supplier: clean(it.supplier, 80) || "(no supplier set)",
    });
  }
  // Group by supplier so one PO covers each vendor.
  const bySupplier = {};
  for (const l of low) { (bySupplier[l.supplier] = bySupplier[l.supplier] || []).push(l); }
  const orders = Object.keys(bySupplier).sort().map((supplier) => ({
    supplier,
    lines: bySupplier[supplier].sort((a, b) => a.item.localeCompare(b.item)),
    draftText: `MGSF reorder — ${supplier}\n` +
      bySupplier[supplier].map((l) => `• ${l.item}: ${l.qty} ${l.unit} on hand (reorder at ${l.reorderAt})`).join("\n") +
      `\nPlease advise availability and lead time. Thanks — Machine Gun Spray Foam, 406-939-8301.`,
  }));
  return { flagged: low.length, suppliers: orders.length, items: low, orders };
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    if (req.query && String(req.query.sweep) === "1") {
      if (!KV_ON) { res.status(200).json({ ok: false, error: "kv_not_attached" }); return; }
      try {
        const inventory = await kvGet("inventory");
        const result = sweep(inventory);
        let notified = false;
        if (result.flagged) {
          const top = result.orders.map((o) => o.lines.length + " from " + o.supplier).join("; ");
          notified = await fireWebhook("reorder", result.flagged + " item(s) at reorder point — " + top, { count: result.flagged });
        }
        res.status(200).json(Object.assign({ ok: true, draftOnly: true, scanned: inventory.length, notified }, result));
      } catch (e) { res.status(200).json({ ok: false, error: String(e).slice(0, 140) }); }
      return;
    }
    res.status(200).json({ ok: true, configured: true, draftOnly: true, autoSweep: KV_ON,
      note: "GET ?sweep=1 to check the app's inventory, or POST { inventory:[...] }. Flags qty <= reorderAt, groups by supplier, drafts a reorder note. Never orders." });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  try {
    const list = Array.isArray(body.inventory) ? body.inventory : (Array.isArray(body) ? body : []);
    res.status(200).json(Object.assign({ ok: true, draftOnly: true, scanned: list.length }, sweep(list)));
  } catch (e) { res.status(200).json({ ok: false, error: String(e).slice(0, 140) }); }
};

module.exports.sweep = sweep;
