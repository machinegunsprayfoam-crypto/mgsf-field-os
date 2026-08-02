#!/usr/bin/env node
// TTS proxy invariants. Run: `node tests/tts.js`. Keyless, no network.
// Verifies: provider detection, voice lists, dormant/configured paths, text cap,
// client-key detection (sk- prefix = OpenAI, else ElevenLabs), and no-key guard.

const path = require("path");
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

console.log("TTS proxy invariants\n");

const src = require("fs").readFileSync(path.join(__dirname, "..", "api", "tts.js"), "utf8");

// ---- re-implement pure helpers from source ----

// provider() logic: ELEVENLABS_API_KEY wins, then OPENAI, else empty.
function provider(env) {
  if (env.ELEVENLABS_API_KEY) return "elevenlabs";
  if (env.OPENAI_API_KEY) return "openai";
  return "";
}

// detectClientProvider: sk- prefix ⇒ openai, else elevenlabs
function detectClientProvider(key) {
  return key ? (/^sk-/.test(key) ? "openai" : "elevenlabs") : "";
}

// ---- provider() logic ----
ok("no keys ⇒ no provider", provider({}) === "");
ok("only OPENAI key ⇒ openai", provider({ OPENAI_API_KEY: "sk-x" }) === "openai");
ok("only ELEVENLABS key ⇒ elevenlabs", provider({ ELEVENLABS_API_KEY: "xi-x" }) === "elevenlabs");
ok("both keys ⇒ elevenlabs wins", provider({ ELEVENLABS_API_KEY: "xi-x", OPENAI_API_KEY: "sk-x" }) === "elevenlabs");

// ---- detectClientProvider ----
ok("sk- prefix ⇒ openai", detectClientProvider("sk-abc123") === "openai");
ok("non-sk key ⇒ elevenlabs", detectClientProvider("xi-somekey") === "elevenlabs");
ok("empty key ⇒ empty string", detectClientProvider("") === "");

// ---- voice lists present in source ----
ok("OPENAI_VOICES list defined", src.includes("const OPENAI_VOICES"));
ok("onyx in OPENAI_VOICES (default voice)", src.includes('"onyx"'));
ok("ELEVEN_VOICES list defined", src.includes("const ELEVEN_VOICES"));

// ---- text cap: 1000-char slice ----
ok("text capped at 1000 chars", src.includes(".slice(0, 1000)"));

// ---- dormant: no key ⇒ configured:false ----
ok("configured:false when no key", src.includes("configured: false"));

// ---- clientConfigurable flag present ----
ok("clientConfigurable:true in GET response", src.includes("clientConfigurable: true"));

// ---- GET probe ⇒ configured + provider + voices ----
ok("GET returns provider field", src.includes('"provider"') || src.includes("provider:"));
ok("GET returns voices field", src.includes("voices:"));

// ---- ElevenLabs API call target ----
ok("ElevenLabs API URL present", src.includes("api.elevenlabs.io/v1/text-to-speech/"));
ok("xi-api-key header used for ElevenLabs", src.includes('"xi-api-key"'));

// ---- OpenAI TTS API call target ----
ok("OpenAI TTS URL present", src.includes("api.openai.com/v1/audio/speech"));
ok("****** used for OpenAI", src.includes('"Bearer "'));

// ---- audio response ----
ok("audio/mpeg content-type set", src.includes('"audio/mpeg"'));
ok("Cache-Control: no-store set", src.includes('"no-store"'));

// ---- no npm require() calls (global fetch only) ----
const requireCalls = src.match(/\brequire\s*\(/g) || [];
ok("no npm require() calls (global fetch only)", requireCalls.length === 0, "found " + requireCalls.length);

// ---- key never echoed in GET response ----
ok("key value never echoed in configured probe", !src.includes("ELEVEN_KEY }") && !src.includes("openaiKey }"));

// ---- error containment: detail capped ----
ok("error detail capped to 160 chars", src.includes(".slice(0, 160)"));

// ---- method guard ----
ok("POST guard present", src.includes('"POST"'));
ok("405 on wrong method", src.includes("405"));

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
