#!/usr/bin/env node
// Change-order — pure doc-build core of api/change-order.js. Run: `node tests/change-order.js`.
// Deterministic, keyless, no network (a fixed date is passed so the new-Date fallback never runs).
// Covers the money math (delta = sum of changes incl. credits, new total = original + delta), the
// OWNER-INPUT-REQUIRED markers (never fabricate a customer/scope), negative-amount formatting, and
// the optional sections. Amounts are caller-supplied (the change's own numbers) — no doctrine pricing.

const path = require("path");
const A = require(path.join(__dirname, "..", "api", "change-order.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }
const kv = (els, k) => (els.find((e) => e.type === "kv" && e.k === k) || {}).v;
const hasText = (els, re) => els.some((e) => (e.type === "text" || e.type === "center" || e.type === "subheading") && re.test(String(e.text || "")));
const DATE = "2026-08-01";

console.log("Change-order (mid-job scope/price change doc)\n");

// ---- money math: delta + new total, credits reduce ----
const r = A.build({ customer: "Acme", originalAmount: 10000, date: DATE, changes: [{ desc: "add attic", amount: 2500 }, { desc: "credit unused", amount: -500 }] });
ok("delta = sum of changes (incl. credit)", r.delta === 2000);
ok("new total = original + delta", r.newTotal === 12000);
ok("NEW CONTRACT TOTAL kv reflects new total", kv(r.elements, "NEW CONTRACT TOTAL") === "$12,000.00");
ok("Original contract kv formatted", kv(r.elements, "Original contract") === "$10,000.00");
ok("This change order kv = delta", kv(r.elements, "This change order") === "$2,000.00");
const credit = A.build({ customer: "Acme", originalAmount: 5000, date: DATE, changes: [{ desc: "remove scope", amount: -1000 }] });
ok("credit-only lowers the total", credit.delta === -1000 && credit.newTotal === 4000);
ok("negative amount formats as -$", hasText(credit.elements, /-\$1,000\.00/));

// ---- OWNER INPUT REQUIRED markers (never fabricate) ----
ok("missing customer ⇒ OWNER INPUT REQUIRED marker", /OWNER INPUT REQUIRED/.test(kv(A.build({ date: DATE, originalAmount: 100 }).elements, "Customer")));
ok("no changes ⇒ OWNER INPUT REQUIRED for line items", hasText(A.build({ customer: "Acme", date: DATE, originalAmount: 100 }).elements, /OWNER INPUT REQUIRED — list the change/));

// ---- robustness ----
ok("non-numeric amount treated as 0 (not NaN)", A.build({ customer: "A", originalAmount: 1000, date: DATE, changes: [{ desc: "x", amount: "oops" }] }).delta === 0);
ok("missing originalAmount defaults to 0", A.build({ customer: "A", date: DATE, changes: [{ desc: "x", amount: 500 }] }).newTotal === 500);
ok("change with no desc labeled '(change)'", hasText(A.build({ customer: "A", date: DATE, changes: [{ amount: 100 }] }).elements, /\(change\)/));

// ---- optional sections ----
ok("valid date kept", kv(A.build({ customer: "A", date: DATE, originalAmount: 1 }).elements, "Date") === DATE);
ok("jobRef kv present only when given", kv(A.build({ customer: "A", date: DATE, jobRef: "JOB-42", originalAmount: 1 }).elements, "Job / Contract ref") === "JOB-42"
  && kv(A.build({ customer: "A", date: DATE, originalAmount: 1 }).elements, "Job / Contract ref") === undefined);
ok("reason section only when given", hasText(A.build({ customer: "A", date: DATE, originalAmount: 1, reason: "weather delay" }).elements, /weather delay/)
  && !hasText(A.build({ customer: "A", date: DATE, originalAmount: 1 }).elements, /weather delay/));
ok("has CHANGE ORDER title + signature lines", hasText(r.elements, /CHANGE ORDER/) && r.elements.some((e) => e.type === "sign"));

// ---- guardrail: no doctrine/MGSF pricing pulled — amounts are only what the caller passed ----
ok("amounts are caller-supplied only (10000 in ⇒ 10000 out, nothing invented)", kv(A.build({ customer: "A", date: DATE, originalAmount: 10000 }).elements, "Original contract") === "$10,000.00");

console.log("\n" + (fail ? "✗ " : "✓ ") + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
