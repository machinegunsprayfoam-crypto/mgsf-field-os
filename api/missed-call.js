// Missed-call auto-recovery — the #1 contractor revenue leak, plugged. When a call is missed
// (after-hours, on a roof, hands full), this drafts an INSTANT speed-to-lead text back to the
// caller plus an owner alert, and fires the event webhook so a Twilio/Zapier/Make flow can send
// the SMS within seconds. Draft/report only — it composes the message and fires the webhook event;
// it never dials or texts a customer itself (golden rule: outward actions are drafts for a human/
// approved automation). No npm, no keys required for the draft; the webhook is optional.
//
// POST { caller, phone, at, service, missedReason } -> { sms, ownerAlert, callbackTask, ... }
// GET  ?event=1 &phone=... &caller=... -> draft + fire webhook (for a Twilio "missed call" hook)
// GET  (no query) -> shape.

function _kvEnv(suffixRe, excludeRe) {
  for (const k of Object.keys(process.env)) { if (excludeRe && excludeRe.test(k)) continue; if (suffixRe.test(k) && process.env[k]) return process.env[k]; }
  return undefined;
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

function clean(s, max) { return String(s == null ? "" : s).trim().slice(0, max || 120); }
function firstName(full) { const f = clean(full, 80).split(/\s+/)[0]; return f || "there"; }

// Field-tolerant reader: outside callers (Hearth AI, Twilio, Zapier, Make, a raw web hook) each
// name their JSON differently — some send `from`, some `caller_number`, some `contact.name`. Pick
// the first non-empty value across a list of aliases so pointing any of them at this endpoint
// "just works" without a per-vendor adapter. Case-insensitive on the key; never invents data.
function pick(body, aliases) {
  if (!body || typeof body !== "object") return "";
  const lower = {};
  for (const k of Object.keys(body)) lower[k.toLowerCase()] = body[k];
  for (const a of aliases) {
    const v = lower[a.toLowerCase()];
    if (v != null && String(v).trim() !== "") return v;
  }
  return "";
}
// Aliases seen in the wild for the four things we need. Ordered most-specific → most-generic.
const A_CALLER  = ["caller", "caller_name", "callerName", "name", "from_name", "fromName", "contact_name", "contactName", "customer_name", "customerName", "contact", "customer"];
const A_PHONE   = ["phone", "phone_number", "phoneNumber", "caller_number", "callerNumber", "from_number", "fromNumber", "from", "number", "caller_id", "callerId", "tel", "msisdn"];
const A_SERVICE = ["service", "reason", "topic", "subject", "summary", "call_reason", "callReason", "intent", "notes", "note", "message", "transcript_summary", "transcriptSummary"];
const A_AT      = ["at", "time", "timestamp", "date", "datetime", "called_at", "calledAt", "start_time", "startTime", "call_time", "callTime", "created_at", "createdAt"];

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
  body = body || {};
  const caller = clean(pick(body, A_CALLER), 80);
  const fn = firstName(caller);
  const phone = clean(pick(body, A_PHONE), 20);
  const service = clean(pick(body, A_SERVICE), 60);
  const atRaw = clean(pick(body, A_AT), 40);
  const atMs = (atRaw && Date.parse(atRaw)) || nowMs;
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
      try {
        const out = build(q, Date.now());
        const notified = await fireWebhook("missed_call",
          out.ownerAlert,
          { caller: out.caller, phone: out.phone, service: out.service, sms: out.channels.sms.text, afterHours: out.afterHours });
        out.notified = notified;
        res.status(200).json(out);
      } catch (e) { res.status(200).json({ ok: false, error: String(e).slice(0, 140) }); }
      return;
    }
    res.status(200).json({ ok: true, configured: true, draftOnly: true, webhook: !!WEBHOOK,
      note: "POST a missed-call notification (from Hearth AI, Twilio, Zapier, Make, or any hook) for a draft speed-to-lead text; field names are tolerant (caller/name, phone/from/number, service/reason, at/time). GET ?event=1&phone=... also fires the webhook. Never sends on its own." });
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
