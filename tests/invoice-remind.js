#!/usr/bin/env node
// Invoice-reminder (AR) decision logic — the pure core of api/invoice-remind.js. Run:
// `node tests/invoice-remind.js`. Deterministic (asOf injected, no clock), keyless, no network.
// Covers the overdue tone ladder (upcoming/gentle/firm/final by days-late), the settled-vs-unpaid
// filter INCLUDING the documented 'unpaid'-contains-'paid' regression guard, amount/due field
// fallbacks, the amount formatter, most-overdue-first ordering, and the draft (sms/email) shape.
// These are AR reminder amounts (what a customer owes), NOT job pricing — no doctrine number touched.

const path = require("path");
const I = require(path.join(__dirname, "..", "api", "invoice-remind.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

console.log("Invoice-reminder (AR) decision logic\n");

const ASOF = Date.parse("2026-08-31T00:00:00Z"); // fixed clock → integer day gaps
const inv = (o) => Object.assign({ customer: "Dana Lee", amount: 1000, due: "2026-08-01", id: "INV-9" }, o);
const draft = (o) => I.draftFor(inv(o), ASOF);

// ---- tone ladder by days-late: <0 upcoming · 0-7 gentle · 8-30 firm · >30 final ----
ok("future due ⇒ upcoming (Due soon)", draft({ due: "2026-09-05" }).tier === "upcoming");
ok("due today (0d) ⇒ gentle", draft({ due: "2026-08-31" }).tier === "gentle");
ok("7 days late ⇒ still gentle", draft({ due: "2026-08-24" }).tier === "gentle");
ok("8 days late ⇒ firm", draft({ due: "2026-08-23" }).tier === "firm");
ok("30 days late ⇒ still firm", draft({ due: "2026-08-01" }).tier === "firm");
ok("31 days late ⇒ final", draft({ due: "2026-07-31" }).tier === "final");
ok("tierLabel matches (firm)", draft({ due: "2026-08-10" }).tierLabel === "Firm reminder");
ok("daysLate reported (integer)", draft({ due: "2026-08-01" }).daysLate === 30);
ok("no due date ⇒ daysLate null, defaults to gentle tone", (function () { const d = draft({ due: "" }); return d.daysLate === null && d.tier === "gentle"; })());

// ---- amount: from amount ?? total ?? value; formatter adds $ + thousands + 2dp ----
ok("amount read from `amount`", draft({ amount: 1234.5 }).amount === 1234.5);
ok("amount falls back to `total`", I.draftFor({ customer: "X", total: 500, due: "2026-08-01" }, ASOF).amount === 500);
ok("amount falls back to `value`", I.draftFor({ customer: "X", value: 250, due: "2026-08-01" }, ASOF).amount === 250);
ok("amountFmt formats $1,234.50", draft({ amount: 1234.5 }).amountFmt === "$1,234.50");
ok("amountFmt formats whole thousands", draft({ amount: 1000 }).amountFmt === "$1,000.00");

// ---- draft shape: sms + email, char count, contact fallthrough, invoice ref, first name ----
const d = draft({ due: "2026-08-10", phone: "406-555-1212", email: "d@x.com" });
ok("sms text present + chars = length", d.draft.sms.text.length === d.draft.sms.chars && d.draft.sms.chars > 0);
ok("sms.to carries the phone", d.draft.sms.to === "406-555-1212");
ok("email has subject + body + to", !!d.draft.email.subject && !!d.draft.email.body && d.draft.email.to === "d@x.com");
ok("missing phone ⇒ sms.to null (no fabricated contact)", draft({ phone: "" }).draft.sms.to === null);
ok("firm sms states days past due", /21 days past due/.test(draft({ due: "2026-08-10" }).draft.sms.text));
ok("final subject is FINAL", /FINAL/.test(draft({ due: "2026-07-01" }).draft.email.subject));
ok("invoice id shown in the message", /INV-9/.test(draft({ due: "2026-08-10" }).draft.sms.text));
ok("greets by first name", /Dana/.test(draft({ due: "2026-08-10" }).draft.sms.text));

// ---- sweep(): settled filter, the 'unpaid'-contains-'paid' guard, amount/window gates, ordering ----
ok("status 'unpaid' is NOT skipped (paid-substring guard)", I.sweep([inv({ status: "unpaid" })], ASOF).length === 1);
ok("status 'past due' is NOT skipped", I.sweep([inv({ status: "past due" })], ASOF).length === 1);
["Paid", "closed", "Complete", "settled", "void", "cancelled"].forEach((st) =>
  ok("settled status '" + st + "' ⇒ skipped", I.sweep([inv({ status: st })], ASOF).length === 0));
["Open", "Outstanding"].forEach((st) =>
  ok("open status '" + st + "' ⇒ kept", I.sweep([inv({ status: st })], ASOF).length === 1));
ok("zero/negative amount ⇒ skipped (nothing owed)", I.sweep([inv({ amount: 0 }), inv({ amount: -5 })], ASOF).length === 0);
ok("due far in the future (< -3d) ⇒ skipped", I.sweep([inv({ due: "2026-09-10" })], ASOF).length === 0); // -10d
ok("due within 3 days out ⇒ kept (upcoming)", I.sweep([inv({ due: "2026-09-02" })], ASOF).length === 1); // -2d
const ordered = I.sweep([
  inv({ customer: "Mid", due: "2026-08-01" }),  // 30d
  inv({ customer: "Worst", due: "2026-07-01" }),// 61d
  inv({ customer: "Least", due: "2026-08-20" }),// 11d
], ASOF);
ok("most-overdue first ⇒ Worst, Mid, Least", ordered.map((x) => x.customer).join(",") === "Worst,Mid,Least", ordered.map((x) => x.customer).join(","));

// ---- defensive ----
ok("null entries skipped, no throw", I.sweep([null, inv(), undefined], ASOF).length === 1);
ok("non-array ⇒ [] no throw", I.sweep(null, ASOF).length === 0 && I.sweep(undefined, ASOF).length === 0);

console.log("\n" + (fail ? "✗" : "✓") + " " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
