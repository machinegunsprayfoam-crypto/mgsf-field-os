// Klyfton WORK HUB — the agents' operating environment: a private WORKSTATION per agent, a shared
// WORK HUB (everyone's status + open handoffs at a glance), and an INTRANET (agent→agent messages +
// broadcasts). This is the AGENT-level coordination layer, one level up from the gearbox
// (api/gearbox.js), which is the MODULE-level event drivetrain. Gearbox = gears meshing (module↔module
// typed events); Work Hub = the agents' break room + bulletin board + inbox (agent↔agent).
//
// WHY: the doer agents (api/agents.js — PM/job-runner, collector, bid-chaser, lead-closer,
// sub-compliance) each produce plans over the SHARED spine, but they had no place to (a) post what
// they're working on, (b) hand a job off to another agent, or (c) message each other. This gives them
// that — so work never falls between agents (same class as the "funnel has no middle" gap, one layer up).
//
// PURE core (station / message / handoff / inbox / hub) — keyless, deterministic, NO Date.now (the
// caller/handler stamps time), unit-testable offline. Gated live layer persists to Vercel KV (dormant +
// honest without it — {configured:false}, never fabricates). INTERNAL ONLY: the intranet stays inside the
// machine; anything OUTWARD (a customer email/text) still goes through the arms (api/act.js) approval gate.
//
//   GET  /api/workhub                                  -> shape + agent roster
//   POST /api/workhub {action:"station", agent, patch} -> upsert an agent's workstation
//   POST /api/workhub {action:"send", from, to, body}  -> post an intranet message (to an agent or "all")
//   POST /api/workhub {action:"handoff", from, to, job, note} -> hand a job to another agent
//   POST /api/workhub {action:"inbox", agent}          -> messages addressed to an agent (+ broadcasts)
//   POST /api/workhub {action:"hub"}                   -> the shared board: every station + open handoffs

let AGENTS = {};
try { AGENTS = require("./agents").AGENTS || {}; } catch (e) { AGENTS = {}; }

function _kvEnv(suffixRe, excludeRe) {
  for (const k of Object.keys(process.env)) { if (excludeRe && excludeRe.test(k)) continue; if (suffixRe.test(k) && process.env[k]) return process.env[k]; }
  return undefined;
}
const KV_URL = _kvEnv(/KV_REST_API_URL$/i) || _kvEnv(/REST_API_URL$/i) || _kvEnv(/UPSTASH_REDIS_REST_URL$/i);
const KV_TOKEN = _kvEnv(/KV_REST_API_TOKEN$/i, /READ_ONLY/i) || _kvEnv(/REST_API_TOKEN$/i, /READ_ONLY/i);
const KV_ON = !!(KV_URL && KV_TOKEN);
const PREFIX = "mgsf:";
const K_STATIONS = "workstations";
const K_INTRANET = "intranet";

function clean(v, max) { return v == null ? "" : String(v).trim().slice(0, max || 200); }
const STATUSES = ["idle", "working", "blocked", "done"];
function normStatus(s) { const t = clean(s, 20).toLowerCase(); return STATUSES.indexOf(t) >= 0 ? t : "idle"; }
function agentId(a) { return clean(a, 40).toLowerCase().replace(/\s+/g, "-"); }
function agentLabel(id) { return (AGENTS[id] && AGENTS[id].label) || (AGENTS[id] && AGENTS[id].name) || id; }

// ---- WORKSTATION: merge a patch onto an agent's private state (status + current task + a bounded scratchpad).
function station(prev, patch, stampISO) {
  prev = prev || {}; patch = patch || {};
  const id = agentId(patch.agent || prev.agent);
  const scratch = Array.isArray(prev.scratch) ? prev.scratch.slice() : [];
  if (patch.scratch != null) {
    const line = clean(patch.scratch, 280);
    if (line) { scratch.push({ note: line, at: clean(stampISO, 40) || null }); }
  }
  return {
    agent: id, label: agentLabel(id),
    status: patch.status != null ? normStatus(patch.status) : normStatus(prev.status),
    task: patch.task != null ? clean(patch.task, 200) : (prev.task != null ? clean(prev.task, 200) : null),
    scratch: scratch.slice(-20),                          // keep the last 20 scratch notes
    updatedAt: clean(stampISO, 40) || prev.updatedAt || null,
  };
}

