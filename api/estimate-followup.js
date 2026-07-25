// Unsold-estimate re-engagement — reheat quotes that never closed. Most recovered contractor
// revenue hides in estimates that went quiet. Reads the app's estimates, finds the ones still
// open past a cadence, and drafts the right "still want to move on this?" nudge by age. Draft-only
// (never auto-sends). KV-backed (mgsf:estimates); fires the webhook on a sweep so a weekly cron can
// surface "which quotes to chase" through Zapier/Make. No npm. Sibling to follow-up.js (which
// chases LEADS); this one chases sent ESTIMATES.
//
// GET  /api/estimate-followup?sweep=1  -> read estimates from KV, draft nudges for quiet open ones
// POST { estimates:[{id,customer,service,total,status,date,lastContact}], asOf } -> drafts
// GET  (no query) -> shape.

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
function firstName(full) { const f = clean(full, 80).split(/\s+/)[0]; return f || "there"; }
function daysSince(iso, asOfMs) { const t = Date.parse(clean(iso, 30)); return Number.isFinite(t) ? Math.floor((asOfMs - t) / 86400000) : null; }

// Cadence for a SENT estimate that hasn't closed: 2-day quick check, 7-day objection/financing,
// 21-day last call before it goes stale. Doctrine holds: never invent a new price, never discount
// on our own — offer financing or to revisit scope, and leave the number to the owner.
function stageFor(days) {
  if (days >= 21) return { stage: "last-call", label: "21-day last call" };
  if (days >= 7) return { stage: "objection", label: "7-day check-in" };
  if (days >= 2) return { stage: "quick", label: "2-day quick check" };
  return null;
}

function draftFor(est, stage) {
  const fn = firstName(est.customer);
  const svc = clean(est.service, 40) || "your project";
  const co = "Machine Gun Spray Foam";
  if (stage === "quick")
    return `Hi ${fn}, ${co} here — did you get the estimate for ${svc}? Happy to walk through any line on it or answer questions. No pressure, just want to make sure it landed. 406-939-8301.`;
  if (stage === "objection")
    return `Hi ${fn}, following up on your ${svc} estimate. If timing or budget is the holdup, we offer $0-down financing so you can get it done now and pay it out — want me to send the rate check? Happy to revisit the scope too. 406-939-8301.`;
  return `Hi ${fn}, last check on your ${svc} estimate before I set it aside. Prices on materials move, so if you still want to move forward let me know and I'll confirm it's current and get you on the schedule. ${co}, 406-939-8301.`;
}

function sweep(estimates, asOfMs) {
  // Closed = won it, lost it, or it's already a job. Everything else that's aged is fair game.
  const closed = /won|accept|approv|lost|dead|declin|complete|paid|schedul|job/i;
  const out = [];
  for (const e of Array.isArray(estimates) ? estimates : []) {
    if (!e) continue;
    if (e.status && closed.test(String(e.status))) continue;
    const days = daysSince(e.lastContact || e.date, asOfMs);
    if (days == null) continue;
    const st = stageFor(days);
    if (!st) continue;
    out.push({
      id: clean(e.id, 40), customer: clean(e.customer, 80), phone: clean(e.phone, 20), email: clean(e.email, 80),
      service: clean(e.service, 40), total: num(e.total != null ? e.total : e.value, 0), status: clean(e.status, 20),
      quietDays: days, stage: st.stage, stageLabel: st.label,
      draft: draftFor({ customer: e.customer, service: e.service }, st.stage),
    });
  }
  // Biggest dollars + longest quiet first — recover the fattest quotes before they die.
  out.sort((a, b) => (b.total - a.total) || (b.quietDays - a.quietDays));
  return out;
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    if (req.query && String(req.query.sweep) === "1") {
      if (!KV_ON) { res.status(200).json({ ok: false, error: "kv_not_attached" }); return; }
      try {
        const estimates = await kvGet("estimates");
        const nudges = sweep(estimates, Date.now());
        let notified = false;
        if (nudges.length) {
          const top = nudges.slice(0, 5).map((n) => n.customer + " ($" + Math.round(n.total) + ", " + n.quietDays + "d)").join("; ");
          notified = await fireWebhook("estimate_followup", nudges.length + " unsold estimate(s) to reheat: " + top,
            { count: nudges.length, pipelineValue: Math.round(nudges.reduce((s, n) => s + n.total, 0)) });
        }
        res.status(200).json({ ok: true, draftOnly: true, scanned: estimates.length, nudges: nudges.length, notified, followups: nudges });
      } catch (e) { res.status(200).json({ ok: false, error: String(e).slice(0, 140) }); }
      return;
    }
    res.status(200).json({ ok: true, configured: true, autoSweep: KV_ON, draftOnly: true,
      note: "GET ?sweep=1 drafts reheat nudges for quiet open estimates (2/7/21-day cadence), or POST { estimates:[...] }. Never invents a price; draft-only." });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  try {
    const estimates = Array.isArray(body.estimates) ? body.estimates : (Array.isArray(body) ? body : []);
    const asOf = (body.asOf && Date.parse(clean(body.asOf, 30))) || Date.now();
    const nudges = sweep(estimates, asOf);
    res.status(200).json({ ok: true, draftOnly: true, scanned: estimates.length, nudges: nudges.length, followups: nudges });
  } catch (e) { res.status(200).json({ ok: false, error: String(e).slice(0, 140) }); }
};

module.exports.sweep = sweep;
