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
const KV_TOKEN = _kvEnv(/KV_REST_API_TOKEN$/i, /READ_ONLY/i) || _kvEnv(/REST_API_TOKEN$/i, /READ_ONLY/i);

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

// Status-filter helpers. "all" / "any" / "" / omitted are WILDCARDS, not literal statuses —
// the spec's documented default was status:"all", and treating it as a literal made every
// consumer that passed it see not_tracked_yet while real rows sat in the store (found by the
// outreach agent 2026-08-04). A filter that matches nothing must also say "no match", never
// "store empty" — those are different facts and the honest-beats-empty rule cuts both ways.
const _statusAll = (s) => /^(all|any)?$/i.test(String(s || "").trim());
const _statusesPresent = (rows) => [...new Set(rows.map((r) => String(r.status || "").trim() || "(blank)"))].sort();
const noMatch = (what, key, allRows, want) => ({
  count: 0, [key]: [], status_filter: want, statuses_present: _statusesPresent(allRows),
  note: allRows.length + " " + what + " record(s) exist; none with status \"" + want + "\".",
});

// ---- tool implementations (ALL READ-ONLY) ----
const TOOLS = {
  list_leads: {
    description: "List leads from the field-os. Optional status filter (e.g. New, Contacted, Quoted, Won, Lost; \"all\" or omit = every status) and limit.",
    inputSchema: { type: "object", properties: { status: { type: "string", description: "Filter by exact status; \"all\", \"any\", or omit for every status" }, limit: { type: "number", description: "Max rows, default 25" } } },
    run: async (a) => {
      if (!KV_ON) return notConfigured;
      const all = await liveRows("leads");
      if (!all.length) return empty("lead");
      const want = String(a.status || "").trim();
      const rows = (_statusAll(want) ? all : all.filter((r) => String(r.status || "").toLowerCase() === want.toLowerCase())).slice();
      if (!rows.length) return noMatch("lead", "leads", all, want);
      rows.sort((x, y) => _day(y.date).localeCompare(_day(x.date)));
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
    description: "List estimates with days_open (for chase logic). Optional status filter (e.g. open, accepted, declined; \"all\" or omit = every status) and limit.",
    inputSchema: { type: "object", properties: { status: { type: "string", description: "Filter by exact status; \"all\", \"any\", or omit for every status" }, limit: { type: "number" } } },
    run: async (a) => {
      if (!KV_ON) return notConfigured;
      const all = await liveRows("estimates");
      if (!all.length) return empty("estimate");
      const want = String(a.status || "").trim();
      const rows = _statusAll(want) ? all : all.filter((r) => String(r.status || "").toLowerCase() === want.toLowerCase());
      if (!rows.length) return noMatch("estimate", "estimates", all, want);
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
      const all = await liveRows("reviews");
      if (!all.length) return empty("review");
      const rows = all.filter((r) => {
        const t = Date.parse(_day(r.date || r.at || r.ts));
        return !Number.isFinite(t) || t >= cutoff;
      });
      if (!rows.length) return { window_days: days, count: 0, reviews: [], note: all.length + " review record(s) exist; none dated in the last " + days + " days." };
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
// Versions we actually speak. Claude's connector client may request any of these; if it
// asks for something newer/unknown, spec says answer with our latest supported, not echo.
const PROTOCOLS_SUPPORTED = ["2025-03-26", "2025-06-18", "2025-11-25"];
function rpcResult(id, result) { return { jsonrpc: "2.0", id, result }; }
function rpcError(id, code, message) { return { jsonrpc: "2.0", id, error: { code, message } }; }

async function handleRpc(msg) {
  const { id, method, params } = msg || {};
  if (method === "initialize") {
    const asked = params && params.protocolVersion;
    return rpcResult(id, {
      protocolVersion: PROTOCOLS_SUPPORTED.includes(asked) ? asked : PROTOCOL,
      capabilities: { tools: {} },
      serverInfo: { name: "klyfton-field-os", title: "MGSF Field-OS (Klyfton)", version: "1.1.1-phase1" },
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

async function handler(req, res) {
  // GET: an MCP client asking for text/event-stream is opening a listen stream — we run
  // stateless JSON mode with no server push, so the spec answer is 405 (client then stays
  // POST-only). Plain GET (curl, uptime monitors) keeps the status probe.
  if (req.method === "GET") {
    if (/text\/event-stream/i.test(String(req.headers["accept"] || ""))) {
      res.setHeader("Allow", "POST");
      res.status(405).json({ error: "sse_not_offered", note: "stateless JSON mode; POST JSON-RPC only" });
      return;
    }
    res.status(200).json({ ok: true, server: "klyfton-field-os", phase: 1, transport: "mcp-streamable-http/json", kv: KV_ON, auth_required: true });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }

  // Bearer gate. 401 on any mismatch; no token configured = closed, not open.
  // Accepts the token under MCP_BEARER_TOKEN or common misspellings (underscores/dashes
  // dropped by dashboard entry, any case), value trimmed to survive paste whitespace.
  const auth = String(req.headers["authorization"] || "");
  const token = _bearerToken();
  const expected = "Bearer " + (token || "");
  if (!token || auth !== expected) {
    // RFC 6750 challenge so MCP clients recognize bearer auth. Deliberately no
    // resource_metadata pointer: we run static-header auth, not OAuth discovery —
    // a dangling metadata URL would send Claude on a doomed .well-known crawl.
    res.setHeader("WWW-Authenticate", auth ? 'Bearer realm="mgsf-mcp", error="invalid_token"' : 'Bearer realm="mgsf-mcp"');
    res.status(401).json({ error: "unauthorized" });
    return;
  }

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
    // Alert Nerve piggyback: fire-and-forget, self-debounced (30 min), every error swallowed
    // inside maybeRunAlerts — it can never touch this response or break this request.
    try { require("./alerts").maybeRunAlerts().catch(() => {}); } catch {}
  } catch (e) {
    res.status(200).json(rpcError(body && body.id != null ? body.id : null, -32603, String(e && e.message || e).slice(0, 200)));
  }
}

// Vercel serves the handler; the in-app brain (api/klyfton.js) imports TOOLS so the chat
// and the MCP endpoint share ONE tool implementation — one schema, two consumers, no
// duplicate logic (per MGSF_Klyfton_MCP_Server_Spec). TOOLS stays READ-ONLY.
module.exports = handler;
module.exports.TOOLS = TOOLS;
