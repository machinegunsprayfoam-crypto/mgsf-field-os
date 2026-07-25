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
const arms = require("./act");     // outward teeth go through the approval gate
const battery = require("./memory"); // the alternator charges this (regen on the reverse stroke)

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
// DUAL-DRIVE: each handler is tagged with the transmission side that turns it.
//   drive:"ai"    = autonomous — internal/reversible/zero-$ transmission, runs on its own.
//   drive:"owner" = outward action (send/invoice/order) — produces a DRAFT and the event goes
//                   'blocked' until turned again with approved:true (Clifton's side of the box).
// Same gears, two transmissions coupled from both sides (see VEHICLE_ARCHITECTURE.md).
const HANDLERS = {
  // AI side: advance the pipeline internally, emit the next gear.
  "estimate.closed": [{ drive: "ai", fn: async (e) => ({ note: "pipeline → won (internal)", emits: [evt("lead.won", e.key, e.payload || {}, "gearbox:estimate.closed")] }) }],
  "lead.won": [{ drive: "ai", fn: async (e) => ({ note: "deal won — invoice gear next", emits: [evt("invoice.created", e.key, e.payload || {}, "gearbox:lead.won")] }) }],
  // OWNER side: the outward money action. Un-approved => arms draft it (needs_approval) and the
  // gear blocks. Approved (owner transmission engaged) => arms.execute for real (still passes
  // through act.js's own gate/ALERTS_WEBHOOK — inert until that env is wired, never fabricates).
  "invoice.created": [{ drive: "owner", fn: async (e, ok) => { const p = e.payload || {};
    const inv = await arms.execute({ type: "create_invoice", customer: p.customer || "", amount: p.amount || p.total || 0, job: p.job || "" }, { approved: ok === true });
    return { note: ok ? "Invoice engaged (owner side)" : "Invoice drafted — owner approval to send", draft: inv }; } }],
  "job.completed": [{ drive: "ai", fn: async (e) => { const p = e.payload || {};
    const emits = [evt("review.requested", e.key, p, "gearbox:job.completed")];
    if (/roof|spf/i.test(String(p.service || ""))) emits.push(evt("roofmaint.enroll", e.key, p, "gearbox:job.completed"));
    return { note: "review + roof-maint gears engaged", emits }; } }],
  "review.requested": [{ drive: "owner", fn: async (e, ok) => { const p = e.payload || {};
    const r = await arms.execute({ type: "send_sms", to: p.phone || "", body: "review request" }, { approved: ok === true });
    return { note: ok ? "Review request engaged (owner side)" : "Review request drafted — owner approval to send", draft: r }; } }],
  "roofmaint.enroll": [{ drive: "ai", fn: async () => ({ note: "enrolled on the roof-maintenance cycle (internal)" }) }],
  "estimate.sent": [{ drive: "ai", fn: async (e) => ({ note: "follow-up scheduled (2/7/21-day)", emits: [evt("followup.scheduled", e.key, e.payload || {}, "gearbox:estimate.sent")] }) }],
  "followup.scheduled": [{ drive: "owner", fn: async (e, ok) => { const p = e.payload || {};
    const r = await arms.execute({ type: "send_sms", to: p.phone || "", body: "reheat nudge" }, { approved: ok === true });
    return { note: ok ? "Follow-up nudge engaged (owner side)" : "Follow-up nudge drafted — owner approval to send", draft: r }; } }],
  // AXLE gears — time turns these (see api/axle.js). Internal/heartbeat only: they record the
  // scheduled tick on the drivetrain and defer outward per-item work to the dedicated crons
  // (daily-brief, follow-up, invoice-remind, roof-maintenance). No fabrication, no double-send.
  "axle.daily": [{ drive: "ai", fn: async () => ({ note: "daily axle tick — drivetrain turned by the clock (outward sweeps run on their own crons)" }) }],
  "axle.weekly": [{ drive: "ai", fn: async () => ({ note: "weekly axle tick — drivetrain turned by the clock" }) }],
  "pipeline.sweep": [{ drive: "ai", fn: async () => ({ note: "pipeline heartbeat: open estimates/deals re-checked internally (per-item reheat = /api/follow-up cron)" }) }],
  "certs.watch": [{ drive: "ai", fn: async () => ({ note: "cert/doc expiry heartbeat (staging pending — v2 Phase A)" }) }],
  "roofmaint.sweep": [{ drive: "ai", fn: async () => ({ note: "roof-maintenance cycle heartbeat (per-item drafts = /api/roof-maintenance cron)" }) }],
};
function consumersFor(name) { return (HANDLERS[clean(name, 60)] || []).map(function (h) { return typeof h === "function" ? { drive: "ai", fn: h } : h; }); }

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
async function sbMark(e, status, result, miles) {
  if (!SB_ON) return;
  try {
    const patch = { status: status || "done", result: result, processed_at: new Date().toISOString() };
    if (typeof miles === "number") patch.miles = miles;
    await fetch(SB_URL.replace(/\/$/, "") + "/rest/v1/events?id=eq." + encodeURIComponent(eid(e.name, e.key)), {
      method: "PATCH",
      headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(patch),
    });
  } catch (x) {}
}

