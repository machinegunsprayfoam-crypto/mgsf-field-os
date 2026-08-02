// Klyfton CUSTOMER PORTAL — the last unbuilt module from the MGCC/MOGS platform plans, built for
// field-os. A customer-facing, READ-ONLY window where one customer sees THEIR own job: plain-English
// status, scheduled date, the quote total they were already given, and any documents awaiting their
// signature. Nothing else — no cost, margin, labor/material breakdown, internal notes, or any other
// customer's data ever crosses the wire (strict allowlist projection, not blocklist).
//
// SECURITY MODEL (deliberately NOT the crew gate): the portal is outward-facing, so it uses a per-record
// unguessable token = HMAC-SHA256(recordId, PORTAL_SECRET). Stateless — no token is stored on the record,
// so generating a link writes NOTHING. Two access modes on this one endpoint:
//   • GET  /api/portal?token=<t>            → CUSTOMER read. Token-gated. Returns the safe view for the
//                                             one matching record, or 404-style {ok:false} if no match.
//   • POST /api/portal {action:"link",id}   → OWNER generates a shareable link. CREW_CODE-gated (guard.js).
// DORMANT until PORTAL_SECRET (+ KV) are set — never exposes anything by default. Read-only always.

const crypto = require("crypto");

function _kvEnv(suffixRe, excludeRe) {
  for (const k of Object.keys(process.env)) { if (excludeRe && excludeRe.test(k)) continue; if (suffixRe.test(k) && process.env[k]) return process.env[k]; }
  return undefined;
}
const KV_URL = _kvEnv(/KV_REST_API_URL$/i) || _kvEnv(/REST_API_URL$/i) || _kvEnv(/UPSTASH_REDIS_REST_URL$/i);
const KV_TOKEN = _kvEnv(/KV_REST_API_TOKEN$/i, /READ_ONLY/i) || _kvEnv(/REST_API_TOKEN$/i, /READ_ONLY/i);
const KV_ON = !!(KV_URL && KV_TOKEN);
const SECRET = process.env.PORTAL_SECRET || "";
const SITE = process.env.PORTAL_BASE_URL || "https://app.machinegunsprayfoam.info";

