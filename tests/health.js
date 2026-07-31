#!/usr/bin/env node
// Health/Mechanic self-check invariants. Run: `node tests/health.js`
//
// buildReport(env) is pure: feed fake env objects, assert subsystems flip on/off/partial
// correctly, secrets are never echoed, core-down ⇒ degraded, and CREW_CODE gating works.
// Keyless, deterministic, no network.

const path = require("path");
const H = require(path.join(__dirname, "..", "api", "health.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }
const get = (r, id) => r.subsystems.find((s) => s.id === id);

console.log("Health / Mechanic self-check invariants\n");

// ---- empty env ⇒ everything off, core degraded ----
(() => {
  const r = H.buildReport({});
  ok("empty env ⇒ ok", r.ok === true);
  ok("empty env ⇒ hive off", get(r, "hive").status === "off");
  ok("empty env ⇒ health degraded (core down)", r.health === "degraded", r.health);
  ok("empty env ⇒ arms inert with a note", get(r, "arms").status === "off" && /ALERTS_WEBHOOK_URL/.test(get(r, "arms").detail));
})();

// ---- core on ⇒ not degraded ----
(() => {
  const r = H.buildReport({ ANTHROPIC_API_KEY: "sk-x" });
  ok("hive key ⇒ hive on", get(r, "hive").status === "on");
  ok("core on ⇒ not degraded", r.health !== "degraded", r.health);
  ok("hive detail is 'configured', NOT the key value", get(r, "hive").detail === "configured");
})();

// ---- secrets never echoed anywhere in the report ----
(() => {
  const secret = "sk-SUPERSECRET-123";
  const r = H.buildReport({ ANTHROPIC_API_KEY: secret, HUBSPOT_TOKEN: "pat-abc" });
  const blob = JSON.stringify(r);
  ok("no secret value leaks into report", blob.indexOf(secret) === -1 && blob.indexOf("pat-abc") === -1);
  ok("crm on when HubSpot token present", get(r, "crm").status === "on");
})();

// ---- partial: Supabase without embed key ⇒ memory partial ----
(() => {
  const r = H.buildReport({ SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k" });
  ok("memory partial without embed key", get(r, "memory").status === "partial", get(r, "memory").status);
  ok("memory on once OPENAI_API_KEY added", H.buildReport({ SUPABASE_URL: "u", SUPABASE_SERVICE_ROLE_KEY: "k", OPENAI_API_KEY: "o" }).subsystems.find((s) => s.id === "memory").status === "on");
  ok("storage on with supabase pair", get(r, "storage").status === "on");
})();

// ---- Twilio partial vs full ----
(() => {
  const partial = H.buildReport({ TWILIO_ACCOUNT_SID: "AC" });
  ok("twilio partial with only SID", partial.subsystems.find((s) => s.id === "sms").status === "partial");
  const full = H.buildReport({ TWILIO_ACCOUNT_SID: "AC", TWILIO_AUTH_TOKEN: "t", TWILIO_FROM: "+1" });
  ok("twilio on with SID+token+from", full.subsystems.find((s) => s.id === "sms").status === "on");
})();

// ---- providers grouped + counted ----
(() => {
  const r = H.buildReport({ XAI_API_KEY: "x", GROQ_API_KEY: "g" });
  ok("providers configured count = 2", r.providers.configured === 2, r.providers.configured);
  ok("grok reported on", r.providers.list.find((p) => p.id === "grok").status === "on");
  ok("openai reported off", r.providers.list.find((p) => p.id === "openai").status === "off");
})();

// ---- CREW_CODE gating ----
ok("no CREW_CODE ⇒ open", H.isAuthorized({}, "") === true);
ok("CREW_CODE set + right code ⇒ authorized", H.isAuthorized({ CREW_CODE: "1978" }, "1978") === true);
ok("CREW_CODE set + wrong code ⇒ denied", H.isAuthorized({ CREW_CODE: "1978" }, "0000") === false);
ok("CREW_CODE set + no code ⇒ denied", H.isAuthorized({ CREW_CODE: "1978" }, "") === false);

// ---- resilience ----
ok("null env ⇒ no throw", (() => { try { H.buildReport(null); return true; } catch (e) { return false; } })());

console.log("\n" + (fail ? "✗" : "✓") + " " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
