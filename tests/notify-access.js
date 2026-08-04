#!/usr/bin/env node
const previous = process.env.CREW_CODE;
process.env.CREW_CODE = "test-crew-code";
const notify = require("../api/notify");
let pass = 0, fail = 0;
function ok(label, cond) { if (cond) pass++; else { fail++; console.error("  FAIL:", label); } }
function response() { return { statusCode: 0, body: null, status(n) { this.statusCode = n; return this; }, json(v) { this.body = v; return this; } }; }
(async () => {
  const denied = response();
  await notify({ method: "POST", headers: {}, body: { testSms: true, smsText: "test" } }, denied);
  ok("denies unauthenticated generic event", denied.statusCode === 401 && denied.body && denied.body.error === "unauthorized");
  const probe = response();
  await notify({ method: "GET", headers: {} }, probe);
  ok("allows non-sensitive status probe", probe.statusCode === 200 && probe.body && typeof probe.body.configured === "boolean");
  if (previous === undefined) delete process.env.CREW_CODE; else process.env.CREW_CODE = previous;
  console.log("\n" + (fail ? "  ✗ " : "  ✓ ") + (pass + fail) + " passed, " + fail + " failed  — generic notification access guard");
  process.exit(fail ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
