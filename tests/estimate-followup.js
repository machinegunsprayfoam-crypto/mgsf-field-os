#!/usr/bin/env node
// Estimate-followup sweep decision logic — the pure core of api/estimate-followup.js (reheat quiet,
// still-open estimates). Run: `node tests/estimate-followup.js`. Deterministic (asOfMs injected, no
// clock), keyless, no network (KV/webhook gated out of sweep()). Covers the 2/7/21-day cadence, the
// closed/won/scheduled filter, lastContact-wins, the total-desc→quietDays ordering, total/value
// fallback, and the per-stage draft text. No pricing asserted — drafts never state a number.

const path = require("path");
const E = require(path.join(__dirname, "..", "api", "estimate-followup.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

console.log("Estimate-followup sweep decision logic\n");

const ASOF = Date.parse("2026-08-31T00:00:00Z"); // fixed clock → integer day gaps
const est = (o) => Object.assign({ id: "E1", customer: "Dana Lee", phone: "406-555-0000", service: "spf roofing", status: "Sent", date: "2026-08-10" }, o);
const one = (o) => E.sweep([est(o)], ASOF);

// ---- cadence: nothing under 2 days; then quick / objection / last-call at 2 / 7 / 21 ----
ok("1 day ⇒ NOT swept", E.sweep([est({ date: "2026-08-30" })], ASOF).length === 0);
ok("exactly 2 days ⇒ quick (2-day quick check)", one({ date: "2026-08-29" })[0].stage === "quick");
ok("6 days ⇒ still quick", one({ date: "2026-08-25" })[0].stage === "quick");
ok("exactly 7 days ⇒ objection (7-day check-in)", one({ date: "2026-08-24" })[0].stage === "objection");
ok("20 days ⇒ still objection", one({ date: "2026-08-11" })[0].stage === "objection");
ok("exactly 21 days ⇒ last-call", one({ date: "2026-08-10" })[0].stage === "last-call");
ok("stageLabel matches", one({ date: "2026-08-24" })[0].stageLabel === "7-day check-in");
ok("quietDays reported", one({ date: "2026-08-29" })[0].quietDays === 2);

// ---- closed = won / accepted / approved / lost / dead / declined / complete / paid / scheduled / job ----
["Won", "accepted", "approved", "lost", "DEAD", "declined", "Completed", "Paid", "Scheduled", "job"].forEach((s) =>
  ok("closed status '" + s + "' ⇒ skipped", E.sweep([est({ status: s, date: "2026-08-01" })], ASOF).length === 0));
ok("open status ('Sent') is swept", one({ status: "Sent" }).length === 1);

// ---- date source + parse safety ----
ok("lastContact wins over date", E.sweep([est({ date: "2026-06-01", lastContact: "2026-08-30" })], ASOF).length === 0); // 1d
ok("missing/unparseable date ⇒ skipped", E.sweep([est({ date: "", lastContact: "" })], ASOF).length === 0 && E.sweep([est({ date: "nope" })], ASOF).length === 0);

// ---- total: from `total`, fall back to `value`; ordering by total desc then quietDays desc ----
ok("total read from `total`", one({ total: 8000, date: "2026-08-29" })[0].total === 8000);
ok("total falls back to `value` when total absent", E.sweep([est({ value: 6000, date: "2026-08-29" })], ASOF)[0].total === 6000);
const ordered = E.sweep([
  est({ id: "X", total: 5000, date: "2026-08-29" }), // 2d,  $5000
  est({ id: "Y", total: 9000, date: "2026-08-24" }), // 7d,  $9000
  est({ id: "Z", total: 5000, date: "2026-08-10" }), // 21d, $5000
], ASOF);
ok("sorted by total desc, then quietDays desc ⇒ Y, Z, X", ordered.map((x) => x.id).join(",") === "Y,Z,X", ordered.map((x) => x.id).join(","));

// ---- draft text: right message per stage, always the shop phone + first name, no invented price ----
ok("quick draft asks if the estimate landed + phone", /get the estimate/i.test(one({ date: "2026-08-29" })[0].draft) && /406-939-8301/.test(one({ date: "2026-08-29" })[0].draft));
ok("objection draft offers financing", /financing/i.test(one({ date: "2026-08-24" })[0].draft));
ok("last-call draft sets it aside / notes prices move", /(set it aside|prices).*/i.test(one({ date: "2026-08-10" })[0].draft));
ok("draft greets by first name", /^Hi Dana,/.test(one({ date: "2026-08-29" })[0].draft));
ok("service defaults to 'your project'", /your project/.test(E.sweep([est({ service: "", date: "2026-08-29" })], ASOF)[0].draft));
ok("no fabricated dollar figure in any draft", one({ total: 12345, date: "2026-08-29" })[0].draft.indexOf("12345") === -1);

// ---- defensive ----
ok("null entries skipped, no throw", E.sweep([null, est({ date: "2026-08-29" }), undefined], ASOF).length === 1);
ok("non-array ⇒ [] no throw", E.sweep(null, ASOF).length === 0 && E.sweep(undefined, ASOF).length === 0);

console.log("\n" + (fail ? "✗" : "✓") + " " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