// ---- PURE: token derivation + verify (deterministic given id+secret — crypto is pure, testable) -------
function tokenFor(id, secret) {
  if (id == null || id === "" || !secret) return "";
  return crypto.createHmac("sha256", String(secret)).update("portal:" + String(id)).digest("hex").slice(0, 24);
}
function safeEqual(a, b) {
  a = String(a); b = String(b);
  if (!a.length || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
function verify(id, token, secret) { const t = tokenFor(id, secret); return !!t && safeEqual(t, token); }

// ---- PURE: map an internal pipeline stage to a customer-friendly status line -------------------------
const STATUS_LABEL = {
  "new": "We received your inquiry",
  "qualified": "We're reviewing your project",
  "estimate sent": "Your quote is ready to review",
  "follow-up": "We're following up with you",
  "scheduled": "Your job is scheduled",
  "in progress": "Work is underway",
  "completed": "Work complete",
  "done": "Work complete",
  "invoiced": "Invoice sent",
  "paid": "Paid in full — thank you!",
  "won": "Booked — thank you!",
};
function statusLabel(stage) {
  const s = String(stage || "").trim().toLowerCase();
  return STATUS_LABEL[s] || (s ? s.replace(/\b\w/g, (c) => c.toUpperCase()) : "In progress");
}

// ---- PURE: build the customer-safe view. ALLOWLIST — only these fields ever leave. --------------------
// Never emits cost/material/labor/margin/gm/overhead/internal notes/source or any other record.
const money = (v) => { const n = typeof v === "number" ? v : parseFloat(v); return Number.isFinite(n) && n > 0 ? Math.round(n) : null; };
function safeView(record, opts) {
  opts = opts || {};
  if (!record) return null;
  const name = String(record.customer || record.name || "").trim();
  const service = String(record.service || record.type || "").trim();
  const scheduled = record.scheduled || record.scheduledDate || (String(record.status || "").toLowerCase() === "scheduled" ? record.date : "") || "";
  // "quote" = the sell price the customer was already shown (value / lastEstimate). NEVER a cost.
  const quote = money(record.value != null ? record.value : record.lastEstimate);
  const docs = Array.isArray(record.signatures) ? record.signatures : (Array.isArray(opts.docsAwaitingSignature) ? opts.docsAwaitingSignature : []);
  const awaiting = docs.filter((d) => d && (d.status ? String(d.status).toLowerCase() !== "signed" : !d.signed)).map((d) => String(d.name || d.type || "document"));
  return {
    company: "Machine Gun Spray Foam & Concrete Lifting",
    contact: { phone: "406-939-8301", email: "clifton@machinegunsprayfoam.info" },
    customer: name || "Customer",
    service: service || null,
    status: statusLabel(record.status || record.stage),
    scheduled: scheduled || null,
    quote,                                   // dollars the customer was already quoted, or null
    awaitingSignature: awaiting,
    note: "This is your project status with Machine Gun Spray Foam. Questions? Call or text us.",
  };
}

// ---- PURE: find the record whose derived token matches (searches provided records only) ---------------
function matchByToken(records, token, secret) {
  if (!token || !secret) return null;
  for (const r of records || []) { if (r && r.id != null && verify(r.id, token, secret)) return r; }
  return null;
}
function linkFor(id, secret, base) { const t = tokenFor(id, secret); return t ? { token: t, url: (base || SITE).replace(/\/$/, "") + "/portal.html?token=" + t } : null; }

// ---- PURE: build the inbound "customer accepted the quote" event (owner reviews; never auto-books) ----
// This is an INBOUND customer signal (like a lead form), not an outward Klyfton action — recording it
// for the owner is allowed; it books nothing. Timestamp is injected (no Date.now in the pure core).
function acceptEvent(record, atISO) {
  record = record || {};
  return {
    type: "portal_accept",
    at: atISO || null,
    recordId: record.id != null ? record.id : null,
    customer: String(record.customer || record.name || "Customer").slice(0, 80),
    service: String(record.service || record.type || "").slice(0, 60) || null,
    quote: money(record.value != null ? record.value : record.lastEstimate),
    note: "Customer tapped Accept on their portal — confirm and book. Nothing was scheduled automatically.",
  };
}

// ---- GATED LIVE handler -----------------------------------------------------------------------------
async function kvGet(col) {
  try {
    const r = await fetch(`${KV_URL}/get/mgsf:${col}`, { headers: { Authorization: `Bearer ${KV_TOKEN}` } });
    if (!r.ok) return [];
    const j = await r.json(); let v = j && j.result; if (typeof v === "string") { try { v = JSON.parse(v); } catch { v = []; } }
    return Array.isArray(v) ? v : [];
  } catch (e) { return []; }
}
// Append an event to a KV list (newest first, capped) — records the inbound customer signal for the owner.
async function kvAppend(col, ev, cap) {
  try {
    const list = await kvGet(col);
    list.unshift(ev);
    const trimmed = list.slice(0, cap || 200);
    await fetch(`${KV_URL}/set/mgsf:${col}`, { method: "POST", headers: { Authorization: `Bearer ${KV_TOKEN}`, "content-type": "application/json" }, body: JSON.stringify(trimmed) });
    return true;
  } catch (e) { return false; }
}
// Best-effort owner notification (same webhook the daily brief uses). Never throws.
async function fireAlert(ev) {
  const url = process.env.ALERTS_WEBHOOK_URL; if (!url) return false;
  try {
    await fetch(url, { method: "POST", headers: Object.assign({ "content-type": "application/json" }, process.env.ALERTS_WEBHOOK_SECRET ? { "x-webhook-secret": process.env.ALERTS_WEBHOOK_SECRET } : {}),
      body: JSON.stringify({ event: "portal_accept", message: `✅ ${ev.customer} accepted their quote${ev.quote ? " ($" + ev.quote.toLocaleString() + ")" : ""} — confirm and book.`, data: ev }) });
    return true;
  } catch (e) { return false; }
}

module.exports = async (req, res) => {
  if (req.method !== "GET" && req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  if (!SECRET || !KV_ON) { res.status(200).json({ configured: false, reason: "not_configured", note: "Set PORTAL_SECRET + KV to enable the customer portal." }); return; }

  if (req.method === "POST") {
    let b = req.body; if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } } b = b || {};
    const action = String(b.action || "link").toLowerCase();

    // CUSTOMER accept mode — TOKEN-gated (not crew-gated): the customer taps Accept on their portal.
    // Records an inbound signal + notifies the owner. Books NOTHING (owner confirms).
    if (action === "accept") {
      const token = b.token || (req.query && req.query.token) || "";
      if (!token) { res.status(200).json({ ok: false, reason: "token_required" }); return; }
      const [leads, jobs] = await Promise.all([kvGet("leads"), kvGet("jobs")]);
      const rec = matchByToken(jobs, token, SECRET) || matchByToken(leads, token, SECRET);
      if (!rec) { res.status(200).json({ ok: false, reason: "not_found" }); return; }
      const ev = acceptEvent(rec, new Date().toISOString());
      await kvAppend("portal_events", ev);
      fireAlert(ev);   // best-effort, don't block the customer's confirmation on it
      res.status(200).json({ ok: true, accepted: true, customer: ev.customer });
      return;
    }

    // OWNER generate-link mode — CREW_CODE-gated (never expose link generation to the public)
    const guard = require("./guard");
    if (!guard.ok(req)) { res.status(401).json(guard.denied()); return; }
    const id = b.id != null ? b.id : b.recordId;
    if (id == null || id === "") { res.status(200).json({ ok: false, reason: "id_required" }); return; }
    res.status(200).json({ ok: true, ...linkFor(id, SECRET, SITE) });
    return;
  }

  // CUSTOMER read mode — token-gated, safe view only
  const token = (req.query && (req.query.token || req.query.t)) || "";
  if (!token) { res.status(200).json({ ok: false, reason: "token_required" }); return; }
  try {
    const [leads, jobs] = await Promise.all([kvGet("leads"), kvGet("jobs")]);
    const rec = matchByToken(jobs, token, SECRET) || matchByToken(leads, token, SECRET);
    if (!rec) { res.status(200).json({ ok: false, reason: "not_found" }); return; }
    res.status(200).json({ ok: true, view: safeView(rec) });
  } catch (e) { res.status(200).json({ ok: false, error: String(e).slice(0, 160) }); }
};

module.exports.tokenFor = tokenFor;
module.exports.verify = verify;
module.exports.statusLabel = statusLabel;
module.exports.safeView = safeView;
module.exports.matchByToken = matchByToken;
module.exports.linkFor = linkFor;
module.exports.acceptEvent = acceptEvent;
