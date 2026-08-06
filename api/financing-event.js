// Financing-event receiver — the OTHER half of the Hearth bridge. When a customer applies for or is
// approved for financing off the Hearth link in our proposals, Hearth emails the owner
// (noreply@gethearth.com). Pointed here (via a Zapier email-parser POST, or a Hearth webhook if they
// offer one), this turns that email into a HOT-lead signal: an owner alert + a suggested CRM stage/
// priority bump. A customer prequalifying is the strongest buy signal there is — this makes sure it
// never sits unread. Draft/report only — it composes the alert and (optionally) fires the event
// webhook; it never messages a customer or writes the CRM itself (golden rule: outward = gated).
// It NEVER invents a dollar amount — only echoes what the notification carried.
//
// POST { customer, email, phone, amount, status } -> { heat, ownerAlert, crmUpdate, ... }
// GET  ?event=1 &customer=... &status=... -> draft + fire webhook
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

// Field-tolerant reader — Hearth (or the parser in front of it) may name fields differently, and the
// exact layout is unconfirmed until a real sample is seen. Pick the first non-empty across aliases,
// case-insensitive. Never invents data.
function pick(body, aliases) {
  if (!body || typeof body !== "object") return "";
  const lower = {};
  for (const k of Object.keys(body)) lower[k.toLowerCase()] = body[k];
  for (const a of aliases) { const v = lower[a.toLowerCase()]; if (v != null && String(v).trim() !== "") return v; }
  return "";
}
const A_CUSTOMER = ["customer", "customer_name", "customerName", "name", "borrower", "borrower_name", "applicant", "applicant_name", "first_name", "firstName", "contact", "full_name", "fullName"];
const A_EMAIL    = ["email", "customer_email", "customerEmail", "borrower_email", "applicant_email", "contact_email"];
const A_PHONE    = ["phone", "phone_number", "phoneNumber", "customer_phone", "borrower_phone", "mobile", "tel"];
const A_AMOUNT   = ["amount", "loan_amount", "loanAmount", "approved_amount", "approvedAmount", "requested_amount", "requestedAmount", "financed_amount", "project_amount", "projectAmount", "loan"];
const A_STATUS   = ["status", "stage", "state", "event", "event_type", "eventType", "type", "application_status", "applicationStatus", "disposition", "subject"];

// Amount: keep only what looks like money; never fabricate one.
function money(raw) {
  const m = String(raw == null ? "" : raw).replace(/[, ]/g, "").match(/\$?(\d+(?:\.\d{1,2})?)/);
  return m ? m[1] : "";
}

// Heat classification from the status text. HOT = approved/prequalified/funded (ready to close),
// WARM = applied/started/submitted (buyer in motion), COLD = declined/expired/canceled (pivot to
// alternatives). Any financing signal at all defaults to WARM — never dropped.
function classify(statusText) {
  const s = String(statusText || "").toLowerCase();
  if (/decline|denied|reject|expire|cancel|withdraw/.test(s)) return "cold";
  if (/approv|prequal|pre-qual|qualif|funded|accepted|offer/.test(s)) return "hot";
  if (/appl|start|submit|request|pending|review|progress|initiat/.test(s)) return "warm";
  return "warm";
}

function build(body, nowMs) {
  body = body || {};
  const customer = clean(pick(body, A_CUSTOMER), 80);
  const email = clean(pick(body, A_EMAIL), 120);
  const phone = clean(pick(body, A_PHONE), 20);
  const amount = money(pick(body, A_AMOUNT));
  const statusRaw = clean(pick(body, A_STATUS), 60);
  const heat = classify(statusRaw);
  const who = customer || email || phone || "A customer";
  const amtBit = amount ? " ($" + amount + ")" : "";
  const stBit = statusRaw ? " — " + statusRaw : "";

  let ownerAlert;
  if (heat === "hot") {
    ownerAlert = `💰 FINANCING — ${who} is approved/prequalified with Hearth${amtBit}${stBit}. Ready-to-close signal — call to lock the job now.`;
  } else if (heat === "cold") {
    ownerAlert = `💰 FINANCING — ${who}'s Hearth application did not go through${stBit}. Follow up with options (deposit/terms) — don't let the lead go cold.`;
  } else {
    ownerAlert = `💰 FINANCING — ${who} started a Hearth financing application${amtBit}${stBit}. Warm buyer in motion — follow up and keep it moving.`;
  }

  // Suggested (NOT executed) CRM move for the owner/arms to approve.
  const crmUpdate = {
    action: "suggest",
    match: { email: email || null, phone: phone || null, name: customer || null },
    priority: heat === "hot" ? "high" : (heat === "cold" ? "normal" : "high"),
    stageHint: heat === "hot" ? "Financing Approved — Ready to Close" : (heat === "cold" ? "Financing Fell Through — Re-engage" : "Financing In Progress"),
    note: "Financing signal from Hearth. Draft only — owner/arms approve any CRM write.",
  };

  return {
    ok: true,
    draftOnly: true,
    source: "hearth",
    customer: customer || null, email: email || null, phone: phone || null,
    amount: amount || null, status: statusRaw || null,
    heat,
    ownerAlert,
    crmUpdate,
  };
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    const q = req.query || {};
    if (String(q.event) === "1") {
      try {
        const out = build(q, Date.now());
        const notified = await fireWebhook("financing_event", out.ownerAlert,
          { customer: out.customer, email: out.email, phone: out.phone, amount: out.amount, status: out.status, heat: out.heat });
        out.notified = notified;
        res.status(200).json(out);
      } catch (e) { res.status(200).json({ ok: false, error: String(e).slice(0, 140) }); }
      return;
    }
    res.status(200).json({ ok: true, configured: true, draftOnly: true, webhook: !!WEBHOOK,
      note: "POST a Hearth financing notification (from noreply@gethearth.com via a Zapier email parser, or a Hearth webhook) for a HOT-lead owner alert + suggested CRM stage; field names are tolerant (customer/name, email, phone, amount/loan_amount, status/stage). GET ?event=1&customer=...&status=... also fires the webhook. Never writes the CRM or messages a customer on its own." });
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
module.exports.classify = classify;
module.exports.money = money;
