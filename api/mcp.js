// Klyfton MCP Server — Phase 1 (READ-ONLY). The brain's sense of touch.
//
// Exposes the field-os data (Vercel KV collections) as Model Context Protocol tools so
// Claude (Klyfton) can read real jobs, leads, estimates, costs, inventory, and reviews.
// Speaks MCP streamable-HTTP in stateless JSON mode: POST JSON-RPC 2.0 to /api/mcp.
//
// House rules honored: no npm deps (global fetch + KV REST, same as sync.js), bearer-gated
// (MCP_BEARER_TOKEN), READ ONLY — no tool here writes anything, pricing formulas/doctrine
// are never exposed, crew PINs never leave storage, tombstoned records stay deleted.
// Dormant-honest: with no KV attached, tools answer { configured:false } instead of lying.
//
// Phase 2 (writes, draft-only) is gated behind two clean weeks of Phase 1. See
// MGSF_Klyfton_MCP_Server_Spec + Brain Architecture decision log 2026-07-24.

// ---- env scan (same pattern as sync.js: accept any storage-integration prefix) ----
function _kvEnv(suffixRe, excludeRe) {
  for (const k of Object.keys(process.env)) {
    if (excludeRe && excludeRe.test(k)) continue;
    if (suffixRe.test(k) && process.env[k]) return process.env[k];
  }
  return undefined;
}
const KV_URL = _kvEnv(/KV_REST_API_URL$/i) || _kvEnv(/REST_API_URL$/i) || _kvEnv(/UPSTASH_REDIS_REST_URL$/i);
const KV_TOKEN = _kvEnv(/KV_REST_API_TOKEN$/i) || _kvEnv(/REST_API_TOKEN$/i) || _kvEnv(/UPSTASH_REDIS_REST_API_TOKEN$/i);

// Bearer token resolver — tolerant of key misspellings (MCP_BEARER_TOKEN, MCPBEARERTOKEN,
// MCP-BEARER-TOKEN, any case) and of pasted whitespace in the value. Fail-closed if absent.
function _bearerToken() {
  for (const k of Object.keys(process.env)) {
    if (/^MCP[_-]?BEARER[_-]?TOKEN$/i.test(k)) {
      const v = String(process.env[k] || "").trim();
      if (v) return v;
    }
  }
  return "";
}
const KV_ON = !!(KV_URL && KV_TOKEN);
const PREFIX = "mgsf:";
const TOMB = "_tomb";

