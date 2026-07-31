// Klyfton PROVIDER HUB — vendor-neutral chat adapter (the "hook up other AIs" port).
//
// Today the hive thinks on Anthropic (Claude) only. This module lets Klyfton also run a
// worker/answer on any OTHER model behind ONE interface: OpenAI (ChatGPT), xAI (Grok),
// Groq, Mistral, or a FREE model you download and host (Ollama / LM Studio / llama.cpp)
// — because they all speak the same "OpenAI-compatible" chat API. So one adapter unlocks
// all of them; Anthropic keeps its own native shape.
//
// Design (the gated-live module pattern):
//   • PURE CORE — buildRequest()/parseResponse()/pickProvider() are deterministic (no
//     network), so the routing + request/response shaping is fully unit-tested.
//   • GATED LIVE — chat() does the fetch; isConfigured(id) checks that provider's key;
//     an absent key ⇒ {ok:false, reason:'not_configured'}. Never fabricates.
//   • ADDITIVE — it does NOT change the live klyfton.js pipeline. New /api/provider
//     endpoint; the hive only uses it once Clifton wires a provider to a job on purpose.
//
// Local/free models: Klyfton runs on Vercel (the cloud) and can't reach a PC on your LAN
// directly — point OPENAI_COMPAT_URL at a reachable OpenAI-compatible endpoint (a tunnel,
// or a hosted runner). Then it's just another provider id: "local".
//
// POST { provider, user, system?, model?, maxTokens? }  -> { ok, text, provider, model }
// GET                                                    -> providers + which are configured
// No npm — global fetch only.

// key = env var name that holds the API key; urlEnv = optional env override for base URL
// (required for the generic openai-compatible / local slots). style drives request/parse.
const PROVIDERS = {
  claude:  { label: "Anthropic (Claude)", style: "anthropic", key: "ANTHROPIC_API_KEY",
             url: "https://api.anthropic.com/v1/messages", defaultModel: "claude-sonnet-4-5" },
  openai:  { label: "OpenAI (ChatGPT)",   style: "openai",   key: "OPENAI_API_KEY",
             url: "https://api.openai.com/v1/chat/completions", defaultModel: "gpt-4o" },
  grok:    { label: "xAI (Grok)",         style: "openai",   key: "XAI_API_KEY",
             url: "https://api.x.ai/v1/chat/completions", defaultModel: "grok-2-latest" },
  groq:    { label: "Groq",               style: "openai",   key: "GROQ_API_KEY",
             url: "https://api.groq.com/openai/v1/chat/completions", defaultModel: "llama-3.3-70b-versatile" },
  mistral: { label: "Mistral",            style: "openai",   key: "MISTRAL_API_KEY",
             url: "https://api.mistral.ai/v1/chat/completions", defaultModel: "mistral-large-latest" },
  // FREE / free-tier models — all OpenAI-compatible, so they slot into the same adapter (one hub,
  // many backends — NOT one module per model). Each is inert until its key is set; models are
  // overridable per call. groq (above) + local (below) are also free.
  gemini:  { label: "Google Gemini (free tier)", style: "openai", key: "GEMINI_API_KEY",
             url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", defaultModel: "gemini-1.5-flash" },
  openrouter: { label: "OpenRouter (free models)", style: "openai", key: "OPENROUTER_API_KEY",
             url: "https://openrouter.ai/api/v1/chat/completions", defaultModel: "meta-llama/llama-3.3-70b-instruct:free" },
  cerebras: { label: "Cerebras (free tier)", style: "openai", key: "CEREBRAS_API_KEY",
             url: "https://api.cerebras.ai/v1/chat/completions", defaultModel: "llama-3.3-70b" },
  together: { label: "Together AI (free tier)", style: "openai", key: "TOGETHER_API_KEY",
             url: "https://api.together.xyz/v1/chat/completions", defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo-Free" },
  // Free/downloaded model reachable over an OpenAI-compatible URL (Ollama, LM Studio, …).
  // Key optional (local runners usually need none) — set OPENAI_COMPAT_URL to activate.
  local:   { label: "Local / free (OpenAI-compatible)", style: "openai", key: "OPENAI_COMPAT_KEY",
             urlEnv: "OPENAI_COMPAT_URL", defaultModel: process.env.OPENAI_COMPAT_MODEL || "local-model" },
};

function clean(s, max) { return String(s == null ? "" : s).trim().slice(0, max || 12000); }

// --- PURE CORE ------------------------------------------------------------------

function pickProvider(name) {
  const id = clean(name, 40).toLowerCase();
  return PROVIDERS[id] ? { id, spec: PROVIDERS[id] } : null;
}

function providerUrl(spec) {
  return spec.urlEnv ? (process.env[spec.urlEnv] || "") : spec.url;
}

// Deterministic: shape the HTTP request for a provider. `key` passed in so it's testable
// without env. Returns {url, headers, body} or {error} — never throws.
function buildRequest(spec, key, opts) {
  const url = providerUrl(spec);
  if (!url) return { error: "no_url" };
  const model = clean(opts && opts.model, 80) || spec.defaultModel;
  const maxTokens = Math.max(1, Math.min(8000, Number(opts && opts.maxTokens) || 1500));
  const system = clean(opts && opts.system, 8000);
  const user = clean(opts && opts.user, 12000);
  if (spec.style === "anthropic") {
    return {
      url,
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: { model, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] },
    };
  }
  // openai-compatible (ChatGPT, Grok, Groq, Mistral, local)
  const messages = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: user });
  const headers = { "content-type": "application/json" };
  if (key) headers.authorization = "Bearer " + key; // local runners may need no key
  return { url, headers, body: { model, max_tokens: maxTokens, messages } };
}

