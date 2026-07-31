#!/usr/bin/env node
// Redact guardrail invariants — secrets always masked, contact PII only on request,
// no false positives on ordinary trade text. Run: `node tests/redact.js`. Pure, keyless.

const path = require("path");
const R = require(path.join(__dirname, "..", "api", "redact.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }
const has = (r, type) => r.found.some((f) => f.type === type);

console.log("Redact guardrail invariants\n");

// ---- secrets always masked ----
(() => {
  const r = R.redact("my key is sk-ABC123def456ghi789 ok");
  ok("api key masked", r.text.indexOf("sk-ABC123def456ghi789") === -1 && has(r, "api_key"), r.text);
  ok("redacted flag set", r.redacted === true);
})();
ok("AWS key masked", R.redact("AKIAIOSFODNN7EXAMPLE").text.indexOf("AKIA") === -1);
ok("github token masked", R.redact("ghp_16charslongtoken1234").text.indexOf("ghp_") === -1);
ok("SSN masked", has(R.redact("SSN 123-45-6789"), "ssn"));
ok("Bearer token masked", has(R.redact("Authorization: Bearer abcdef0123456789ABCDEF"), "bearer"));
(() => {
  const pk = "-----BEGIN RSA PRIVATE KEY-----\nMIIEabc\n-----END RSA PRIVATE KEY-----";
  ok("private key block masked", R.redact(pk).text.indexOf("MIIEabc") === -1 && has(R.redact(pk), "private_key"));
})();

// ---- credit card: Luhn-valid masked, Luhn-invalid / ordinary numbers left alone ----
ok("valid Visa test number masked", has(R.redact("card 4111 1111 1111 1111"), "credit_card"));
ok("invalid 16-digit number NOT masked", !has(R.redact("id 1234 5678 9012 3456"), "credit_card"));
ok("luhnValid true for 4111111111111111", R.luhnValid("4111111111111111") === true);
ok("luhnValid false for 4111111111111112", R.luhnValid("4111111111111112") === false);

// ---- ordinary trade text is untouched (no false positives) ----
(() => {
  const trade = "Spray 2400 sqft at 3 inches closed cell, R-21, 2 sets, WY x1.12, $1,200 min.";
  const r = R.redact(trade);
  ok("trade text unchanged", r.text === trade && r.redacted === false, r.text);
})();

// ---- contact PII: only masked when opts.contact ----
(() => {
  const t = "call 406-939-8301 or email clifton@machinegunsprayfoam.info";
  const off = R.redact(t);
  ok("contact NOT masked by default", off.text === t && off.redacted === false);
  const on = R.redact(t, { contact: true });
  ok("email masked with contact:true", on.text.indexOf("@machinegunsprayfoam") === -1 && has(on, "email"));
  ok("phone masked with contact:true", on.text.indexOf("406-939-8301") === -1 && has(on, "phone"));
})();

// ---- sanitizeForModel: secrets only, returns flag ----
(() => {
  const s = R.sanitizeForModel("here is sk-SECRETkey1234567890 and my phone 406-939-8301");
  ok("sanitize strips the secret", s.text.indexOf("sk-SECRETkey") === -1);
  ok("sanitize keeps the phone (secrets only)", s.text.indexOf("406-939-8301") >= 0, s.text);
  ok("sanitize reports redacted:true", s.redacted === true);
})();

// ---- resilience ----
ok("null ⇒ no throw, empty", (() => { try { const r = R.redact(null); return r.text === "" && r.redacted === false; } catch (e) { return false; } })());
ok("number input ⇒ no throw", (() => { try { R.redact(12345); return true; } catch (e) { return false; } })());
ok("counts multiple hits", R.redact("sk-aaaaaaaaaaaa and sk-bbbbbbbbbbbb").found.find((f) => f.type === "api_key").count === 2);

console.log("\n" + (fail ? "✗" : "✓") + " " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
