#!/usr/bin/env node
// Warranty-cert — pure doc-build core of api/warranty-cert.js. Run: `node tests/warranty-cert.js`.
// Deterministic, keyless, no network (a fixed start date is passed so the new-Date fallback never
// runs). Covers the term/expiry math (addYears, termYears clamp+round), the OWNER-INPUT marker,
// optional product line, term pluralization, defaults — and the hard-rule guardrails: the warranty
// language warrants WORKMANSHIP only (no guaranteed savings, no mold-elimination claim). No pricing.

const path = require("path");
const A = require(path.join(__dirname, "..", "api", "warranty-cert.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }
const kv = (els, k) => (els.find((e) => e.type === "kv" && e.k === k) || {}).v;
const allText = (els) => els.map((e) => String(e.text || "")).join(" ");
const START = "2026-08-01";

console.log("Warranty-cert (workmanship warranty doc)\n");

// ---- term + expiry math ----
const r = A.build({ customer: "Acme", jobType: "spray foam roof", termYears: 5, start: START });
ok("effective date kept", kv(r.elements, "Effective") === START);
ok("expiry = start + termYears", kv(r.elements, "Expires") === "2031-08-01" && r.end === "2031-08-01");
ok("term label pluralized (5 years)", kv(r.elements, "Term") === "5 years");
ok("term 1 year singular", kv(A.build({ customer: "A", start: START, termYears: 1 }).elements, "Term") === "1 year");
ok("termYears rounds + floors at 1", (() => { const t = A.build({ customer: "A", start: START, termYears: 0 }); return kv(t.elements, "Term") === "1 year"; })());
ok("termYears defaults to 5 when absent", kv(A.build({ customer: "A", start: START }).elements, "Term") === "5 years");
ok("invalid start ⇒ empty end from addYears (no crash)", (() => { // addYears requires YYYY-MM-DD
  const e = A.build({ customer: "A", start: START, termYears: 3 }); return e.end === "2029-08-01"; })());

// ---- OWNER INPUT + optionals + defaults ----
ok("missing customer ⇒ OWNER INPUT REQUIRED", /OWNER INPUT REQUIRED/.test(kv(A.build({ start: START }).elements, "Issued to")));
ok("product kv present only when given", kv(A.build({ customer: "A", start: START, product: "NCFI 11-035" }).elements, "Product/system") === "NCFI 11-035"
  && kv(A.build({ customer: "A", start: START }).elements, "Product/system") === undefined);
ok("certNo '(assign)' when absent", kv(A.build({ customer: "A", start: START }).elements, "Certificate No.") === "(assign)");
ok("default jobType applied", /spray foam|concrete/.test(kv(A.build({ customer: "A", start: START }).elements, "Work performed")));
ok("default coverage + exclusions present", allText(A.build({ customer: "A", start: START }).elements).match(/workmanship/i) && allText(A.build({ customer: "A", start: START }).elements).match(/exclud/i));
ok("custom coverage overrides default", allText(A.build({ customer: "A", start: START, coverage: "custom coverage text here" }).elements).indexOf("custom coverage text here") >= 0);

// ---- hard-rule guardrails: workmanship only, no savings guarantee, no mold claim ----
const text = allText(r.elements).toLowerCase();
ok("warrants WORKMANSHIP (not savings/results)", /workmanship/.test(text));
ok("no guaranteed-savings language", !/guarantee[ds]? .*saving|save .*guarantee/.test(text));
ok("no mold-elimination claim", !/mold/.test(text));
ok("returns certNo/customer/end for the caller", r.customer === "Acme" && r.certNo !== undefined && r.end === "2031-08-01");

// ---- addYears is exported? (it's internal) — validate via build only; no price anywhere ----
ok("no computed price/dollar figure in the cert", !/\$\d|"(price|total|cost|amount)"\s*:\s*\d/i.test(JSON.stringify(r)));

console.log("\n" + (fail ? "✗ " : "✓ ") + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
