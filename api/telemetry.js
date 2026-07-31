// Klyfton TELEMETRY — runtime observability. The agents log every step to agent_runs; this rolls
// that up into "what has Klyfton actually been doing": runs by agent, by outcome (dispatched /
// drafts / skipped / blocked), and a per-day trend — so you can see whether the machine is working
// and where it's stuck (e.g., lots of 'blocked' = a dark tool needs a key; the CMDB says which).
//
// PURE rollup (deterministic — unit-testable offline) + gated read from Supabase. Graceful no-op
// without the store. Read-only, CREW_CODE-gated. GET /api/telemetry -> the rollup.
const guard = require("./guard");

function _env(re) { for (const k of Object.keys(process.env)) { if (re.test(k) && process.env[k]) return process.env[k]; } return undefined; }
const SB_URL = (_env(/SUPABASE_URL$/i) || "").replace(/\/$/, "");
const SB_KEY = _env(/SERVICE_ROLE_KEY$/i) || _env(/SUPABASE_SECRET/i);
const SB_ON = !!(SB_URL && SB_KEY);

function dayOf(at) { const ms = typeof at === "number" ? at : Date.parse(at); return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : "unknown"; }

// PURE: roll up agent_runs rows into counts by agent, by outcome, and by day. Deterministic.
function rollup(runs) {
  const rows = Array.isArray(runs) ? runs : [];
  const byAgent = {}, byOutcome = {}, byDay = {};
  for (const r of rows) {
    if (!r) continue;
    const a = r.agent || "unknown", o = r.outcome || "unknown", d = dayOf(r.at);
    byAgent[a] = byAgent[a] || { total: 0, dispatched: 0, drafts: 0, skipped: 0, blocked: 0, other: 0 };
    byAgent[a].total++;
    if (o === "dispatched") byAgent[a].dispatched++;
    else if (o === "needs_approval" || o === "incomplete") byAgent[a].drafts++;
    else if (o === "skipped") byAgent[a].skipped++;
    else if (o === "blocked") byAgent[a].blocked++;
    else byAgent[a].other++;
    byOutcome[o] = (byOutcome[o] || 0) + 1;
    byDay[d] = (byDay[d] || 0) + 1;
  }
  return { total: rows.length, agents: Object.keys(byAgent).length, byAgent, byOutcome, byDay };
}

async function sbFetch(pathStr) {
  return fetch(SB_URL + pathStr, { headers: { apikey: SB_KEY, authorization: "Bearer " + SB_KEY } });
}
// Gated read: pull recent agent_runs, roll them up. Graceful.
async function report(env, opts) {
  if (!SB_ON) return { configured: false, note: "attach Supabase + run db/agent_runs.sql; agents log runs there", rollup: rollup([]) };
  try {
    const limit = (opts && opts.limit) || 1000;
    const r = await sbFetch("/rest/v1/agent_runs?select=agent,outcome,at&order=at.desc&limit=" + limit);
    if (!r.ok) return { configured: true, ok: false, status: r.status, rollup: rollup([]) };
    const rows = await r.json();
    return { configured: true, ok: true, rollup: rollup(Array.isArray(rows) ? rows : []) };
  } catch (e) { return { configured: true, ok: false, error: String(e).slice(0, 120), rollup: rollup([]) }; }
}

module.exports = async (req, res) => {
  if (req.method !== "GET" && req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  if (!guard.ok(req)) { res.status(401).json(guard.denied()); return; }
  try { res.status(200).json({ service: "klyfton-telemetry", ...(await report(process.env)) }); }
  catch (e) { res.status(200).json({ ok: false, error: String(e).slice(0, 140) }); }
};

module.exports.rollup = rollup;
module.exports.report = report;
module.exports.dayOf = dayOf;
