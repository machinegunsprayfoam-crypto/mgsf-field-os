// Klyfton TOOL BAG — the single self-describing catalog of every tool Klyfton has: what each
// one DOES, which file backs it, what gates it, and whether it's LIVE right now. This is the
// piece that lets the brain (and Clifton) see the whole kit in one place instead of guessing
// across 50 modules + the health board + the arms bus.
//
// SINGLE SOURCE OF TRUTH: gating/live-status for the connected capabilities is pulled straight
// from health.js (the Mechanic) via its exported _SUBSYSTEMS — so on/off can NEVER drift from
// the Mechanic. This module only ADDS the human/agent-facing metadata (category + one-line
// "does") and folds in the keyless local compute tools that health doesn't track.
//
// Honest by design: no capability is claimed "live" from an env var alone — live() runs the
// same predicate the Mechanic uses. Keyless compute tools are always live (no key to miss).
// Keyless, no npm, pure catalog builder — unit-testable offline. GET /api/tools -> the catalog.

let SUBSYS = [];
try { SUBSYS = require("./health")._SUBSYSTEMS || []; } catch (e) { SUBSYS = []; }

// Agent-facing metadata keyed by the Mechanic's subsystem id. Gating stays in health.js;
// this is only "what it is / what it does / where it lives."
const SUBSYS_META = {
  hive:    { category: "intelligence", kind: "compute", does: "Queen→worker→critic reasoning over the GraphRAG brain", module: "api/klyfton.js" },
  memory:  { category: "memory",       kind: "recall",  does: "semantic recall + remember durable facts (pgvector)", module: "api/memory.js" },
  arms:    { category: "action",       kind: "outward", does: "send email/SMS, push CRM, create invoice/order — approval-gated", module: "api/act.js" },
  ats:     { category: "governor",     kind: "infra",   does: "auto-throttle spend fuel→battery near the monthly cap", module: "api/ats.js" },
  crm:     { category: "crm",          kind: "read",    does: "HubSpot contacts/deals → scored call list", module: "api/hubspot.js" },
  sms:     { category: "comms",        kind: "outward", does: "Twilio SMS / voice + missed-call text-back", module: "api/missed-call.js" },
  govcon:  { category: "govcon",       kind: "read",    does: "daily SAM.gov opportunity scan for our NAICS/region", module: "api/samgov.js" },
  storage: { category: "infra",        kind: "infra",   does: "Supabase event spine / durable state", module: "api/sync.js" },
  maps:    { category: "geo",          kind: "read",    does: "geocode + drive-distance mobilization tiers", module: "api/geo.js" },
  pricing: { category: "pricing",      kind: "read",    does: "pull the newest dated pricing sheet (doctrine wins)", module: "api/pricing.js" },
  access:  { category: "infra",        kind: "infra",   does: "CREW_CODE gate on pipeline/data endpoints", module: "api/auth.js" },
  cron:    { category: "infra",        kind: "infra",   does: "shared secret protecting scheduled endpoints", module: "api/axle.js" },
};

// Keyless compute tools — always available (no env gate to miss). The estimator + eval toolkit.
const LOCAL_TOOLS = [
  { id: "foam-calc",        category: "estimator", kind: "compute", does: "open/closed-cell board-feet, sets, cost", module: "api/foam-calc.js" },
  { id: "coating-calc",     category: "estimator", kind: "compute", does: "roof-coating gallons + coats + cost", module: "api/coating-calc.js" },
  { id: "measure",          category: "estimator", kind: "compute", does: "roof/wall takeoff (area, waste, slope factor)", module: "api/measure.js" },
  { id: "dew-point",        category: "estimator", kind: "compute", does: "spray-safety GO/CAUTION/NO-GO (5°F margin)", module: "api/dew-point.js" },
  { id: "bpi-calc",         category: "estimator", kind: "compute", does: "blower-door ACH50 bands + ASHRAE 62.2 target", module: "api/bpi-calc.js" },
  { id: "roi",              category: "estimator", kind: "compute", does: "financing cash-flow / payback decision", module: "api/roi.js" },
  { id: "geo-mobilization", category: "geo",       kind: "compute", does: "mobilization tier by distance (keyless math)", module: "api/geo.js" },
  { id: "commission",       category: "finance",   kind: "compute", does: "commission split math", module: "api/commission.js" },
  { id: "payment-schedule", category: "finance",   kind: "compute", does: "deposit/progress/final payment schedule", module: "api/payment-schedule.js" },
  { id: "unit-convert",     category: "estimator", kind: "compute", does: "trade unit conversions", module: "api/unit-convert.js" },
  { id: "job-cost",         category: "finance",   kind: "compute", does: "job-cost roll-up vs estimate", module: "api/job-cost.js" },
  { id: "curriculum",       category: "learning",  kind: "compute", does: "graded exam that scores Klyfton's knowledge (the eval loop)", module: "api/curriculum.js" },
];

