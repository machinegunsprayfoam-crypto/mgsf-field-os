// Stripe webhook receiver — the money-loop closer. When a payment succeeds, Stripe POSTs a SIGNED
// event here; this verifies the signature (STRIPE_WEBHOOK_SECRET), normalizes the payment (amount /
// customer / id), raises an owner alert + a SUGGESTED CRM "mark Paid", and turns the gearbox
// `payment.received` gear (→ job.completed → review request draft) so lead→…→paid→review finally
// links up. The money already moved at Stripe — this only RECORDS + NOTIFIES + drafts; it never
// charges, refunds, or writes truth on its own, and never fabricates an amount. Unsigned/!configured
// callers are rejected (fail-closed) — a payment event must be provably from Stripe.
//
// POST (Stripe event, header Stripe-Signature) -> { received, payment?, ownerAlert? }
// GET  -> shape.
const crypto = require("crypto");

const SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
const ALERTS = process.env.ALERTS_WEBHOOK_URL || process.env.NOTIFY_WEBHOOK_URL || "";
const ALERT_TOKEN = process.env.WEBHOOK_SECRET || process.env.ALERTS_WEBHOOK_SECRET || "";

function clean(s, max) { return String(s == null ? "" : s).trim().slice(0, max || 200); }

// Verify Stripe's `Stripe-Signature: t=<ts>,v1=<hexhmac>` over `<ts>.<rawBody>` (HMAC-SHA256).
// Pure + injectable nowMs so it's testable and deterministic. Constant-time compare; timestamp
// tolerance guards replay. Returns {ok, reason}.
function verifySignature(rawBody, sigHeader, secret, nowMs, toleranceSec) {
  if (!secret) return { ok: false, reason: "not_configured" };
  if (rawBody == null || !sigHeader) return { ok: false, reason: "missing_input" };
  const parts = {};
  String(sigHeader).split(",").forEach((kv) => { const i = kv.indexOf("="); if (i > 0) parts[kv.slice(0, i).trim()] = kv.slice(i + 1).trim(); });
  const t = parts.t, v1 = parts.v1;
  if (!t || !v1) return { ok: false, reason: "malformed_header" };
  const signed = String(t) + "." + String(rawBody);
  const expected = crypto.createHmac("sha256", secret).update(signed, "utf8").digest("hex");
  let match = false;
  try { match = expected.length === v1.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1)); } catch { match = false; }
  if (!match) return { ok: false, reason: "signature_mismatch" };
  const tol = toleranceSec || 300;
  const age = Math.abs((Number(nowMs) / 1000) - Number(t));
  if (Number.isFinite(age) && age > tol) return { ok: false, reason: "timestamp_out_of_tolerance" };
  return { ok: true };
}

// Pure: normalize a Stripe event object into the fields we care about. Amounts are cents in Stripe —
// convert to dollars; never invent one (missing → null).
function parseEvent(evt) {
  evt = evt || {};
  const type = clean(evt.type, 80);
  const obj = (evt.data && evt.data.object) || {};
  const cents = obj.amount_total != null ? obj.amount_total
    : obj.amount_paid != null ? obj.amount_paid
      : obj.amount_received != null ? obj.amount_received
        : obj.amount != null ? obj.amount : null;
  const amount = cents != null && Number.isFinite(Number(cents)) ? Math.round(Number(cents)) / 100 : null;
  const currency = clean(obj.currency || "usd", 8).toUpperCase();
  const email = clean((obj.customer_details && obj.customer_details.email) || obj.receipt_email || (obj.billing_details && obj.billing_details.email) || obj.customer_email, 120);
  const name = clean((obj.customer_details && obj.customer_details.name) || (obj.billing_details && obj.billing_details.name), 80);
  const id = clean(obj.id, 80);
  const paidFlag = obj.paid === true || obj.status === "paid" || obj.status === "complete" || obj.status === "succeeded";
  const isPaymentType = /checkout\.session\.completed|invoice\.paid|charge\.succeeded|payment_intent\.succeeded/.test(type);
  const paid = isPaymentType && (paidFlag || /completed|paid|succeeded/.test(type));
  return { type, paid, amount, currency, email, name, id, livemode: evt.livemode === true };
}

