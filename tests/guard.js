#!/usr/bin/env node
// Klyfton access guard — CREW_CODE gate semantics. Run: `node tests/guard.js`. Keyless, no network.
// The critical properties: DORMANT (no lockout) until CREW_CODE is set; once set, only the right
// code (header/query/body) passes; wrong/missing code is denied; compare is length-safe.

const path = require("path");
const G = require(path.join(__dirname, "..", "api", "guard.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

console.log("Klyfton guard — CREW_CODE gate\n");

// ---- DORMANT: no CREW_CODE ⇒ everything allowed (never locks anyone out) ----
ok("unset CREW_CODE ⇒ ok (dormant, no lockout)", G.ok({ headers: {} }, {}) === true);
ok("unset CREW_CODE ⇒ ok even with a random code present", G.ok({ headers: { "x-crew-code": "whatever" } }, {}) === true);

// ---- ENFORCED: CREW_CODE set ⇒ must present the right code ----
const ENV = { CREW_CODE: "s3cret" };
ok("set + no code ⇒ denied", G.ok({ headers: {} }, ENV) === false);
ok("set + correct code in x-crew-code header ⇒ ok", G.ok({ headers: { "x-crew-code": "s3cret" } }, ENV) === true);
ok("set + correct code in ?code= ⇒ ok", G.ok({ headers: {}, query: { code: "s3cret" } }, ENV) === true);
ok("set + correct code in body ⇒ ok", G.ok({ headers: {}, body: { code: "s3cret" } }, ENV) === true);
ok("set + body as JSON string ⇒ parsed + ok", G.ok({ headers: {}, body: JSON.stringify({ code: "s3cret" }) }, ENV) === true);
ok("set + WRONG code ⇒ denied", G.ok({ headers: { "x-crew-code": "nope" } }, ENV) === false);

// ---- present() extraction + safeEqual ----
ok("present() reads header/query/body", G.present({ headers: { "x-crew-code": "h" } }) === "h" && G.present({ query: { code: "q" } }) === "q");
ok("present() no code ⇒ empty string, no throw", G.present({}) === "");
ok("safeEqual true on match", G.safeEqual("abc", "abc") === true);
ok("safeEqual false on mismatch", G.safeEqual("abc", "abd") === false);
ok("safeEqual false on length mismatch", G.safeEqual("abc", "abcd") === false);

// ---- denied() shape ----
ok("denied() ⇒ 401-style body, no secret echoed", (() => { const d = G.denied(); return d.ok === false && d.error === "unauthorized" && !/s3cret/.test(JSON.stringify(d)); })());

console.log("\n" + (fail ? "✗" : "✓") + " " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