async function kvGet(col) {
  try {
    const r = await fetch(KV_URL + "/get/" + encodeURIComponent(PREFIX + col), { headers: { Authorization: "Bearer " + KV_TOKEN } });
    if (!r.ok) return [];
    const j = await r.json();
    if (!j || j.result == null) return [];
    const parsed = JSON.parse(j.result);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

// Live (non-tombstoned) rows of a collection — mirrors sync.js GET semantics.
async function liveRows(col) {
  const [rows, tomb] = await Promise.all([kvGet(col), kvGet(TOMB)]);
  const tset = new Set((tomb || []).map((t) => t.c + "|" + String(t.id)));
  return (rows || []).filter((r) => r && r.id != null && !tset.has(col + "|" + String(r.id)));
}

// ---- small helpers ----
const _day = (v) => String(v || "").slice(0, 10);
function daysOpen(dateStr) {
  const d = Date.parse(_day(dateStr));
  if (!Number.isFinite(d)) return null;
  return Math.max(0, Math.floor((Date.now() - d) / 86400000));
}
const notConfigured = { configured: false, hint: "Vercel KV not attached — data lives on-device only. Connect KV storage to bring the sync backbone (and this server) online." };
const empty = (what) => ({ not_tracked_yet: true, reason: "No " + what + " records in the shared store yet. Honest beats empty." });

// ---- tool implementations (ALL READ-ONLY) ----
const TOOLS = {
  list_leads: {
    description: "List leads from the field-os. Optional status filter (e.g. New, Contacted, Quoted, Won, Lost) and limit.",
    inputSchema: { type: "object", properties: { status: { type: "string", description: "Filter by exact status; omit for all" }, limit: { type: "number", description: "Max rows, default 25" } } },
    run: async (a) => {
      if (!KV_ON) return notConfigured;
      let rows = await liveRows("leads");
      if (a.status) rows = rows.filter((r) => String(r.status || "").toLowerCase() === String(a.status).toLowerCase());
      rows.sort((x, y) => _day(y.date).localeCompare(_day(x.date)));
      if (!rows.length) return empty("lead");
      return { count: rows.length, leads: rows.slice(0, a.limit > 0 ? a.limit : 25) };
    },
  },
  get_lead: {
    description: "Get one lead by id, full record.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    run: async (a) => {
      if (!KV_ON) return notConfigured;
      const row = (await liveRows("leads")).find((r) => String(r.id) === String(a.id));
      return row || { not_found: true, id: a.id };
    },
  },
  list_estimates: {
    description: "List estimates with days_open (for chase logic). Optional status filter (e.g. open, accepted, declined) and limit.",
    inputSchema: { type: "object", properties: { status: { type: "string" }, limit: { type: "number" } } },
    run: async (a) => {
      if (!KV_ON) return notConfigured;
      let rows = await liveRows("estimates");
      if (a.status) rows = rows.filter((r) => String(r.status || "").toLowerCase() === String(a.status).toLowerCase());
      if (!rows.length) return empty("estimate");
      const out = rows.map((r) => ({ ...r, days_open: daysOpen(r.date || r.at) }));
      out.sort((x, y) => (y.days_open || 0) - (x.days_open || 0));
      return { count: out.length, estimates: out.slice(0, a.limit > 0 ? a.limit : 25) };
    },
  },
  get_estimate: {
    description: "Get one estimate by id, full record.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    run: async (a) => {
      if (!KV_ON) return notConfigured;
      const row = (await liveRows("estimates")).find((r) => String(r.id) === String(a.id));
      return row || { not_found: true, id: a.id };
    },
  },
  get_job: {
    description: "Get one job by id: customer, service, status, value, date, crew, linked records.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    run: async (a) => {
      if (!KV_ON) return notConfigured;
      const row = (await liveRows("jobs")).find((r) => String(r.id) === String(a.id));
      return row || { not_found: true, id: a.id };
    },
  },
  job_cost_summary: {
    description: "Quoted vs actual for a job: job value, jobcost record if present, material log actuals, and computed actual gross margin. The Monday scoreboard feed.",
    inputSchema: { type: "object", properties: { id: { type: "string", description: "Job id" } }, required: ["id"] },
    run: async (a) => {
      if (!KV_ON) return notConfigured;
      const [jobs, jobcosts, matlogs] = await Promise.all([liveRows("jobs"), liveRows("jobcosts"), liveRows("matlogs")]);
      const job = jobs.find((r) => String(r.id) === String(a.id));
      if (!job) return { not_found: true, id: a.id };
      const jc = jobcosts.find((r) => String(r.job || r.id) === String(a.id)) || null;
      const mats = matlogs.filter((r) => String(r.job) === String(a.id));
      const matCost = mats.reduce((s, m) => s + (parseFloat(m.cost) || 0), 0);
      const value = parseFloat(job.value) || null;
      const out = { job_id: job.id, customer: job.customer || job.name || null, status: job.status || null, quoted_value: value, jobcost_record: jc, material_logs: mats.length, material_cost_actual: Math.round(matCost) };
      if (value && matCost > 0) out.gm_after_materials_pct = Math.round(((value - matCost) / value) * 1000) / 10;
      if (!jc && !mats.length) out.costs = empty("cost");
      return out;
    },
  },
  inventory_levels: {
    description: "Current inventory records (foam sets, coatings, parts) with whatever reorder fields the app tracks.",
    inputSchema: { type: "object", properties: {} },
    run: async () => {
      if (!KV_ON) return notConfigured;
      const rows = await liveRows("inventory");
      if (!rows.length) return empty("inventory");
      return { count: rows.length, inventory: rows };
    },
  },
  review_ask_status: {
    description: "Review engine status: review records from the last N days (default 30) — asks, results, pending.",
    inputSchema: { type: "object", properties: { days: { type: "number", description: "Lookback window, default 30" } } },
    run: async (a) => {
      if (!KV_ON) return notConfigured;
      const days = a.days > 0 ? a.days : 30;
      const cutoff = Date.now() - days * 86400000;
      const rows = (await liveRows("reviews")).filter((r) => {
        const t = Date.parse(_day(r.date || r.at || r.ts));
        return !Number.isFinite(t) || t >= cutoff;
      });
      if (!rows.length) return empty("review");
      return { window_days: days, count: rows.length, reviews: rows };
    },
  },
  list_scheduled_jobs: {
    description: "Jobs dated between two ISO dates (YYYY-MM-DD), inclusive.",
    inputSchema: { type: "object", properties: { from: { type: "string" }, to: { type: "string" } }, required: ["from", "to"] },
    run: async (a) => {
      if (!KV_ON) return notConfigured;
      const rows = (await liveRows("jobs")).filter((r) => { const d = _day(r.date); return d >= _day(a.from) && d <= _day(a.to); });
      if (!rows.length) return { count: 0, jobs: [], note: "No jobs dated " + _day(a.from) + " to " + _day(a.to) };
      rows.sort((x, y) => _day(x.date).localeCompare(_day(y.date)));
      return { count: rows.length, jobs: rows };
    },
  },
};

