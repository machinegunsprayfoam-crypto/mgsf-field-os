// Klyfton CMDB — the AI-augmented system-of-record for Klyfton's OWN architecture. Not an
// enterprise IT CMDB (MGSF has no data center) — this tracks the app's components, the infra
// capabilities they depend on, and reasons over the graph: WHY is a tool dark (root cause), WHAT
// goes dark if a capability fails (blast radius), and WHICH single switch unlocks the most (the
// "do this first" insight). It layers on top of the tool bag (component inventory + live status)
// and health.js (subsystem gating) — this module adds the DEPENDENCY EDGES + impact reasoning.
//
// Pure/deterministic against an env-like object (no network, no time) — unit-testable offline.
// GET -> the full CMDB report against process.env.

let CATALOG = [];
try { CATALOG = (require("./tools").catalog({}) || {}).tools || []; } catch (e) { CATALOG = []; }

function has(e, k) { return !!(e && e[k]); }
function anyOf(e, ks) { return ks.some((k) => has(e, k)); }
function suffix(e, re) { return Object.keys(e || {}).some((k) => re.test(k) && e[k]); }
function storageOn(e) { return suffix(e, /SUPABASE_URL$/i) && (suffix(e, /SERVICE_ROLE_KEY$/i) || suffix(e, /SUPABASE_SECRET/i)); }

// Infra CAPABILITIES (the roots tools depend on). Each: a live predicate + how to arm it.
const CAPS = {
  anthropic: { label: "Claude API (the hive)", on: (e) => has(e, "ANTHROPIC_API_KEY"), arm: "set ANTHROPIC_API_KEY" },
  storage:   { label: "Supabase storage", on: storageOn, arm: "set SUPABASE_URL + a service-role key, run the db schema" },
  embed:     { label: "Embedding key (semantic recall)", on: (e) => has(e, "OPENAI_API_KEY"), arm: "set OPENAI_API_KEY" },
  webhook:   { label: "Outbound webhook (arms + universal bus)", on: (e) => anyOf(e, ["ALERTS_WEBHOOK_URL", "NOTIFY_WEBHOOK_URL"]), arm: "set ALERTS_WEBHOOK_URL" },
  hubspot:   { label: "HubSpot CRM", on: (e) => anyOf(e, ["HUBSPOT_TOKEN", "HUBSPOT_API_KEY"]), arm: "set HUBSPOT_TOKEN" },
  twilio:    { label: "Twilio SMS/voice", on: (e) => has(e, "TWILIO_ACCOUNT_SID") && has(e, "TWILIO_AUTH_TOKEN") && has(e, "TWILIO_FROM"), arm: "set the TWILIO_* trio" },
  sam:       { label: "SAM.gov", on: (e) => anyOf(e, ["SAM_API_KEY", "SAMGOV_API_KEY"]), arm: "set SAM_API_KEY (free)" },
  maps:      { label: "Maps / geocoding", on: (e) => anyOf(e, ["GOOGLE_MAPS_API_KEY", "MAPS_API_KEY"]), arm: "set GOOGLE_MAPS_API_KEY" },
  ttskey:    { label: "Voice (TTS) key", on: (e) => anyOf(e, ["ELEVENLABS_API_KEY", "OPENAI_API_KEY"]), arm: "set ELEVENLABS_API_KEY or OPENAI_API_KEY" },
  drive:     { label: "Google Drive backup", on: (e) => anyOf(e, ["GDRIVE_WEBAPP_URL", "GOOGLE_APPS_SCRIPT_URL", "GDRIVE_TOKEN"]), arm: "set GDRIVE_WEBAPP_URL (+ token)" },
  budget:    { label: "Monthly budget cap (ATS)", on: (e) => has(e, "KLYFTON_MONTHLY_BUDGET_USD"), arm: "set KLYFTON_MONTHLY_BUDGET_USD" },
  pricingfeed: { label: "Live pricing feed", on: (e) => has(e, "PRICING_CSV_URL"), arm: "set PRICING_CSV_URL" },
  crewcode:  { label: "Access gate", on: (e) => has(e, "CREW_CODE"), arm: "set CREW_CODE" },
  cronsecret: { label: "Cron/axle secret", on: (e) => anyOf(e, ["CRON_SECRET", "AXLE_SECRET"]), arm: "set CRON_SECRET" },
};

