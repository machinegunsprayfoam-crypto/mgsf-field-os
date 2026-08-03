// Klyfton REQUEST LOG — the missing half of observability. telemetry.js answers "what have the
// AGENTS been doing"; this answers "what has the API been doing": which of the ~94 endpoints get
// called, how fast, how often they fail, and WHICH CAPABILITY KEY each call exercised. That last
// column is the point — it turns "we pay for HubSpot/Twilio/Maps/Anthropic" into "here is what
// each key actually did this week", which is the only honest basis for keeping or cutting one.
//
// PURE core (deterministic — no Date.now, no network, unit-testable offline):
//   normalizeRoute · scrubError · rollup · keyUsage · percentile
// LIVE layer (gated, graceful, never throws into a request):
//   wrap(handler, meta) — times a handler, records, and CANNOT change its response or crash it
//   sink to Supabase api_requests when attached; otherwise an in-memory ring buffer
//
// HONESTY RULE — this module never invents a dollar figure. It counts calls and milliseconds,
// which it can observe. Cost per call depends on token counts and vendor pricing it does NOT
// have, so `cost` is only ever reported when a CALLER supplies it. A fabricated spend number
// would be worse than none, because Clifton would make a keep/cut decision on it.
//
// Read-only report: GET /api/reqlog -> the rollup. CREW_CODE-gated like every data endpoint.

const REDACT = (function () { try { return require("./redact"); } catch (e) { return null; } })();
const CMDB = (function () { try { return require("./cmdb"); } catch (e) { return null; } })();

function _env(re) { for (const k of Object.keys(process.env)) { if (re.test(k) && process.env[k]) return process.env[k]; } return undefined; }
const SB_URL = (_env(/SUPABASE_URL$/i) || "").replace(/\/$/, "");
const SB_KEY = _env(/SERVICE_ROLE_KEY$/i) || _env(/SUPABASE_SECRET/i);
const SB_ON = !!(SB_URL && SB_KEY);

const RING_MAX = 500;              // per-instance fallback buffer (serverless: per lambda, still useful)
const _ring = [];

// PURE: a URL becomes a stable route key. Query strings are dropped (they carry ?code= and other
// caller secrets), trailing slashes collapse, and anything unrecognizable becomes "/unknown" —
// never the raw string, so a malformed URL can't smuggle data into the log.
function normalizeRoute(url) {
  const raw = String(url || "");
  const noQuery = raw.split("?")[0].split("#")[0];
  const m = /^(\/api\/[A-Za-z0-9._-]+)\/?$/.exec(noQuery);
  return m ? m[1] : "/unknown";
}

// PURE: an error message may carry a key or a customer's data. Run it through the existing
// redaction guardrail and hard-cap the length — a log line is not a place to debug freeform text.
function scrubError(msg) {
  let s = String(msg == null ? "" : msg).slice(0, 200);
  if (!s) return "";
  if (REDACT && typeof REDACT.redact === "function") {
    try { s = REDACT.redact(s, { contact: true }).text; } catch (e) { /* redaction must never break logging */ }
  }
  return s;
}

// PURE: build one normalized row. `at` and `ms` are supplied by the caller (no clock in here).
function record(e) {
  e = e || {};
  const status = Number.isFinite(+e.status) ? +e.status : 0;
  return {
    route: normalizeRoute(e.route || e.url),
    method: String(e.method || "GET").toUpperCase().slice(0, 7),
    status,
    ok: status >= 200 && status < 400,
    ms: Math.max(0, Math.round(+e.ms || 0)),
    cap: e.cap ? String(e.cap).slice(0, 40) : null,   // capability key this call exercised
    denied: status === 401 || status === 403,
    error: e.error ? scrubError(e.error) : "",
    at: e.at || null,                                  // ISO string, caller-supplied
  };
}

function dayOf(at) { const s = String(at || ""); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : "unknown"; }

// PURE: nearest-rank percentile over a numeric array. Deterministic, no interpolation surprises.
function percentile(values, p) {
  const v = (values || []).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!v.length) return 0;
  const rank = Math.ceil((p / 100) * v.length);
  return v[Math.min(v.length - 1, Math.max(0, rank - 1))];
}