// ---- MCP JSON-RPC plumbing (stateless streamable-HTTP, JSON responses) ----
const PROTOCOL = "2025-06-18";
function rpcResult(id, result) { return { jsonrpc: "2.0", id, result }; }
function rpcError(id, code, message) { return { jsonrpc: "2.0", id, error: { code, message } }; }
function _setCors(res) {
  if (!res || typeof res.setHeader !== "function") return;
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type,authorization,x-mcp-bearer-token,x-api-key");
}
function _header(req, name) {
  const h = (req && req.headers) || {};
  const want = String(name || "").toLowerCase();
  for (const k of Object.keys(h)) if (String(k).toLowerCase() === want) return h[k];
  return "";
}
function _requestToken(req) {
  const auth = String(_header(req, "authorization") || "").trim();
  if (auth) {
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (m && m[1]) return String(m[1]).trim();
    // Some clients pass the raw token with no auth scheme.
    if (!/\s/.test(auth)) return auth;
  }
  return String(_header(req, "x-mcp-bearer-token") || _header(req, "x-api-key") || "").trim();
}

async function handleRpc(msg) {
  const { id, method, params } = msg || {};
  if (method === "initialize") {
    return rpcResult(id, {
      protocolVersion: (params && params.protocolVersion) || PROTOCOL,
      capabilities: { tools: {} },
      serverInfo: { name: "klyfton-field-os", version: "1.0.0-phase1" },
      instructions: "Read-only Phase 1 tools over the MGSF field-os shared store. Nothing here writes. If a tool answers configured:false, the KV sync backbone isn't attached yet; not_tracked_yet means the collection is real but empty.",
    });
  }
  if (method === "ping") return rpcResult(id, {});
  if (method === "tools/list") {
    return rpcResult(id, { tools: Object.keys(TOOLS).map((name) => ({ name, description: TOOLS[name].description, inputSchema: TOOLS[name].inputSchema })) });
  }
  if (method === "tools/call") {
    const name = params && params.name;
    const tool = TOOLS[name];
    if (!tool) return rpcError(id, -32602, "Unknown tool: " + String(name).slice(0, 60));
    try {
      const data = await tool.run((params && params.arguments) || {});
      return rpcResult(id, { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });
    } catch (e) {
      return rpcResult(id, { content: [{ type: "text", text: JSON.stringify({ ok: false, error: String(e && e.message || e).slice(0, 200) }) }], isError: true });
    }
  }
  if (String(method || "").startsWith("notifications/")) return null; // acknowledged, no response body
  return rpcError(id, -32601, "Method not found: " + String(method).slice(0, 60));
}

module.exports = async (req, res) => {
  _setCors(res);
  if (req.method === "OPTIONS") { res.status(204).end(); return; }

  // Status probe (no data): confirms the route exists and whether storage + auth are configured.
  if (req.method === "GET") {
    res.status(200).json({ ok: true, server: "klyfton-field-os", phase: 1, transport: "mcp-streamable-http/json", kv: KV_ON, auth_required: true, token_configured: !!_bearerToken() });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }

  // Bearer gate. 401 on any mismatch; no token configured = closed, not open.
  // Accepts the token under MCP_BEARER_TOKEN or common misspellings (underscores/dashes
  // dropped by dashboard entry, any case), value trimmed to survive paste whitespace.
  const token = _bearerToken();
  const got = _requestToken(req);
  if (!token || !got || got !== token) { res.status(401).json({ error: "unauthorized", hint: "send MCP_BEARER_TOKEN in the authorization header (or x-mcp-bearer-token/x-api-key)" }); return; }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body) { res.status(400).json(rpcError(null, -32700, "Parse error")); return; }

  try {
    if (Array.isArray(body)) { // batch
      const out = (await Promise.all(body.map(handleRpc))).filter((r) => r !== null);
      if (!out.length) { res.status(202).end(); return; }
      res.status(200).json(out);
      return;
    }
    const out = await handleRpc(body);
    if (out === null) { res.status(202).end(); return; } // notification — accepted, nothing to say
    res.status(200).json(out);
  } catch (e) {
    res.status(200).json(rpcError(body && body.id != null ? body.id : null, -32603, String(e && e.message || e).slice(0, 200)));
  }
};
