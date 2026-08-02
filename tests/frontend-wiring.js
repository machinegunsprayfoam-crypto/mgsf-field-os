#!/usr/bin/env node
// Frontend wiring integrity (public/index.html) — guards two "dead UI" regression classes that are
// easy to introduce in a 13k-line single-file app and invisible until a user taps the thing:
//   (1) DEAD BUTTON — an on{click,change,input,submit}="fn(…)" whose leading function is never defined
//       anywhere in the page (renamed/removed handler → the button silently does nothing).
//   (2) DEAD NAV — a switchModule('x') target with no matching <div id="mod-x"> container (tab opens
//       to nothing) or vice-versa.
// A manual QA sweep found these clean once (PROJECT_MEMORY); this makes it permanent — every frontend
// feature added (owner tools, portal share, workflow board, estimator compare, gov-programs…) stays wired.
// Run: `node tests/frontend-wiring.js`. Deterministic, keyless, no network, node-only (parses the HTML).

const fs = require("fs");
const path = require("path");

let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

console.log("Frontend wiring integrity (public/index.html)\n");

const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

// ---- collect every defined name (functions, window.X, const/let/var assignments, obj-literal methods) ----
const defs = new Set();
for (const m of html.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)) defs.add(m[1]);
for (const m of html.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=/g)) defs.add(m[1]);
for (const m of html.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function|\()/g)) defs.add(m[1]);
for (const m of html.matchAll(/([A-Za-z_$][\w$]*)\s*[:=]\s*(?:async\s*)?function/g)) defs.add(m[1]);
ok("index.html defines a non-trivial number of functions", defs.size >= 200, String(defs.size));

// ---- (1) DEAD BUTTON: every inline event handler's leading call resolves to a definition ----
// Globals/builtins/keywords that legitimately lead a handler expression and are never "defined" here.
const GLOBAL = new Set(["switchModule", "alert", "confirm", "prompt", "print", "open", "location", "history",
  "event", "navigator", "window", "document", "console", "setTimeout", "setInterval", "JSON", "Math", "Number",
  "String", "Boolean", "Array", "Object", "Date", "parseInt", "parseFloat", "isNaN", "encodeURIComponent",
  "decodeURIComponent", "this", "if", "return", "void", "typeof", "new", "delete", "for", "while"]);
const handlers = {};
for (const m of html.matchAll(/on(?:click|change|input|submit|keyup|keydown)="\s*([A-Za-z_$][\w$]*)\s*\(/g)) {
  handlers[m[1]] = (handlers[m[1]] || 0) + 1;
}
const handlerNames = Object.keys(handlers);
ok("index.html has a non-trivial number of inline handlers", handlerNames.length >= 100, String(handlerNames.length));
const deadButtons = handlerNames.filter((n) => !defs.has(n) && !GLOBAL.has(n));
ok("every inline event handler resolves to a defined function (no dead buttons)", deadButtons.length === 0, deadButtons.join(", "));

// ---- (2) DEAD NAV: switchModule('x') targets ↔ <div id="mod-x"> containers are 1:1 reachable ----
const navTargets = new Set([...html.matchAll(/switchModule\(\s*['"]([a-z0-9-]+)['"]/g)].map((m) => m[1]));
const modContainers = new Set([...html.matchAll(/id="mod-([a-z0-9-]+)"/g)].map((m) => m[1]));
ok("switchModule targets found", navTargets.size >= 20, String(navTargets.size));
ok("mod- containers found", modContainers.size >= 20, String(modContainers.size));
const navNoContainer = [...navTargets].filter((t) => !modContainers.has(t));
ok("every switchModule('x') target has a <div id=mod-x> container (no dead nav)", navNoContainer.length === 0, navNoContainer.join(", "));

// ---- spot-check: this session's new handlers are actually wired (regression anchors) ----
["renderBizAudit", "renderPredictCost", "renderWorkflow", "sharePortalLink", "renderGovPrograms", "calcComparePast", "saveEstimate", "createLeadFromEstimate"]
  .forEach((fn) => ok("critical handler defined: " + fn, defs.has(fn)));

console.log("\n" + (fail ? "✗ " : "✓ ") + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
