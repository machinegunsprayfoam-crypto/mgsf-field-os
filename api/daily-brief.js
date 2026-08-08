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

// CALL LIST — the weekly brain-audit's #1 fix ("leads die at the handoff"). The brief must not just
// COUNT leads; it must hand the owner a ready-to-act list: who to call, the number, and a one-line ask,
// ranked by urgency. The clock starts at CAPTURE — a brand-new lead with no callback yet is already on
// the list (that's the whole point). READ-ONLY: this composes a heads-up for YOU; it sends nothing to a
// customer. Never fabricates — every field comes from the lead record; unknowns render honestly.
function callList(leads, asOfMs, limit) {
  const now = Number.isFinite(asOfMs) ? asOfMs : Date.now();
  const dayMs = 86400000;
  const dsOf = (d) => { const t = Date.parse(String(d || "").slice(0, 10)); return Number.isFinite(t) ? Math.floor((now - t) / dayMs) : null; };
  const live = (leads || []).filter((l) => l && !isDead(l.status));
  const items = [];
  for (const l of live) {
    const lc = l.lastContact ? Date.parse(String(l.lastContact).slice(0, 10)) : NaN;
    const contacted = Number.isFinite(lc);                       // has a lastContact date on record (past or future)
    const sinceContact = contacted ? Math.floor((now - lc) / dayMs) : null; // negative if the date is in the future
    const uncontacted = !contacted;                             // only "no contact on record at all" is uncontacted
    const cold = sinceContact != null && sinceContact >= 7;
    if (!(uncontacted || cold)) continue;                        // contacted within 7d ⇒ not on the call list
    const phone = String(l.phone || l.number || l.tel || l.mobile || "").trim();
    const ask = (String(l.service || l.ask || l.note || l.notes || "").replace(/\s+/g, " ").trim().slice(0, 60)) || "follow up";
    const waited = uncontacted ? dsOf(l.date || l.created || l.captured) : sinceContact;
    items.push({
      name: String(l.name || l.customer || "Lead").trim() || "Lead",
      phone: phone || null, ask,
      waited: waited == null ? null : waited,
      uncontacted, value: num(l.value),
    });
  }
  // rank: never-contacted first (clock started at capture), then longest-waiting, then biggest value
  items.sort((a, b) => (Number(b.uncontacted) - Number(a.uncontacted)) || ((b.waited || 0) - (a.waited || 0)) || (b.value - a.value));
  return typeof limit === "number" ? items.slice(0, limit) : items;
}

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

  // CALL LIST — who to call TODAY (uncontacted-first), so a captured lead never dies at the handoff.
  const callsAll = callList(leads, now.getTime());
  const calls = callsAll.slice(0, 5);
  if (calls.length) {
    lines.push("");
    lines.push(`Call today (${callsAll.length}):`);
    calls.forEach((c) => {
      const ph = c.phone || "no # on file";
      const age = c.waited == null ? "" : (c.uncontacted ? ` — ${c.waited}d in, NO CALLBACK YET` : ` — quiet ${c.waited}d`);
      lines.push(`- ${c.name} · ${ph} · ${c.ask}${age}`);
    });
  }

  // Top audit findings (injected by the handler from business-audit's pure audit()). Only the
  // red/amber ones, top 3 — so the brief surfaces "what needs action" without opening OPS.
  const findings = Array.isArray(data.findings) ? data.findings : [];
  // Accept BOTH severity vocabularies: business-audit emits red/amber/green; other producers use
  // high/medium/low. Without red|amber here, real business-audit findings silently never reach the brief.
  const hot = findings.filter((f) => f && /high|red|medium|amber/i.test(String(f.severity || ""))).slice(0, 3);
  if (hot.length) {
    lines.push("");
    lines.push("Needs attention:");
    hot.forEach((f) => lines.push(`- ${f.title || f.area}${f.action ? ` → ${f.action}` : ""}`));
  }

  return {
    text: lines.join("\n"),
    stats: { today: today.length, week, overdue, ar, arLate, invoices: inv.length, cold: cold.length, coldVal, pipeline: pipe, findings: hot.length, calls: callsAll.length },
  };
}

module.exports = async (req, res) => {
  const guard = require("./guard"); if (!guard.ok(req)) { res.status(401).json(guard.denied()); return; }

  if (!KV_ON) { res.status(200).json({ configured: false, note: "Attach Vercel KV to enable the daily brief." }); return; }
  try {
    const [jobs, leads, invoices, estimates, certs] = await Promise.all([kvGet("jobs"), kvGet("leads"), kvGet("invoices"), kvGet("estimates"), kvGet("certs")]);
    // Fold the top business-audit findings into the brief (pure audit — degrades to none on any error).
    let findings = [];
    try { const a = require("./business-audit").audit({ leads, jobs, estimates, invoices, certs }, { asOfMs: Date.now() }); findings = (a && a.findings) || []; } catch (e) {}
    const brief = compose({ jobs, leads, invoices, findings });

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
module.exports.callList = callList;
