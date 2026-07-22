// Klyfton Event Webhook — the universal bridge out of the app.
//
// Fires a single webhook (Zapier "Catch Hook", Make, Twilio Flow, n8n, etc.) on every
// meaningful business event, so ONE URL can fan out to 6,000+ apps: text/email the owner
// on a new lead, drop a scheduled job on Google Calendar, push a deal to HubSpot, create
// a QuickBooks invoice on completion, ask for a review after a job, warn on low stock.
//
// No cloud storage needed. Set ONE env var in Vercel → mgsf-fieldos → Settings →
// Environment Variables:  ALERTS_WEBHOOK_URL = https://hooks.zapier.com/hooks/catch/....
// Dormant (returns {configured:false}) until it's set — the app behaves identically.

const WEBHOOK = process.env.ALERTS_WEBHOOK_URL || process.env.NOTIFY_WEBHOOK_URL || "";
// Optional shared secret — set WEBHOOK_SECRET in Vercel and filter on it in your Zap so only the
// app can fire real events (blocks anyone who guesses the catch-hook URL). Dormant if unset.
const SECRET = process.env.WEBHOOK_SECRET || process.env.ALERTS_WEBHOOK_SECRET || "";

// Small stable hash → a content-based event id. Identical payloads yield the SAME id, so an
// accidental double-fire (or a delivery retry) dedups downstream (HubSpot/Zapier) instead of
// creating a duplicate lead/deal. Not crypto — just a fast idempotency key.
function _hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }

// Twilio owner-text alerts (optional). Credentials live ONLY in env, server-side — never in the
// app or the repo. Dormant unless TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM are set.
function tenv(re, excl) { for (const k of Object.keys(process.env)) { if (excl && excl.test(k)) continue; if (re.test(k) && process.env[k]) return process.env[k]; } }
const TW_SID = process.env.TWILIO_ACCOUNT_SID || tenv(/TWILIO.*ACCOUNT.*SID$/i) || tenv(/TWILIO_SID$/i);
const TW_TOKEN = process.env.TWILIO_AUTH_TOKEN || tenv(/TWILIO.*AUTH.*TOKEN$/i) || tenv(/TWILIO_TOKEN$/i);
const TW_FROM = process.env.TWILIO_FROM || process.env.TWILIO_PHONE_NUMBER || tenv(/TWILIO.*(FROM|PHONE|NUMBER)$/i);
const TW_TO = process.env.ALERT_SMS_TO || process.env.OWNER_SMS || tenv(/ALERT_SMS_TO$/i);
const SMS_ON = !!(TW_SID && TW_TOKEN && TW_FROM);

