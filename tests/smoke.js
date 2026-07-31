#!/usr/bin/env node
// Klyfton smoke-test SCAFFOLD — tests the pure plan() (which live checks run vs skip). The live
// probes themselves (tools/smoke_test.js main) hit real services and run post-deploy; here we only
// prove the scaffold's logic offline. Run: `node tests/smoke.js`. Keyless, no network.

const path = require("path");
const S = require(path.join(__dirname, "..", "tools", "smoke_test.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

console.log("Klyfton smoke scaffold — plan()\n");

// ---- no keys (sandbox) ⇒ every check is skipped (nothing marked configured) ----
const none = S.plan({});
ok("plan covers the key services (>=5)", none.length >= 5, none.length);
ok("with no env, nothing is configured (all would skip)", none.every((c) => c.configured === false));

// ---- keys flip a check to configured ----
ok("ANTHROPIC_API_KEY ⇒ anthropic configured", S.plan({ ANTHROPIC_API_KEY: "k" }).find((c) => c.id === "anthropic").configured === true);
ok("HUBSPOT_TOKEN ⇒ hubspot configured", S.plan({ HUBSPOT_TOKEN: "t" }).find((c) => c.id === "hubspot").configured === true);
ok("ALERTS_WEBHOOK_URL ⇒ webhook configured", S.plan({ ALERTS_WEBHOOK_URL: "u" }).find((c) => c.id === "webhook").configured === true);
ok("supabase needs BOTH url + service key", S.plan({ SUPABASE_URL: "u" }).find((c) => c.id === "supabase").configured === false);
ok("supabase configured with url + service key", S.plan({ SUPABASE_URL: "u", SUPABASE_SERVICE_ROLE_KEY: "k" }).find((c) => c.id === "supabase").configured === true);

// ---- each check has a real live probe fn (so main() can exercise it post-deploy) ----
ok("every check has a run() probe", S.CHECKS.every((c) => typeof c.run === "function"));

console.log("\n" + (fail ? "✗" : "✓") + " " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
