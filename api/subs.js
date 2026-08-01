// Klyfton SUBCONTRACTOR ROSTER — Phase 2 of the construction/prime-with-subs layer. When MGSF runs
// a job as PRIME, every sub must have its compliance packet on file (from api/construction.js) BEFORE
// it works — the prime carries the risk if a sub is uninsured/unlicensed. This module is the roster:
// who the subs are, which required docs are on file, and which are EXPIRING or EXPIRED (COI + license
// lapse — the two that bite). It computes readiness so nobody puts an uninsured sub on a job.
//
// GROUNDED, NOT FABRICATED (doctrine): the required-doc set is derived from construction.subPacket()
// (single source of truth), not re-invented. Nothing is guessed — a doc is "on file" only if entered;
// status is computed from real expiry dates. No pricing. Writes are gated on Supabase + owner-approved.
//
// Pure core (readiness/expiry math) is deterministic — nowMs is injected, so no Date.now() in logic.
// Gated live layer persists to Supabase (subcontractors table); inert + graceful without it.
//
// POST { action:"list"|"get"|"save"|"status"|"expiring", ... }   GET -> shape + required docs

const construction = require("./construction");

function _kvEnv(re) { for (const k of Object.keys(process.env)) { if (re.test(k) && process.env[k]) return process.env[k]; } return undefined; }
const SB_URL = _kvEnv(/SUPABASE_URL$/i);
const SB_KEY = _kvEnv(/SUPABASE_SERVICE_ROLE_KEY$/i) || _kvEnv(/SERVICE_ROLE_KEY$/i) || _kvEnv(/SUPABASE_SECRET/i);
const SB_ON = !!(SB_URL && SB_KEY);

function clean(s, max) { return String(s == null ? "" : s).trim().slice(0, max || 120); }
const DAY = 86400000;

// Required doc set = the always-required baseline from the construction sub packet (single source of
// truth). DATED docs carry an expiry we watch; the rest are point-in-time "on file".
const BASELINE = construction.subPacket({}).items.reduce((m, i) => { m[i.id] = i.name; return m; }, {});
const REQUIRED = Object.keys(BASELINE);
const DATED = new Set(["coi", "license"]);

function findDoc(sub, type) { const docs = (sub && Array.isArray(sub.docs)) ? sub.docs : []; return docs.find((d) => d && clean(d.type, 40) === type) || null; }

// Status of one required doc for a sub, at nowMs, with an expiry warning window (days).
function docStatus(type, doc, nowMs, windowDays) {
  if (!doc || doc.onFile === false || (doc.onFile == null && !doc.expires)) return { type, name: BASELINE[type] || type, status: "missing" };
  if (DATED.has(type)) {
    const exp = doc.expires ? Date.parse(String(doc.expires).slice(0, 10)) : NaN;
    if (!Number.isFinite(exp)) return { type, name: BASELINE[type] || type, status: doc.onFile ? "on-file" : "missing", note: "no expiry date entered" };
    const days = Math.floor((exp - nowMs) / DAY);
    if (days < 0) return { type, name: BASELINE[type] || type, status: "expired", expires: String(doc.expires).slice(0, 10), daysLeft: days };
    if (days <= (windowDays == null ? 30 : windowDays)) return { type, name: BASELINE[type] || type, status: "expiring", expires: String(doc.expires).slice(0, 10), daysLeft: days };
    return { type, name: BASELINE[type] || type, status: "current", expires: String(doc.expires).slice(0, 10), daysLeft: days };
  }
  return { type, name: BASELINE[type] || type, status: "on-file" };
}

// Overall readiness for one sub: ready / expiring / blocked, with the reasons.
function complianceStatus(sub, nowMs, windowDays) {
  const now = Number.isFinite(nowMs) ? nowMs : 0;
  const items = REQUIRED.map((t) => docStatus(t, findDoc(sub, t), now, windowDays));
  const blockers = items.filter((i) => i.status === "missing" || i.status === "expired");
  const expiring = items.filter((i) => i.status === "expiring");
  const readiness = blockers.length ? "blocked" : (expiring.length ? "expiring" : "ready");
  return {
    id: (sub && (sub.id != null ? sub.id : undefined)),
    name: clean(sub && sub.name, 120), trade: clean(sub && sub.trade, 80), company: clean(sub && sub.company, 120) || undefined,
    readiness, items, blockers: blockers.map((b) => b.type), expiring: expiring.map((e) => ({ type: e.type, expires: e.expires, daysLeft: e.daysLeft })),
    note: readiness === "ready" ? "All required docs on file — cleared to work under MGSF as prime."
      : readiness === "expiring" ? "Cleared, but a COI/license is expiring soon — chase the renewal."
      : "NOT cleared — missing/expired required docs. Do not put on a job until resolved.",
  };
}

// Roster-wide sweep: subs that are blocked or expiring, most-urgent first.
function sweepExpiring(subs, nowMs, windowDays) {
  const list = Array.isArray(subs) ? subs : [];
  const rank = { blocked: 0, expiring: 1, ready: 2 };
  return list.map((s) => complianceStatus(s, nowMs, windowDays))
    .filter((s) => s.readiness !== "ready")
    .sort((a, b) => (rank[a.readiness] - rank[b.readiness]) || (minDays(a) - minDays(b)));
}
function minDays(s) { const ds = (s.expiring || []).map((e) => e.daysLeft).filter((d) => Number.isFinite(d)); return ds.length ? Math.min(...ds) : -9999; }

