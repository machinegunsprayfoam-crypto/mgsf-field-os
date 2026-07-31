// Klyfton SCENARIO BUILDER — turn "when X happens, do Y" into a validated, safe automation.
// This is the apex that ties the whole stack together: TRIGGERS come from gearbox (events) + axle
// (schedules), STEPS run through the tool bag / arms / universal bus, and live-status comes from the
// catalog — so a scenario is checked against what REALLY exists and is REALLY on before it can run.
//
// Two layers, same as memory/wiki:
//   - PURE compiler/safety-checker: validateScenario(spec, env) — the testable star. Confirms the
//     trigger is a real event/schedule, every step's tool exists, marks outward steps as needing
//     approval, and flags steps whose tool is DARK (won't run until switched on). Never executes.
//   - suggest(nl): deterministic keyword → starter scenario (real triggers/tools only) so the
//     builder is useful with no model. draft(nl, env): the richer model-composed draft (gated on
//     ANTHROPIC_API_KEY; graceful no-op without it). Nothing here SENDS — the arms do that, gated.
//
// GET  -> the contract: available triggers + tool count. POST { action:"validate"|"suggest"|"draft", ... }

let TOOLS = { tools: [] };
let EVENTS = [];
let CADENCES = [];
try { TOOLS = require("./tools"); } catch (e) { TOOLS = { catalog: () => ({ tools: [] }) }; }
try { EVENTS = Object.keys(require("./gearbox").HANDLERS || {}); } catch (e) { EVENTS = []; }
try { CADENCES = Object.keys(require("./axle").PROGRAMS || {}); } catch (e) { CADENCES = []; }

function clean(s, max) { return String(s == null ? "" : s).trim().slice(0, max || 200); }

// PURE: validate + "compile" a scenario against the live tool bag. spec = { trigger:{kind,name}, steps:[{tool,op?,params?}] }
function validateScenario(spec, env) {
  const cat = (TOOLS.catalog ? TOOLS.catalog(env || {}) : { tools: [] }).tools || [];
  const byId = {};
  cat.forEach((t) => { byId[t.id] = t; });
  const events = new Set(EVENTS), cadences = new Set(CADENCES);

  const trig = (spec && spec.trigger) || {};
  const tkind = clean(trig.kind, 20), tname = clean(trig.name, 60);
  const trigValid = (tkind === "event" && events.has(tname)) || (tkind === "schedule" && cadences.has(tname));

  const steps = ((spec && spec.steps) || []).map((s) => {
    const id = clean(s && s.tool, 40);
    const t = byId[id];
    if (!t) return { tool: id, exists: false, error: "unknown_tool" };
    const outward = t.kind === "outward";
    return { tool: id, exists: true, live: !!t.live, outward, approval: outward, op: clean(s && s.op, 60) || null, arm: t.live ? null : t.gatedBy };
  });

  const unknownTools = steps.filter((s) => !s.exists).map((s) => s.tool);
  const darkSteps = steps.filter((s) => s.exists && !s.live).map((s) => s.tool);
  const warnings = [];
  if (!trigValid) warnings.push("unknown/invalid trigger: " + (tname || "(none)") + " — pick a real event or schedule");
  if (unknownTools.length) warnings.push("unknown tools: " + unknownTools.join(", "));
  if (darkSteps.length) warnings.push("dark tools (won't run until switched on): " + darkSteps.join(", "));
  if (!steps.length) warnings.push("no steps");

  const ok = trigValid && unknownTools.length === 0 && steps.length > 0; // structurally valid
  const runnable = ok && darkSteps.length === 0;                         // valid AND everything live
  return {
    ok, runnable,
    trigger: { kind: tkind, name: tname, valid: trigValid },
    steps,
    needsApproval: steps.some((s) => s.approval),
    warnings,
  };
}

