// Klyfton HEALTH — the Mechanic. A read-only self-check: which subsystems are wired,
// which are inert, and what to set to turn each on. Replaces the retired mcp-diag (410).
//
// SECURITY: reports env PRESENCE only (on/off) — it NEVER echoes a key's value, never
// touches pipeline data, never calls out. When CREW_CODE is set it gates the detailed
// report behind the code (same no-lockout pattern as command-center: no CREW_CODE ⇒ open,
// so it can't lock the owner out). Fabricates nothing.
//
// GET (or POST) -> { ok, health, subsystems:[{id,label,status,detail}], summary }
// No npm, no network — pure env inspection.

// Each subsystem: id, label, `on(env)` predicate, `partial(env)` optional, and the note
// telling the owner exactly what to set. Presence-only; values never read into output.
const has = (env, k) => !!(env && env[k] && String(env[k]).trim());
const hasAny = (env, ks) => ks.some((k) => has(env, k));
const hasAll = (env, ks) => ks.every((k) => has(env, k));
// Suffix-tolerant match, mirroring memory.js/_kvEnv — Vercel integrations often inject a
// PREFIXED var name (e.g. a "…_SUPABASE_URL"), which an exact-key check silently misses,
// making health report storage/memory OFF while memory.js already sees it ON.
const hasSuffix = (env, re) => Object.keys(env || {}).some((k) => re.test(k) && String(env[k]).trim());
const supabaseOn = (e) => hasSuffix(e, /SUPABASE_URL$/i) &&
  (hasSuffix(e, /SUPABASE_SERVICE_ROLE_KEY$/i) || hasSuffix(e, /SERVICE_ROLE_KEY$/i) || hasSuffix(e, /SUPABASE_SECRET/i));

