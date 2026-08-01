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
  { id: "energy-audit",     category: "estimator", kind: "compute", does: "utility-bill baseline for BPI reports — annualize kWh/therms, base-load vs seasonal split, weather-normalize, ESTIMATE savings (energy units, no $)", module: "api/energy-audit.js" },
  { id: "equipment-lookup", category: "estimator", kind: "ai", does: "AI helper: find an HVAC/water-heater unit's specs from make+model (grounded web_search, verified-only-with-source, never guesses; typical-by-vintage ESTIMATE fallback)", module: "api/equipment-lookup.js" },
  { id: "roi",              category: "estimator", kind: "compute", does: "financing cash-flow / payback decision", module: "api/roi.js" },
  { id: "geo-mobilization", category: "geo",       kind: "compute", does: "mobilization tier by distance (keyless math)", module: "api/geo.js" },
  { id: "commission",       category: "finance",   kind: "compute", does: "commission split math", module: "api/commission.js" },
  { id: "payment-schedule", category: "finance",   kind: "compute", does: "deposit/progress/final payment schedule", module: "api/payment-schedule.js" },
  { id: "unit-convert",     category: "estimator", kind: "compute", does: "trade unit conversions", module: "api/unit-convert.js" },
  { id: "job-cost",         category: "finance",   kind: "compute", does: "job-cost roll-up vs estimate", module: "api/job-cost.js" },
  { id: "curriculum",       category: "learning",  kind: "compute", does: "graded exam that scores Klyfton's knowledge (the eval loop)", module: "api/curriculum.js" },
  { id: "rag",              category: "knowledge", kind: "compute", does: "unified retrieval — fans out across brain graph + wiki + memory, merged + ranked (doctrine wins)", module: "api/rag.js" },
  { id: "projects",         category: "pm",        kind: "compute", does: "job-lifecycle tracker — where each job is, what's next, what's overdue", module: "api/projects.js" },
  { id: "cmdb",             category: "infra",     kind: "compute", does: "self-map: component dependency graph, why-is-X-dark root cause, biggest-unlock", module: "api/cmdb.js" },
  { id: "boot",             category: "infra",     kind: "compute", does: "boot manifest — one live self-map (components/deps/tools/brain/agents) computed from env", module: "api/boot.js" },
  { id: "scenarios",        category: "automation", kind: "compute", does: "AI scenario builder — turn 'when X do Y' into a validated, safe automation (real triggers/tools)", module: "api/scenarios.js" },
  { id: "agents",           category: "automation", kind: "compute", does: "goal-completing agent runtime (PM/collector/bid-chaser/lead-closer) — plans + stages drafts, approval-gated", module: "api/agents.js" },
  // keyless document + draft generators (produce a doc/message for approval — no external key)
  { id: "proposal-pdf",     category: "documents", kind: "compute", does: "turn an estimate into a branded, emailable proposal PDF", module: "api/proposal-pdf.js" },
  { id: "warranty-cert",    category: "documents", kind: "compute", does: "warranty certificate PDF to hand over at job close", module: "api/warranty-cert.js" },
  { id: "capability-statement", category: "govcon", kind: "compute", does: "one-page SDVOSB capability statement for federal buyers", module: "api/capability-statement.js" },
  { id: "change-order",     category: "documents", kind: "compute", does: "mid-job scope/price change-order doc to sign", module: "api/change-order.js" },
  { id: "reviews",          category: "comms",     kind: "compute", does: "draft the post-job 'how'd we do?' review request", module: "api/reviews.js" },
  { id: "photo-estimate",   category: "estimator", kind: "compute", does: "draft an estimate from a field photo + a few measurements", module: "api/photo-estimate.js" },
  { id: "weather",          category: "ops",       kind: "compute", does: "spray-window go/no-go conditions for a job address", module: "api/weather.js" },
];

