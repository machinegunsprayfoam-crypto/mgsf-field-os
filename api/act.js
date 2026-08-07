// Klyfton's ARMS — the outward action executor. The brain already has HANDS (it drafts ~25 kinds
// of [[ACTION]] blocks that the app applies on a confirm tap). This is the muscle for the actions
// that LEAVE THE BUILDING or cost money — send an email/text, book an appointment, push to the CRM,
// create an invoice, place a material order. It is the real executor behind the "Silvr" idea in
// CLAUDE.md (which was never built).
//
// SAFETY MODEL (doctrine: never auto-send truth; hard gate on money/binding/irreversible):
//   - Every outward action is GATED: it will NOT dispatch unless the caller passes approved:true
//     (that's Clifton tapping the confirm button). Without it you get a preview + needs_approval.
//   - Dispatch goes through the owner-controlled event webhook (Zapier/Make/Twilio/n8n → the real
//     send). No raw customer credentials live in this function, and it is INERT until the owner sets
//     ALERTS_WEBHOOK_URL. So nothing can go out silently or by accident.
//   - Every dispatch returns an audit record and fires an 'action_executed' event.
// Reversible, zero-dollar, in-app data writes (remember/log_*/add_lead…) are handled by the app's
// existing confirm flow, NOT here — this endpoint is outward muscle only.
//
// POST { action:{type,...}, approved:true, actor } -> dispatch (if approved) or needs_approval
// GET  -> the supported arms + safety note.

function _kvEnv(suffixRe, excludeRe) {
  for (const k of Object.keys(process.env)) { if (excludeRe && excludeRe.test(k)) continue; if (suffixRe.test(k) && process.env[k]) return process.env[k]; }
  return undefined;
}
const WEBHOOK = process.env.ALERTS_WEBHOOK_URL || process.env.NOTIFY_WEBHOOK_URL || "";
const SECRET = process.env.WEBHOOK_SECRET || process.env.ALERTS_WEBHOOK_SECRET || "";

let idempotency = null;
try { idempotency = require("./idempotency"); } catch (e) {}

function clean(s, max) { return String(s == null ? "" : s).trim().slice(0, max || 300); }

// The arms. Every one is outward/irreversible/costs money => all require approval. `preview` builds
// the human-readable confirm-card line; `event` is the webhook event name the owner's flow routes on.
const ARMS = {
  send_email: {
    event: "arm_send_email",
    fields: ["to", "subject", "body"],
    preview: (a) => `Send email to ${clean(a.to, 80) || "?"} — "${clean(a.subject, 80) || "(no subject)"}"`,
  },
  send_sms: {
    event: "arm_send_sms",
    fields: ["to", "body"],
    preview: (a) => `Text ${clean(a.to, 20) || "?"}: "${clean(a.body, 100)}"`,
  },
  book_appointment: {
    event: "arm_book_appointment",
    fields: ["customer", "when", "service", "address"],
    preview: (a) => `Book ${clean(a.service, 40) || "appointment"} for ${clean(a.customer, 60) || "?"} on ${clean(a.when, 40) || "?"}`,
  },
  crm_update: {
    event: "arm_crm_update",
    fields: ["object", "id", "fields"],
    preview: (a) => `Update CRM ${clean(a.object, 20) || "record"} ${clean(a.id, 40) || ""}`.trim(),
  },
  create_invoice: {
    event: "arm_create_invoice",
    fields: ["customer", "amount", "job"],
    preview: (a) => `Create invoice for ${clean(a.customer, 60) || "?"} — $${Math.max(0, parseFloat(a.amount) || 0)}`,
  },
  place_material_order: {
    event: "arm_place_material_order",
    fields: ["supplier", "items", "job"],
    preview: (a) => `Order from ${clean(a.supplier, 60) || "?"} for ${clean(a.job, 40) || "stock"}`,
  },
  // ── Division-facing arms (map to the new specialists) ──────────────────────────
  // Sales & Growth → Proposal-Writer: deliver a finished proposal to a customer.
  send_proposal: {
    event: "arm_send_proposal",
    fields: ["customer", "to"],
    preview: (a) => `Send proposal to ${clean(a.customer, 60) || "?"} <${clean(a.to, 80) || "?"}>` +
      (a.amount != null && String(a.amount).trim() !== "" ? ` — $${Math.max(0, parseFloat(a.amount) || 0)}` : ""),
  },
  // Sales & Growth → Reviews-Referrals: ask a customer for a review after job close.
  request_review: {
    event: "arm_request_review",
    fields: ["customer", "to"],
    preview: (a) => `Request review from ${clean(a.customer, 60) || "?"} <${clean(a.to, 80) || "?"}>`,
  },
  // Finance & Admin → Cash-Flow: send a deposit/payment link.
  send_payment_link: {
    event: "arm_send_payment_link",
    fields: ["customer", "to", "amount"],
    preview: (a) => `Send payment link to ${clean(a.customer, 60) || "?"} — $${Math.max(0, parseFloat(a.amount) || 0)}`,
  },
  // Finance & Admin → AR-Collections: a staged AR reminder (nudge/reminder/final/lien-warning).
  collections_notice: {
    event: "arm_collections_notice",
    fields: ["customer", "to", "amount", "stage"],
    preview: (a) => `Collections ${clean(a.stage, 24) || "notice"} → ${clean(a.customer, 50) || "?"} — $${Math.max(0, parseFloat(a.amount) || 0)}`,
  },
  // Sales & Growth → Marketing: publish a social post (fans out via the owner's flow).
  post_social: {
    event: "arm_post_social",
    fields: ["platform", "body"],
    preview: (a) => `Post to ${clean(a.platform, 24) || "?"}: "${clean(a.body, 90)}"`,
  },
  // THE UNIVERSAL BUS — one arm to reach any of Zapier's 9,000+ apps through the SAME owner
  // webhook. A single "Catch Hook" zap on the owner's side fans out by app+op (Google Sheets,
  // Calendar, Slack, QuickBooks, Meta, …). This is how Klyfton reaches a tool it has no dedicated
  // arm for. Still outward => approval-gated, still inert until ALERTS_WEBHOOK_URL is set, still
  // audited. `params` (optional object) carries the app-specific fields; `summary` labels the card.
  zap: {
    event: "arm_zap",
    fields: ["app", "op"],
    preview: (a) => {
      const n = a.params && typeof a.params === "object" ? Object.keys(a.params).length : 0;
      return `Zapier → ${clean(a.app, 40) || "?"}: ${clean(a.op, 60) || "run"}` +
        (a.summary ? ` — ${clean(a.summary, 80)}` : (n ? ` (${n} field${n === 1 ? "" : "s"})` : ""));
    },
  },
};

