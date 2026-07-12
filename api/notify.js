// Klyfton alerts — fires a webhook (Zapier "Catch Hook", Make, Twilio Flow, etc.)
// so Clifton gets a text/email the instant something happens (new web lead, reorder).
//
// No cloud storage needed. Set ONE env var in Vercel → mgsf-fieldos → Settings →
// Environment Variables:  ALERTS_WEBHOOK_URL = https://hooks.zapier.com/hooks/catch/....
// Then every new lead pings it. Dormant (returns {configured:false}) until it's set.

const WEBHOOK = process.env.ALERTS_WEBHOOK_URL || process.env.NOTIFY_WEBHOOK_URL || "";

function allowOrigin(origin) {
  if (!origin) return null;
  let host;
  try { host = new URL(origin).hostname; } catch (e) { return null; }
  if (host === 'machinegunsprayfoam.info' || host.endsWith('.machinegunsprayfoam.info')) return origin;
  if (host.endsWith('.vercel.app')) return origin;
  if (host === 'localhost' || host === '127.0.0.1') return origin;
  return null;
}

function setCors(req, res) {
  const reflected = allowOrigin(req.headers.origin);
  if (reflected) res.setHeader('Access-Control-Allow-Origin', reflected);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function sendJson(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(obj));
}

module.exports = async (req, res) => {
  setCors(req, res);

  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
  if (req.method !== 'POST') { sendJson(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }); return; }
  if (!WEBHOOK) { sendJson(res, 200, { sent: false, configured: false }); return; }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  // Build a clean, SMS/email-friendly payload for the webhook to map onto a message.
  const lead = body.lead || {};
  const payload = {
    event: body.event || "alert",
    // A ready-to-send one-liner most Zaps can drop straight into SMS/email:
    message: body.message || (body.event === "new_lead"
      ? `New spray foam lead: ${lead.name || "?"}${lead.phone ? " · " + lead.phone : ""}${lead.service ? " · " + lead.service : ""}${lead.address ? " · " + lead.address : ""}`
      : "Klyfton alert"),
    name: lead.name || "",
    phone: lead.phone || "",
    email: lead.email || "",
    service: lead.service || "",
    address: lead.address || "",
    value: lead.value || "",
    source: lead.source || "",
    at: new Date().toISOString(),
  };

  try {
    const r = await fetch(WEBHOOK, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    sendJson(res, 200, { sent: r.ok, status: r.status, configured: true });
  } catch (e) {
    sendJson(res, 200, { sent: false, error: String(e).slice(0, 140), configured: true });
  }
};
