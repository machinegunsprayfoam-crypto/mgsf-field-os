#!/usr/bin/env node
// Klyfton scenario builder — validate/compile + suggest. Run: `node tests/scenarios.js`.
// Pure/deterministic, keyless, no network. Proves a scenario is checked against REAL triggers
// (gearbox events / axle schedules) and the REAL tool bag: valid trigger + existing tools ⇒ ok;
// outward steps require approval; dark tools flag not-runnable; unknown trigger/tool warns. Also
// checks the deterministic keyword suggester produces a real starter.

const path = require("path");
const S = require(path.join(__dirname, "..", "api", "scenarios.js"));
const G = require(path.join(__dirname, "..", "api", "gearbox.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

console.log("Klyfton scenario builder — validate + suggest\n");

// A real event to build on (sourced from gearbox so the test can't drift)
const realEvent = Object.keys(G.HANDLERS || {})[0];
ok("gearbox exposes real trigger events", typeof realEvent === "string" && realEvent.length > 0, realEvent);

// ---- validate: a good scenario on a real trigger + keyless tool ----
const good = S.validateScenario({ trigger: { kind: "event", name: realEvent }, steps: [{ tool: "curriculum" }] }, {});
ok("valid trigger + existing tool ⇒ ok", good.ok === true, JSON.stringify(good.warnings));
ok("keyless tool ⇒ runnable (nothing dark)", good.runnable === true);

// ---- schedule triggers work too ----
ok("schedule trigger 'daily' is valid", S.validateScenario({ trigger: { kind: "schedule", name: "daily" }, steps: [{ tool: "daily-brief" }] }, {}).trigger.valid === true);

// ---- unknown trigger / unknown tool are caught ----
const badTrig = S.validateScenario({ trigger: { kind: "event", name: "not.a.real.event" }, steps: [{ tool: "curriculum" }] }, {});
ok("unknown trigger ⇒ not ok + warned", badTrig.ok === false && /trigger/i.test(badTrig.warnings.join()));
const badTool = S.validateScenario({ trigger: { kind: "event", name: realEvent }, steps: [{ tool: "nonexistent_tool" }] }, {});
ok("unknown tool ⇒ not ok + warned", badTool.ok === false && /unknown tools/i.test(badTool.warnings.join()));
ok("no steps ⇒ not ok", S.validateScenario({ trigger: { kind: "event", name: realEvent }, steps: [] }, {}).ok === false);

// ---- outward step requires approval ----
const outward = S.validateScenario({ trigger: { kind: "event", name: realEvent }, steps: [{ tool: "zapier-bus" }] }, {});
ok("outward step (zapier-bus) ⇒ needsApproval", outward.needsApproval === true);
ok("zapier-bus step marked approval:true", (outward.steps[0] || {}).approval === true);

// ---- dark tool: valid but NOT runnable until switched on; env flips it ----
const darkEnv = S.validateScenario({ trigger: { kind: "event", name: realEvent }, steps: [{ tool: "crm" }] }, {});
ok("dark tool (crm, no key) ⇒ ok but NOT runnable", darkEnv.ok === true && darkEnv.runnable === false);
ok("dark tool step carries an arm hint (how to switch on)", !!(darkEnv.steps[0] && darkEnv.steps[0].arm));
const litEnv = S.validateScenario({ trigger: { kind: "event", name: realEvent }, steps: [{ tool: "crm" }] }, { HUBSPOT_TOKEN: "t" });
ok("setting HUBSPOT_TOKEN makes the crm step runnable", litEnv.runnable === true);

// ---- suggest: deterministic keyword starter with real triggers/tools ----
const sug = S.suggest("when an estimate is sent, text the customer and update HubSpot");
ok("suggest picks the estimate.sent trigger", sug.trigger.name === "estimate.sent");
ok("suggest maps 'text' → sms and 'HubSpot' → crm", sug.steps.some((s) => s.tool === "sms") && sug.steps.some((s) => s.tool === "crm"));
const sugV = S.validateScenario(sug, {});
ok("a suggested scenario passes structural validation", sugV.ok === true, JSON.stringify(sugV.warnings));

console.log("\n" + (fail ? "✗" : "✓") + " " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
