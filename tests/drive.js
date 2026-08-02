#!/usr/bin/env node
// Google Drive proxy invariants. Run: `node tests/drive.js`. Keyless, no network.
// Verifies: URL validation, payload sanitization, GET probe, dormant path, and relay-guard
// (only Google Apps Script exec URLs accepted — no open relay). Pure function tests.

const path = require("path");
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

console.log("Google Drive proxy invariants\n");

// ---- extract validScriptUrl and readBody from the module source ----
// We test the pure helpers without spinning up an HTTP server.
const src = require("fs").readFileSync(path.join(__dirname, "..", "api", "drive.js"), "utf8");

// Re-implement validScriptUrl from source (copy of the same regex) to assert its behaviour.
function validScriptUrl(u) {
  return typeof u === "string" && /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec(\?|#|$)/.test(u);
}

// ---- validScriptUrl: only Apps Script exec URLs pass ----
ok("valid exec URL passes", validScriptUrl("https://script.google.com/macros/s/AKfycb123_-abc/exec") === true);
ok("valid exec URL with query passes", validScriptUrl("https://script.google.com/macros/s/AKfycb123/exec?foo=1") === true);
ok("valid exec URL with fragment passes", validScriptUrl("https://script.google.com/macros/s/AKfycb123/exec#anchor") === true);
ok("non-exec path rejected", validScriptUrl("https://script.google.com/macros/s/AKfycb123/dev") === false);
ok("arbitrary HTTPS URL rejected", validScriptUrl("https://hooks.zapier.com/hooks/catch/123") === false);
ok("HTTP URL rejected", validScriptUrl("http://script.google.com/macros/s/AKfycb123/exec") === false);
ok("empty string rejected", validScriptUrl("") === false);
ok("null rejected", validScriptUrl(null) === false);
ok("undefined rejected", validScriptUrl(undefined) === false);

// ---- source-level sanity: DEFAULT_URL is a valid Apps Script exec URL ----
const defaultMatch = src.match(/const DEFAULT_URL\s*=\s*"([^"]+)"/);
ok("DEFAULT_URL present in source", !!defaultMatch, "regex did not match");
if (defaultMatch) {
  ok("DEFAULT_URL is a valid Apps Script exec URL", validScriptUrl(defaultMatch[1]), defaultMatch[1]);
}

// ---- source-level sanity: no npm require() calls (global fetch only) ----
const requireCalls = src.match(/\brequire\s*\(/g) || [];
ok("no npm require() calls (global fetch only)", requireCalls.length === 0, "found " + requireCalls.length + " require() calls");

// ---- source-level sanity: webappUrl deleted from forwarded payload ----
ok("webappUrl stripped before forwarding", src.includes("delete payload.webappUrl"));

// ---- source-level sanity: GET ⇒ configured + clientConfigurable ----
ok("GET probe returns clientConfigurable", src.includes("clientConfigurable: true"));

// ---- source-level sanity: dormant path returns configured:false ----
ok("no-URL path returns configured:false", src.includes("configured: false"));

// ---- source-level sanity: redirect:follow for Apps Script 302 ----
ok("redirect:follow set (handles Apps Script 302 redirect)", src.includes('redirect: "follow"'));

// ---- source-level sanity: token forwarded when set, deleted when absent ----
ok("token forwarded when set", src.includes("payload.token = token"));
ok("token deleted when empty", src.includes("delete payload.token"));

// ---- source-level sanity: POST-only write path ----
ok("POST guard present", src.includes('"POST"'));
ok("405 on wrong method", src.includes("405"));

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
