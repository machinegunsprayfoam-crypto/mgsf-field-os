// Klyfton OPS MANAGER — the foreman over the doer agents (api/agents.js). One supervisor that
// reads the whole crew's plans, ranks the next actions by REVENUE/RISK, surfaces what's blocked on a
// dark tool, derives each agent's Work-Hub station, and rolls ONE approve-queue up to the owner.
//
// It is the layer Clifton asked for: not five agents to check one by one, but a foreman that says
// "here's the crew, here's the top thing to approve, here's what's stuck." It RECOMMENDS + QUEUES
// only — every outward step still dispatches through the arms (api/act.js) on the owner's approval.
// The foreman itself never sends anything and never fabricates a number or a customer.
//
// Pure core `supervise(plans, stampISO)` is deterministic, keyless, no Date.now, no network — it
// takes the doer agents' plan() outputs and returns the rollup. The gated live handler wires the
// real jobs board + subs roster into agents.plan()/planSubCompliance() and calls supervise().
//
// POST { jobs:[...], subs:[...], now? }   GET -> shape + who it supervises.

const agents = require("./agents");

function clean(s, max) { return String(s == null ? "" : s).trim().slice(0, max || 200); }

// Why each doer matters, and its base priority. Revenue/risk order: cash already earned (AR) >
// new revenue (speed-to-lead) > revenue at risk (cooling bid) > risk that can HALT a job
// (a sub's lapsed COI/license) > throughput (keep everything moving). Tune here, one place.
const ROLE = {
  collector:        { weight: 100, why: "cash in hand — aging AR" },
  "lead-closer":    { weight: 90,  why: "speed-to-lead — new revenue at stake" },
  "bid-chaser":     { weight: 80,  why: "revenue at risk — a bid going cold" },
  "sub-compliance": { weight: 70,  why: "risk — a sub's lapsed COI/license can halt a job" },
  pm:               { weight: 50,  why: "throughput — keep every job moving" },
};

// Pure: given the doer agents' plans, produce the foreman's rollup —
//   priorities   : one cross-agent action queue, ranked by revenue/risk (highest first)
//   escalations  : the steps blocked on a dark tool (what to unlock)
//   stations     : each agent's Work-Hub workstation (reuses agents.stationFrom)
//   counts       : desks working/blocked/idle + ready/blocked step totals
//   summary      : one owner-readable line (TL;DR)
// Deterministic; never fabricates. Steps keep agents.plan()'s semantics: live===true ⇒ ready,
// live===false ⇒ blocked (dark tool), live==null ⇒ in-app/manual (neither).
function supervise(plans, stampISO) {
  const list = (Array.isArray(plans) ? plans : []).filter((p) => p && p.ok !== false);
  const stations = [], priorities = [], escalations = [];
  list.forEach((p) => {
    const role = ROLE[p.agent] || { weight: 10, why: "general" };
    const steps = Array.isArray(p.steps) ? p.steps : [];
    let readyN = 0;
    steps.forEach((s) => {
      const blocked = s.live === false;
      const ready = s.live === true;
      if (ready) readyN++;
      const item = {
        agent: p.agent, label: clean(p.label, 60) || p.agent,
        who: clean(s.who, 80), stage: clean(s.stage, 24),
        action: clean(s.action || s.issue, 160),
        tool: s.tool || null,
        ready, blocked, inApp: s.live == null,
        blockedBy: blocked ? (s.blockedBy || null) : null,
        approval: s.approval === true,
        why: role.why,
        // ready steps rank slightly above equal-weight peers; blocked steps sink (owner can't action yet).
        score: role.weight + (ready ? 5 : 0) - (blocked ? 3 : 0),
      };
      priorities.push(item);
      if (blocked) escalations.push(item);
    });
    // Normalize for stationFrom (works whether or not the plan carried ready/count).
    stations.push(agents.stationFrom(p.agent, { agent: p.agent, count: steps.length, ready: readyN, goal: p.goal }, stampISO));
  });
  priorities.sort((a, b) => b.score - a.score ||
    String(a.agent).localeCompare(String(b.agent)) || String(a.who).localeCompare(String(b.who)));
  const counts = {
    agents: stations.length,
    working: stations.filter((s) => s.status === "working").length,
    blocked: stations.filter((s) => s.status === "blocked").length,
    idle: stations.filter((s) => s.status === "idle").length,
    steps: priorities.length,
    ready: priorities.filter((q) => q.ready).length,
    escalations: escalations.length,
  };
  const top = priorities[0];
  const summary = counts.steps === 0
    ? "All quiet — no open actions across the crew."
    : (counts.ready + " ready action" + (counts.ready === 1 ? "" : "s") + " across " + counts.agents + " desks"
        + (counts.escalations ? ("; " + counts.escalations + " blocked on a dark tool") : "")
        + (top ? (". Top: " + top.label + " → " + top.who + " (" + top.why + ")") : "."));
  return {
    ok: true, agent: "ops-manager", label: "Ops Manager",
    summary, counts,
    priorities,
    top: priorities.slice(0, 5),
    escalations,
    stations,
    note: "Recommends + queues only. Every outward step still dispatches through the arms (act.js) on the OWNER's approval — the foreman never auto-sends and never fabricates.",
  };
}

const DOERS = ["pm", "collector", "bid-chaser", "lead-closer"];

module.exports = async (req, res) => {
  const guard = require("./guard"); if (!guard.ok(req)) { res.status(401).json(guard.denied()); return; }
  if (req.method === "GET") {
    res.status(200).json({ ok: true, configured: true, service: "ops-manager",
      supervises: Object.keys(ROLE),
      note: "The foreman over the doer agents — reads the crew's plans, ranks the next actions by revenue/risk, surfaces blockers, and rolls one approve-queue up to the owner. Recommends only; outward actions still pass the arms (act.js) approval gate. POST { jobs:[...], subs:[...] }." });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body; if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  const jobs = Array.isArray(body.jobs) ? body.jobs : [];
  const subs = Array.isArray(body.subs) ? body.subs : [];
  const nowMs = Number(body.now) || Date.parse(body.now) || Date.now();
  const env = process.env;
  const stampISO = new Date().toISOString();
  try {
    const plans = DOERS.map((id) => agents.plan(id, jobs, nowMs, env));
    if (typeof agents.planSubCompliance === "function") plans.push(agents.planSubCompliance(subs, nowMs, env));
    res.status(200).json(supervise(plans, stampISO));
  } catch (e) { res.status(200).json({ ok: false, error: String((e && e.message) || e).slice(0, 200) }); }
};

module.exports.supervise = supervise;
module.exports.ROLE = ROLE;
