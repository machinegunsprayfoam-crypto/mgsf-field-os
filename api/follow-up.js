// Follow-up sequencer — no lead goes cold. Harvested from MOGS (FollowUp.gs). Reads the app's leads,
// finds the ones that have gone quiet, and drafts the right nudge for how long it's been. Draft-only
// (never auto-sends). KV-backed (mgsf:leads), fires the webhook on a sweep so a weekly cron can
// surface "who to chase" through Zapier. No npm.
//
// GET  /api/follow-up?sweep=1   -> read leads from KV, draft nudges for quiet ones, fire webhook
// POST { leads:[{name,phone,email,service,value,status,date,lastContact}], asOf }
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
function daysSince(iso, asOfMs) { const t = Date.parse(clean(iso, 20)); return Number.isFinite(t) ? Math.floor((asOfMs - t) / 86400000) : null; }

// Cadence: 3-day soft touch, 7-day value nudge, 30-day last call. A lead is "quiet" if the last
// touch (lastContact, else created date) is 3+ days ago and it's still open.
function stageFor(days) {
  if (days >= 30) return { stage: "last-call", label: "30-day last call" };
  if (days >= 7) return { stage: "value", label: "7-day check-in" };
  if (days >= 3) return { stage: "soft", label: "3-day nudge" };
  return null;
}

function draftFor(lead, days, stage) {
  const fn = (clean(lead.name, 80).split(/\s+/)[0]) || "there";
  const svc = clean(lead.service, 40) || "your project";
  const co = "Machine Gun Spray Foam";
  if (stage === "soft") return `Hi ${fn}, ${co} here — just following up on ${svc}. Any questions I can knock out for you? Happy to get you a firm number. 406-939-8301.`;
  if (stage === "value") return `Hi ${fn}, checking back on ${svc}. If timing or budget is the holdup, we do offer $0-down financing — get it done now, pay it out. Want me to send the rate check? 406-939-8301.`;
  return `Hi ${fn}, last check-in on ${svc} — I'll close out your file if the timing's not right, no worries. If you still want a quote, just say the word and I'll get you on the schedule. ${co}, 406-939-8301.`;
}

function sweep(leads, asOfMs) {
  const closed = /won|lost|dead|complete|paid/i;
  const out = [];
  for (const l of Array.isArray(leads) ? leads : []) {
    if (!l) continue;
    if (l.status && closed.test(String(l.status))) continue;
    const days = daysSince(l.lastContact || l.date, asOfMs);
    if (days == null) continue;
    const st = stageFor(days);
    if (!st) continue;
    out.push({
      name: clean(l.name, 80), phone: clean(l.phone, 20), email: clean(l.email, 80),
      service: clean(l.service, 40), value: num(l.value, 0), status: clean(l.status, 20),
      quietDays: days, stage: st.stage, stageLabel: st.label,
      draft: draftFor(l, days, st.stage),
    });
  }
  // Highest-value + longest-quiet first — chase the best leads before they fully die.
  out.sort((a, b) => (b.value - a.value) || (b.quietDays - a.quietDays));
  return out;
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    if (req.query && String(req.query.sweep) === "1") {
      if (!KV_ON) { res.status(200).json({ ok: false, error: "kv_not_attached" }); return; }
      try {
        const leads = await kvGet("leads");
        const nudges = sweep(leads, Date.now());
        let notified = false;
        if (nudges.length) {
          const top = nudges.slice(0, 5).map((n) => n.name + " (" + n.quietDays + "d, " + n.stageLabel + ")").join("; ");
          notified = await fireWebhook("follow_up", nudges.length + " lead(s) to chase: " + top, { count: nudges.length });
        }
        res.status(200).json({ ok: true, draftOnly: true, scanned: leads.length, nudges: nudges.length, notified, followups: nudges });
      } catch (e) { res.status(200).json({ ok: false, error: String(e).slice(0, 140) }); }
      return;
    }
    res.status(200).json({ ok: true, configured: true, autoSweep: KV_ON,
      note: "GET ?sweep=1 drafts nudges for quiet open leads (3/7/30-day cadence), or POST { leads:[...] }. Draft-only." });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  try {
    const leads = Array.isArray(body.leads) ? body.leads : (Array.isArray(body) ? body : []);
    const asOf = (body.asOf && Date.parse(clean(body.asOf, 20))) || Date.now();
    const nudges = sweep(leads, asOf);
    res.status(200).json({ ok: true, draftOnly: true, scanned: leads.length, nudges: nudges.length, followups: nudges });
  } catch (e) { res.status(200).json({ ok: false, error: String(e).slice(0, 140) }); }
};

module.exports.sweep = sweep;