async function sendSms(to, text) {
  const form = new URLSearchParams({ To: to, From: TW_FROM, Body: String(text).slice(0, 1200) });
  const r = await fetch("https://api.twilio.com/2010-04-01/Accounts/" + encodeURIComponent(TW_SID) + "/Messages.json", {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(TW_SID + ":" + TW_TOKEN).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: j.status || r.status, error: r.ok ? null : ((j && j.message) || ("Twilio " + r.status)) };
}

// Turn any event into a clean, SMS/email-friendly one-liner most Zaps can drop straight in.
function lineFor(event, body) {
  const lead = body.lead || {};
  const job = body.job || {};
  const inv = body.invoice || {};
  switch (event) {
    case "new_lead":
      return `New spray foam lead: ${lead.name || "?"}${lead.phone ? " · " + lead.phone : ""}${lead.service ? " · " + lead.service : ""}${lead.address ? " · " + lead.address : ""}`;
    case "job_scheduled":
      return `Job scheduled: ${job.customer || job.name || "?"}${job.service ? " · " + job.service : ""}${job.date ? " · " + job.date : ""}${job.address ? " · " + job.address : ""}`;
    case "job_completed":
      return `Job completed: ${job.customer || job.name || "?"}${job.service ? " · " + job.service : ""}${job.value ? " · $" + job.value : ""} — time to invoice & ask for a review.`;
    case "invoice":
      return `Invoice ready: ${inv.customer || job.customer || "?"}${inv.amount ? " · $" + inv.amount : ""}${inv.number ? " · #" + inv.number : ""}`;
    case "review_ask":
      return `Ask ${job.customer || lead.name || "the customer"} for a Google review — job just wrapped.`;
    case "reorder":
      return body.message || "Inventory hit a reorder point.";
    default:
      return body.message || "Klyfton alert";
  }
}

module.exports = async (req, res) => {
  // Status probe (webhook + text alerts).
  if (req.method === "GET") { res.status(200).json({ configured: !!WEBHOOK, sms: { configured: SMS_ON, hasDefaultTo: !!TW_TO } }); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  // Direct text send (Admin "Send test text").
  if (body.testSms) {
    if (!SMS_ON) { res.status(200).json({ sms: { configured: false } }); return; }
    const to = String(body.smsTo || TW_TO || "").trim();
    const text = String(body.smsText || body.message || "").slice(0, 1200);
    if (!to) { res.status(400).json({ error: "No recipient — set ALERT_SMS_TO or pass smsTo." }); return; }
    if (!text) { res.status(400).json({ error: "Empty message." }); return; }
    try { const s = await sendSms(to, text); res.status(200).json({ sms: { configured: true, sent: s.ok, status: s.status, error: s.error } }); }
    catch (e) { res.status(200).json({ sms: { configured: true, sent: false, error: String(e.message || e).slice(0, 160) } }); }
    return;
  }

  const event = body.event || "alert";
  const lead = body.lead || {};
  const job = body.job || {};
  const inv = body.invoice || {};

  // Flat, predictable fields so a Zap can map without digging into nested objects,
  // plus the original objects for anyone who wants them.
  const payload = {
    event,
    message: body.message || lineFor(event, body),
    // lead fields
    name: lead.name || job.customer || "",
    phone: lead.phone || job.phone || "",
    email: lead.email || job.email || "",
    service: lead.service || job.service || "",
    address: lead.address || job.address || "",
    value: lead.value || job.value || inv.amount || "",
    source: lead.source || "",
    // job/invoice fields
    customer: job.customer || inv.customer || lead.name || "",
    job_status: job.status || "",
    job_date: job.date || "",
    invoice_number: inv.number || "",
    invoice_amount: inv.amount || "",
    lead, job, invoice: inv,
    at: new Date().toISOString(),
  };
  // Idempotency key (content-based) + optional shared secret so the Zap can dedup and verify.
  const _entity = String(lead.id || job.id || inv.number || payload.customer || payload.name || "").trim();
  payload.id = body.id || (event + "_" + _hash([event, _entity, payload.service, payload.value, payload.job_status].join("|")));
  if (SECRET) payload.token = SECRET;

  // Fire the webhook (if configured) and the owner SMS (if a text body was supplied) — independently.
  let webhookSent = false, webhookStatus = 0, smsSent = false;
  if (WEBHOOK) {
    try {
      const hdrs = { "content-type": "application/json", "x-klyfton-event": event, "x-klyfton-id": payload.id };
      if (SECRET) hdrs["x-klyfton-token"] = SECRET;
      const r = await fetch(WEBHOOK, { method: "POST", headers: hdrs, body: JSON.stringify(payload) });
      webhookSent = r.ok; webhookStatus = r.status;
    } catch (e) {}
  }
  const smsText = body.smsText || "";
  if (SMS_ON && smsText && TW_TO) {
    try { const s = await sendSms(TW_TO, smsText); smsSent = s.ok; } catch (e) {}
  }
  res.status(200).json({ configured: !!WEBHOOK, sent: webhookSent, status: webhookStatus, sms: { configured: SMS_ON, sent: smsSent } });
};