// Pure: owner alert + suggested CRM move for a parsed payment (or nulls when it isn't one we act on).
function summarize(p) {
  p = p || {};
  if (!p.paid) return { isPayment: false, ownerAlert: null, crmUpdate: null };
  const who = p.name || p.email || "A customer";
  const amtBit = p.amount != null ? ` paid $${p.amount.toFixed(2)}` : " completed a payment";
  const ownerAlert = `💵 PAYMENT — ${who}${amtBit} via Stripe. Mark the job Paid; a review request is queued (draft).`;
  const crmUpdate = {
    action: "suggest",
    match: { email: p.email || null, name: p.name || null },
    stageHint: "Paid",
    priority: "normal",
    note: "Stripe payment received. Draft only — owner/arms approve any CRM write.",
  };
  return { isPayment: true, ownerAlert, crmUpdate };
}

async function fireAlert(message, extra) {
  if (!ALERTS) return false;
  try {
    const payload = Object.assign({ event: "payment_received", message, at: new Date().toISOString() }, extra || {});
    if (ALERT_TOKEN) payload.token = ALERT_TOKEN;
    const hdrs = { "content-type": "application/json", "x-klyfton-event": "payment_received" };
    if (ALERT_TOKEN) hdrs["x-klyfton-token"] = ALERT_TOKEN;
    const r = await fetch(ALERTS, { method: "POST", headers: hdrs, body: JSON.stringify(payload) });
    return r.ok;
  } catch { return false; }
}

// Best-effort: turn the money-loop gear. Owner gears inside (review request) stay gated drafts.
async function turnGear(p) {
  try {
    const gb = require("./gearbox");
    if (gb && typeof gb.turn === "function") {
      await gb.turn("payment.received", p.id || p.email || "payment", { customer: p.name, email: p.email, amount: p.amount, service: "" }, "stripe", false);
      return true;
    }
  } catch { /* gearbox optional */ }
  return false;
}

// Get the RAW body for signature verification (Stripe signs exact bytes — a re-stringified object
// won't match). Vercel may hand us a string or a parsed object; prefer the string.
function rawBodyOf(req) {
  if (typeof req.rawBody === "string") return req.rawBody;
  if (typeof req.body === "string") return req.body;
  return null; // parsed object → cannot reconstruct exact bytes; verification will fail-closed
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({ ok: true, configured: !!SECRET, draftOnly: true, alerts: !!ALERTS,
      note: "Stripe webhook endpoint. Set STRIPE_WEBHOOK_SECRET (Vercel) + add this URL in Stripe Dashboard → Developers → Webhooks (events: checkout.session.completed, invoice.paid, charge.succeeded). Verifies the signature, alerts on payment, turns the gearbox payment.received gear (→ review draft). Never charges/refunds/writes truth on its own." });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  if (!SECRET) { res.status(503).json({ ok: false, reason: "not_configured", need: "STRIPE_WEBHOOK_SECRET" }); return; }

  const raw = rawBodyOf(req);
  const sig = req.headers && (req.headers["stripe-signature"] || req.headers["Stripe-Signature"]);
  const ver = verifySignature(raw, sig, SECRET, Date.now(), 300);
  if (!ver.ok) { res.status(400).json({ ok: false, reason: ver.reason }); return; }

  let evt; try { evt = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { res.status(400).json({ ok: false, reason: "bad_json" }); return; }
  const parsed = parseEvent(evt);
  const sum = summarize(parsed);
  if (sum.isPayment) {
    await fireAlert(sum.ownerAlert, { amount: parsed.amount, email: parsed.email, name: parsed.name, id: parsed.id, livemode: parsed.livemode });
    await turnGear(parsed);
  }
  // Always 200 to Stripe on a verified event (even non-payment types) so it doesn't retry.
  res.status(200).json({ received: true, type: parsed.type, payment: sum.isPayment, ownerAlert: sum.ownerAlert || null });
};

module.exports.verifySignature = verifySignature;
module.exports.parseEvent = parseEvent;
module.exports.summarize = summarize;
