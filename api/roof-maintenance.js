// Roof Maintenance program — recurring revenue Klyfton wasn't capturing. Harvested from MOGS
// (RoofMaintenance.gs). Tracks SPF-roof customers on a service cycle (annual inspection + periodic
// re-coat), flags who's due, and auto-drafts outreach through the webhook. Also quotes a plan price.
// KV-backed (mgsf:maintenance), no npm. Draft/report only — never bills or schedules on its own.
//
// GET  /api/roof-maintenance?sweep=1   -> read plans from KV, flag due/overdue, fire webhook
// POST { plans:[{customer,address,roofSqft,coating,lastService,installDate,inspectionMonths,recoatYears}], asOf }
// POST { quote:true, roofSqft, inspectionRate, recoatCostPerSqft, recoatYears }  -> annual plan price
// GET  (no query) -> shapes.

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
function clean(s, max) { return String(s == null ? "" : s).trim().slice(0, max || 120); }
function addMonths(iso, m) { const d = new Date(iso + "T00:00:00Z"); d.setUTCMonth(d.getUTCMonth() + m); return d.toISOString().slice(0, 10); }
function addYears(iso, y) { const d = new Date(iso + "T00:00:00Z"); d.setUTCFullYear(d.getUTCFullYear() + y); return d.toISOString().slice(0, 10); }
function daysUntil(iso, asOfMs) { const t = Date.parse(iso + "T00:00:00Z"); return Number.isFinite(t) ? Math.floor((t - asOfMs) / 86400000) : null; }

// One plan -> its next inspection + next re-coat and whether either is due.
function schedule(plan, asOfMs) {
  const base = /^\d{4}-\d{2}-\d{2}$/.test(plan.lastService || "") ? plan.lastService
    : (/^\d{4}-\d{2}-\d{2}$/.test(plan.installDate || "") ? plan.installDate : null);
  const inspMonths = Math.max(1, Math.round(num(plan.inspectionMonths, 12)));
  const recoatYears = Math.max(1, Math.round(num(plan.recoatYears, 10)));
  const installBase = /^\d{4}-\d{2}-\d{2}$/.test(plan.installDate || "") ? plan.installDate : base;
  const nextInspection = base ? addMonths(base, inspMonths) : null;
  const nextRecoat = installBase ? addYears(installBase, recoatYears) : null;
  const inspDays = nextInspection ? daysUntil(nextInspection, asOfMs) : null;
  const recoatDays = nextRecoat ? daysUntil(nextRecoat, asOfMs) : null;
  // "Due" if within 30 days or past.
  const inspDue = inspDays != null && inspDays <= 30;
  const recoatDue = recoatDays != null && recoatDays <= 90;   // re-coats need more lead time
  return { nextInspection, nextRecoat, inspDays, recoatDays, inspDue, recoatDue, due: inspDue || recoatDue };
}

function sweep(plans, asOfMs) {
  const active = /paid|paused|cancel|inactive|complete/i;
  const out = [];
  for (const p of Array.isArray(plans) ? plans : []) {
    if (!p) continue;
    if (p.status && active.test(String(p.status))) continue;
    const s = schedule(p, asOfMs);
    if (!s.due) continue;
    const what = [s.inspDue ? "inspection" : "", s.recoatDue ? "re-coat" : ""].filter(Boolean).join(" + ");
    out.push({
      customer: clean(p.customer || p.name, 80), address: clean(p.address, 120),
      roofSqft: num(p.roofSqft, 0), coating: clean(p.coating, 40),
      due: what, nextInspection: s.nextInspection, nextRecoat: s.nextRecoat,
      inspDays: s.inspDays, recoatDays: s.recoatDays,
      draft: `Hi ${(clean(p.customer || p.name, 80).split(/\s+/)[0]) || "there"}, this is Machine Gun Spray Foam — your roof is due for its ${what}. Keeping the coating maintained protects the warranty and the roof. Want us to get you on the schedule? 406-939-8301.`,
    });
  }
  // Soonest-due first.
  out.sort((a, b) => (Math.min(a.inspDays == null ? 1e9 : a.inspDays, a.recoatDays == null ? 1e9 : a.recoatDays)) - (Math.min(b.inspDays == null ? 1e9 : b.inspDays, b.recoatDays == null ? 1e9 : b.recoatDays)));
  return out;
}