// ---- INTRANET message: agent→agent, or broadcast ("all"). Kinds: note | ask | ack | handoff. Never outward.
let _seq = 0;
function normMessage(m, stampISO) {
  m = m || {};
  const to = clean(m.to, 40).toLowerCase() === "all" || !m.to ? "all" : agentId(m.to);
  const kind = ["note", "ask", "ack", "handoff"].indexOf(clean(m.kind, 20).toLowerCase()) >= 0 ? clean(m.kind, 20).toLowerCase() : "note";
  return {
    id: m.id != null ? String(m.id) : null,               // handler assigns a real id on persist
    from: agentId(m.from) || "system", to, kind,
    body: clean(m.body, 500),
    job: m.job != null ? clean(m.job, 80) : null,
    at: clean(stampISO, 40) || null,
    ack: m.ack === true,
  };
}

// ---- HANDOFF: a typed message that moves a job from one agent to another (open until acked).
function handoff(h, stampISO) {
  h = h || {};
  return normMessage({ from: h.from, to: h.to, kind: "handoff", job: h.job,
    body: clean(h.note, 500) || ("Handoff" + (h.job ? " of " + clean(h.job, 80) : "")) }, stampISO);
}

// ---- INBOX: messages addressed to an agent (direct or broadcast), newest first. Never invents.
function inbox(agent, messages) {
  const id = agentId(agent);
  return (messages || []).filter((m) => m && (agentId(m.to) === id || clean(m.to, 40) === "all"))
    .slice().sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));
}

// ---- WORK HUB: the shared board — every agent's station + the open (unacked) handoffs + a recent feed.
function hub(data) {
  data = data || {};
  const stations = (data.stations || []).filter(Boolean);
  const messages = (data.messages || []).filter(Boolean);
  const byId = {}; stations.forEach((s) => { if (s && s.agent) byId[s.agent] = s; });
  // include every KNOWN agent even if it hasn't posted a station yet (so the hub shows the full crew)
  const roster = Object.keys(AGENTS);
  roster.forEach((id) => { if (!byId[id]) byId[id] = { agent: id, label: agentLabel(id), status: "idle", task: null, scratch: [], updatedAt: null }; });
  const stationList = Object.keys(byId).map((k) => byId[k]);
  const openHandoffs = messages.filter((m) => m && m.kind === "handoff" && m.ack !== true)
    .slice().sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));
  const feed = messages.slice().sort((a, b) => String(b.at || "").localeCompare(String(a.at || ""))).slice(0, 20);
  return {
    stations: stationList,
    counts: {
      agents: stationList.length,
      working: stationList.filter((s) => s.status === "working").length,
      blocked: stationList.filter((s) => s.status === "blocked").length,
      openHandoffs: openHandoffs.length,
    },
    openHandoffs, feed,
  };
}

// ---- gated KV layer (dormant + honest without storage) ----
async function kvGet(col) {
  try {
    const r = await fetch(KV_URL + "/get/" + encodeURIComponent(PREFIX + col), { headers: { Authorization: "Bearer " + KV_TOKEN } });
    if (!r.ok) return []; const j = await r.json(); if (!j || j.result == null) return [];
    const p = JSON.parse(j.result); return Array.isArray(p) ? p : [];
  } catch { return []; }
}
async function kvSet(col, arr) {
  await fetch(KV_URL + "/set/" + encodeURIComponent(PREFIX + col), { method: "POST", headers: { Authorization: "Bearer " + KV_TOKEN }, body: JSON.stringify(arr) });
}

