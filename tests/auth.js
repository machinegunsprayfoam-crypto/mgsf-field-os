#!/usr/bin/env node
// Auth endpoint hardening regression check. Account seeding and credential-bearing
// diagnostics must never be exposed by a deployed route.
const fs = require("fs");
const path = require("path");
const source = fs.readFileSync(path.join(__dirname, "..", "api", "auth.js"), "utf8");
let pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.log("  ✗ " + name); } }

console.log("Klyfton auth — deployment hardening\n");
ok("no public account bootstrap route", !/bootstrap/.test(source));
ok("no seed-user roster in deployed handler", !/SEED_USERS|adminCreate/.test(source));
ok("no credential-bearing self-test route", !/selftest/.test(source));
ok("login, token verification, password changes, and owner resets remain supported", /body\.action === "login"/.test(source) && /body\.action === "verify"/.test(source) && /body\.action === "change_password"/.test(source) && /body\.action === "admin_reset"/.test(source));

console.log("\n" + (fail ? "✗" : "✓") + " " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