// No arm here is reversible+zero-dollar, so ALL require approval. Kept as a function so the policy
// is explicit and future in-app/reversible arms could be added as tier:'auto'.
function tierOf(/* type */) { return "approval"; }

function classify(action) {
  const type = clean(action && action.type, 40);
  const arm = ARMS[type];
  if (!arm) return { ok: false, error: "unknown_arm", type, supported: Object.keys(ARMS) };
  const missing = arm.fields.filter((f) => action[f] == null || String(action[f]).trim() === "");
  return { ok: true, type, tier: tierOf(type), outward: true, event: arm.event, preview: arm.preview(action), missing };
}

async function dispatch(event, action, actor) {
  if (!WEBHOOK) return { dispatched: false, reason: "no_dispatch_channel" }; // inert until owner wires it
  try {
    const payload = { event, action, actor: clean(actor, 60) || "owner", at: new Date().toISOString() };
    if (SECRET) payload.token = SECRET;
    const hdrs = { "content-type": "application/json", "x-klyfton-event": event };
    if (SECRET) hdrs["x-klyfton-token"] = SECRET;
    const r = await fetch(WEBHOOK, { method: "POST", headers: hdrs, body: JSON.stringify(payload) });
    return { dispatched: r.ok, status: r.status };
  } catch (e) { return { dispatched: false, reason: String(e).slice(0, 120) }; }
}

// The core: decide + (if approved) act. Never dispatches without approved===true.
async function execute(action, opts) {
  const o = opts || {};
  const c = classify(action);
  if (!c.ok) return { ok: false, error: c.error, supported: c.supported };
  if (c.missing.length) return { ok: false, status: "incomplete", type: c.type, missing: c.missing, preview: c.preview };

  // The gate. Outward/costs-money => must be explicitly approved (Clifton's confirm tap).
  if (o.approved !== true) {
    return { ok: true, status: "needs_approval", type: c.type, tier: c.tier, preview: c.preview,
      note: "Outward action — will only dispatch when re-sent with approved:true." };
  }

  // Idempotency: don't re-send the same approved action. Check BEFORE dispatch; commit only AFTER a
  // successful send (a failed send isn't recorded, so retry still works). Injectable for tests;
  // gated no-op without a store. `day` scopes the key so the same action tomorrow is legitimately new.
  const idem = o.idem || idempotency;
  let idemKey = null;
  if (idem && typeof idem.key === "function") {
    try {
      idemKey = idem.key(action, new Date().toISOString().slice(0, 10));
      if (await idem.check(idemKey)) {
        return { ok: true, status: "duplicate_skipped", type: c.type,
          note: "Identical action already dispatched today — not re-sent (idempotency).",
          audit: { type: c.type, preview: c.preview, dispatched: false, duplicate: true } };
      }
    } catch (e) { /* idempotency is best-effort — never block a send on it */ }
  }

  const d = await dispatch(c.event, action, o.actor);
  if (d.dispatched && idem && idemKey) { try { await idem.commit(idemKey, { type: c.type, at: new Date().toISOString() }); } catch (e) {} }
  const audit = { type: c.type, preview: c.preview, approvedBy: clean(o.actor, 60) || "owner", at: new Date().toISOString(), dispatched: d.dispatched };
  if (!d.dispatched) {
    return { ok: false, status: "blocked", type: c.type,
      reason: d.reason === "no_dispatch_channel"
        ? "No dispatch channel configured — set ALERTS_WEBHOOK_URL (Zapier/Make/Twilio) to give the arms a hand to shake."
        : ("dispatch_failed: " + (d.reason || d.status)),
      audit };
  }
  return { ok: true, status: "dispatched", type: c.type, via: "webhook", audit };
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({
      ok: true, configured: true, dispatchReady: !!WEBHOOK,
      arms: Object.fromEntries(Object.entries(ARMS).map(([k, v]) => [k, v.fields])),
      universalBus: "The 'zap' arm reaches any of Zapier's 9,000+ apps via one Catch Hook — send { type:'zap', app, op, params:{...} }. Same approval gate + webhook as every other arm.",
      safety: "All arms are outward/cost money → require approved:true, and dispatch only through your ALERTS_WEBHOOK_URL. Inert until you wire it. Nothing sends silently.",
    });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  try {
    const action = body.action || body;
    const out = await execute(action, { approved: body.approved === true, actor: body.actor });
    res.status(200).json(out);
  } catch (e) { res.status(200).json({ ok: false, error: String(e).slice(0, 140) }); }
};

module.exports.classify = classify;
module.exports.execute = execute;
module.exports.ARMS = ARMS;
