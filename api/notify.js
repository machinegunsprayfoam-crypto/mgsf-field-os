// Klyfton alerts — fires a webhook (Zapier "Catch Hook", Make, Twilio Flow, etc.)
// so Clifton gets a text/email the instant something happens (new web lead, reorder).
//
// No cloud storage needed. Set ONE env var in Vercel → mgsf-fieldos → Settings →
// Environment Variables:  ALERTS_WEBHOOK_URL = https://hooks.zapier.com/hooks/catch/....
// Then every new lead pings it. Dormant (returns {configured:false}) until it's set.

const WEBHOOK = process.env.ALERTS_WEBHOOK_URL || process.env.NOTIFY_WEBHOOK_URL || "";

module.exports = async (req, res) => {
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }
  if (!WEBHOOK) { res.status(200).json({ sent: false, configured: false }); return; }

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
    res.status(200).json({ sent: r.ok, status: r.status, configured: true });
  } catch (e) {
    res.status(200).json({ sent: false, error: String(e).slice(0, 140), configured: true });
  }
};