function statusOf(sub, env) {
  try {
    if (typeof sub.on === "function" && sub.on(env)) return "live";
    if (typeof sub.partial === "function" && sub.partial(env)) return "partial";
  } catch (e) { /* a bad predicate must not crash the catalog */ }
  return "dark";
}

// Build the full catalog against an env-like object. Deterministic, no network, no time.
function catalog(env) {
  env = env || {};
  const gated = SUBSYS.map((s) => {
    const meta = SUBSYS_META[s.id] || { category: "other", kind: "infra", does: s.label || s.id, module: "api/" + s.id + ".js" };
    const status = statusOf(s, env);
    return {
      id: s.id, name: s.label || s.id,
      category: meta.category, kind: meta.kind, does: meta.does, module: meta.module,
      gated: true, gatedBy: s.note || "(see health.js)",
      status, live: status === "live",
    };
  });
  const local = LOCAL_TOOLS.map((t) => ({
    id: t.id, name: t.id, category: t.category, kind: t.kind, does: t.does, module: t.module,
    gated: false, gatedBy: "none", status: "live", live: true,
  }));
  const tools = gated.concat(local);
  const live = tools.filter((t) => t.live);
  const dark = tools.filter((t) => t.status === "dark");
  const byCategory = {};
  for (const t of tools) {
    byCategory[t.category] = byCategory[t.category] || { total: 0, live: 0 };
    byCategory[t.category].total++;
    if (t.live) byCategory[t.category].live++;
  }
  return {
    ok: true,
    count: tools.length,
    live: live.length,
    dark: dark.length,
    darkTools: dark.map((t) => ({ id: t.id, arm: t.gatedBy })), // what's off + how to turn it on
    byCategory,
    tools,
  };
}

function find(id, env) { return catalog(env).tools.find((t) => t.id === id) || null; }

// Validate the catalog is well-formed (used by the gate so a malformed entry can't ship).
function validate(env) {
  const c = catalog(env);
  const ids = new Set();
  const errors = [];
  for (const t of c.tools) {
    if (!t.id) errors.push("tool with no id");
    else if (ids.has(t.id)) errors.push("duplicate id: " + t.id);
    else ids.add(t.id);
    if (!t.does) errors.push(t.id + ": no 'does'");
    if (!t.category) errors.push(t.id + ": no category");
    if (!t.module) errors.push(t.id + ": no module");
  }
  return { ok: errors.length === 0, count: c.tools.length, errors };
}

module.exports = { catalog, find, validate, LOCAL_TOOLS, SUBSYS_META };

// HTTP: GET /api/tools -> the live catalog (read-only, safe to expose; no secrets, no keys).
module.exports.handler = function (req, res) {
  const c = catalog(process.env);
  const body = JSON.stringify({ service: "klyfton-tool-bag", ...c }, null, 2);
  if (res && typeof res.setHeader === "function") {
    res.setHeader("Content-Type", "application/json");
    res.statusCode = 200;
    res.end(body);
  }
  return c;
};

// Direct run: print the catalog against the current env. `node api/tools.js`
if (require.main === module) {
  const c = catalog(process.env);
  console.log("Klyfton tool bag: " + c.count + " tools (" + c.live + " live, " + c.dark + " dark)\n");
  for (const t of c.tools) {
    console.log("  [" + (t.live ? "•" : " ") + "] " + t.id.padEnd(16) + t.category.padEnd(13) + t.does);
  }
  const v = validate(process.env);
  console.log(v.ok ? "\n✓ catalog valid" : "\n✗ errors: " + v.errors.join("; "));
}
