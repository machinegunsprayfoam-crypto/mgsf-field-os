// Gearbox — Klyfton's internal drivetrain. Modules mesh like gears: a typed EVENT is a tooth;
// emitting one turns the gears that consume it, which may emit the next event, and so on. This is
// the transmission INSIDE the machine (module<->module). The ARMS (api/act.js) are how it reaches
// OUT — so any gear that produces an outward action routes through act.js and comes back as a GATED
// draft (needs_approval), never an auto-send. Every turn is logged to the `events` table (the
// drivetrain record the Command Center reads). Plain fetch + built-in crypto, no npm. See GEARBOX_SPEC.md.
//
// POST { action:"turn", event:{ name, key, payload, source } }  -> emit + dispatch, returns the trace
// GET                                                            -> config + registered meshes
const crypto = require("crypto");
const arms = require("./act"); // outward teeth go through the approval gate

function _kvEnv(suffixRe, excludeRe) {
  for (const k of Object.keys(process.env)) { if (excludeRe && excludeRe.test(k)) continue; if (suffixRe.test(k) && process.env[k]) return process.env[k]; }
  return undefined;
}
const SB_URL = _kvEnv(/SUPABASE_URL$/i);
const SB_KEY = _kvEnv(/SUPABASE_SERVICE_ROLE_KEY$/i) || _kvEnv(/SERVICE_ROLE_KEY$/i) || _kvEnv(/SUPABASE_SECRET/i);
const SB_ON = !!(SB_URL && SB_KEY);

function clean(s, max) { return String(s == null ? "" : s).trim().slice(0, max || 200); }
function eid(name, key) { return crypto.createHash("sha1").update(clean(name) + "|" + clean(key)).digest("hex"); }
function evt(name, key, payload, source) {
  return { name: clean(name, 60), key: clean(key, 120), payload: payload && typeof payload === "object" ? payload : {}, source: clean(source, 60) || "gearbox", at: new Date().toISOString() };
}

// ---- REGISTRY: event name -> [handlers]. Each handler(e) returns { note, emits?:[evt...], draft? }.
// Handlers NEVER send — outward steps call arms.execute(..., {approved:false}) => a gated draft.
// They decide the next gear to turn (emits). This is the money drivetrain from the spec.
const HANDLERS = {
  "estimate.closed": [async (e) => {
    const p = e.payload || {};
    const crm = await arms.execute({ type: "crm_update", object: "deal", id: p.customer || p.id || "", fields: { stage: "won" } }, { approved: false });
    return { note: "CRM 'won' update drafted (gated)", draft: crm, emits: [evt("lead.won", e.key, p, "gearbox:estimate.closed")] };
  }],
  "lead.won": [async (e) => {
    const p = e.payload || {};
    const inv = await arms.execute({ type: "create_invoice", customer: p.customer || "", amount: p.amount || p.total || 0, job: p.job || "" }, { approved: false });
    return { note: "Invoice drafted (gated)", draft: inv, emits: [evt("invoice.created", e.key, p, "gearbox:lead.won")] };
  }],
  "invoice.created": [async () => ({ note: "Invoice logged — awaiting owner approval to send" })],
  "job.completed": [async (e) => {
    const p = e.payload || {};
    const emits = [evt("review.requested", e.key, p, "gearbox:job.completed")];
    if (/roof|spf/i.test(String(p.service || ""))) emits.push(evt("roofmaint.enroll", e.key, p, "gearbox:job.completed"));
    return { note: "Review request + roof-maintenance enroll queued", emits };
  }],
  "estimate.sent": [async (e) => ({ note: "Follow-up scheduled (2/7/21-day reheat)", emits: [evt("followup.scheduled", e.key, e.payload || {}, "gearbox:estimate.sent")] })],
};
function consumersFor(name) { return HANDLERS[clean(name, 60)] || []; }

async function sbInsertEvent(e, status) {
  if (!SB_ON) return { persisted: false };
  try {
    const row = { id: eid(e.name, e.key), name: e.name, event_key: e.key || null, payload: e.payload, source: e.source, status: status || "pending", created_at: e.at };
    const r = await fetch(SB_URL.replace(/\/$/, "") + "/rest/v1/events?on_conflict=id", {
      method: "POST",
      headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(row),
    });
    return { persisted: r.ok };
  } catch (x) { return { persisted: false }; }
}
async function sbMarkDone(e, result) {
  if (!SB_ON) return;
  try {
    await fetch(SB_URL.replace(/\/$/, "") + "/rest/v1/events?id=eq." + encodeURIComponent(eid(e.name, e.key)), {
      method: "PATCH",
      headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ status: "done", result: result, processed_at: new Date().toISOString() }),
    });
  } catch (x) {}
}

// Turn a gear: persist the event, run its consumers, and recursively turn the gears they drive.
// Bounded: max depth + a per-turn visited set so a cycle can't spin the box forever.
async function dispatch(e, ctx) {
  ctx = ctx || { depth: 0, seen: new Set(), trace: [] };
  const stamp = e.name + "|" + e.key;
  if (ctx.depth > 8 || ctx.seen.has(stamp)) { ctx.trace.push({ event: e.name, skipped: "depth_or_cycle" }); return ctx; }
  ctx.seen.add(stamp);
  await sbInsertEvent(e, "pending");
  const handlers = consumersFor(e.name);
  const node = { event: e.name, key: e.key, handled: handlers.length, results: [] };
  ctx.trace.push(node);
  for (const h of handlers) {
    let out;
    try { out = await h(e); } catch (x) { out = { error: String(x).slice(0, 140) }; }
    node.results.push({ note: out && out.note, draft: out && out.draft ? (out.draft.status || "drafted") : undefined, error: out && out.error });
    await sbMarkDone(e, node);
    if (out && Array.isArray(out.emits)) {
      for (const child of out.emits) { ctx.depth++; await dispatch(child, ctx); ctx.depth--; }
    }
  }
  if (!handlers.length) await sbMarkDone(e, { note: "no consumer (emitted, unmeshed)" });
  return ctx;
}

async function turn(name, key, payload, source) {
  const e = evt(name, key, payload, source);
  if (!e.name) return { ok: false, error: "event name required" };
  const ctx = await dispatch(e);
  return { ok: true, configured: SB_ON, turned: e.name, trace: ctx.trace, persisted: SB_ON };
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({ ok: true, configured: SB_ON, meshes: Object.keys(HANDLERS),
      note: "POST {action:'turn', event:{name,key,payload,source}} to turn a gear. Outward steps come back as gated drafts (needs_approval) — never auto-sent. Persists to the events table when Supabase is set." });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  try {
    if (clean(body.action, 20) === "turn") {
      const e = body.event || {};
      res.status(200).json(await turn(e.name, e.key, e.payload, e.source));
      return;
    }
    res.status(200).json({ ok: false, error: "unknown_action", supported: ["turn"] });
  } catch (x) { res.status(200).json({ ok: false, error: String(x).slice(0, 140) }); }
};

module.exports.turn = turn;
module.exports.dispatch = dispatch;
module.exports.HANDLERS = HANDLERS;
module.exports._evt = evt;