// Deterministic: pull the assistant text out of either provider shape. Returns "" if the
// payload isn't in the expected form (never throws).
function parseResponse(style, data) {
  if (!data || typeof data !== "object") return "";
  if (style === "anthropic") {
    return (Array.isArray(data.content) ? data.content : [])
      .map((b) => (b && b.type === "text" ? b.text : "")).join("").trim();
  }
  const choice = Array.isArray(data.choices) ? data.choices[0] : null;
  return (choice && choice.message && typeof choice.message.content === "string")
    ? choice.message.content.trim() : "";
}

// --- GATED LIVE LAYER -----------------------------------------------------------

function isConfigured(id) {
  const spec = PROVIDERS[id];
  if (!spec) return false;
  if (!providerUrl(spec)) return false;                 // local needs its URL set
  if (id === "local") return true;                      // key optional for local
  return !!process.env[spec.key];
}

function listProviders() {
  return Object.keys(PROVIDERS).map((id) => ({
    id, label: PROVIDERS[id].label, style: PROVIDERS[id].style,
    configured: isConfigured(id), defaultModel: PROVIDERS[id].defaultModel,
  }));
}

// Live call. Returns { ok, text, provider, model } or { ok:false, reason }.
async function chat(opts) {
  const p = pickProvider(opts && opts.provider);
  if (!p) return { ok: false, reason: "unknown_provider" };
  if (!isConfigured(p.id)) return { ok: false, reason: "not_configured", need: p.spec.key, provider: p.id };
  const key = process.env[p.spec.key] || "";
  const req = buildRequest(p.spec, key, opts);
  if (req.error) return { ok: false, reason: req.error, provider: p.id };
  try {
    const r = await fetch(req.url, { method: "POST", headers: req.headers, body: JSON.stringify(req.body) });
    if (!r.ok) { const t = await r.text(); return { ok: false, reason: "http_" + r.status, detail: t.slice(0, 300), provider: p.id }; }
    const data = await r.json();
    return { ok: true, provider: p.id, model: req.body.model, text: parseResponse(p.spec.style, data) };
  } catch (e) {
    return { ok: false, reason: "error", detail: (e && e.message) || "err", provider: p.id };
  }
}

// --- FALLBACK (resilience: try the next configured model if one fails) ----------

// Deterministic ordering: preferred provider(s) first, then the rest of the registry,
// de-duped. Pure — testable without env.
function fallbackChain(preferred) {
  const order = [];
  const push = (id) => { if (id && PROVIDERS[id] && order.indexOf(id) < 0) order.push(id); };
  (Array.isArray(preferred) ? preferred : [preferred]).forEach(push);
  Object.keys(PROVIDERS).forEach(push);
  return order;
}

// Try each configured provider in order until one returns usable text. Injectable
// (`_chat`, `_isConfigured`) so the loop is fully unit-tested without a network. Returns
// { ok, text, provider, model, tried:[{provider,ok}] } or { ok:false, reason, tried }.
async function chatWithFallback(opts) {
  opts = opts || {};
  const chatFn = opts._chat || chat;
  const isConf = opts._isConfigured || isConfigured;
  const chain = fallbackChain(opts.provider || "claude").filter(isConf);
  if (!chain.length) return { ok: false, reason: "no_configured_provider", tried: [] };
  const tried = [];
  for (const id of chain) {
    let r;
    try { r = await chatFn({ ...opts, provider: id }); }
    catch (e) { r = { ok: false, reason: "error", detail: (e && e.message) || "err" }; }
    tried.push({ provider: id, ok: !!(r && r.ok && r.text) });
    if (r && r.ok && r.text) return { ok: true, text: r.text, provider: id, model: r.model, tried };
  }
  return { ok: false, reason: "all_failed", tried };
}

// --- HTTP HANDLER (additive endpoint) -------------------------------------------

module.exports = async (req, res) => {
  try {
    if (req.method === "GET") {
      return res.status(200).json({ ok: true, module: "provider",
        what: "vendor-neutral chat: Claude native + OpenAI-compatible (ChatGPT/Grok/Groq/Mistral/local)",
        providers: listProviders() });
    }
    if (req.method !== "POST") return res.status(405).json({ ok: false, reason: "method" });
    const body = req.body || {};
    if (!clean(body.user)) return res.status(400).json({ ok: false, reason: "no_user" });
    // fallback:true ⇒ try the preferred model, then auto-retry the next configured one.
    if (body.fallback) return res.status(200).json(await chatWithFallback(body));
    if (!body.provider) return res.status(400).json({ ok: false, reason: "no_provider", providers: listProviders() });
    const result = await chat(body);
    return res.status(200).json(result);
  } catch (e) {
    return res.status(200).json({ ok: false, reason: "error", detail: (e && e.message) || "err" });
  }
};

// Pure exports for the test harness + for the hive/orchestrator to compose later.
module.exports.buildRequest = buildRequest;
module.exports.parseResponse = parseResponse;
module.exports.pickProvider = pickProvider;
module.exports.isConfigured = isConfigured;
module.exports.listProviders = listProviders;
module.exports.chat = chat;
module.exports.fallbackChain = fallbackChain;
module.exports.chatWithFallback = chatWithFallback;
module.exports._PROVIDERS = PROVIDERS;