// Recurring plan price. Rates are ESTIMATE inputs (caller-supplied defaults) — never invent a rate.
function quote(body) {
  const sqft = Math.max(0, num(body.roofSqft, 0));
  if (!sqft) return { ok: false, error: "need_roofSqft" };
  const inspectionRate = Math.max(0, num(body.inspectionRate, 0.03));      // $/sqft/yr for annual inspection + minor upkeep
  const recoatCostPerSqft = Math.max(0, num(body.recoatCostPerSqft, 1.25)); // $/sqft for a full re-coat
  const recoatYears = Math.max(1, Math.round(num(body.recoatYears, 12)));
  const annualInspection = sqft * inspectionRate;
  const recoatAmortized = (sqft * recoatCostPerSqft) / recoatYears;         // spread the next re-coat over the cycle
  const annualPlan = annualInspection + recoatAmortized;
  return {
    ok: true, label: "ESTIMATE",
    roofSqft: sqft, recoatYears,
    annualInspection: Math.round(annualInspection),
    recoatAmortizedPerYear: Math.round(recoatAmortized),
    annualPlanPrice: Math.round(annualPlan),
    monthlyPlanPrice: Math.round(annualPlan / 12),
    note: "Recurring roof-maintenance plan. Rates are estimates ($" + inspectionRate + "/sqft inspection, $" + recoatCostPerSqft + "/sqft re-coat over " + recoatYears + " yr) — set them to your real numbers. Recurring revenue + protects the warranty.",
  };
}

module.exports = async (req, res) => {
  const asOfMs = (req.query && Date.parse((clean(req.query.asOf, 20) || "") + "T00:00:00Z")) || Date.now();
  if (req.method === "GET") {
    if (req.query && String(req.query.sweep) === "1") {
      if (!KV_ON) { res.status(200).json({ ok: false, error: "kv_not_attached" }); return; }
      try {
        const plans = await kvGet("maintenance");
        const due = sweep(plans, asOfMs);
        let notified = false;
        if (due.length) {
          const top = due.slice(0, 5).map((d) => d.customer + " (" + d.due + ")").join("; ");
          notified = await fireWebhook("maintenance", due.length + " roof(s) due for service: " + top, { count: due.length });
        }
        res.status(200).json({ ok: true, draftOnly: true, scanned: plans.length, due: due.length, notified, plans: due });
      } catch (e) { res.status(200).json({ ok: false, error: String(e).slice(0, 140) }); }
      return;
    }
    res.status(200).json({ ok: true, configured: true, autoSweep: KV_ON,
      plan: { customer: "", address: "", roofSqft: 0, coating: "", installDate: "YYYY-MM-DD", lastService: "YYYY-MM-DD", inspectionMonths: 12, recoatYears: 10 },
      quote: { quote: true, roofSqft: 0, inspectionRate: 0.03, recoatCostPerSqft: 1.25, recoatYears: 12 } });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  try {
    if (body.quote) { res.status(200).json(quote(body)); return; }
    const plans = Array.isArray(body.plans) ? body.plans : (Array.isArray(body) ? body : []);
    const asOf = (body.asOf && Date.parse(clean(body.asOf, 20) + "T00:00:00Z")) || Date.now();
    const due = sweep(plans, asOf);
    res.status(200).json({ ok: true, draftOnly: true, scanned: plans.length, due: due.length, plans: due });
  } catch (e) { res.status(200).json({ ok: false, error: String(e).slice(0, 140) }); }
};

module.exports.sweep = sweep; module.exports.schedule = schedule; module.exports.quote = quote;
