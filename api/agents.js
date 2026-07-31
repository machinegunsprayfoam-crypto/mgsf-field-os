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
let arms = null;
try { arms = require("./act"); } catch (e) {}

function _kvEnv(suffixRe) { for (const k of Object.keys(process.env)) { if (suffixRe.test(k) && process.env[k]) return process.env[k]; } return undefined; }
const SB_URL = _kvEnv(/SUPABASE_URL$/i);
const SB_KEY = _kvEnv(/SERVICE_ROLE_KEY$/i) || _kvEnv(/SUPABASE_SECRET/i);
const SB_ON = !!(SB_URL && SB_KEY);

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

// Turn a planned step + its job into a concrete ARM action skeleton (the bridge from "next action"
// to something the executor can actually run). Body/subject are left EMPTY on purpose — the brain
// drafts the message, the owner approves; we never fabricate customer copy here. Returns null when
// the step isn't an arm-level send (in-app/manual). Pure.
function buildAction(step, job) {
  const who = clean((job && (job.customer || job.name)) || "", 80);
  const phone = clean(job && job.phone, 20), email = clean(job && job.email, 120);
  switch (step && step.stage) {
    case "lead":
    case "scheduled": return { type: "send_sms", to: phone, body: "", _for: who };
    case "bid":
    case "invoiced": return { type: "send_email", to: email, subject: "", body: "", _for: who };
    case "done": return { type: "create_invoice", customer: who, amount: (job && job.value) || "", job: (job && job.service) || "" };
    default: return null; // paid (review), in_progress (photo), etc. — handled in-app, not an arm
  }
}

// Observe → don't repeat: skip a step already run for the same who+stage within the cooldown. Pure.
function shouldSkip(step, history, nowMs, cooldownDays) {
  const cd = (cooldownDays || 3) * 86400000;
  return (history || []).some((h) => h && h.who === step.who && h.stage === step.stage &&
    Number.isFinite(h.at) && Number.isFinite(nowMs) && (nowMs - h.at) < cd);
}

// The CLOSED LOOP: plan → for each outward step, build the arm action and run it THROUGH the arms
// executor (which enforces its own approval gate) → collect the outcome. Observes run-history to
// skip recently-done steps. `exec` is injectable (defaults to arms.execute) so it's testable
// offline. SAFETY: nothing dispatches unless opts.approved===true AND arms.execute approves it too.
async function run(agentId, jobs, nowMs, env, opts) {
  const p = plan(agentId, jobs, nowMs, env);
  if (!p.ok) return p;
  const o = opts || {};
  const exec = typeof o.exec === "function" ? o.exec : (arms && arms.execute);
  const history = Array.isArray(o.history) ? o.history : [];
  const list = Array.isArray(jobs) ? jobs : [];
  const results = [];
  for (const step of p.steps) {
    if (shouldSkip(step, history, nowMs, o.cooldownDays)) { results.push({ step, outcome: "skipped", reason: "done within cooldown" }); continue; }
    const job = list.find((j) => (j.customer || j.name) === step.who) || {};
    const action = buildAction(step, job);
    if (!action) { results.push({ step, outcome: "in_app", reason: "handled in-app, not an outward arm" }); continue; }
    if (step.live === false) { results.push({ step, outcome: "blocked", reason: "tool dark", blockedBy: step.blockedBy }); continue; }
    if (typeof exec !== "function") { results.push({ step, outcome: "no_executor" }); continue; }
    const r = await exec(action, { approved: o.approved === true, actor: o.actor });
    results.push({ step, action: { type: action.type, for: action._for || action.customer }, result: r, outcome: (r && r.status) || "unknown" });
  }
  const tally = (s) => results.filter((r) => r.outcome === s).length;
  return {
    ...p,
    approved: o.approved === true,
    dispatched: tally("dispatched"),
    drafts: tally("needs_approval") + tally("incomplete"),
    skipped: tally("skipped"),
    blocked: tally("blocked"),
    results,
    note: o.approved === true
      ? "Approved run: complete + live steps dispatched through the arms (each still act.js-gated); dark/incomplete/recent steps skipped."
      : "Preview: every outward step ran through the arms as a GATED draft. Nothing sent.",
  };
}

async function sbFetch(pathStr, opts) {
  return fetch(SB_URL.replace(/\/$/, "") + pathStr, { ...opts,
    headers: { apikey: SB_KEY, authorization: "Bearer " + SB_KEY, "content-type": "application/json", ...(opts && opts.headers) } });
}
// Persist a run's steps to agent_runs (gated/graceful) so agents are STATEFUL — the history other
// runs read via shouldSkip. Records who+stage+outcome+timestamp only (no customer message body).
async function logRun(agentId, results, nowMs) {
  if (!SB_ON) return { configured: false };
  try {
    const rows = (results || []).filter((r) => r && r.step).map((r) => ({
      agent: clean(agentId, 40), who: clean(r.step.who, 80), stage: clean(r.step.stage, 40),
      outcome: clean(r.outcome, 40), at: Number.isFinite(nowMs) ? nowMs : null }));
    if (!rows.length) return { configured: true, ok: true, logged: 0 };
    const resp = await sbFetch("/rest/v1/agent_runs", { method: "POST", headers: { prefer: "return=minimal" }, body: JSON.stringify(rows) });
    return { configured: true, ok: resp.ok, logged: rows.length };
  } catch (e) { return { configured: true, ok: false, error: String(e).slice(0, 120) }; }
}
// Read recent run-history for an agent (gated/graceful) — feeds shouldSkip on the next run.
async function history(agentId, limit) {
  if (!SB_ON) return { configured: false, results: [] };
  try {
    const r = await sbFetch("/rest/v1/agent_runs?select=who,stage,outcome,at&agent=eq." + encodeURIComponent(clean(agentId, 40)) + "&order=at.desc&limit=" + (limit || 200));
    if (!r.ok) return { configured: true, ok: false, results: [] };
    const rows = await r.json();
    return { configured: true, ok: true, results: Array.isArray(rows) ? rows : [] };
  } catch (e) { return { configured: true, ok: false, results: [], error: String(e).slice(0, 120) }; }
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({ service: "klyfton-agents",
      roster: Object.keys(AGENTS).map((id) => ({ id, label: AGENTS[id].label, goal: AGENTS[id].goal })),
      note: "POST { agent, jobs:[...], nowMs } for a plan. Agents plan + stage drafts; the arms send, approval-gated." });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  const guard = require("./guard"); if (!guard.ok(req)) { res.status(401).json(guard.denied()); return; } // dormant until CREW_CODE set
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  try {
    const nowMs = Number.isFinite(body.nowMs) ? body.nowMs : (Date.parse(body.now || "") || null);
    const hist = await history(body.agent, 200);           // observe: recent runs (gated/graceful)
    const out = await run(body.agent, body.jobs, nowMs, process.env,
      { approved: body.approved === true, actor: body.actor, history: hist.results, cooldownDays: body.cooldownDays });
    if (out.ok) { try { await logRun(body.agent, out.results, nowMs); } catch (e) {} } // record for next time
    res.status(200).json(out);
  } catch (e) { res.status(200).json({ ok: false, error: String(e).slice(0, 140) }); }
};

module.exports.AGENTS = AGENTS;
module.exports.plan = plan;
module.exports.run = run;
module.exports.primaryTool = primaryTool;
module.exports.buildAction = buildAction;
module.exports.shouldSkip = shouldSkip;
module.exports.logRun = logRun;
module.exports.history = history;