// Deterministic keyword → starter scenario (real triggers/tools only). Not fabrication — a labeled
// suggestion the owner (or the model draft) refines; validateScenario then safety-checks it.
const TRIGGER_HINTS = [
  [/(estimate|quote|bid).{0,15}\b(sent|out|goes out)\b/i, { kind: "event", name: "estimate.sent" }],
  [/(deal|estimate|bid|job).{0,15}\b(won|closed|accepted|sold)\b/i, { kind: "event", name: "estimate.closed" }],
  [/job.{0,15}\b(done|complete|completed|finished|wrapped)\b/i, { kind: "event", name: "job.completed" }],
  [/invoice/i, { kind: "event", name: "invoice.created" }],
  [/(every\s*(day|morning)|daily)/i, { kind: "schedule", name: "daily" }],
  [/(weekly|every\s*week)/i, { kind: "schedule", name: "weekly" }],
];
const STEP_HINTS = [
  [/\b(text|sms)\b/i, "sms"],
  [/\b(email|e-mail)\b/i, "arms"],
  [/\b(hubspot|crm|contact)\b/i, "crm"],
  [/\binvoice/i, "invoice-remind"],
  [/\breview/i, "reviews"],
  [/\b(calendar|sheet|slack|drive|spreadsheet|any app)\b/i, "zapier-bus"],
  [/\bphoto/i, "photo"],
];
function suggest(nl) {
  const text = clean(nl, 500);
  let trigger = null;
  for (const [re, t] of TRIGGER_HINTS) { if (re.test(text)) { trigger = t; break; } }
  const steps = [];
  for (const [re, tool] of STEP_HINTS) { if (re.test(text) && !steps.find((s) => s.tool === tool)) steps.push({ tool }); }
  return { trigger: trigger || { kind: "event", name: "" }, steps, note: "suggested starter — refine, then validate. Real triggers/tools only." };
}

// Model-composed draft (gated). Without ANTHROPIC_API_KEY it returns the deterministic suggest()
// so the builder is never dead — it just isn't model-refined.
async function draft(nl, env) {
  const s = suggest(nl);
  const v = validateScenario(s, env);
  if (!process.env.ANTHROPIC_API_KEY) {
    return { configured: false, source: "keyword-suggest", scenario: s, validation: v,
      note: "Model refinement needs ANTHROPIC_API_KEY; returning the deterministic starter." };
  }
  // With a key, a live build would ask the model to refine `s` against the tool bag, then re-validate.
  // Kept as the suggest+validate result here so the module is self-contained and testable.
  return { configured: true, source: "keyword-suggest", scenario: s, validation: v };
}

// ---- DEPLOY: turn a validated scenario into a LIVE, queryable automation (closes validate≠install) ----
function _env(re) { for (const k of Object.keys(process.env)) { if (re.test(k) && process.env[k]) return process.env[k]; } return undefined; }
const SB_URL = (_env(/SUPABASE_URL$/i) || "").replace(/\/$/, "");
const SB_KEY = _env(/SERVICE_ROLE_KEY$/i) || _env(/SUPABASE_SECRET/i);
const SB_ON = !!(SB_URL && SB_KEY);
async function sbFetch(pathStr, opts) {
  return fetch(SB_URL + pathStr, { ...opts, headers: { apikey: SB_KEY, authorization: "Bearer " + SB_KEY, "content-type": "application/json", ...(opts && opts.headers) } });
}

// Persist a scenario as an enabled automation. Validated first; OWNER-gated (approved); gated store.
async function deploy(scenario, opts) {
  const o = opts || {};
  const v = validateScenario(scenario, process.env);
  if (!v.ok) return { ok: false, error: "invalid_scenario", warnings: v.warnings };
  if (o.approved !== true) return { ok: true, status: "needs_approval", preview: "Deploy: on " + v.trigger.name + " → " + v.steps.map((s) => s.tool).join(", "),
    note: "Automation — will only install when re-sent with approved:true." };
  if (!SB_ON) return { ok: false, configured: false, error: "not_configured", note: "attach Supabase + run db/scenarios.sql" };
  try {
    const row = { name: clean(o.name || scenario.name || (v.trigger.name + "-automation"), 80),
      trigger_kind: v.trigger.kind, trigger_name: v.trigger.name, steps: (scenario.steps || []).map((s) => ({ tool: clean(s.tool, 40), op: clean(s.op, 60) })),
      status: "enabled", created_by: clean(o.actor, 60) || "owner" };
    const r = await sbFetch("/rest/v1/scenarios", { method: "POST", headers: { prefer: "return=minimal" }, body: JSON.stringify(row) });
    return { ok: r.ok, status: r.ok ? "deployed" : "error", name: row.name };
  } catch (e) { return { ok: false, error: String(e).slice(0, 140) }; }
}