function validateSub(sub) {
  const errors = [];
  if (!sub || typeof sub !== "object") return { ok: false, errors: ["not an object"] };
  if (!clean(sub.name, 120)) errors.push("name required");
  if (!clean(sub.trade, 80)) errors.push("trade required");
  if (sub.docs != null && !Array.isArray(sub.docs)) errors.push("docs must be an array");
  return { ok: errors.length === 0, errors };
}

// ---- gated live layer (Supabase; graceful — never throws, never fabricates) ----
async function sbFetch(path, opts) {
  return fetch(SB_URL.replace(/\/$/, "") + path, { ...opts, headers: { apikey: SB_KEY, authorization: "Bearer " + SB_KEY, "content-type": "application/json", ...(opts && opts.headers) } });
}
async function list(nowMs) {
  if (!SB_ON) return { configured: false, results: [] };
  try {
    const r = await sbFetch("/rest/v1/subcontractors?select=id,name,trade,company,contact,phone,email,state,license_no,status,docs,updated_at&order=name.asc&limit=500");
    if (!r.ok) return { configured: true, ok: false, results: [], status: r.status };
    const rows = await r.json();
    const now = Number.isFinite(nowMs) ? nowMs : safeNow();
    return { configured: true, ok: true, results: (Array.isArray(rows) ? rows : []).map((s) => ({ ...s, compliance: complianceStatus(s, now) })) };
  } catch (e) { return { configured: true, ok: false, results: [], error: String(e).slice(0, 120) }; }
}
async function save(sub, opts) {
  if (!SB_ON) return { configured: false, ok: false, reason: "not_configured" };
  const v = validateSub(sub); if (!v.ok) return { configured: true, ok: false, errors: v.errors };
  if (!(opts && opts.approved)) return { configured: true, ok: false, reason: "needs_approval", note: "Roster writes are owner-approved — resend with approved:true." };
  try {
    const row = { name: clean(sub.name, 120), trade: clean(sub.trade, 80), company: clean(sub.company, 120), contact: clean(sub.contact, 120),
      phone: clean(sub.phone, 40), email: clean(sub.email, 120), state: clean(sub.state, 8), license_no: clean(sub.license_no, 60),
      status: clean(sub.status, 40) || "active", docs: Array.isArray(sub.docs) ? sub.docs : [], updated_at: new Date().toISOString() };
    if (sub.id != null) row.id = sub.id;
    const r = await sbFetch("/rest/v1/subcontractors?on_conflict=id", { method: "POST", headers: { prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(row) });
    if (!r.ok) return { configured: true, ok: false, status: r.status, detail: (await r.text()).slice(0, 160) };
    const saved = await r.json();
    return { configured: true, ok: true, saved: Array.isArray(saved) ? saved[0] : saved };
  } catch (e) { return { configured: true, ok: false, error: String(e).slice(0, 120) }; }
}
function safeNow() { try { return Date.now(); } catch (e) { return 0; } }

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({ ok: true, service: "subs", configured: SB_ON, requiredDocs: REQUIRED.map((t) => ({ type: t, name: BASELINE[t], dated: DATED.has(t) })),
      note: "Subcontractor roster + compliance readiness. POST {action:'list'|'get'|'save'|'status'|'expiring'}. A sub is 'ready' only when all required docs are on file and no COI/license is expired; 'expiring' warns on renewals due within 30 days; 'blocked' means do-not-schedule. Writes need Supabase + approved:true. No pricing." });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  const action = clean(body.action, 20) || "list";
  const now = Number.isFinite(body.nowMs) ? body.nowMs : safeNow();
  try {
    if (action === "status") { res.status(200).json({ ok: true, compliance: complianceStatus(body.sub || body, now, body.windowDays) }); return; }
    if (action === "expiring") {
      if (Array.isArray(body.subs)) { res.status(200).json({ ok: true, alerts: sweepExpiring(body.subs, now, body.windowDays) }); return; }
      const l = await list(now); res.status(200).json({ ...l, alerts: l.results ? sweepExpiring(l.results, now, body.windowDays) : [] }); return;
    }
    if (action === "save") { res.status(200).json(await save(body.sub || body, { approved: !!body.approved })); return; }
    if (action === "get") {
      if (!SB_ON) { res.status(200).json({ configured: false }); return; }
      const l = await list(now); const one = (l.results || []).find((s) => String(s.id) === String(body.id));
      res.status(200).json({ configured: true, ok: !!one, sub: one || null }); return;
    }
    res.status(200).json(await list(now)); // default: list
  } catch (e) { res.status(200).json({ ok: false, error: String((e && e.message) || e).slice(0, 140) }); }
};

// pure exports for the brain + tests
module.exports.docStatus = docStatus;
module.exports.complianceStatus = complianceStatus;
module.exports.sweepExpiring = sweepExpiring;
module.exports.validateSub = validateSub;
module.exports.REQUIRED = REQUIRED;
module.exports.BASELINE = BASELINE;
