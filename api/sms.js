// Klyfton text alerts via Twilio. Sends SMS (e.g. "new bid saved", "job won").
//
// SECURITY: credentials live ONLY in Vercel env vars, server-side. Never hardcode them, never
// send them to the browser. This runs on the server; the Account SID + Auth Token never leave it.
// Dormant until TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM are set.
//
//   GET             -> { configured, hasDefaultTo }
//   POST {to?, body} -> sends an SMS ('to' falls back to ALERT_SMS_TO)

function env(re, excl) { for (const k of Object.keys(process.env)) { if (excl && excl.test(k)) continue; if (re.test(k) && process.env[k]) return process.env[k]; } }
const SID = process.env.TWILIO_ACCOUNT_SID || env(/TWILIO.*ACCOUNT.*SID$/i) || env(/TWILIO_SID$/i);
const TOKEN = process.env.TWILIO_AUTH_TOKEN || env(/TWILIO.*AUTH.*TOKEN$/i) || env(/TWILIO_TOKEN$/i);
const FROM = process.env.TWILIO_FROM || process.env.TWILIO_PHONE_NUMBER || env(/TWILIO.*(FROM|PHONE|NUMBER)$/i);
const DEFAULT_TO = process.env.ALERT_SMS_TO || process.env.OWNER_SMS || env(/ALERT_SMS_TO$/i);
const ON = !!(SID && TOKEN && FROM);

module.exports = async (req, res) => {
  if (req.method === "GET") { res.status(200).json({ configured: ON, hasDefaultTo: !!DEFAULT_TO }); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }
  if (!ON) { res.status(200).json({ configured: false, hint: "Set TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM in Vercel." }); return; }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  const to = String(body.to || DEFAULT_TO || "").trim();
  const text = String(body.body || body.text || "").slice(0, 1200);
  if (!to) { res.status(400).json({ error: "No recipient — set ALERT_SMS_TO or pass 'to'." }); return; }
  if (!text) { res.status(400).json({ error: "Empty message." }); return; }

  try {
    const form = new URLSearchParams({ To: to, From: FROM, Body: text });
    const r = await fetch("https://api.twilio.com/2010-04-01/Accounts/" + encodeURIComponent(SID) + "/Messages.json", {
      method: "POST",
      headers: { Authorization: "Basic " + Buffer.from(SID + ":" + TOKEN).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { res.status(200).json({ configured: true, ok: false, error: (j && j.message) || ("Twilio " + r.status) }); return; }
    res.status(200).json({ configured: true, ok: true, sid: j.sid, status: j.status });
  } catch (e) {
    res.status(200).json({ configured: true, ok: false, error: String(e.message || e).slice(0, 200) });
  }
};