// PURE: roll rows up into the picture Clifton actually reads — traffic, failures, slowness.
function rollup(rows) {
  const list = Array.isArray(rows) ? rows.filter(Boolean) : [];
  const byRoute = {}, byStatus = {}, byDay = {};
  const allMs = [];
  let errors = 0, denied = 0;
  for (const r of list) {
    const route = r.route || "/unknown";
    byRoute[route] = byRoute[route] || { calls: 0, errors: 0, denied: 0, ms: [] };
    byRoute[route].calls++;
    if (!r.ok) { byRoute[route].errors++; errors++; }
    if (r.denied) { byRoute[route].denied++; denied++; }
    byRoute[route].ms.push(r.ms);
    allMs.push(r.ms);
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    const d = dayOf(r.at);
    byDay[d] = (byDay[d] || 0) + 1;
  }
  // collapse the per-route ms arrays into stats (don't leak raw arrays into the report)
  const routes = {};
  for (const k of Object.keys(byRoute)) {
    const b = byRoute[k];
    routes[k] = {
      calls: b.calls, errors: b.errors, denied: b.denied,
      errorRate: b.calls ? Math.round((b.errors / b.calls) * 1000) / 1000 : 0,
      p50: percentile(b.ms, 50), p95: percentile(b.ms, 95), max: b.ms.length ? Math.max.apply(null, b.ms) : 0,
    };
  }
  const slowest = Object.keys(routes).map((k) => ({ route: k, p95: routes[k].p95, calls: routes[k].calls }))
    .sort((a, b) => b.p95 - a.p95 || a.route.localeCompare(b.route)).slice(0, 10);
  const noisiest = Object.keys(routes).filter((k) => routes[k].errors > 0)
    .map((k) => ({ route: k, errors: routes[k].errors, errorRate: routes[k].errorRate }))
    .sort((a, b) => b.errors - a.errors || a.route.localeCompare(b.route)).slice(0, 10);
  return {
    total: list.length,
    errors, denied,
    errorRate: list.length ? Math.round((errors / list.length) * 1000) / 1000 : 0,
    p50: percentile(allMs, 50), p95: percentile(allMs, 95),
    routes, byStatus, byDay, slowest, noisiest,
  };
}

// PURE: per-KEY usage. Attributes calls to the capability each one exercised, and — the useful
// part — names the capabilities that are ARMED but saw ZERO traffic. That's a paid key doing
// nothing. `cost` is summed ONLY from caller-supplied values; it is never estimated or derived.
function keyUsage(rows, env, capsArg) {
  const list = Array.isArray(rows) ? rows.filter(Boolean) : [];
  const caps = capsArg || (CMDB && CMDB.CAPS) || {};
  const used = {};
  let costed = 0, costTotal = 0;
  for (const r of list) {
    if (!r.cap) continue;
    used[r.cap] = used[r.cap] || { calls: 0, errors: 0, ms: [] };
    used[r.cap].calls++;
    if (!r.ok) used[r.cap].errors++;
    used[r.cap].ms.push(r.ms);
    if (Number.isFinite(+r.cost)) { costed++; costTotal += +r.cost; }
  }
  const keys = {};
  for (const k of Object.keys(used)) {
    const u = used[k];
    keys[k] = { calls: u.calls, errors: u.errors, p95: percentile(u.ms, 95) };
  }
  // armed-but-idle: the capability's predicate says live, yet nothing called it in this window
  const idle = [];
  for (const id of Object.keys(caps)) {
    let live = false;
    try { live = !!(caps[id] && typeof caps[id].on === "function" && caps[id].on(env || {})); } catch (e) { live = false; }
    if (live && !used[id]) idle.push({ cap: id, label: caps[id].label || id });
  }
  return {
    keys,
    armedButIdle: idle.sort((a, b) => a.cap.localeCompare(b.cap)),
    cost: {
      // honest by construction: we report what fraction of rows carried a real cost figure
      rowsWithCost: costed,
      total: costed ? Math.round(costTotal * 10000) / 10000 : null,
      note: costed
        ? "summed from caller-supplied per-call cost only"
        : "no per-call cost supplied — this module does not estimate spend (token counts and vendor pricing are not observable here)",
    },
  };
}

