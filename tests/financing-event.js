#!/usr/bin/env node
// Regression suite for the Hearth financing-event receiver (api/financing-event.js) — the second half
// of the Hearth bridge. A customer applying/approving off our proposal link is the strongest buy
// signal we get; this locks the invariants that keep it SAFE: draft-only (never writes CRM / never
// messages a customer), correct heat classification, never fabricates a dollar amount, field-tolerant
// for whatever Hearth/parser sends, and no barred claims. Keyless, no npm. Run: `node tests/financing-event.js`

const path = require("path");
const fe = require(path.join(__dirname, "..", "api", "financing-event.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail ? "  [" + detail + "]" : "")); } }
const NOW = Date.parse("2026-08-06T18:00:00Z");

console.log("Hearth financing-event invariants\n");

// ---- core safety: always a draft, never a write/send ----
(() => {
  const o = fe.build({ customer: "Jane Doe", email: "jane@x.com", amount: "9,000", status: "Approved" }, NOW);
  ok("ok:true", o.ok === true);
  ok("draftOnly:true (never writes CRM / never messages)", o.draftOnly === true);
  ok("source tagged hearth", o.source === "hearth");
  ok("ownerAlert present", typeof o.ownerAlert === "string" && o.ownerAlert.length > 0);
  ok("crmUpdate is a SUGGESTION, not an executed write", o.crmUpdate && o.crmUpdate.action === "suggest");
  ok("customer passthrough", o.customer === "Jane Doe");
  ok("amount parsed from '9,000'", o.amount === "9000");
})();

// ---- heat classification ----
(() => {
  ok("approved -> hot", fe.classify("Approved") === "hot");
  ok("prequalified -> hot", fe.classify("Prequalified") === "hot");
  ok("funded -> hot", fe.classify("Funded") === "hot");
  ok("application started -> warm", fe.classify("Application Started") === "warm");
  ok("submitted -> warm", fe.classify("Submitted for review") === "warm");
  ok("declined -> cold", fe.classify("Declined") === "cold");
  ok("expired -> cold", fe.classify("Offer expired") === "cold");
  ok("unknown/empty -> warm (never dropped)", fe.classify("") === "warm" && fe.classify("some new thing") === "warm");
})();

// ---- hot lead alert content ----
(() => {
  const hot = fe.build({ customer: "Bob", amount: "12000", status: "Approved" }, NOW);
  ok("hot: heat=hot", hot.heat === "hot");
  ok("hot: alert says ready to close", /ready-to-close|close/i.test(hot.ownerAlert));
  ok("hot: high priority + stage hint", hot.crmUpdate.priority === "high" && /Ready to Close/i.test(hot.crmUpdate.stageHint));
  const warm = fe.build({ customer: "Sam", status: "Application Started" }, NOW);
  ok("warm: heat=warm", warm.heat === "warm");
  ok("warm: alert says follow up", /follow up|in motion|moving/i.test(warm.ownerAlert));
  const cold = fe.build({ customer: "Pat", status: "Declined" }, NOW);
  ok("cold: heat=cold", cold.heat === "cold");
  ok("cold: alert offers re-engagement, not a dead end", /follow up|options|re-engage|don't let/i.test(cold.ownerAlert));
})();

// ---- never fabricates a dollar amount ----
(() => {
  const noAmt = fe.build({ customer: "Kim", status: "Approved" }, NOW);
  ok("no amount given -> amount null (nothing invented)", noAmt.amount === null);
  ok("no amount -> alert carries no $ figure", !/\$\d/.test(noAmt.ownerAlert));
  ok("money() ignores non-numeric", fe.money("pending") === "" && fe.money("$3,500.50") === "3500.50");
})();

// ---- field tolerance: any vendor/parser field names work ----
(() => {
  // Hearth-ish: borrower_name / loan_amount / application_status
  const o = fe.build({ borrower_name: "Dana Reed", loan_amount: "$15,000", application_status: "Approved", customer_email: "dana@x.com" }, NOW);
  ok("alt: customer from borrower_name", o.customer === "Dana Reed");
  ok("alt: amount from loan_amount", o.amount === "15000");
  ok("alt: status from application_status -> hot", o.status === "Approved" && o.heat === "hot");
  ok("alt: email from customer_email", o.email === "dana@x.com");
  // case-insensitive keys
  const t = fe.build({ Name: "Lee", Status: "Prequalified", Amount: "8000" }, NOW);
  ok("alt: case-insensitive keys", t.customer === "Lee" && t.heat === "hot" && t.amount === "8000");
})();

// ---- graceful degrade: empty body must not throw ----
(() => {
  let threw = false, o = null;
  try { o = fe.build({}, NOW); } catch { threw = true; }
  ok("empty body: no throw", threw === false);
  ok("empty body: still draftOnly", o && o.draftOnly === true);
  ok("empty body: customer null (nothing invented)", o && o.customer === null);
  ok("empty body: defaults to a warm, non-empty alert", o && o.heat === "warm" && o.ownerAlert.length > 0);
})();

// ---- brand safety: no barred claims ----
(() => {
  const variants = [
    fe.build({ customer: "T", status: "Approved", amount: "10000" }, NOW).ownerAlert,
    fe.build({ customer: "T", status: "Declined" }, NOW).ownerAlert,
    fe.build({ customer: "T", status: "Started" }, NOW).ownerAlert,
  ].join(" ");
  ok("no guaranteed-savings claim", !/guarantee|save \$|\d+% off/i.test(variants));
  ok("no mold-elimination claim", !/mold/i.test(variants));
})();

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