// Real modules that DO need a key/config to work — each with an honest gate. `gate` is one of:
//   { anyOf:[...] } live if ANY listed env var is set · { allOf:[...] } live if ALL set ·
//   { subsystem:"id" } reuse a health.js subsystem's own predicate (single source of truth).
const WEBHOOK = { anyOf: ["ALERTS_WEBHOOK_URL", "NOTIFY_WEBHOOK_URL"] }; // the outward bridge
const GATED_TOOLS = [
  { id: "zapier-bus",      category: "action",  kind: "outward", does: "UNIVERSAL BUS — reach 9,000+ apps (Sheets/Calendar/Slack/QuickBooks/Meta…) via one approval-gated webhook", module: "api/act.js", gate: WEBHOOK, arm: "set ALERTS_WEBHOOK_URL (a Zapier Catch Hook)" },
  { id: "notify",          category: "comms",   kind: "outward", does: "universal event webhook — the bridge out of the app", module: "api/notify.js", gate: WEBHOOK, arm: "set ALERTS_WEBHOOK_URL or NOTIFY_WEBHOOK_URL" },
  { id: "missed-call",     category: "comms",   kind: "outward", does: "missed-call auto text-back (speed-to-lead recovery)", module: "api/missed-call.js", gate: WEBHOOK, arm: "set a webhook (+ Twilio for SMS)" },
  { id: "daily-brief",     category: "ops",     kind: "outward", does: "server-side morning brief pushed from app data", module: "api/daily-brief.js", gate: WEBHOOK, arm: "set a webhook to deliver it" },
  { id: "follow-up",       category: "comms",   kind: "outward", does: "no-lead-goes-cold follow-up sequencer", module: "api/follow-up.js", gate: WEBHOOK, arm: "set a webhook" },
  { id: "estimate-followup", category: "comms", kind: "outward", does: "reheat unsold estimates that never closed", module: "api/estimate-followup.js", gate: WEBHOOK, arm: "set a webhook" },
  { id: "invoice-remind",  category: "finance", kind: "outward", does: "draft reminders for due/overdue invoices", module: "api/invoice-remind.js", gate: WEBHOOK, arm: "set a webhook" },
  { id: "inventory-reorder", category: "ops",   kind: "outward", does: "what to reorder and from whom (reorder sweep)", module: "api/inventory-reorder.js", gate: WEBHOOK, arm: "set a webhook" },
  { id: "roof-maintenance", category: "revenue", kind: "outward", does: "recurring roof-maintenance program outreach", module: "api/roof-maintenance.js", gate: WEBHOOK, arm: "set a webhook" },
  { id: "tts",             category: "comms",   kind: "outward", does: "text-to-speech — Klyfton's replies as natural voice", module: "api/tts.js", gate: { anyOf: ["ELEVENLABS_API_KEY", "OPENAI_API_KEY"] }, arm: "set ELEVENLABS_API_KEY or OPENAI_API_KEY" },
  { id: "drive",           category: "infra",   kind: "outward", does: "Google Drive CSV + job-photo backup", module: "api/drive.js", gate: { anyOf: ["GDRIVE_WEBAPP_URL", "GOOGLE_APPS_SCRIPT_URL", "GDRIVE_TOKEN"] }, arm: "set GDRIVE_WEBAPP_URL (+ token)" },
  { id: "wiki",            category: "knowledge", kind: "read",  does: "editable knowledge base — SOPs/playbooks/product docs the brain retrieves from", module: "api/wiki.js", gate: { subsystem: "storage" }, arm: "attach storage (Supabase) + run db/wiki_schema.sql" },
  { id: "photo",           category: "infra",   kind: "read",    does: "job-photo storage on the shared data backbone", module: "api/photo.js", gate: { subsystem: "storage" }, arm: "attach storage (Supabase/KV)" },
  { id: "sync",            category: "infra",   kind: "read",    does: "multi-device sync backbone (every crew phone in step)", module: "api/sync.js", gate: { subsystem: "storage" }, arm: "attach storage (Supabase/KV)" },
  { id: "command-center",  category: "ops",     kind: "read",    does: "ops dashboard read API — the real live numbers", module: "api/command-center.js", gate: { subsystem: "storage" }, arm: "attach storage (Supabase/KV)" },
  { id: "telemetry",       category: "infra",   kind: "read",    does: "runtime observability — agent runs rolled up by agent/outcome/day", module: "api/telemetry.js", gate: { subsystem: "storage" }, arm: "attach storage (Supabase) — agents log to agent_runs" },
  { id: "mcp-server",      category: "infra",   kind: "read",    does: "Klyfton's own MCP server (read-only data tools for the brain)", module: "api/mcp.js", gate: { subsystem: "storage" }, arm: "attach storage + set MCP_BEARER_TOKEN" },
];

function statusOf(sub, env) {
  try {
    if (typeof sub.on === "function" && sub.on(env)) return "live";
    if (typeof sub.partial === "function" && sub.partial(env)) return "partial";
  } catch (e) { /* a bad predicate must not crash the catalog */ }
  return "dark";
}

function _has(env, k) { return !!(env && env[k]); }
// Resolve a GATED_TOOLS gate spec against env. anyOf / allOf on env keys, or reuse a health subsystem.
function gateLive(gate, env) {
  try {
    if (!gate) return false;
    if (gate.anyOf) return gate.anyOf.some((k) => _has(env, k));
    if (gate.allOf) return gate.allOf.every((k) => _has(env, k));
    if (gate.subsystem) {
      const sub = SUBSYS.find((s) => s.id === gate.subsystem);
      return !!(sub && typeof sub.on === "function" && sub.on(env));
    }
  } catch (e) { /* never crash the catalog on a bad gate */ }
  return false;
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
  const extra = GATED_TOOLS.map((t) => {
    const live = gateLive(t.gate, env);
    return {
      id: t.id, name: t.id, category: t.category, kind: t.kind, does: t.does, module: t.module,
      gated: true, gatedBy: t.arm || "(needs config)", status: live ? "live" : "dark", live,
    };
  });
  const tools = gated.concat(local, extra);
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

// HTTP: GET /api/tools -> the live catalog (read-only, safe to expose; no secrets, no keys).
// The handler is the DEFAULT export (Vercel routes api/tools.js -> /api/tools and needs a function,
// not an object). The pure helpers hang off it as properties so `require("./tools").catalog(...)`
// still works everywhere internally (cmdb, boot, klyfton, scenarios).
function handler(req, res) {
  const guard = require("./guard"); if (!guard.ok(req)) { if (res && res.setHeader) { res.setHeader("Content-Type", "application/json"); res.statusCode = 401; res.end(JSON.stringify(guard.denied())); } return guard.denied(); } // dormant until CREW_CODE set; safe when res is null (CLI/test)
  const c = catalog(process.env);
  const body = JSON.stringify({ service: "klyfton-tool-bag", ...c }, null, 2);
  if (res && typeof res.setHeader === "function") {
    res.setHeader("Content-Type", "application/json");
    res.statusCode = 200;
    res.end(body);
  }
  return c;
}
module.exports = handler;              // default export = the Vercel handler (was an object → /api/tools was broken)
module.exports.handler = handler;     // back-compat for callers using .handler
module.exports.catalog = catalog;
module.exports.find = find;
module.exports.validate = validate;
module.exports.LOCAL_TOOLS = LOCAL_TOOLS;
module.exports.SUBSYS_META = SUBSYS_META;

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
