#!/usr/bin/env node
// Meta — guards repo integrity that has no other test. Run: `node tests/meta-suites.js`. Deterministic,
// keyless. Two invariants:
//  (1) TEST REGISTRY: a new tests/<x>.js not added to run-all.js's SUITES array SILENTLY never runs
//      (coverage lost, no error); a SUITES entry with no file is a dead reference. tests/ ↔ SUITES 1:1.
//  (2) DB GO-LIVE DOCS: every db/*.sql must be listed in db/SETUP.md's run-order — else at go-live the
//      owner runs the checklist, misses a table, and a subsystem stays dark with no obvious cause.
//  (3) ENV GO-LIVE DOCS: every process.env.X the code reads must be documented in .env.example (or be a
//      known fallback alias) — else the owner never knows to set it and the subsystem stays dark. Same
//      failure class as (2), for env vars. The alias allowlist is itself guarded against going stale.

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

// ---- (3) env go-live docs: every process.env.X read by code is documented in .env.example ----
// Fallback aliases the code accepts but that share a documented primary's slot (see .env.example
// comments). Each MUST actually be read by code, or this allowlist has gone stale.
const ENV_ALIASES = {
  HUBSPOT_API_KEY: "HUBSPOT_TOKEN", SAMGOV_API_KEY: "SAM_API_KEY", MAPS_API_KEY: "GOOGLE_MAPS_API_KEY",
  GOOGLE_APPS_SCRIPT_URL: "GDRIVE_WEBAPP_URL", NOTIFY_WEBHOOK_URL: "ALERTS_WEBHOOK_URL",
  TWILIO_FROM: "TWILIO_PHONE_NUMBER", ALERT_SMS_TO: "OWNER_SMS", ALERTS_WEBHOOK_SECRET: "WEBHOOK_SECRET",
};
const root = path.join(testsDir, "..");
const envExamplePath = path.join(root, ".env.example");
function walkJs(dir) {
  let out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out = out.concat(walkJs(p));
    else if (e.name.endsWith(".js")) out.push(p);
  }
  return out;
}
if (fs.existsSync(envExamplePath)) {
  const codeDirs = ["api", "lib"].map((d) => path.join(root, d)).filter((d) => fs.existsSync(d));
  const read = new Set();
  codeDirs.flatMap(walkJs).forEach((f) => {
    const src = fs.readFileSync(f, "utf8");
    for (const m of src.matchAll(/process\.env\.([A-Z0-9_]+)/g)) read.add(m[1]);
    // Registry-style reads: this codebase's hub modules (api/provider.js) keep env var NAMES
    // as data and read them via process.env[spec.key], which the literal scan above cannot
    // see. Without this, a whole family of keys can be read by code, undocumented, and still
    // report all-clear — exactly how 7 provider keys (5 of them free) stayed invisible.
    for (const m of src.matchAll(/(?:key|urlEnv):\s*"([A-Z][A-Z0-9]*_[A-Z0-9_]+)"/g)) read.add(m[1]);
  });
  const example = fs.readFileSync(envExamplePath, "utf8");
  const documented = new Set([...example.matchAll(/^([A-Z0-9_]+)=/gm)].map((m) => m[1]));
  const aliasNames = new Set(Object.keys(ENV_ALIASES));

  ok(".env.example documents a non-trivial number of vars", documented.size >= 25, String(documented.size));
  ok("code reads a non-trivial number of env vars", read.size >= 25, String(read.size));

  const undocumented = [...read].filter((v) => !documented.has(v) && !aliasNames.has(v)).sort();
  ok("every process.env var is documented in .env.example (or a known alias)", undocumented.length === 0, undocumented.join(","));

  // the alias allowlist must not rot: every alias is actually read, and its primary is documented
  const staleAlias = [...aliasNames].filter((a) => !read.has(a)).sort();
  ok("every ENV_ALIAS is actually read by code (no stale allowlist entry)", staleAlias.length === 0, staleAlias.join(","));
  const aliasNoPrimary = Object.entries(ENV_ALIASES).filter(([, prim]) => !documented.has(prim)).map(([a]) => a).sort();
  ok("every alias's documented primary is in .env.example", aliasNoPrimary.length === 0, aliasNoPrimary.join(","));
} else {
  ok(".env.example present to audit", false, "missing .env.example");
}

console.log("\n" + (fail ? "✗ " : "✓ ") + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
