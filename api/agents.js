// Klyfton AGENTS — the goal-completing runtime. Everything built this session was substrate; this
// is the doer. A named agent has a GOAL, SELECTS the jobs it owns from the projects board, and
// produces an ordered PLAN of next actions — each routed to a real tool, checked against live
// status, and marked approval-required for anything outward. It never sends on its own: outward
// steps dispatch through the arms (api/act.js) only on the owner's approval, and the whole run is
// budget-capped by the ATS. This is the "Silvr" idea finally done safely.
//
// Agent #1 is the Project Manager / Job Runner. Others: Collector (aging invoices), Bid Chaser
// (stale bids), Lead Closer (speed-to-lead). Each is a thin policy over the projects engine.
//
// PURE planning core (deterministic on nowMs) — unit-testable offline. Live dispatch is gated.
// GET -> the roster. POST { agent, jobs, nowMs } -> the plan.

const projects = require("./projects");
let toolBag = { catalog: () => ({ tools: [] }) };
try { toolBag = require("./tools"); } catch (e) {}

function clean(s, max) { return String(s == null ? "" : s).trim().slice(0, max || 80); }
function stageOf(j) { return projects.normalizeStage(j && (j.stage || j.status)); }

// The roster. `select(jobs, nowMs)` picks the jobs this agent owns. Thin policies over projects.
const AGENTS = {
  pm: {
    label: "Project Manager / Job Runner",
    goal: "Drive every open job to its next stage — nothing stalls between lead and paid.",
    select: (jobs, nowMs) => jobs.filter((j) => !projects.isTerminal(stageOf(j))),
  },
  collector: {
    label: "Collector",
    goal: "Chase every aging invoice to paid.",
    select: (jobs, nowMs) => jobs.filter((j) => stageOf(j) === "invoiced" && projects.isOverdue(j, nowMs).overdue),
  },
  "bid-chaser": {
    label: "Bid Chaser",
    goal: "Reheat stale bids before they go cold.",
    select: (jobs, nowMs) => jobs.filter((j) => stageOf(j) === "bid" && projects.isOverdue(j, nowMs).overdue),
  },
  "lead-closer": {
    label: "Lead Closer",
    goal: "Respond to new leads fast (speed-to-lead).",
    select: (jobs, nowMs) => jobs.filter((j) => stageOf(j) === "lead"),
  },
};

// Map a projects next-action tool hint ("missed-call / follow-up", "arm:create_invoice", "—")
// to a single real tool-bag id (or an arm). Deterministic.
function primaryTool(hint) {
  const h = clean(hint, 60);
  if (!h || h === "—") return null;
  const first = h.split("/")[0].trim();
  if (/^arm:/i.test(first)) return "arms";
  return first || null;
}

// Build the ordered plan for an agent against the jobs board. Pure/deterministic on nowMs.
function plan(agentId, jobs, nowMs, env) {
  const a = AGENTS[clean(agentId, 40)];
  if (!a) return { ok: false, error: "unknown_agent", agents: Object.keys(AGENTS) };
  const cat = (toolBag.catalog ? toolBag.catalog(env || {}) : { tools: [] }).tools || [];
  const byId = {};
  cat.forEach((t) => { byId[t.id] = t; });
  const selected = a.select(Array.isArray(jobs) ? jobs : [], nowMs);
  const steps = selected.map((j) => {
    const na = projects.nextAction(j);
    const toolId = primaryTool(na.tool);
    const t = toolId ? byId[toolId] : null;
    const outward = t ? t.kind === "outward" : true; // unknown/arm ⇒ treat as outward (safer: needs approval)
    return {
      who: clean(j.customer || j.name || "unnamed"),
      stage: stageOf(j),
      action: na.action,
      tool: toolId,
      live: t ? !!t.live : null,
      approval: outward,                        // outward ⇒ owner must approve
      blockedBy: t && !t.live ? t.gatedBy : null,
    };
  });
  const dispatchable = steps.filter((s) => s.live === true);
  const blocked = steps.filter((s) => s.live === false);
  return {
    ok: true, agent: agentId, label: a.label, goal: a.goal,
    count: steps.length,
    ready: dispatchable.length,        // steps whose tool is live (still approval-gated if outward)
    blocked: blocked.length,           // steps waiting on a dark tool
    steps,
    note: "Draft plan. Outward steps dispatch through the arms (api/act.js) ONLY on approval; the run is ATS budget-capped.",
  };
}

// run() = plan + a dispatch summary. It does NOT send: real outward dispatch goes through
// arms.execute(step, {approved:true}) per step, which is the owner's confirm. Kept side-effect-free
// here so the runtime is testable and can never fire an unapproved action.
function run(agentId, jobs, nowMs, env, opts) {
  const p = plan(agentId, jobs, nowMs, env);
  if (!p.ok) return p;
  const o = opts || {};
  return {
    ...p,
    approved: o.approved === true,
    willDispatch: o.approved === true ? p.steps.filter((s) => s.live === true) : [],
    note: o.approved === true
      ? "Approved: live steps are ready to dispatch through the arms (still each gated at act.js). Dark-tool steps skipped."
      : "Preview only — re-run per step with approval to dispatch. Nothing sent.",
  };
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({ service: "klyfton-agents",
      roster: Object.keys(AGENTS).map((id) => ({ id, label: AGENTS[id].label, goal: AGENTS[id].goal })),
      note: "POST { agent, jobs:[...], nowMs } for a plan. Agents plan + stage drafts; the arms send, approval-gated." });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  try {
    const nowMs = Number.isFinite(body.nowMs) ? body.nowMs : (Date.parse(body.now || "") || null);
    res.status(200).json(run(body.agent, body.jobs, nowMs, process.env, { approved: body.approved === true }));
  } catch (e) { res.status(200).json({ ok: false, error: String(e).slice(0, 140) }); }
};

module.exports.AGENTS = AGENTS;
module.exports.plan = plan;
module.exports.run = run;
module.exports.primaryTool = primaryTool;
