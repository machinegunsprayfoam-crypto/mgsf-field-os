#!/usr/bin/env node
// MCP server (api/mcp.js) tests — the status-filter contract that hid live leads on 2026-08-04.
// Covers: gated (no KV) honesty; "all"/"any"/omit as wildcards (never literal statuses);
// filter-miss vs empty-store are DIFFERENT answers (noMatch note vs not_tracked_yet);
// case-insensitive match; tombstone exclusion; limit + sort; review window honesty.
// Run: `node tests/mcp.js`. KV is stubbed via global.fetch — no network, no real store.

const path = require("path");
const MCP_PATH = path.join(__dirname, "..", "api", "mcp.js");
let pass = 0, fail = 0;
function ok(n, c, d) { if (c) pass++; else { fail++; console.log("  ✗ " + n + (d ? "  [" + (typeof d === "string" ? d : JSON.stringify(d)) + "]" : "")); } }
function fresh() { delete require.cache[require.resolve(MCP_PATH)]; return require(MCP_PATH); }

console.log("MCP server (Phase 1 read-only) tests\n");

(async () => {
  // ---- 1) gated: no KV env -> configured:false, never fabricates ----
  const gated = fresh();
  ok("exports 9 read-only tools", Object.keys(gated.TOOLS).length === 9, Object.keys(gated.TOOLS).join(","));
  const g = await gated.TOOLS.list_leads.run({ status: "all" });
  ok("no KV -> configured:false (not a fake empty)", g.configured === false && !g.not_tracked_yet, g);

  // ---- live: stub KV behind global.fetch, mutable store ----
  process.env.KV_REST_API_URL = "http://kv.test";
  process.env.KV_REST_API_TOKEN = "test-token";
  const STORE = {
    "mgsf:leads": [
      { id: "L1", name: "Alpha", status: "New", date: "2026-08-03" },
      { id: "L2", name: "Bravo", status: "New", date: "2026-07-29" },
      { id: "L3", name: "Charlie", status: "Contacted", date: "2026-07-20" },
      { id: "L9", name: "Tombed", status: "New", date: "2026-07-01" },
    ],
    "mgsf:_tomb": [{ c: "leads", id: "L9" }],
    "mgsf:estimates": [
      { id: "E1", customer: "Delta", status: "open", date: "2026-07-25" },
      { id: "E2", customer: "Echo", status: "accepted", date: "2026-07-10" },
    ],
    "mgsf:reviews": [{ id: "R1", customer: "Foxtrot", date: "2020-01-01" }],
  };
  const realFetch = global.fetch;
  global.fetch = async (url) => {
    const key = decodeURIComponent(String(url).split("/get/")[1] || "");
    return { ok: true, json: async () => ({ result: JSON.stringify(STORE[key] || []) }) };
  };
  const live = fresh();
  const L = live.TOOLS.list_leads.run.bind(null);
  const E = live.TOOLS.list_estimates.run.bind(null);
  const R = live.TOOLS.review_ask_status.run.bind(null);

  // ---- 2) wildcard sentinels ----
  let r = await L({});
  ok("omit status -> every live lead", r.count === 3, r);
  r = await L({ status: "all" });
  ok('"all" is a wildcard, not a literal status', r.count === 3 && !r.not_tracked_yet, r);
  r = await L({ status: "ANY" });
  ok('"ANY" (any case) is a wildcard too', r.count === 3, r);
  ok("newest date sorts first", r.leads[0].id === "L1", r.leads.map((x) => x.id).join(","));
  ok("tombstoned lead stays deleted", !r.leads.some((x) => x.id === "L9"));

  // ---- 3) real filters ----
  r = await L({ status: "new" });
  ok("status match is case-insensitive", r.count === 2, r);
  r = await L({ status: "New", limit: 1 });
  ok("limit caps rows, count stays total-matching", r.leads.length === 1 && r.count === 2, r);

  // ---- 4) filter-miss vs empty-store are different answers ----
  r = await L({ status: "Quoted" });
  ok("zero-match -> count:0 + note, NEVER not_tracked_yet", r.count === 0 && !r.not_tracked_yet && /3 lead record/.test(r.note), r);
  ok("zero-match names the statuses that DO exist", (r.statuses_present || []).includes("New") && (r.statuses_present || []).includes("Contacted"), r.statuses_present);
  STORE["mgsf:leads"] = [];
  r = await L({ status: "all" });
  ok("truly empty store -> not_tracked_yet (honest beats empty)", r.not_tracked_yet === true, r);

  // ---- 5) estimates: same contract + days_open survives ----
  r = await E({ status: "all" });
  ok("estimates: \"all\" wildcard", r.count === 2, r);
  r = await E({ status: "open" });
  ok("estimates: filter works, days_open computed", r.count === 1 && Number.isFinite(r.estimates[0].days_open), r);
  r = await E({ status: "declined" });
  ok("estimates: zero-match -> note, not not_tracked_yet", r.count === 0 && !r.not_tracked_yet && /2 estimate record/.test(r.note), r);
  STORE["mgsf:estimates"] = [];
  r = await E({ status: "open" });
  ok("estimates: empty store -> not_tracked_yet", r.not_tracked_yet === true, r);

  // ---- 6) review window: out-of-window is not "empty store" ----
  r = await R({ days: 30 });
  ok("reviews exist but out of window -> count:0 + note", r.count === 0 && !r.not_tracked_yet && /1 review record/.test(r.note), r);
  STORE["mgsf:reviews"].push({ id: "R2", customer: "Golf", date: new Date().toISOString() });
  r = await R({ days: 30 });
  ok("in-window review shows up", r.count === 1 && r.reviews[0].id === "R2", r);
  STORE["mgsf:reviews"] = [];
  r = await R({ days: 30 });
  ok("reviews: empty store -> not_tracked_yet", r.not_tracked_yet === true, r);

  global.fetch = realFetch;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  console.log("\n" + pass + " passed, " + fail + " failed.");
  process.exit(fail ? 1 : 0);
})();