// ---- LIVE layer -------------------------------------------------------------------------

function push(row) {
  _ring.push(row);
  while (_ring.length > RING_MAX) _ring.shift();
  if (SB_ON) {
    // fire-and-forget; a logging failure must never surface to the caller
    try {
      fetch(SB_URL + "/rest/v1/api_requests", {
        method: "POST",
        headers: { apikey: SB_KEY, authorization: "Bearer " + SB_KEY, "content-type": "application/json", prefer: "return=minimal" },
        body: JSON.stringify(row),
      }).catch(function () {});
    } catch (e) { /* never throw out of logging */ }
  }
}

// wrap(handler, meta) — the drop-in. Times the handler, records the outcome, and is transparent:
// it returns exactly what the handler returned and re-throws exactly what it threw. The logging
// itself is wrapped so a bug in HERE can never take down an endpoint.
function wrap(handler, meta) {
  meta = meta || {};
  return async function wrapped(req, res) {
    const started = Date.now();
    let status = 0, errMsg = "";
    // observe the status the handler sets without altering behaviour
    let observed = null;
    try {
      if (res && typeof res.status === "function") {
        const orig = res.status.bind(res);
        res.status = function (c) { observed = c; return orig(c); };
      }
      const out = await handler(req, res);
      status = observed || (res && res.statusCode) || 200;
      return out;
    } catch (e) {
      status = 500;
      errMsg = (e && e.message) || String(e);
      throw e;
    } finally {
      try {
        push(record({
          route: (req && (req.url || req.path)) || meta.route,
          method: req && req.method,
          status,
          ms: Date.now() - started,
          cap: meta.cap || null,
          error: errMsg,
          at: new Date().toISOString(),
        }));
      } catch (e) { /* logging must never break the request */ }
    }
  };
}

function recent() { return _ring.slice(); }
function _reset() { _ring.length = 0; }   // test hook

async function report(env, opts) {
  const limit = (opts && opts.limit) || 1000;
  if (!SB_ON) {
    const rows = recent();
    return {
      configured: false,
      source: "memory",
      note: "attach Supabase + run db/api_requests.sql for durable, cross-instance logging; this buffer is per-instance and resets on cold start",
      rollup: rollup(rows),
      keyUsage: keyUsage(rows, env),
    };
  }
  try {
    const r = await fetch(SB_URL + "/rest/v1/api_requests?select=route,method,status,ok,ms,cap,denied,at&order=at.desc&limit=" + limit,
      { headers: { apikey: SB_KEY, authorization: "Bearer " + SB_KEY } });
    if (!r.ok) return { configured: true, ok: false, status: r.status, source: "supabase", rollup: rollup([]), keyUsage: keyUsage([], env) };
    const rows = await r.json();
    const list = Array.isArray(rows) ? rows : [];
    return { configured: true, ok: true, source: "supabase", rollup: rollup(list), keyUsage: keyUsage(list, env) };
  } catch (e) {
    return { configured: true, ok: false, source: "supabase", error: scrubError(e && e.message), rollup: rollup([]), keyUsage: keyUsage([], env) };
  }
}

module.exports = async (req, res) => {
  if (req.method !== "GET" && req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  const guard = require("./guard");
  if (!guard.ok(req)) { res.status(401).json(guard.denied()); return; }
  try { res.status(200).json({ service: "klyfton-reqlog", ...(await report(process.env)) }); }
  catch (e) { res.status(200).json({ ok: false, error: scrubError(e && e.message) }); }
};

module.exports.normalizeRoute = normalizeRoute;
module.exports.scrubError = scrubError;
module.exports.record = record;
module.exports.percentile = percentile;
module.exports.rollup = rollup;
module.exports.keyUsage = keyUsage;
module.exports.dayOf = dayOf;
module.exports.wrap = wrap;
module.exports.recent = recent;
module.exports.report = report;
module.exports._reset = _reset;
