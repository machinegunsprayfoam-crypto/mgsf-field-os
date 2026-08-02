#!/usr/bin/env node
// Roof-maintenance schedule/sweep decision logic — the pure date core of api/roof-maintenance.js
// (when a coated roof is due for inspection / re-coat). Run: `node tests/roof-maintenance.js`.
// Deterministic (asOfMs injected, no clock), keyless, no network. Covers base-date selection
// (lastService→installDate fallback), the inspection-month / re-coat-year cadence + clamps, the
// due windows (≤30d inspection, ≤90d re-coat, past = due), the inactive-status filter, soonest-due
// ordering, and the draft text. Pricing intentionally NOT touched — quote() (rate inputs) is excluded.

const path = require("path");
const R = require(path.join(__dirname, "..", "api", "roof-maintenance.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

console.log("Roof-maintenance schedule/sweep decision logic\n");

const ASOF = Date.parse("2026-08-31T00:00:00Z"); // fixed clock → integer day gaps

// ---- schedule(): base date + cadence ----
let s = R.schedule({ lastService: "2026-08-01", installDate: "2020-01-01", inspectionMonths: 1, recoatYears: 10 }, ASOF);
ok("nextInspection = lastService + inspectionMonths", s.nextInspection === "2026-09-01");
ok("inspection 1 day out ⇒ inspDue", s.inspDue === true && s.inspDays === 1);
ok("re-coat far future ⇒ not recoatDue", s.recoatDue === false);
ok("due = inspDue || recoatDue", s.due === true);

s = R.schedule({ installDate: "2016-09-15", lastService: "2026-08-20", inspectionMonths: 12, recoatYears: 10 }, ASOF);
ok("nextRecoat = installDate + recoatYears", s.nextRecoat === "2026-09-15");
ok("re-coat 15 days out ⇒ recoatDue (≤90d window)", s.recoatDue === true && s.recoatDays === 15);
ok("inspection far out ⇒ not inspDue", s.inspDue === false);

// base-date fallback: no lastService ⇒ installDate is the base for inspection
s = R.schedule({ installDate: "2026-08-10", inspectionMonths: 1 }, ASOF);
ok("no lastService ⇒ installDate used as inspection base", s.nextInspection === "2026-09-10" && s.inspDue === true);

// no usable date at all ⇒ nothing scheduled, not due
s = R.schedule({ inspectionMonths: 1 }, ASOF);
ok("no lastService/installDate ⇒ nextInspection null, not due", s.nextInspection === null && s.nextRecoat === null && s.due === false);

// past-due inspection counts as due (negative daysUntil)
s = R.schedule({ lastService: "2026-06-01", installDate: "2020-01-01", inspectionMonths: 1, recoatYears: 10 }, ASOF);
ok("past inspection date ⇒ inspDue (negative days)", s.inspDays < 0 && s.inspDue === true);

// window edges: 30d inspection is due, 31d is not; 90d re-coat is due, 91d is not
ok("inspection exactly 30d ⇒ due", R.schedule({ lastService: "2026-08-01", installDate: "2020-01-01", inspectionMonths: 1 }, Date.parse("2026-08-02T00:00:00Z")).inspDue === true); // 2026-09-01 is 30d after 2026-08-02
ok("inspection 31d ⇒ not due", R.schedule({ lastService: "2026-08-01", installDate: "2020-01-01", inspectionMonths: 1 }, Date.parse("2026-08-01T00:00:00Z")).inspDue === false); // 2026-09-01 is 31d after 2026-08-01

// cadence clamps: 0/blank ⇒ minimum 1 (never a 0-month/0-year schedule)
ok("inspectionMonths 0 ⇒ clamped to 1 month", R.schedule({ lastService: "2026-08-15", inspectionMonths: 0 }, ASOF).nextInspection === "2026-09-15");
ok("recoatYears 0 ⇒ clamped to 1 year", R.schedule({ installDate: "2026-08-01", recoatYears: 0 }, ASOF).nextRecoat === "2027-08-01");
ok("defaults: inspection 12mo / re-coat 10yr when unset", (function () { const d = R.schedule({ lastService: "2026-08-01", installDate: "2016-08-01" }, ASOF); return d.nextInspection === "2027-08-01" && d.nextRecoat === "2026-08-01"; })());

// ---- sweep(): filter + label + order + draft ----
const duePlan = (o) => Object.assign({ customer: "Pat Roe", lastService: "2026-08-01", installDate: "2020-01-01", inspectionMonths: 1, recoatYears: 10, status: "Active" }, o);
ok("a due, active plan is swept", R.sweep([duePlan()], ASOF).length === 1);
ok("swept plan labels what's due", R.sweep([duePlan()], ASOF)[0].due === "inspection");
["Paid", "Paused", "cancelled", "inactive", "Complete"].forEach((st) =>
  ok("inactive status '" + st + "' ⇒ skipped", R.sweep([duePlan({ status: st })], ASOF).length === 0));
ok("a not-due plan is skipped", R.sweep([duePlan({ inspectionMonths: 12, installDate: "2024-01-01", lastService: "2026-08-20" })], ASOF).length === 0);
ok("both due ⇒ label 'inspection + re-coat'", R.sweep([duePlan({ installDate: "2016-09-15" })], ASOF)[0].due === "inspection + re-coat");

// soonest-due first
const ordered = R.sweep([
  duePlan({ customer: "Far", inspectionMonths: 12, lastService: "2026-08-20", installDate: "2016-09-15" }), // re-coat 15d
  duePlan({ customer: "Near", inspectionMonths: 1, lastService: "2026-08-01", installDate: "2020-01-01" }), // insp 1d
], ASOF);
ok("sorted soonest-due first ⇒ Near, Far", ordered.map((x) => x.customer.split(" ")[0]).join(",") === "Near,Far", ordered.map((x) => x.customer).join(","));

// draft
const d = R.sweep([duePlan()], ASOF)[0].draft;
ok("draft greets by first name + names what's due + shop phone", /^Hi Pat,/.test(d) && /due for its inspection/.test(d) && /406-939-8301/.test(d));

// defensive
ok("null entries skipped, no throw", R.sweep([null, duePlan(), undefined], ASOF).length === 1);
ok("non-array ⇒ [] no throw", R.sweep(null, ASOF).length === 0 && R.sweep(undefined, ASOF).length === 0);

console.log("\n" + (fail ? "✗" : "✓") + " " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
