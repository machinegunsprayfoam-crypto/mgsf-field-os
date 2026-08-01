#!/usr/bin/env node
// Meta — guards the test harness itself. Run: `node tests/meta-suites.js`. Deterministic, keyless.
// A new tests/<x>.js that isn't added to run-all.js's SUITES array SILENTLY never runs — coverage
// lost with no error. And a SUITES entry with no matching file is a dead reference. This asserts the
// tests/ directory and the SUITES registry stay in 1:1 sync (this file included), so neither drifts.

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

console.log("\n" + (fail ? "✗ " : "✓ ") + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
