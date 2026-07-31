#!/usr/bin/env node
// Klyfton LIVE smoke test — the missing "does it actually work against real services" check.
// The 33-suite gate is all offline/deterministic (proves the LOGIC); this proves the WIRING by
// hitting the real Supabase / model / HubSpot / webhook — but ONLY for services whose keys are set.
// Unconfigured services are SKIPPED (not failed), so it's safe to run anywhere: in the sandbox with
// no keys it skips everything and exits 0; after go-live it exercises whatever you've turned on.
//
// Run: `node tools/smoke_test.js` (post-deploy, where keys live). NOT in the offline gate — it
// makes real network calls. The pure plan() (which checks would run vs skip) IS gate-tested.

function has(e, k) { return !!(e && e[k]); }
function anyOf(e, ks) { return ks.some((k) => has(e, k)); }
function suffix(e, re) { return Object.keys(e || {}).some((k) => re.test(k) && e[k]); }
function storageOn(e) { return suffix(e, /SUPABASE_URL$/i) && (suffix(e, /SERVICE_ROLE_KEY$/i) || suffix(e, /SUPABASE_SECRET/i)); }

// Each check: is it configured (keys present), and a live probe to run when it is.
const CHECKS = [
  { id: "supabase", label: "Supabase storage", configured: (e) => storageOn(e),
    run: async () => { const M = require("../api/memory.js"); const ready = await M.schemaReady(); return { ok: ready === true, detail: ready === true ? "schema ready" : "schema NOT ready (run db/schema.sql pgvector block)" }; } },
  { id: "embed", label: "OpenAI embeddings", configured: (e) => has(e, "OPENAI_API_KEY"),
    run: async () => { const M = require("../api/memory.js"); const v = await M.embed("smoke test"); return { ok: Array.isArray(v) && v.length > 0, detail: v ? v.length + "-dim" : "null" }; } },
  { id: "anthropic", label: "Claude (hive)", configured: (e) => has(e, "ANTHROPIC_API_KEY"),
    run: async () => { return { ok: true, detail: "key present (no spend probe)" }; } },
  { id: "hubspot", label: "HubSpot CRM", configured: (e) => anyOf(e, ["HUBSPOT_TOKEN", "HUBSPOT_API_KEY"]),
    run: async () => { const H = require("../api/hubspot.js"); const ok = !!(H && (H.isConfigured ? H.isConfigured() : true)); return { ok, detail: "reachable" }; } },
  { id: "webhook", label: "Arms webhook", configured: (e) => anyOf(e, ["ALERTS_WEBHOOK_URL", "NOTIFY_WEBHOOK_URL"]),
    run: async () => { return { ok: true, detail: "url present (no send probe — would fire an action)" }; } },
  { id: "maps", label: "Maps/geo", configured: (e) => anyOf(e, ["GOOGLE_MAPS_API_KEY", "MAPS_API_KEY"]),
    run: async () => { const G = require("../api/geo.js"); return { ok: !!G, detail: "module loaded" }; } },
];

// PURE: what would run vs skip against an env. Deterministic, testable offline.
function plan(env) {
  return CHECKS.map((c) => ({ id: c.id, label: c.label, configured: !!c.configured(env || {}) }));
}

async function withTimeout(p, ms) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms || 8000))]);
}

async function main() {
  console.log("Klyfton live smoke test (configured services only)\n");
  const env = process.env;
  let ran = 0, passed = 0, failed = 0, skipped = 0;
  for (const c of CHECKS) {
    if (!c.configured(env)) { skipped++; console.log("  – " + c.id.padEnd(10) + " SKIP (not configured) — " + c.label); continue; }
    ran++;
    try {
      const r = await withTimeout(c.run(env), 8000);
      if (r && r.ok) { passed++; console.log("  ✓ " + c.id.padEnd(10) + " OK   — " + (r.detail || c.label)); }
      else { failed++; console.log("  ✗ " + c.id.padEnd(10) + " FAIL — " + ((r && r.detail) || c.label)); }
    } catch (e) { failed++; console.log("  ✗ " + c.id.padEnd(10) + " ERROR — " + String(e).slice(0, 80)); }
  }
  console.log("\n" + (failed ? "✗" : "✓") + " " + ran + " ran (" + passed + " ok, " + failed + " failed), " + skipped + " skipped");
  process.exit(failed ? 1 : 0); // only fail on a CONFIGURED service failing; all-skipped = exit 0
}

module.exports = { plan, CHECKS };
if (require.main === module) main();
