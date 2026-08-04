#!/usr/bin/env node
const cron = require("../api/cron-guard");
let pass = 0, fail = 0;
function ok(label, cond) { if (cond) pass++; else { fail++; console.error("  FAIL:", label); } }
const env = { CRON_SECRET: "test-secret" };
ok("allows when CRON_SECRET is absent", cron.ok({ headers: {} }, {}) === true);
ok("accepts Vercel bearer authorization", cron.ok({ headers: { authorization: "Bearer test-secret" } }, env) === true);
ok("accepts explicit cron header", cron.ok({ headers: { "x-cron-secret": "test-secret" } }, env) === true);
ok("rejects missing authorization", cron.ok({ headers: {} }, env) === false);
ok("rejects incorrect authorization", cron.ok({ headers: { authorization: "Bearer wrong" } }, env) === false);
ok("denial response hides the secret", JSON.stringify(cron.denied()).includes("test-secret") === false);
console.log("\n" + (fail ? "  ✗ " : "  ✓ ") + (pass + fail) + " passed, " + fail + " failed  — cron trigger access guard");
process.exit(fail ? 1 : 0);
