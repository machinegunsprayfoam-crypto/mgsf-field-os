#!/usr/bin/env node
// Universal API key generator (api/keygen.js). Run: `node tests/keygen.js`.
// Deterministic/keyless unit tests for normalization, authorization, and token composition.

const path = require("path");
const K = require(path.join(__dirname, "..", "api", "keygen.js"));
let pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.log("  ✗ " + name); } }

console.log("Key generator — security and shape\n");

ok("configured false without env", K.configured({}) === false);
ok("configured true with KEYGEN_SECRET", K.configured({ KEYGEN_SECRET: "x" }) === true);

ok("safeEqual match true", K.safeEqual("abc", "abc") === true);
ok("safeEqual mismatch false", K.safeEqual("abc", "abx") === false);
ok("safeEqual length mismatch false", K.safeEqual("abc", "abcd") === false);

const reqHdr = { headers: { "x-keygen-secret": "gate" }, query: {}, body: {} };
ok("presentedSecret reads header", K.presentedSecret(reqHdr, {}) === "gate");
ok("isAuthorized true on right gate", K.isAuthorized(reqHdr, {}, { KEYGEN_SECRET: "gate" }) === true);
ok("isAuthorized false on wrong gate", K.isAuthorized(reqHdr, {}, { KEYGEN_SECRET: "nope" }) === false);

// The secret must NEVER be accepted from the query string. Query strings are written to
// Vercel access logs, browser history, and the Referer header of any outbound link — and this
// is the endpoint that mints every other credential, so a URL-borne secret here is the worst
// case in the codebase. These assertions exist so the convenience cannot be re-added.
const viaQuery  = { headers: {}, query: { secret: "gate" }, body: {} };
const viaQuery2 = { headers: {}, query: { keygen_secret: "gate" }, body: {} };
ok("?secret= is NOT read as the secret", K.presentedSecret(viaQuery, {}) === "");
ok("?keygen_secret= is NOT read as the secret", K.presentedSecret(viaQuery2, {}) === "");
ok("?secret= does NOT authorize", K.isAuthorized(viaQuery, {}, { KEYGEN_SECRET: "gate" }) === false);
ok("?keygen_secret= does NOT authorize", K.isAuthorized(viaQuery2, {}, { KEYGEN_SECRET: "gate" }) === false);
// the two supported channels keep working
ok("body secret still authorizes", K.isAuthorized({ headers: {}, query: {} }, { secret: "gate" }, { KEYGEN_SECRET: "gate" }) === true);
ok("x-admin-secret header still authorizes", K.isAuthorized({ headers: { "x-admin-secret": "gate" }, query: {} }, {}, { KEYGEN_SECRET: "gate" }) === true);

const n1 = K.normalizeSpec({ purpose: "crew_code" });
ok("preset crew_code resolves", n1.ok && n1.spec.length === 10 && n1.spec.alphabet.includes("A"));
const n2 = K.normalizeSpec({ length: 2, count: 99, prefix: "mgsf!!!@@@" });
ok("length clamped min 8", n2.ok && n2.spec.length === 8);
ok("count clamped max 20", n2.ok && n2.spec.count === 20);
ok("prefix sanitized", n2.ok && n2.spec.prefix === "mgsf");
ok("alphabet too small rejected", K.normalizeSpec({ alphabet: "a" }).ok === false);

const token = K.generateToken(32, "ABCDEF");
ok("generateToken exact length", token.length === 32);
ok("generateToken only alphabet chars", /^[ABCDEF]+$/.test(token));

const key = K.makeKey({ length: 12, alphabet: "abc123", prefix: "mgsf_" });
ok("makeKey adds prefix", key.startsWith("mgsf_"));
ok("makeKey body length exact", key.length === "mgsf_".length + 12);

console.log("\n" + (fail ? "✗" : "✓") + " " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
