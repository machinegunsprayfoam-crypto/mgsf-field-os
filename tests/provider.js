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
ok("pick: free-tier models registered (gemini/openrouter/cerebras/together)",
   ["gemini","openrouter","cerebras","together"].every((k) => !!P._PROVIDERS[k]));
ok("free model builds an OpenAI-style request (gemini)", (() => {
   const r = P.buildRequest(P._PROVIDERS.gemini, "GKEY", { user: "hi" });
   return /\/chat\/completions$/.test(r.url) && r.headers.authorization === "Bearer GKEY";
})());

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
  ok("list: returns every registered provider with configured flags", list.length === Object.keys(P._PROVIDERS).length && list.length >= 10 && list.every((p) => typeof p.configured === "boolean"));
})();

// ---- chat() gating (no network hit when unconfigured) ----
(async () => {
  const had = process.env.MISTRAL_API_KEY; delete process.env.MISTRAL_API_KEY;
  const r = await P.chat({ provider: "mistral", user: "hi" });
  ok("chat: unconfigured ⇒ not_configured (no fetch)", r.ok === false && r.reason === "not_configured", JSON.stringify(r));
  if (had !== undefined) process.env.MISTRAL_API_KEY = had;
  const u = await P.chat({ provider: "bogus", user: "hi" });
  ok("chat: unknown provider ⇒ ok:false", u.ok === false && u.reason === "unknown_provider");

  // ---- fallbackChain ordering (pure) ----
  ok("chain: preferred first", P.fallbackChain("grok")[0] === "grok");
  ok("chain: includes all providers, de-duped", P.fallbackChain("grok").length === Object.keys(P._PROVIDERS).length);
  ok("chain: array preferred honored", P.fallbackChain(["local", "grok"]).slice(0, 2).join(",") === "local,grok");

  // ---- chatWithFallback: injected chat + configured predicate (no network) ----
  const allConf = () => true;
  // claude fails, grok succeeds ⇒ returns grok, tried shows the claude miss first
  const scripted = (o) => Promise.resolve(o.provider === "claude" ? { ok: false, reason: "http_529" } : { ok: true, text: "hi from " + o.provider, model: "m" });
  const r1 = await P.chatWithFallback({ provider: "claude", user: "x", _chat: scripted, _isConfigured: allConf });
  ok("fallback: falls through to a working provider", r1.ok === true && r1.provider !== "claude", JSON.stringify(r1.provider));
  ok("fallback: records what it tried", r1.tried[0].provider === "claude" && r1.tried[0].ok === false);

  // first success short-circuits (claude ok ⇒ no further tries)
  const okAll = (o) => Promise.resolve({ ok: true, text: "ok", model: "m", provider: o.provider });
  const r2 = await P.chatWithFallback({ provider: "claude", user: "x", _chat: okAll, _isConfigured: allConf });
  ok("fallback: first success short-circuits", r2.provider === "claude" && r2.tried.length === 1);

  // all fail ⇒ ok:false with the full tried list
  const allFail = () => Promise.resolve({ ok: false, reason: "http_500" });
  const r3 = await P.chatWithFallback({ provider: "claude", user: "x", _chat: allFail, _isConfigured: allConf });
  ok("fallback: all fail ⇒ ok:false", r3.ok === false && r3.reason === "all_failed");
  ok("fallback: a throwing provider doesn't crash the chain", (await P.chatWithFallback({ provider: "claude", user: "x", _chat: () => { throw new Error("boom"); }, _isConfigured: allConf })).ok === false);

  // none configured ⇒ explicit reason
  const r4 = await P.chatWithFallback({ provider: "claude", user: "x", _chat: okAll, _isConfigured: () => false });
  ok("fallback: none configured ⇒ no_configured_provider", r4.ok === false && r4.reason === "no_configured_provider");

  console.log("\n" + (fail ? "✗" : "✓") + " " + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
