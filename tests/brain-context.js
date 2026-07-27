#!/usr/bin/env node
// Brain live-data grounding tests (Roadmap #2). Validates the pure summarize() core + that gather()
// is gated (not-configured with no KV/HubSpot) and never fabricates. Run: `node tests/brain-context.js`.

const path = require("path");
const C = require(path.join(__dirname, "..", "api", "brain-context.js"));
let pass = 0, fail = 0;
function ok(n, c, d) { if (c) pass++; else { fail++; console.log("  ✗ " + n + (d ? "  [" + d + "]" : "")); } }

console.log("Brain live-data grounding tests\n");

// fixed clock: 2026-07-27
const NOW = Date.parse("2026-07-27T12:00:00Z");
const data = {
  leads: [
    { name: "A", status: "new", date: "2026-07-26", value: 5000 },     // open, fresh
    { name: "B", status: "open", date: "2026-07-10", value: 8000 },     // open, cold (>7d)
    { name: "C", status: "won", date: "2026-07-01", value: 9000 },      // closed — excluded
    { name: "D", status: "quoted", date: "2026-07-05", value: 4000 },   // open, cold
  ],
  jobs: [
    { customer: "E", status: "scheduled", value: 12000 },
    { customer: "F", status: "in progress", value: 8000 },
    { customer: "G", status: "complete", value: 6000 },                 // not active
  ],
  estimates: [
    { customer: "H", status: "sent", total: 15000 },                    // unsold
    { customer: "I", status: "accepted", total: 20000 },                // sold — excluded
    { customer: "J", status: "draft", total: 5000 },                    // unsold
  ],
};

const s = C.summarize(data, NOW);
ok("openLeads = 3 (excludes won)", s.summary.openLeads === 3, s.summary.openLeads);
ok("coldLeads = 2 (>7d open)", s.summary.coldLeads === 2, s.summary.coldLeads);
ok("activeJobs = 2 (excludes complete)", s.summary.activeJobs === 2, s.summary.activeJobs);
ok("activeJobsValue = 20000", s.summary.activeJobsValue === 20000, s.summary.activeJobsValue);
ok("unsoldEstimates = 2 (excludes accepted)", s.summary.unsoldEstimates === 2, s.summary.unsoldEstimates);
ok("unsoldValue = 20000", s.summary.unsoldValue === 20000, s.summary.unsoldValue);
ok("context mentions the real counts", /3 open lead/.test(s.context) && /2 cold/.test(s.context) && /2 active job/.test(s.context), s.context);
ok("context is non-empty when data present", s.hasData === true);

// empty data -> empty context, no fabrication
const e = C.summarize({}, NOW);
ok("no data -> empty context (no fabrication)", e.context === "" && e.hasData === false);
ok("no data -> zeroed summary", e.summary.openLeads === 0 && e.summary.unsoldValue === 0);

// gated: with no KV/HubSpot env in this sandbox, gather() reports not-configured, empty context
(async () => {
  const st = C.status();
  const g = await C.gather({ now: NOW });
  ok("status(): kv/hubspot both off in sandbox", st.kv === false && st.hubspot === false, JSON.stringify(st));
  ok("gather() gated -> configured:false", g.ok === true && g.configured === false, JSON.stringify(g).slice(0, 80));
  ok("gather() gated -> empty context (brain adds nothing)", g.context === "");
  console.log("\n" + pass + " passed, " + fail + " failed.");
  process.exit(fail ? 1 : 0);
})();
