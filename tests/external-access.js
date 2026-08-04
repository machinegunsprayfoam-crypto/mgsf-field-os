#!/usr/bin/env node
const previous = process.env.CREW_CODE;
process.env.CREW_CODE = "test-crew-code";
const hubspot = require("../api/hubspot");
const drive = require("../api/drive");
let pass = 0, fail = 0;
function ok(label, cond) { if (cond) pass++; else { fail++; console.error("  FAIL:", label); } }
function response() { return { statusCode: 0, body: null, headers: {}, setHeader(k,v) { this.headers[k] = v; }, end(v) { this.body = v ? JSON.parse(v) : null; }, status(n) { this.statusCode = n; return this; }, json(v) { this.body = v; } }; }
(async () => {
  for (const [name, handler] of [["HubSpot", hubspot], ["Drive", drive]]) {
    const denied = response(); await handler({ method: "POST", headers: {}, body: {} }, denied);
    ok(`${name} rejects unauthenticated writes`, denied.statusCode === 401 && denied.body && denied.body.error === "unauthorized");
  }
  if (previous === undefined) delete process.env.CREW_CODE; else process.env.CREW_CODE = previous;
  console.log("\n" + (fail ? "  ✗ " : "  ✓ ") + (pass + fail) + " passed, " + fail + " failed  — external integration access guards");
  process.exit(fail ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
