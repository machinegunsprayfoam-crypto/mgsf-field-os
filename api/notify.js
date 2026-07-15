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
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }
  if (!WEBHOOK) { res.status(200).json({ sent: false, configured: false }); return; }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

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
