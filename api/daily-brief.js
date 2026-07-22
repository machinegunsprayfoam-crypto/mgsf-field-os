// Klyfton daily brief — composes the "morning brief" server-side from the app's KV data and
// (optionally) fires the event webhook so it can land on the owner's phone via Zapier/Make → SMS
// or email. DRAFT/READ-ONLY: it never sends customer-facing anything; it just pushes YOU a summary.
//
// DORMANT until storage is attached. With no KV it returns {configured:false}. The webhook only
// fires if ALERTS_WEBHOOK_URL is set — otherwise GET ?send=1 just returns the composed brief so you
// can preview it. No npm; global fetch only. Never fabricates — every number comes from your records.
//
//   GET /api/daily-brief          → { ok, brief } (preview, never fires)
//   GET /api/daily-brief?send=1   → compose + fire the webhook (used by the Mon–Sat cron)

function _kvEnv(suffixRe, excludeRe) {
  for (const k of Object.keys(process.env)) { if (excludeRe && excludeRe.test(k)) continue; if (suffixRe.test(k) && process.env[k]) return process.env[k]; }
  return undefined;
}
const KV_URL = _kvEnv(/KV_REST_API_URL$/i) || _kvEnv(/REST_API_URL$/i) || _kvEnv(/UPSTASH_REDIS_REST_URL$/i);
const KV_TOKEN = _kvEnv(/KV_REST_API_TOKEN$/i, /READ_ONLY/i) || _kvEnv(/REST_API_TOKEN$/i, /READ_ONLY/i);
const KV_ON = !!(KV_URL && KV_TOKEN);

const WEBHOOK = process.env.ALERTS_WEBHOOK_URL || process.env.NOTIFY_WEBHOOK_URL || "";
const SECRET = process.env.WEBHOOK_SECRET || process.env.ALERTS_WEBHOOK_SECRET || "";

async function kvGet(col) {
  try {
    const r = await fetch(KV_URL + "/get/" + encodeURIComponent("mgsf:" + col), { headers: { Authorization: "Bearer " + KV_TOKEN } });
    if (!r.ok) return [];
    const j = await r.json(); if (!j || j.result == null) return [];
    const p = JSON.parse(j.result); return Array.isArray(p) ? p : [];
  } catch { return []; }
}
async function fireWebhook(event, message, extra) {
  if (!WEBHOOK) return false;
  try {
    const payload = Object.assign({ event, message, at: new Date().toISOString() }, extra || {});
    const hdrs = { "content-type": "application/json", "x-klyfton-event": event };
    if (SECRET) { payload.token = SECRET; hdrs["x-klyfton-token"] = SECRET; }
    const r = await fetch(WEBHOOK, { method: "POST", headers: hdrs, body: JSON.stringify(payload) });
    return r.ok;
  } catch { return false; }
}

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const money = (n) => "$" + Math.round(num(n)).toLocaleString("en-US");
const daysSince = (d) => { const t = Date.parse(String(d || "").slice(0, 10)); return Number.isFinite(t) ? Math.floor((Date.now() - t) / 86400000) : null; };
const isDead = (s) => /won|lost|unqualif|closed|dead|complete|cancel/i.test(String(s || ""));

function compose(data) {
  const jobs = (data.jobs || []).filter((j) => j && !/paid|cancel|complete/i.test(j.status || ""));
  const leads = (data.leads || []).filter((l) => l && !isDead(l.status));
  const inv = (data.invoices || []).filter((v) => v && v.paid !== true && (num(v.amt) - num(v.dep)) > 0.5);

  const now = new Date();
  const tod = now.getUTCHours() < 18 ? "Morning" : "Evening"; // UTC-ish; fine for a heads-up
  const tkey = now.toISOString().slice(0, 10);
  const today = jobs.filter((j) => String(j.date || "").slice(0, 10) === tkey);

  const t0 = new Date(); t0.setUTCHours(0, 0, 0, 0);
  const wkEnd = t0.getTime() + 7 * 86400000;
  const parse = (d) => { const t = Date.parse(String(d || "").slice(0, 10)); return Number.isFinite(t) ? t : null; };
  const week = jobs.filter((j) => { const t = parse(j.date); return t != null && t >= t0.getTime() && t <= wkEnd; }).length;
  const overdue = jobs.filter((j) => { const t = parse(j.date); return t != null && t < t0.getTime(); }).length;

  const ar = inv.reduce((s, v) => s + (num(v.amt) - num(v.dep)), 0);
  const arLate = inv.filter((v) => { const d = daysSince(v.due || v.date); return d != null && d > 0; }).length;

  const cold = leads.filter((l) => { const d = daysSince(l.lastContact || l.date); return d == null || d >= 7; });
  const coldVal = cold.reduce((s, l) => s + num(l.value), 0);

  const pipe = leads.reduce((s, l) => s + num(l.value), 0) + jobs.reduce((s, j) => s + num(j.value), 0);

  const lines = [`Klyfton ${tod} Brief — ${now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}`];
  lines.push(today.length ? `Today: ${today.length} job(s) — ${today.map((j) => j.customer || j.name || "Job").join(", ")}` : "Today: nothing scheduled");
  lines.push(`Week: ${week} scheduled${overdue ? `, ${overdue} OVERDUE` : ""}`);
  if (inv.length) lines.push(`Owed to you: ${money(ar)} across ${inv.length} invoice(s)${arLate ? ` (${arLate} overdue)` : ""}`);
  if (cold.length) lines.push(`Cold leads: ${cold.length} quiet 7d+${coldVal ? ` — ${money(coldVal)} at risk` : ""}`);
  lines.push(`Pipeline: ${money(pipe)} (${leads.length} leads + ${jobs.length} jobs)`);

  return {
    text: lines.join("\n"),
    stats: { today: today.length, week, overdue, ar, arLate, invoices: inv.length, cold: cold.length, coldVal, pipeline: pipe },
  };
}

module.exports = async (req, res) => {
  if (!KV_ON) { res.status(200).json({ configured: false, note: "Attach Vercel KV to enable the daily brief." }); return; }
  try {
    const [jobs, leads, invoices] = await Promise.all([kvGet("jobs"), kvGet("leads"), kvGet("invoices")]);
    const brief = compose({ jobs, leads, invoices });

    const wantSend = req.query && String(req.query.send) === "1";
    // Never fire on Sundays — owner boundary (family day). Preview still works any day.
    const isSunday = new Date().getUTCDay() === 0;
    let sent = false;
    if (wantSend && !isSunday) sent = await fireWebhook("daily_brief", brief.text, { stats: brief.stats });

    res.status(200).json({
      ok: true, configured: true, draftOnly: true,
      webhook: WEBHOOK ? "configured" : "not_set",
      sent, skippedSunday: wantSend && isSunday,
      brief: brief.text, stats: brief.stats,
    });
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e && e.message || e).slice(0, 200) });
  }
};

module.exports.compose = compose;
