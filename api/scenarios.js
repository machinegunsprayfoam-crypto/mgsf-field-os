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
    res.status(400).json({ error: "unknown_action", supported: ["validate", "suggest", "draft"] });
  } catch (e) { res.status(200).json({ ok: false, error: String(e).slice(0, 140) }); }
};

module.exports.validateScenario = validateScenario;
module.exports.suggest = suggest;
module.exports.draft = draft;
module.exports._events = () => EVENTS;
module.exports._cadences = () => CADENCES;
