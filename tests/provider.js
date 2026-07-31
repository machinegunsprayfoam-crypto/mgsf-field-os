#!/usr/bin/env node
// Provider-hub invariants — vendor-neutral request/response shaping + gating. Run: `node tests/provider.js`
//
// The core is PURE: buildRequest/parseResponse/pickProvider are deterministic (no network,
// no keys), so we assert the request shape per vendor style and the parse of each response
// shape. Gating is checked against env presence. Keyless, no npm, deterministic.

const path = require("path");
const P = require(path.join(__dirname, "..", "api", "provider.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

console.log("Provider-hub invariants — routing / request / response shaping\n");

// ---- pickProvider ----
ok("pick: known id (grok)", P.pickProvider("grok").id === "grok");
ok("pick: case-insensitive", P.pickProvider("OpenAI").id === "openai");
ok("pick: unknown ⇒ null", P.pickProvider("nope") === null);
ok("pick: registry has claude+openai+grok+groq+mistral+local",
   ["claude","openai","grok","groq","mistral","local"].every((k) => !!P._PROVIDERS[k]));

// ---- buildRequest: anthropic style ----
(() => {
  const spec = P._PROVIDERS.claude;
  const r = P.buildRequest(spec, "KEY123", { system: "sys", user: "hi", maxTokens: 500 });
  ok("anthropic: url is messages endpoint", /api\.anthropic\.com\/v1\/messages$/.test(r.url), r.url);
  ok("anthropic: x-api-key header set", r.headers["x-api-key"] === "KEY123");
  ok("anthropic: anthropic-version header set", r.headers["anthropic-version"] === "2023-06-01");
  ok("anthropic: system top-level, user in messages", r.body.system === "sys" && r.body.messages[0].content === "hi");
  ok("anthropic: max_tokens passed", r.body.max_tokens === 500);
  ok("anthropic: default model when none given", P.buildRequest(spec, "K", { user: "x" }).body.model === "claude-sonnet-4-5");
})();

// ---- buildRequest: openai-compatible style (grok) ----
(() => {
  const spec = P._PROVIDERS.grok;
  const r = P.buildRequest(spec, "XAIKEY", { system: "s", user: "u" });
  ok("openai: url is chat/completions", /\/chat\/completions$/.test(r.url), r.url);
  ok("openai: Bearer auth header", r.headers.authorization === "Bearer XAIKEY");
  ok("openai: system+user as messages array", r.body.messages[0].role === "system" && r.body.messages[1].role === "user");
  ok("openai: no system ⇒ only user message", P.buildRequest(spec, "K", { user: "u" }).body.messages.length === 1);
})();

// ---- buildRequest: local (key optional, url from env) ----
(() => {
  const spec = P._PROVIDERS.local;
  // no OPENAI_COMPAT_URL set in this test env ⇒ error, no fabricated URL
  const noUrl = P.buildRequest(spec, "", { user: "u" });
  ok("local: no url ⇒ error (no fabrication)", noUrl.error === "no_url", JSON.stringify(noUrl));
  // simulate a configured local URL
  process.env.OPENAI_COMPAT_URL = "http://example.local:11434/v1/chat/completions";
  const r = P.buildRequest(spec, "", { user: "u" });
  ok("local: uses env url", r.url === "http://example.local:11434/v1/chat/completions", r.url);
  ok("local: no key ⇒ no auth header", !r.headers.authorization);
  delete process.env.OPENAI_COMPAT_URL;
})();

// ---- buildRequest guards ----
ok("build: maxTokens clamped to <=8000", P.buildRequest(P._PROVIDERS.openai, "K", { user: "x", maxTokens: 99999 }).body.max_tokens === 8000);
ok("build: maxTokens floor >=1", P.buildRequest(P._PROVIDERS.openai, "K", { user: "x", maxTokens: -5 }).body.max_tokens === 1);

// ---- parseResponse: both shapes ----
ok("parse anthropic: joins text blocks",
   P.parseResponse("anthropic", { content: [{ type: "text", text: "hel" }, { type: "text", text: "lo" }] }) === "hello");
ok("parse anthropic: ignores non-text blocks",
   P.parseResponse("anthropic", { content: [{ type: "tool_use" }, { type: "text", text: "x" }] }) === "x");
ok("parse openai: choices[0].message.content",
   P.parseResponse("openai", { choices: [{ message: { content: "answer" } }] }) === "answer");
ok("parse: garbage ⇒ empty string (no throw)", P.parseResponse("openai", null) === "" && P.parseResponse("anthropic", {}) === "");

// ---- isConfigured / listProviders (env-driven, no fabrication) ----
(() => {
  const had = process.env.XAI_API_KEY;
  delete process.env.XAI_API_KEY;
  ok("gate: grok unconfigured without key", P.isConfigured("grok") === false);
  process.env.XAI_API_KEY = "test";
  ok("gate: grok configured with key", P.isConfigured("grok") === true);
  if (had === undefined) delete process.env.XAI_API_KEY; else process.env.XAI_API_KEY = had;
  ok("gate: unknown provider ⇒ false", P.isConfigured("nope") === false);
  const list = P.listProviders();
  ok("list: returns all 6 providers with configured flags", list.length === 6 && list.every((p) => typeof p.configured === "boolean"));
})();

// ---- chat() gating (no network hit when unconfigured) ----
(async () => {
  const had = process.env.MISTRAL_API_KEY; delete process.env.MISTRAL_API_KEY;
  const r = await P.chat({ provider: "mistral", user: "hi" });
  ok("chat: unconfigured ⇒ not_configured (no fetch)", r.ok === false && r.reason === "not_configured", JSON.stringify(r));
  if (had !== undefined) process.env.MISTRAL_API_KEY = had;
  const u = await P.chat({ provider: "bogus", user: "hi" });
  ok("chat: unknown provider ⇒ ok:false", u.ok === false && u.reason === "unknown_provider");

  console.log("\n" + (fail ? "✗" : "✓") + " " + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