// Turn a gear: persist the event, run its consumers, and recursively turn the gears they drive.
// Bounded: max depth + a per-turn visited set so a cycle can't spin the box forever.
// DUAL-DRIVE: an "ai" gear runs autonomously and cascades. An "owner" gear is an outward
// action — it produces a DRAFT and the event goes 'blocked' until the SAME turn is re-issued
// with approved:true (Clifton's transmission engaging that gear from his side). A blocked
// owner gear does NOT cascade — the drivetrain stops at the clutch until he presses it.
// THE ODOMETER (Clifton's model). Each meshing of the two transmissions racks miles:
//   +1 FORWARD  — an OWNER gear turned from the owner side (approved): Clifton drove the machine (leverage).
//   -1 REVERSE  — an OWNER gear that BLOCKED (AI reached into him for approval): his attention spent.
//    0          — an AI-internal gear freewheeling: no cross-engagement (still burns fuel/tokens, tracked separately).
// Net miles = is the machine a net force-multiplier. Fuel (tokens/$) is a SEPARATE gauge — it never nets out.
async function dispatch(e, ctx, approved) {
  ctx = ctx || { depth: 0, seen: new Set(), trace: [], miles: 0 };
  const stamp = e.name + "|" + e.key;
  if (ctx.depth > 8 || ctx.seen.has(stamp)) { ctx.trace.push({ event: e.name, skipped: "depth_or_cycle" }); return ctx; }
  ctx.seen.add(stamp);
  await sbInsertEvent(e, "pending");
  const handlers = consumersFor(e.name);
  const node = { event: e.name, key: e.key, handled: handlers.length, results: [] };
  ctx.trace.push(node);
  let anyBlocked = false;
  let nodeMiles = 0;
  for (const h of handlers) {
    // Owner-drive gears are the approval gate expressed as a transmission: they only turn
    // when engaged from the owner side (approved:true). Un-approved => draft + blocked, no cascade.
    if (h.drive === "owner" && !approved) {
      let out;
      try { out = await h.fn(e, false); } catch (x) { out = { error: String(x).slice(0, 140) }; }
      nodeMiles -= 1; // REVERSE — the machine reached into Clifton for approval
      node.results.push({ drive: "owner", blocked: true, miles: -1, note: out && out.note, draft: out && out.draft ? (out.draft.status || "needs_approval") : "needs_approval", error: out && out.error });
      anyBlocked = true;
      continue; // do NOT run emits — the wheels don't turn until the clutch is pressed
    }
    let out;
    const ownerRan = h.drive === "owner" && approved === true;
    try { out = await h.fn(e, ownerRan); } catch (x) { out = { error: String(x).slice(0, 140) }; }
    const m = ownerRan ? 1 : 0; // FORWARD when Clifton drove an owner gear; AI-internal = 0
    nodeMiles += m;
    node.results.push({ drive: h.drive, miles: m, note: out && out.note, draft: out && out.draft ? (out.draft.status || "drafted") : undefined, error: out && out.error });
    if (out && Array.isArray(out.emits)) {
      for (const child of out.emits) { ctx.depth++; await dispatch(child, ctx, approved); ctx.depth--; }
    }
  }
  node.miles = nodeMiles;
  ctx.miles += nodeMiles;
  if (!handlers.length) await sbMark(e, "done", { note: "no consumer (emitted, unmeshed)" }, 0);
  else await sbMark(e, anyBlocked ? "blocked" : "done", node, nodeMiles);
  return ctx;
}

async function turn(name, key, payload, source, approved) {
  const e = evt(name, key, payload, source);
  if (!e.name) return { ok: false, error: "event name required" };
  const ctx = await dispatch(e, undefined, approved === true);
  const blocked = ctx.trace.some(function (n) { return n.results && n.results.some(function (r) { return r.blocked; }); });
  let fwd = 0, rev = 0;
  ctx.trace.forEach(function (n) { if (n.miles > 0) fwd += n.miles; else if (n.miles < 0) rev += -n.miles; });
  // ALTERNATOR (hybrid regen): an approved owner-gear turn IS Clifton's decision. Capture it to the
  // battery (memory) so the reverse stroke recharges the system instead of wasting the energy. This
  // is the only place the drivetrain charges the battery. Best-effort, gated, reversible/internal —
  // never blocks the turn, never fabricates. Zero-op when memory is unconfigured.
  let charged = false;
  if (approved === true && fwd > 0) {
    try { const c = await battery.remember("Owner approved gear '" + e.name + "'" + (e.key ? " [" + e.key + "]" : "") + " (" + e.at.slice(0, 10) + ")"); charged = !!(c && c.stored); } catch (x) {}
  }
  return { ok: true, configured: SB_ON, turned: e.name, drive: approved === true ? "owner" : "ai", blocked: blocked,
    miles: { forward: fwd, reverse: rev, net: ctx.miles }, charged: charged, trace: ctx.trace, persisted: SB_ON };
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({ ok: true, configured: SB_ON, meshes: Object.keys(HANDLERS),
      drives: { ai: "autonomous / reversible / zero-$ — runs and cascades on its own", owner: "outward action (invoice/sms/order) — drafts + blocks until turned again with approved:true" },
      odometer: { forward: "+1 when Clifton drives an owner gear (approved) — leverage", reverse: "-1 when an owner gear blocks (machine asks for approval) — his attention", net: "is the machine a net force-multiplier", fuel: "tokens/$ (agent_runs.cost_usd) — a SEPARATE gauge; it never nets out. see v_odometer" },
      note: "POST {action:'turn', event:{name,key,payload,source}, approved?:true}. AI gears run autonomously; OWNER gears (the arms) come back as gated drafts (needs_approval) and only turn when re-issued with approved:true. Each turn returns miles {forward,reverse,net}. Persists to the events table when Supabase is set." });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  try {
    if (clean(body.action, 20) === "turn") {
      const e = body.event || {};
      res.status(200).json(await turn(e.name, e.key, e.payload, e.source, body.approved === true));
      return;
    }
    res.status(200).json({ ok: false, error: "unknown_action", supported: ["turn"] });
  } catch (x) { res.status(200).json({ ok: false, error: String(x).slice(0, 140) }); }
};

module.exports.turn = turn;
module.exports.dispatch = dispatch;
module.exports.HANDLERS = HANDLERS;
module.exports._evt = evt;
