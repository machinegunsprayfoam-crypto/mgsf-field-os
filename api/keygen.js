const crypto = require("crypto");

const PRESETS = {
  api_key: { format: "urlsafe", length: 40, prefix: "mgsf_" },
  crew_code: { alphabet: "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", length: 10, prefix: "" },
  portal_secret: { format: "urlsafe", length: 64, prefix: "" },
  webhook_secret: { format: "hex", length: 48, prefix: "" },
};

const FORMATS = {
  hex: "0123456789abcdef",
  base62: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
  urlsafe: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_",
};

function safeEqual(a, b) {
  a = String(a || "");
  b = String(b || "");
  if (!a.length || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function parseBody(body) {
  if (!body) return {};
  if (typeof body === "string") {
    try { return JSON.parse(body) || {}; } catch { return {}; }
  }
  return body;
}

function configured(env) { return !!(env && env.KEYGEN_SECRET); }

function presentedSecret(req, body) {
  // HEADER or BODY only — deliberately NOT ?secret= / ?keygen_secret=.
  // Query strings are written to Vercel access logs, browser history, and the Referer header
  // of any outbound link. Accepting one here would leak the credential that mints every other
  // credential, which makes this the worst endpoint in the codebase to put in a URL.
  const h = req && req.headers ? (req.headers["x-keygen-secret"] || req.headers["x-admin-secret"] || "") : "";
  const b = body && (body.secret || body.keygen_secret || "");
  return String(h || b || "");
}

function isAuthorized(req, body, env) {
  const gate = String((env && env.KEYGEN_SECRET) || "");
  if (!gate) return false;
  return safeEqual(presentedSecret(req, body), gate);
}

function uniqChars(s) {
  let out = "";
  for (const ch of String(s || "")) if (!out.includes(ch)) out += ch;
  return out;
}

function intClamp(n, lo, hi) {
  const v = Number.parseInt(String(n), 10);
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

function normalizeSpec(input) {
  input = input || {};
  const purpose = String(input.purpose || "api_key").trim().toLowerCase();
  const preset = PRESETS[purpose] || PRESETS.api_key;
  const fmt = String(input.format || preset.format || "").toLowerCase();
  let alphabet = uniqChars(String(input.alphabet || preset.alphabet || FORMATS[fmt] || FORMATS.urlsafe));
  if (alphabet.length < 2) return { ok: false, error: "alphabet_too_small" };
  if (alphabet.length > 128) alphabet = alphabet.slice(0, 128);
  const length = intClamp(input.length != null ? input.length : preset.length, 8, 128);
  const count = intClamp(input.count != null ? input.count : 1, 1, 20);
  const prefix = String(input.prefix != null ? input.prefix : (preset.prefix || "")).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 24);
  return { ok: true, spec: { purpose, format: fmt || "custom", alphabet, length, count, prefix } };
}

function bytesRng(n) { return crypto.randomBytes(Math.max(1, n | 0)); }

function generateToken(length, alphabet, rng) {
  const chars = String(alphabet || "");
  const pick = typeof rng === "function" ? rng : bytesRng;
  if (chars.length < 2) return "";
  const lim = 256 - (256 % chars.length);
  let out = "";
  while (out.length < length) {
    const buf = pick(Math.max(32, length * 2));
    for (let i = 0; i < buf.length && out.length < length; i++) {
      const b = buf[i];
      if (b < lim) out += chars[b % chars.length];
    }
  }
  return out;
}

function makeKey(spec, rng) {
  spec = spec || {};
  const token = generateToken(spec.length || 32, spec.alphabet || FORMATS.urlsafe, rng);
  return String(spec.prefix || "") + token;
}

function json(res, code, body) { res.status(code).json(body); }

module.exports = async (req, res, envArg) => {
  const env = envArg || process.env || {};
  if (req.method === "GET") {
    json(res, 200, {
      configured: configured(env),
      service: "klyfton-keygen",
      presets: Object.keys(PRESETS),
      note: "POST /api/keygen with x-keygen-secret and action:'generate' to mint keys.",
    });
    return;
  }
  if (req.method !== "POST") { json(res, 405, { ok: false, error: "method_not_allowed" }); return; }
  const body = parseBody(req.body);
  if (!configured(env)) { json(res, 200, { ok: false, configured: false, error: "not_configured", note: "Set KEYGEN_SECRET in environment to enable key generation." }); return; }
  if (!isAuthorized(req, body, env)) { json(res, 401, { ok: false, error: "unauthorized", note: "Send x-keygen-secret." }); return; }
  const action = String(body.action || "generate").toLowerCase();
  if (action === "presets") {
    json(res, 200, { ok: true, presets: PRESETS });
    return;
  }
  if (action !== "generate") { json(res, 200, { ok: false, error: "unknown_action" }); return; }
  const n = normalizeSpec(body);
  if (!n.ok) { json(res, 200, { ok: false, error: n.error }); return; }
  const keys = [];
  for (let i = 0; i < n.spec.count; i++) keys.push(makeKey(n.spec));
  json(res, 200, {
    ok: true,
    service: "klyfton-keygen",
    purpose: n.spec.purpose,
    spec: { format: n.spec.format, length: n.spec.length, count: n.spec.count, prefix: n.spec.prefix },
    key: keys[0],
    keys,
  });
};

module.exports.PRESETS = PRESETS;
module.exports.FORMATS = FORMATS;
module.exports.safeEqual = safeEqual;
module.exports.parseBody = parseBody;
module.exports.configured = configured;
module.exports.presentedSecret = presentedSecret;
module.exports.isAuthorized = isAuthorized;
module.exports.normalizeSpec = normalizeSpec;
module.exports.generateToken = generateToken;
module.exports.makeKey = makeKey;