// DEPENDENCY EDGES: tool id -> [capability ids] it needs. Mirrors the tool-bag gating; a tool with
// no entry is keyless (no deps). Kept explicit so the graph is auditable (a drift test guards it).
const DEPS = {
  hive: ["anthropic"],
  memory: ["storage", "embed"],
  wiki: ["storage"], photo: ["storage"], sync: ["storage"], "command-center": ["storage"], "mcp-server": ["storage"],
  crm: ["hubspot"], sms: ["twilio"], govcon: ["sam"], maps: ["maps"], tts: ["ttskey"], drive: ["drive"],
  arms: ["webhook"], "zapier-bus": ["webhook"], notify: ["webhook"], "missed-call": ["webhook"],
  "daily-brief": ["webhook"], "follow-up": ["webhook"], "estimate-followup": ["webhook"],
  "invoice-remind": ["webhook"], "inventory-reorder": ["webhook"], "roof-maintenance": ["webhook"],
  // self-gated subsystems (each needs its own single switch)
  storage: ["storage"], ats: ["budget"], pricing: ["pricingfeed"], access: ["crewcode"], cron: ["cronsecret"],
};

function depsOf(toolId) { return DEPS[toolId] || []; }
// Which capabilities a tool needs are currently DOWN (the root cause of it being dark). Pure on env.
function blockedBy(toolId, env) { return depsOf(toolId).filter((c) => CAPS[c] && !CAPS[c].on(env)); }
// Blast radius: which tools depend on a given capability (pure graph — env-independent).
function impactOf(capId) { return Object.keys(DEPS).filter((t) => depsOf(t).indexOf(capId) >= 0); }

// The AI-augmented insight: among capabilities that are currently DOWN, which one unlocks the most
// currently-dark tools if switched on. That's the single highest-leverage thing the owner can do.
function biggestUnlock(env) {
  let best = null;
  for (const cap of Object.keys(CAPS)) {
    if (CAPS[cap].on(env)) continue; // already on
    const unlocks = impactOf(cap).filter((t) => blockedBy(t, env).length === 1 && blockedBy(t, env)[0] === cap);
    // count tools that would go live if ONLY this cap were the blocker; also count multi-blocked assists
    const wouldLight = impactOf(cap).filter((t) => { const b = blockedBy(t, env); return b.length && b.every((c) => c === cap); });
    if (!best || wouldLight.length > best.unlocks) best = { cap: cap, label: CAPS[cap].label, arm: CAPS[cap].arm, unlocks: wouldLight.length, tools: wouldLight };
  }
  return best && best.unlocks > 0 ? best : null;
}

// Full report: capability status, per-component live + root-cause, and the biggest unlock.
function report(env) {
  env = env || {};
  const capabilities = Object.keys(CAPS).map((id) => ({ id, label: CAPS[id].label, live: CAPS[id].on(env), arm: CAPS[id].arm, powers: impactOf(id).length }));
  // Live is computed from the dependency graph against THIS env (not the frozen catalog): a
  // component is live when none of its dependencies are down (keyless tools have none → always live).
  const components = CATALOG.map((t) => {
    const blockers = blockedBy(t.id, env);
    return { id: t.id, category: t.category, live: blockers.length === 0, deps: depsOf(t.id), blockedBy: blockers };
  });
  const live = components.filter((c) => c.live).length;
  return {
    ok: true,
    counts: { components: components.length, live, dark: components.length - live, capabilities: capabilities.length, capsLive: capabilities.filter((c) => c.live).length },
    biggestUnlock: biggestUnlock(env),
    capabilities,
    components,
  };
}

module.exports = async (req, res) => {
  if (req.method !== "GET" && req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  const guard = require("./guard"); if (!guard.ok(req)) { res.status(401).json(guard.denied()); return; } // dormant until CREW_CODE set
  res.status(200).json({ service: "klyfton-cmdb", ...report(process.env) });
};

module.exports.CAPS = CAPS;
module.exports.DEPS = DEPS;
module.exports.depsOf = depsOf;
module.exports.blockedBy = blockedBy;
module.exports.impactOf = impactOf;
module.exports.biggestUnlock = biggestUnlock;
module.exports.report = report;

// Direct run: print the CMDB against the current env. `node api/cmdb.js`
if (require.main === module) {
  const r = report(process.env);
  console.log("Klyfton CMDB: " + r.counts.live + "/" + r.counts.components + " components live, " +
    r.counts.capsLive + "/" + r.counts.capabilities + " capabilities up");
  if (r.biggestUnlock) console.log("Biggest unlock: " + r.biggestUnlock.arm + " → lights " + r.biggestUnlock.unlocks + " tools (" + r.biggestUnlock.tools.join(", ") + ")");
}
