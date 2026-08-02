#!/usr/bin/env node
// Meta — guards repo integrity that has no other test. Run: `node tests/meta-suites.js`. Deterministic,
// keyless. Two invariants:
//  (1) TEST REGISTRY: a new tests/<x>.js not added to run-all.js's SUITES array SILENTLY never runs
//      (coverage lost, no error); a SUITES entry with no file is a dead reference. tests/ ↔ SUITES 1:1.
//  (2) DB GO-LIVE DOCS: every db/*.sql must be listed in db/SETUP.md's run-order — else at go-live the
//      owner runs the checklist, misses a table, and a subsystem stays dark with no obvious cause.

const fs = require("fs");
const path = require("path");
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

console.log("Meta — test harness registry integrity\n");

const testsDir = __dirname;
// every tests/*.js on disk, minus the runner itself
const files = fs.readdirSync(testsDir)
  .filter((f) => f.endsWith(".js") && f !== "run-all.js")
  .map((f) => f.replace(/\.js$/, ""))
  .sort();

// names registered in run-all.js SUITES (entries look like:  ["name", "description"],)
const runAll = fs.readFileSync(path.join(testsDir, "run-all.js"), "utf8");
const registered = [...runAll.matchAll(/\[\s*"([a-z0-9-]+)"\s*,/g)].map((m) => m[1]).sort();
const regSet = new Set(registered);
const fileSet = new Set(files);

ok("run-all.js SUITES is non-trivial", registered.length >= 40, String(registered.length));
ok("no duplicate SUITES entries", registered.length === regSet.size);

const unregistered = files.filter((f) => !regSet.has(f));
ok("every tests/*.js is registered in run-all.js (no silently-skipped suite)", unregistered.length === 0, unregistered.join(","));

const dangling = registered.filter((r) => !fileSet.has(r));
ok("every SUITES entry has a matching tests/<name>.js (no dead reference)", dangling.length === 0, dangling.join(","));

ok("this meta-suite is itself registered", regSet.has("meta-suites"));

// ---- (2) DB go-live docs: every db/*.sql is listed in db/SETUP.md's run-order ----
const dbDir = path.join(testsDir, "..", "db");
const setupPath = path.join(dbDir, "SETUP.md");
if (fs.existsSync(dbDir) && fs.existsSync(setupPath)) {
  const sqlFiles = fs.readdirSync(dbDir).filter((f) => f.endsWith(".sql")).sort();
  const setup = fs.readFileSync(setupPath, "utf8");
  const undocumented = sqlFiles.filter((f) => !setup.includes(f));
  ok("db/ has SQL schema files", sqlFiles.length >= 1, String(sqlFiles.length));
  ok("every db/*.sql is listed in db/SETUP.md (owner won't miss a table at go-live)", undocumented.length === 0, undocumented.join(","));
} else {
  ok("db/ + SETUP.md present to audit", false, "missing db dir or SETUP.md");
}

console.log("\n" + (fail ? "✗ " : "✓ ") + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