module.exports = async (req, res) => {
  const guard = require("./guard"); if (!guard.ok(req)) { res.status(401).json(guard.denied()); return; }
  if (req.method === "GET") {
    res.status(200).json({ ok: true, configured: KV_ON, service: "workhub",
      roster: Object.keys(AGENTS).map((id) => ({ id, label: agentLabel(id) })),
      statuses: STATUSES,
      note: "Agent operating layer — private WORKSTATION per agent + shared WORK HUB + agent↔agent INTRANET. Internal only; outward actions still go through the arms (act.js) approval gate. Complements the module-level gearbox." });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  if (!KV_ON) { res.status(200).json({ configured: false, note: "Attach Vercel KV to enable the work hub (per-agent state + intranet)." }); return; }

  let body = req.body; if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  const nowISO = new Date().toISOString();
  try {
    if (body.action === "station") {
      const stations = await kvGet(K_STATIONS);
      const id = agentId(body.agent || (body.patch && body.patch.agent));
      const prev = stations.find((s) => s && s.agent === id);
      const next = station(prev, Object.assign({ agent: id }, body.patch || body), nowISO);
      const merged = stations.filter((s) => s && s.agent !== id).concat([next]);
      await kvSet(K_STATIONS, merged.slice(-100));
      res.status(200).json({ ok: true, station: next });
    } else if (body.action === "send" || body.action === "handoff") {
      const msgs = await kvGet(K_INTRANET);
      const msg = body.action === "handoff" ? handoff(body, nowISO) : normMessage(body, nowISO);
      msg.id = "m" + (Date.now().toString(36)) + (++_seq).toString(36);
      await kvSet(K_INTRANET, msgs.concat([msg]).slice(-500));
      res.status(200).json({ ok: true, message: msg });
    } else if (body.action === "ack") {
      const msgs = await kvGet(K_INTRANET);
      const id = String(body.id);
      const next = msgs.map((m) => (m && String(m.id) === id ? Object.assign({}, m, { ack: true }) : m));
      await kvSet(K_INTRANET, next);
      res.status(200).json({ ok: true, acked: id });
    } else if (body.action === "inbox") {
      res.status(200).json({ ok: true, agent: agentId(body.agent), messages: inbox(body.agent, await kvGet(K_INTRANET)) });
    } else if (body.action === "hub") {
      res.status(200).json(Object.assign({ ok: true }, hub({ stations: await kvGet(K_STATIONS), messages: await kvGet(K_INTRANET) })));
    } else {
      res.status(400).json({ ok: false, error: "unknown_action", allowed: ["station", "send", "handoff", "ack", "inbox", "hub"] });
    }
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e && e.message || e).slice(0, 200) });
  }
};

// Persist an agent's derived station onto the shared board (so agent runs auto-populate the Work
// Hub + Foreman once KV is attached). Best-effort + GATED: a no-op returning {configured:false}
// without KV — never throws, never fabricates. Mirrors the handler's "station" action write.
async function persistStation(agent, patch, stampISO) {
  if (!KV_ON) return { ok: false, configured: false };
  try {
    const id = agentId(agent || (patch && patch.agent));
    const stations = await kvGet(K_STATIONS);
    const prev = stations.find((s) => s && s.agent === id);
    const next = station(prev, Object.assign({ agent: id }, patch || {}), stampISO);
    const merged = stations.filter((s) => s && s.agent !== id).concat([next]).slice(-100);
    await kvSet(K_STATIONS, merged);
    return { ok: true, station: next };
  } catch (e) { return { ok: false, error: String((e && e.message) || e).slice(0, 120) }; }
}

module.exports.station = station;
module.exports.persistStation = persistStation;
module.exports.normMessage = normMessage;
module.exports.handoff = handoff;
module.exports.inbox = inbox;
module.exports.hub = hub;
module.exports.STATUSES = STATUSES;