const SUBSYSTEMS = [
  { id: "hive", label: "Hive (Claude brain)", core: true,
    on: (e) => has(e, "ANTHROPIC_API_KEY"),
    note: "set ANTHROPIC_API_KEY" },
  { id: "memory", label: "Memory (pgvector recall)",
    on: (e) => supabaseOn(e) && has(e, "OPENAI_API_KEY"),
    partial: (e) => supabaseOn(e),
    note: "note-only until OPENAI_API_KEY is set (needs Supabase + embed key for semantic recall)" },
  { id: "arms", label: "Arms (email/SMS/CRM/invoice executor)",
    on: (e) => has(e, "ALERTS_WEBHOOK_URL"),
    note: "set ALERTS_WEBHOOK_URL to bring outward actions live (still approval-gated)" },
  { id: "ats", label: "ATS (budget auto-throttle)",
    on: (e) => has(e, "KLYFTON_MONTHLY_BUDGET_USD"),
    note: "set KLYFTON_MONTHLY_BUDGET_USD to cap monthly spend" },
  { id: "crm", label: "CRM (HubSpot call list)",
    on: (e) => hasAny(e, ["HUBSPOT_TOKEN", "HUBSPOT_API_KEY"]),
    note: "set HUBSPOT_TOKEN" },
  { id: "sms", label: "SMS / voice (Twilio)",
    on: (e) => hasAll(e, ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM"]),
    partial: (e) => hasAny(e, ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM"]),
    note: "set TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM" },
  { id: "govcon", label: "GovCon scanner (SAM.gov)",
    on: (e) => hasAny(e, ["SAM_API_KEY", "SAMGOV_API_KEY"]),
    note: "set SAM_API_KEY (free)" },
  { id: "storage", label: "Storage / event spine (Supabase)",
    on: (e) => supabaseOn(e),
    note: "set SUPABASE_URL + a service-role key, then run db/schema.sql" },
  { id: "maps", label: "Maps / geo (geocoding + drive distance)",
    on: (e) => hasAny(e, ["GOOGLE_MAPS_API_KEY", "MAPS_API_KEY"]),
    note: "set GOOGLE_MAPS_API_KEY (or MAPS_API_KEY) for geocoding + mobilization-by-distance (mobilization math works keyless)" },
  { id: "pricing", label: "Live pricing feed",
    on: (e) => has(e, "PRICING_CSV_URL"),
    note: "set PRICING_CSV_URL to pull newest dated pricing" },
  { id: "access", label: "Access gate (CREW_CODE)",
    on: (e) => has(e, "CREW_CODE"),
    note: "set CREW_CODE to gate pipeline/data endpoints" },
  { id: "cron", label: "Cron/axle secrets",
    on: (e) => hasAny(e, ["CRON_SECRET", "AXLE_SECRET"]),
    note: "set CRON_SECRET / AXLE_SECRET to protect scheduled endpoints" },
];

// Extra AI providers (the provider hub) — reported as a group.
const PROVIDERS = [
  { id: "openai", label: "ChatGPT", on: (e) => has(e, "OPENAI_API_KEY") },
  { id: "grok", label: "Grok (xAI)", on: (e) => has(e, "XAI_API_KEY") },
  { id: "groq", label: "Groq (free tier)", on: (e) => has(e, "GROQ_API_KEY") },
  { id: "mistral", label: "Mistral", on: (e) => has(e, "MISTRAL_API_KEY") },
  { id: "gemini", label: "Google Gemini (free tier)", on: (e) => has(e, "GEMINI_API_KEY") },
  { id: "openrouter", label: "OpenRouter (free models)", on: (e) => has(e, "OPENROUTER_API_KEY") },
  { id: "cerebras", label: "Cerebras (free tier)", on: (e) => has(e, "CEREBRAS_API_KEY") },
  { id: "together", label: "Together AI (free tier)", on: (e) => has(e, "TOGETHER_API_KEY") },
  { id: "local", label: "Local/free model", on: (e) => has(e, "OPENAI_COMPAT_URL") },
];

// Likely-misnamed critical keys: the code reads these EXACT names. If the canonical is
// absent but a lookalike var exists (e.g. "open_ai" instead of OPENAI_API_KEY), flag it —
// this is the trap that silently leaves memory/TTS off. `allow` = legit sibling vars that
// contain the token but are NOT misnamings.
const CANON_KEYS = [
  { canon: "OPENAI_API_KEY", token: "OPENAI",
    allow: ["OPENAI_COMPAT_URL", "OPENAI_COMPAT_KEY", "OPENAI_COMPAT_MODEL", "OPENAI_TTS_MODEL"] },
  { canon: "ANTHROPIC_API_KEY", token: "ANTHROPIC", allow: [] },
];
const _norm = (n) => String(n).toUpperCase().replace(/[^A-Z0-9]/g, "");

function misnamedWarnings(env) {
  const names = Object.keys(env || {});
  const out = [];
  for (const c of CANON_KEYS) {
    if (env[c.canon]) continue; // canonical present ⇒ fine
    const allow = c.allow.map(_norm);
    const suspects = names.filter((n) =>
      _norm(n).indexOf(c.token) >= 0 && _norm(n) !== _norm(c.canon) && allow.indexOf(_norm(n)) < 0);
    if (suspects.length) {
      out.push({ expected: c.canon, found: suspects,
        hint: "possible misnamed env var — the code reads " + c.canon + " exactly; rename it and redeploy" });
    }
  }
  return out;
}

// Pure core: deterministic report from an env-like object. No time, no network.
function buildReport(env) {
  env = env || {};
  const subsystems = SUBSYSTEMS.map((s) => {
    let status = "off";
    if (s.on(env)) status = "on";
    else if (s.partial && s.partial(env)) status = "partial";
    return { id: s.id, label: s.label, status, core: !!s.core,
             detail: status === "on" ? "configured" : s.note };
  });
  const providers = PROVIDERS.map((p) => ({ id: p.id, label: p.label, status: p.on(env) ? "on" : "off" }));
  const on = subsystems.filter((s) => s.status === "on").length;
  const partial = subsystems.filter((s) => s.status === "partial").length;
  const off = subsystems.filter((s) => s.status === "off").length;
  const coreDown = subsystems.filter((s) => s.core && s.status !== "on").map((s) => s.id);
  const providersOn = providers.filter((p) => p.status === "on").length;
  const health = coreDown.length ? "degraded" : (off > 0 ? "online (some subsystems inert)" : "fully wired");
  const warnings = misnamedWarnings(env);
  return {
    ok: true,
    health,
    subsystems,
    providers: { configured: providersOn, list: providers },
    warnings, // e.g. a likely-misnamed OPENAI_API_KEY (the open_ai trap)
    summary: { on, partial, off, coreDown, providersConfigured: providersOn, warnings: warnings.length },
  };
}

// Gate the DETAILED report behind CREW_CODE when it's set; open otherwise (no lockout).
function isAuthorized(env, providedCode) {
  const code = env && env.CREW_CODE ? String(env.CREW_CODE).trim() : "";
  if (!code) return true; // not set ⇒ open
  return String(providedCode || "").trim() === code;
}

module.exports = async (req, res) => {
  try {
    const env = process.env;
    const body = (req && req.body) || {};
    let code = body.code;
    if (!code && req && req.url) { const m = req.url.match(/[?&]code=([^&]+)/); if (m) code = decodeURIComponent(m[1]); }
    if (!isAuthorized(env, code)) {
      // minimal, non-sensitive response when a code is required but wrong/absent
      // Fully non-informative when a code is required but wrong/absent — do NOT reveal
      // whether the core hive is configured (avoids an information leak to the unauthorized).
      return res.status(200).json({ ok: true, health: "restricted",
        note: "CREW_CODE required for the detailed self-check" });
    }
    return res.status(200).json(buildReport(env));
  } catch (e) {
    return res.status(200).json({ ok: false, reason: "error", detail: (e && e.message) || "err" });
  }
};

// Pure exports for the test harness.
module.exports.buildReport = buildReport;
module.exports.misnamedWarnings = misnamedWarnings;
module.exports.isAuthorized = isAuthorized;
module.exports._SUBSYSTEMS = SUBSYSTEMS;
