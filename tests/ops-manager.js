#!/usr/bin/env node
// Ops Manager — the foreman over the doer agents. Tests the pure supervise() core: it ranks the
// crew's next actions by REVENUE/RISK, surfaces dark-tool blockers as escalations, derives each
// agent's station, and rolls one owner summary. Deterministic, keyless, no network. Run:
// `node tests/ops-manager.js`.

const path = require("path");
const O = require(path.join(__dirname, "..", "api", "ops-manager.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

console.log("Ops Manager — foreman rollup over the doer agents\n");

// Fake doer plans in the exact shape agents.plan()/planSubCompliance() return.
const PLANS = [
  { ok: true, agent: "pm", label: "Project Manager / Job Runner", goal: "drive jobs",
    count: 1, ready: 1, steps: [{ who: "Moe", stage: "in_progress", action: "photo update", tool: "portal", live: true, approval: false }] },
  { ok: true, agent: "collector", label: "Collector", goal: "chase AR",
    count: 2, ready: 1, steps: [
      { who: "Ray", stage: "invoiced", action: "AR reminder", tool: "arms", live: true, approval: true },
      { who: "Deb", stage: "invoiced", action: "AR reminder", tool: "arms", live: false, approval: true, blockedBy: "ALERTS_WEBHOOK_URL" },
    ] },
  { ok: true, agent: "lead-closer", label: "Lead Closer", goal: "speed to lead",
    count: 1, ready: 1, steps: [{ who: "Sam", stage: "lead", action: "first contact", tool: "arms", live: true, approval: true }] },
  { ok: false, error: "unknown_agent" }, // must be ignored, not crash
];

const r = O.supervise(PLANS, "2026-08-09T10:00:00Z");

ok("returns a foreman rollup", r.ok === true && r.agent === "ops-manager" && r.label === "Ops Manager");
ok("bad/!ok plans are skipped, not crashed", r.counts.agents === 3);
ok("collector (cash) outranks lead-closer outranks pm", (() => {
  const order = r.priorities.map((p) => p.agent);
  return order.indexOf("collector") < order.indexOf("lead-closer") && order.indexOf("lead-closer") < order.indexOf("pm");
})(), r.priorities.map((p) => p.agent + ":" + p.score).join(", "));
ok("top priority is the collector's live AR chase (Ray), with a revenue/risk 'why'", (() => {
  const t = r.priorities[0]; return t.agent === "collector" && t.who === "Ray" && /cash in hand/i.test(t.why);
})());
ok("a ready step outranks the same agent's blocked step", (() => {
  const ray = r.priorities.findIndex((p) => p.who === "Ray");
  const deb = r.priorities.findIndex((p) => p.who === "Deb");
  return ray < deb;
})());
ok("blocked-on-dark-tool step becomes an escalation naming the missing env", (() => {
  const e = r.escalations.find((x) => x.who === "Deb");
  return r.counts.escalations === 1 && e && e.blocked === true && e.blockedBy === "ALERTS_WEBHOOK_URL";
})());
ok("counts are right (3 desks, 3 ready steps of 4 total, 1 escalation)", r.counts.steps === 4 && r.counts.ready === 3 && r.counts.escalations === 1);
ok("each agent gets a station (working when it has ready steps)", (() => {
  const c = r.stations.find((s) => s.agent === "collector");
  return r.stations.length === 3 && c && c.status === "working";
})());
ok("summary is one owner line naming the top pick", /ready action/.test(r.summary) && /Top: Collector → Ray/.test(r.summary));
ok("top is capped at 5", Array.isArray(r.top) && r.top.length <= 5);
ok("foreman is recommend-only (never auto-sends)", /never auto-sends/i.test(r.note));

// ---- empty crew ----
const empty = O.supervise([], "T");
ok("empty crew ⇒ 'all quiet', zero counts", /all quiet/i.test(empty.summary) && empty.counts.steps === 0 && empty.priorities.length === 0);

// ---- in-app step (live==null) is neither ready nor blocked ----
const inapp = O.supervise([{ ok: true, agent: "pm", label: "PM", goal: "g", steps: [{ who: "X", stage: "paid", action: "review", tool: null, live: null, approval: false }] }], "T");
ok("in-app step (live null) counts as neither ready nor blocked", inapp.counts.ready === 0 && inapp.counts.escalations === 0 && inapp.priorities[0].inApp === true);

console.log("\n" + (fail ? "✗ " : "✓ ") + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
