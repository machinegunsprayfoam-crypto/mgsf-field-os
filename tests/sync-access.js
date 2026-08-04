#!/usr/bin/env node
const previous = process.env.CREW_CODE;
process.env.CREW_CODE = "test-crew-code";
const sync = require("../api/sync");
let pass = 0, fail = 0;
function ok(label, cond) { if (cond) pass++; else { fail++; console.error("  FAIL:", label); } }
function response() {
  return { statusCode: 0, body: null, status(n) { this.statusCode = n; return this; }, json(v) { this.body = v; return this; } };
}
(async () => {
  const denied = response();
  await sync({ method: "GET", headers: {}, query: {} }, denied);
  ok("denies unauthenticated cloud-sync read", denied.statusCode === 401 && denied.body && denied.body.error === "unauthorized");
  const allowed = response();
  await sync({ method: "GET", headers: { "x-crew-code": "test-crew-code" }, query: {} }, allowed);
  ok("allows authenticated cloud-sync read", allowed.statusCode === 200 && allowed.body && allowed.body.configured === false);
  if (previous === undefined) delete process.env.CREW_CODE; else process.env.CREW_CODE = previous;
  console.log("\n" + (fail ? "  ✗ " : "  ✓ ") + (pass + fail) + " passed, " + fail + " failed  — cloud-sync access guard");
  process.exit(fail ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
