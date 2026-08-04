#!/usr/bin/env node
const { eventAuthorized } = require("../api/missed-call");
let pass = 0, fail = 0;
function ok(label, cond) { if (cond) pass++; else { fail++; console.error("  FAIL:", label); } }
const env = { MISSED_CALL_WEBHOOK_SECRET: "test-inbound-secret" };
ok("allows events until secret is configured", eventAuthorized({ headers: {}, query: {} }, {}) === true);
ok("accepts matching inbound header", eventAuthorized({ headers: { "x-missed-call-secret": "test-inbound-secret" }, query: {} }, env) === true);
ok("accepts matching query secret for provider compatibility", eventAuthorized({ headers: {}, query: { secret: "test-inbound-secret" } }, env) === true);
ok("rejects missing inbound secret", eventAuthorized({ headers: {}, query: {} }, env) === false);
ok("rejects incorrect inbound secret", eventAuthorized({ headers: { "x-missed-call-secret": "wrong" }, query: {} }, env) === false);
console.log("\n" + (fail ? "  ✗ " : "  ✓ ") + (pass + fail) + " passed, " + fail + " failed  — missed-call inbound webhook guard");
process.exit(fail ? 1 : 0);