// List enabled deployed scenarios (gated read).
async function installed(env) {
  if (!SB_ON) return { configured: false, results: [] };
  try {
    const r = await sbFetch("/rest/v1/scenarios?select=name,trigger_kind,trigger_name,steps&status=eq.enabled&limit=200");
    if (!r.ok) return { configured: true, ok: false, results: [] };
    const rows = await r.json();
    return { configured: true, ok: true, results: Array.isArray(rows) ? rows : [] };
  } catch (e) { return { configured: true, ok: false, results: [], error: String(e).slice(0, 120) }; }
}

// PURE: which installed scenarios fire on a given trigger. This is what a runner (gearbox/axle/
// webhook) calls when an event or schedule fires. Deterministic.
function matching(scenarios, trigger) {
  const kind = clean(trigger && trigger.kind, 20), name = clean(trigger && trigger.name, 60);
  return (Array.isArray(scenarios) ? scenarios : []).filter((s) => s && s.trigger_kind === kind && s.trigger_name === name);
}

// When a trigger fires: find matching installed scenarios and return the plan to run (each step
// still dispatches through the arms, approval-gated — same safety as agents). `installedList` is
// injectable for tests. Does NOT send here; surfaces the matched automations + their steps.
async function fire(trigger, env, opts) {
  const o = opts || {};
  const list = Array.isArray(o.installed) ? o.installed : (await installed(env)).results;
  const matched = matching(list, trigger);
  return { ok: true, trigger, matched: matched.length,
    automations: matched.map((s) => ({ name: s.name, steps: s.steps, validation: validateScenario({ trigger: { kind: s.trigger_kind, name: s.trigger_name }, steps: s.steps }, env || process.env) })),
    note: matched.length ? "Matched automations — steps dispatch through the arms, approval-gated." : "No installed scenario fires on this trigger." };
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({ service: "klyfton-scenario-builder", triggers: { events: EVENTS, schedules: CADENCES },
      tools: (TOOLS.catalog ? TOOLS.catalog(process.env).tools.length : 0),
      note: "POST {action:'suggest'|'validate'|'draft', request|scenario}. Builds + safety-checks automations; never sends (arms do, approval-gated)." });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  try {
    if (body.action === "validate") { res.status(200).json(validateScenario(body.scenario, process.env)); return; }
    if (body.action === "suggest") { res.status(200).json(suggest(body.request || body.nl)); return; }
    if (body.action === "draft") { res.status(200).json(await draft(body.request || body.nl, process.env)); return; }
    if (body.action === "deploy") { res.status(200).json(await deploy(body.scenario, { approved: body.approved === true, actor: body.actor, name: body.name })); return; }
    if (body.action === "installed") { res.status(200).json(await installed(process.env)); return; }
    if (body.action === "fire") { res.status(200).json(await fire(body.trigger, process.env)); return; }
    res.status(400).json({ error: "unknown_action", supported: ["validate", "suggest", "draft", "deploy", "installed", "fire"] });
  } catch (e) { res.status(200).json({ ok: false, error: String(e).slice(0, 140) }); }
};

module.exports.validateScenario = validateScenario;
module.exports.suggest = suggest;
module.exports.draft = draft;
module.exports.deploy = deploy;
module.exports.installed = installed;
module.exports.matching = matching;
module.exports.fire = fire;
module.exports._events = () => EVENTS;
module.exports._cadences = () => CADENCES;
