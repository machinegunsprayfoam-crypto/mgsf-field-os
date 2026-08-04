#!/usr/bin/env node
const { normalize } = require("../api/lead-intake");
let pass = 0, fail = 0;
function ok(label, cond) { if (cond) pass++; else { fail++; console.error("  FAIL:", label); } }
const valid = normalize({ name: "Ada Customer", phone: "406-555-1234", email: "ada@example.com", service: "Spray foam", sqft: "1200", notes: "Need attic quote" });
ok("accepts complete lead", valid && valid.status === "New" && valid.source === "Web intake");
ok("assigns a server-side id", valid && typeof valid.id === "string" && valid.id.length > 10);
ok("does not trust caller-owned workflow fields", valid && valid.value === 0 && valid.status === "New");
ok("rejects missing required service", normalize({ name: "Ada", phone: "406-555-1234" }) === null);
ok("rejects malformed phone", normalize({ name: "Ada", phone: "nope", service: "Foam" }) === null);
ok("bounds notes", normalize({ name: "Ada", phone: "406-555-1234", service: "Foam", notes: "x".repeat(2500) }).notes.length === 2000);
console.log("\n" + (fail ? "  ✗ " : "  ✓ ") + (pass + fail) + " passed, " + fail + " failed  — public lead intake validation");
process.exit(fail ? 1 : 0);
