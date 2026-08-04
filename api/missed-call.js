// Missed-call auto-recovery — the #1 contractor revenue leak, plugged. When a call is missed
// (after-hours, on a roof, hands full), this drafts an INSTANT speed-to-lead text back to the
// caller plus an owner alert, and fires the event webhook so a Twilio/Zapier/Make flow can send
// the SMS within seconds. Draft/report only — it composes the message and fires the webhook event;
// it never dials or texts a customer itself (golden rule: outward actions are drafts for a human/
// approved automation). No npm, no keys required for the draft; the webhook is optional.
//
// POST { caller, phone, at, service, missedReason } -> { sms, ownerAlert, callbackTask, ... }
// GET  ?event=1 &phone=... &caller=... -> draft + fire webhook (requires MISSED_CALL_WEBHOOK_SECRET when configured)
// GET  (no query) -> shape.

function _kvEnv(suffixRe, excludeRe) {
  for (const k of Object.keys(process.env)) { if (excludeRe && excludeRe.test(k)) continue; if (suffixRe.test(k) && process.env[k]) return process.env[k]; }
  return undefined;
}
const WEBHOOK = process.env.ALERTS_WEBHOOK_URL || process.env.NOTIFY_WEBHOOK_URL || "";
const SECRET = process.env.WEBHOOK_SECRET || process.env.ALERTS_WEBHOOK_SECRET || "";
// Dedicated inbound secret for the Twilio/automation callback. It is intentionally optional so
// existing deployments stay live until the provider has been updated with the new credential.
function safeEqual(a, b) { a = String(a); b = String(b); if (a.length !== b.length) return false; let diff = 0; for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i); return diff === 0; }
function eventAuthorized(req, env) {
  const secret = String((env || process.env).MISSED_CALL_WEBHOOK_SECRET || "");
  if (!secret) return true;
  const headers = (req && req.headers) || {}, query = (req && req.query) || {};
  const supplied = headers["x-missed-call-secret"] || headers["X-Missed-Call-Secret"] || query.secret || "";
  return safeEqual(supplied, secret);
}
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

function clean(s, max) { return String(s == null ? "" : s).trim().slice(0, max || 120); }
function firstName(full) { const f = clean(full, 80).split(/\s+/)[0]; return f || "there"; }

// Business hours (America/Denver): Mon–Sat 8–6, no Sunday work (doctrine). If the miss is
// after-hours, the text sets next-business-day expectations instead of "right back."
function afterHours(atMs) {
  const d = new Date(atMs);
  // getUTC*, then shift to Mountain (UTC-6 MDT / UTC-7 MST — use -6 as the summer default;
  // the message only changes tone, never a commitment, so the hour edge is harmless).
  const mtHour = ((d.getUTCHours() - 6) % 24 + 24) % 24;
  const mtDay = d.getUTCDay(); // 0 = Sun
  const sunday = mtDay === 0;
  const open = !sunday && mtHour >= 8 && mtHour < 18;
  return { open, sunday };
}

function build(body, nowMs) {
  const caller = clean(body.caller || body.name, 80);
  const fn = firstName(caller);
  const phone = clean(body.phone, 20);
  const service = clean(body.service, 60);
  const atMs = (body.at && Date.parse(clean(body.at, 30))) || nowMs;
  const co = "Machine Gun Spray Foam";
  const svcBit = service ? ` about ${service}` : "";
  const hrs = afterHours(atMs);

  // Speed-to-lead SMS — sent back to the CALLER within seconds. One ask, easy to reply.
  let sms;
  if (hrs.sunday) {
    sms = `Hi ${fn}, this is ${co} — sorry we missed your call${svcBit}. We're closed Sundays (family day) but I'll call you first thing tomorrow. ` +
          `Reply here with what you need and I'll come ready. 406-939-8301.`;
  } else if (hrs.open) {
    sms = `Hi ${fn}, ${co} here — sorry we missed you${svcBit}, we were likely on a job. I'll call you right back. ` +
          `Or text me what you need and I'll get you a number. 406-939-8301.`;
  } else {
    sms = `Hi ${fn}, this is ${co} — sorry we missed your call${svcBit}. It's after hours here, but you're first on my list in the morning. ` +
          `Reply with the details (town + what you need) and I'll come ready. 406-939-8301.`;
  }

  const ownerAlert = `📞 MISSED CALL${caller ? " from " + caller : ""}${phone ? " (" + phone + ")" : ""}${svcBit}. ` +
    `Speed-to-lead text drafted — send/approve it, then call back. Faster you call, likelier you close.`;

  const callbackTask = {
    title: `Call back ${caller || phone || "missed caller"}`,
    due: hrs.open ? "within 5 minutes" : (hrs.sunday ? "Monday AM" : "next business morning"),
    phone: phone || null,
    note: "Speed-to-lead: contractors who call back within 5 min close far more. Draft text already staged.",
  };

  return {
    ok: true,
    draftOnly: true,
    caller, phone: phone || null, service: service || null,
    afterHours: !hrs.open,
    channels: { sms: { to: phone || null, text: sms, chars: sms.length } },
    ownerAlert,
    callbackTask,
  };
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    const q = req.query || {};
    if (String(q.event) === "1") {
      if (!eventAuthorized(req)) { res.status(401).json({ ok: false, error: "unauthorized" }); return; }
      try {
        const out = build({ caller: q.caller, phone: q.phone, service: q.service, at: q.at }, Date.now());
        const notified = await fireWebhook("missed_call",
          out.ownerAlert,
          { caller: out.caller, phone: out.phone, service: out.service, sms: out.channels.sms.text, afterHours: out.afterHours });
        out.notified = notified;
        res.status(200).json(out);
      } catch (e) { res.status(200).json({ ok: false, error: String(e).slice(0, 140) }); }
      return;
    }
    res.status(200).json({ ok: true, configured: true, draftOnly: true, webhook: !!WEBHOOK,
      note: "POST { caller, phone, at, service } for a draft speed-to-lead text; or GET ?event=1&phone=... from a Twilio missed-call hook to also fire the webhook. Set MISSED_CALL_WEBHOOK_SECRET and send it in x-missed-call-secret (or secret query parameter) to protect the inbound trigger. Never sends on its own." });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  try { res.status(200).json(build(body, Date.now())); }
  catch (e) { res.status(200).json({ ok: false, error: String(e).slice(0, 140) }); }
};

module.exports.build = build;
module.exports.eventAuthorized = eventAuthorized;
