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
  { id: "concrete-calc",    category: "estimator", kind: "compute", does: "concrete lifting/void-fill/seawall quantities: void volume → cured polyurethane pounds (×density) → sets (owner set weight); density default is a typical ESTIMATE (verify TDS); soil blocked (Terra-Lok); no pricing", module: "api/concrete-calc.js" },
  { id: "rvalue-calc",      category: "estimator", kind: "compute", does: "installed R-value (foam thickness × R/inch, + flash-and-batt) vs IECC 2021 Zone 6/7 code minimum by assembly (wall/ceiling/floor/basement/crawl/slab) — meets/short + how much more foam; ESTIMATE, verify AHJ+TDS, no pricing", module: "api/rvalue-calc.js" },
  { id: "air-barrier-calc", category: "estimator", kind: "compute", does: "air/vapor barrier quantities: fluid-applied gallons (coverage/wet-mil) or membrane rolls, plus the cold-climate vapor-control rule (Zone 5-8) + CAZ combustion flag — coverage owner/TDS-entered, no pricing", module: "api/air-barrier-calc.js" },
  { id: "electrical-load",  category: "estimator", kind: "compute", does: "electrical (GC/sub-check): NEC Article 220 dwelling service-load calc → amps + service size, NEC 310.16 conductor ampacity + 240.4(D) breaker caps, voltage drop — ESTIMATE + planning aid; a licensed electrician + AHJ design/stamp/permit; NEC 2023 baseline (verify edition); no pricing", module: "api/electrical-load.js" },
  { id: "plumbing-calc",    category: "estimator", kind: "compute", does: "plumbing (GC/sub-check): IPC fixture units (WSFU/DFU) → drain + water-supply pipe sizing + water-heater sizing (tank FHR / tankless GPM-at-rise) — ESTIMATE + planning aid; a licensed plumber + AHJ design/stamp/permit; IPC-typical (verify edition); no pricing", module: "api/plumbing-calc.js" },
  { id: "hvac-load",        category: "estimator", kind: "compute", does: "HVAC (GC/sub-check): Zone 6/7 rule-of-thumb heating/cooling load + tonnage/CFM + ASHRAE 62.2 ventilation — NOT a Manual J; a licensed HVAC contractor (Manual J/S/D) + AHJ govern; oversizing short-cycles; no pricing", module: "api/hvac-load.js" },
  { id: "framing-calc",     category: "estimator", kind: "compute", does: "carpentry/framing (GC/sub-check): stud/plate/sheathing wall takeoff + joist/rafter count + board-feet by OC spacing — takeoff quantities only; member sizing/spans deferred to the IRC span tables + AHJ/engineer; no pricing", module: "api/framing-calc.js" },
  { id: "drywall-calc",     category: "estimator", kind: "compute", does: "drywall/finish takeoff (GC/sub-check): wall+ceiling area → sheets to order by sheet size + waste (solid geometry), plus GA-216 screw + GA-214 mud/tape ESTIMATES (transparent, overridable coverage); board TYPE (type-X/mold-resistant/cement board) deferred to GA-216 + AHJ; no pricing", module: "api/drywall-calc.js" },
  { id: "flatwork-calc",    category: "estimator", kind: "compute", does: "concrete flatwork takeoff (GC/sub-check): area × thickness → cubic yards to order (0.25-yd round-up) + bagged-mix count for small pours — volume is geometry; rebar size/spacing, mix (air entrainment for Zone 6/7), and footing frost depth deferred to ACI 318/332 + IRC + AHJ/engineer; no pricing. Distinct from concrete-calc (our polyurethane lifting).", module: "api/flatwork-calc.js" },
  { id: "roofing-shingle-calc", category: "estimator", kind: "compute", does: "shingle/metal roofing takeoff (GC/sub-check): ROOF-SURFACE area → squares (geometry) + bundles/square + underlayment rolls + drip-edge/starter/ridge-cap footage (ESTIMATE, overridable); ice-and-water barrier (Zone 6/7) + fastening per IRC R905 + AHJ; no pricing. (SPF/coated roofs = our coating-calc.)", module: "api/roofing-shingle-calc.js" },
  { id: "masonry-calc",     category: "estimator", kind: "compute", does: "masonry takeoff (GC/sub-check): wall face area × unit coverage → CMU/brick count + mortar bags + grout for filled cells (standard NCMA/BIA coverage, ESTIMATE); reinforcing size/spacing + structural/seismic deferred to TMS 402/602 + IBC/IRC + AHJ/engineer; no pricing", module: "api/masonry-calc.js" },
  { id: "excavation-calc",  category: "estimator", kind: "compute", does: "excavation/earthwork takeoff (GC/sub-check): area × depth → bank cubic yards (geometry) + swell (loose/haul-out) + compaction (fill-borrow) + truck loads; swell/compaction VARY BY SOIL (typical ESTIMATE, verify geotech); shoring/bearing/dewatering NOT designed. Safety surfaced: 811 locate + OSHA 1926 Subpart P (trench ≥5 ft). No pricing", module: "api/excavation-calc.js" },
  { id: "trade-estimate",   category: "estimator", kind: "compute", does: "per-trade estimator: turns a trade's quantities into a priced DRAFT from OWNER-ENTERED rates (material qty×cost + labor hrs×rate) + owner markup + owner tax → total; never fabricates a rate (unpriced lines = $0), MGSF self-perform trades defer to doctrine pricing; action:proposal → proposal-pdf payload; DRAFT for owner review", module: "api/trade-estimate.js" },
  { id: "trade-pack",       category: "estimator", kind: "read", does: "per-trade toolbox — each trade's calculators + its own needs: governing code (NEC/IPC/IMC/IRC/ASHRAE), permit + inspections, licensing, safety (OSHA/NFPA 70E/EPA 608), spec checklist, and materials; GUIDANCE, verify with the AHJ + state board; no pricing", module: "api/trade-pack.js" },
  { id: "trade-rates",      category: "estimator", kind: "read", does: "per-trade rate memory: saves the owner's usual material costs + labor rates by trade+item and pre-fills them on a new estimate (fills MISSING rates only, never overrides what the owner typed) — owner-entered + owner-approved writes, Supabase-gated, nothing fabricated", module: "api/trade-rates.js" },
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
  { id: "business-audit",   category: "pm",        kind: "compute", does: "AI business audit — ranked, decision-ready findings from the app's records (pipeline health, stale bids, close rate, cold leads, AR aging, overdue jobs, customer concentration, margin) with severity + recommended action; margin graded ONLY against a supplied doctrine target; keyless core, optional gated owner-voice memo (ANTHROPIC_API_KEY); no fabricated numbers, no pricing", module: "api/business-audit.js" },
  { id: "job-workflow",     category: "pm",        kind: "compute", does: "job workflow / wiring map — turns a blueprint scope (trades) into the ordered construction sequence: phases + dependency edges (what must finish first = the wiring) + inspection gates + prime/sub tag per trade + the MGSF never-cover-foam-before-inspection rule; the missing link between blueprint (reads plan→trades) and construction (prime/sub); GUIDANCE, verify AHJ, no pricing/durations", module: "api/job-workflow.js" },
  { id: "cmdb",             category: "infra",     kind: "compute", does: "self-map: component dependency graph, why-is-X-dark root cause, biggest-unlock", module: "api/cmdb.js" },
  { id: "boot",             category: "infra",     kind: "compute", does: "boot manifest — one live self-map (components/deps/tools/brain/agents) computed from env", module: "api/boot.js" },
  { id: "scenarios",        category: "automation", kind: "compute", does: "AI scenario builder — turn 'when X do Y' into a validated, safe automation (real triggers/tools)", module: "api/scenarios.js" },
  { id: "agents",           category: "automation", kind: "compute", does: "goal-completing agent runtime (PM/collector/bid-chaser/lead-closer/sub-compliance) — plans + stages drafts, approval-gated", module: "api/agents.js" },
  { id: "engineer",         category: "platform",   kind: "compute", does: "pit-crew agent — assesses health/gaps/curriculum, ranks improvements, drafts an AI plan (all outputs draft-for-approval)", module: "api/engineer.js" },
  // keyless document + draft generators (produce a doc/message for approval — no external key)
  { id: "proposal-pdf",     category: "documents", kind: "compute", does: "turn an estimate into a branded, emailable proposal PDF", module: "api/proposal-pdf.js" },
  { id: "warranty-cert",    category: "documents", kind: "compute", does: "warranty certificate PDF to hand over at job close", module: "api/warranty-cert.js" },
  { id: "capability-statement", category: "govcon", kind: "compute", does: "one-page SDVOSB capability statement for federal buyers", module: "api/capability-statement.js" },
  { id: "gov-programs",     category: "govcon", kind: "compute", does: "state-gov + workforce/labor helper: MT/ND/SD/WY vendor registration + bid preference, Davis-Bacon/state prevailing-wage applicability, WOTC/OJT/apprenticeship incentives (GUIDANCE, verify pointers, never fabricated)", module: "api/gov-programs.js" },
  { id: "construction",     category: "estimator", kind: "compute", does: "GC/prime-with-subs layer: CSI MasterFormat trade taxonomy (branches of each trade), MGSF self-perform vs subcontract split, and the subcontractor compliance packet (COI/additional-insured, license, lien waivers, bond, prevailing-wage flow-down) — GUIDANCE, grounded, no pricing", module: "api/construction.js" },
  { id: "subs",             category: "estimator", kind: "read", does: "subcontractor roster + compliance readiness: tracks each sub's required docs and flags expiring/expired COI + license so an uninsured/unlicensed sub never gets put on a job (Supabase-gated; owner-approved writes)", module: "api/subs.js" },
  { id: "sub-bid",          category: "estimator", kind: "compute", does: "subcontractor bid leveling: normalizes sub quotes to equal scope, flags who's missing which scope item + the cheapest-but-incomplete trap, low/high/spread — sub quotes are owner-entered (not MGSF pricing), advisory only", module: "api/sub-bid.js" },
  { id: "prime-assembler",  category: "estimator", kind: "compute", does: "GC prime-bid rollup: splits a job into MGSF self-perform (priced by doctrine, deferred) + subcontracted trades, levels + suggests each sub bid, gates on sub compliance, sums the subs subtotal, applies an owner-entered markup (else deferred), and emits a proposal skeleton — never fabricates an MGSF price, never auto-awards a sub", module: "api/prime-assembler.js" },
  { id: "blueprint",        category: "estimator", kind: "ai", does: "blueprint/plan READER (vision): reads title block, legend/key, and scope of work from a plan image/PDF, maps scope to CSI trades + the prime/sub split, and lists dimensions printed on the sheet — never invents a measurement or scale (measure to scale in Bluebeam); no pricing", module: "api/blueprint.js" },
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
