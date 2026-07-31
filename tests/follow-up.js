#!/usr/bin/env node
// Lead follow-up sweep decision logic — the pure core of api/follow-up.js. Run: `node tests/follow-up.js`.
// Deterministic (asOfMs is passed in, never read from a clock), keyless, no network (KV/webhook gated
// out of sweep()). Covers the 3/7/30-day cadence, the "quiet & still-open" rule, the closed-status
// filter, the value+quietDays ordering, and the per-stage draft text — none of it tested elsewhere.

const path = require("path");
const F = require(path.join(__dirname, "..", "api", "follow-up.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

console.log("Lead follow-up sweep decision logic\n");

const ASOF = Date.parse("2026-08-31T00:00:00Z"); // fixed clock → integer day gaps below
const lead = (o) => Object.assign({ name: "Sam Jones", phone: "406-555-1212", service: "spray foam", status: "New", date: "2026-08-01" }, o);
const one = (o) => F.sweep([lead(o)], ASOF);

// ---- cadence: nothing under 3 days; then soft / value / last-call at 3 / 7 / 30 ----
ok("under 3 days quiet ⇒ NOT swept", F.sweep([lead({ date: "2026-08-29" })], ASOF).length === 0); // 2d
ok("exactly 3 days ⇒ soft (3-day nudge)", one({ date: "2026-08-28" })[0].stage === "soft"); // 3d
ok("6 days ⇒ still soft", one({ date: "2026-08-25" })[0].stage === "soft"); // 6d
ok("exactly 7 days ⇒ value (7-day check-in)", one({ date: "2026-08-24" })[0].stage === "value"); // 7d
ok("29 days ⇒ still value", one({ date: "2026-08-02" })[0].stage === "value"); // 29d
ok("exactly 30 days ⇒ last-call", one({ date: "2026-08-01" })[0].stage === "last-call"); // 30d
ok("61 days ⇒ last-call", one({ date: "2026-07-01" })[0].stage === "last-call");
ok("stageLabel matches the stage", one({ date: "2026-08-24" })[0].stageLabel === "7-day check-in");
ok("quietDays is reported (integer day gap)", one({ date: "2026-08-28" })[0].quietDays === 3);

// ---- open vs closed: only chase live leads ----
["Won", "lost", "DEAD", "Completed", "Paid"].forEach((s) =>
  ok("closed status '" + s + "' ⇒ skipped", F.sweep([lead({ status: s, date: "2026-07-01" })], ASOF).length === 0));
ok("open status is swept", one({ status: "Quoted" }).length === 1);

// ---- date source + parse safety ----
ok("lastContact wins over date (recent touch resets the clock)",
  F.sweep([lead({ date: "2026-06-01", lastContact: "2026-08-29" })], ASOF).length === 0); // lastContact=2d
ok("missing/unparseable date ⇒ skipped (can't compute quiet days)",
  F.sweep([lead({ date: "", lastContact: "" })], ASOF).length === 0 &&
  F.sweep([lead({ date: "not-a-date", lastContact: "" })], ASOF).length === 0);

// ---- ordering: highest value first, then longest quiet ----
const ordered = F.sweep([
  lead({ name: "A", value: 5000, date: "2026-08-28" }),   // 3d,  $5000
  lead({ name: "B", value: 9000, date: "2026-08-24" }),   // 7d,  $9000
  lead({ name: "C", value: 5000, date: "2026-08-01" }),   // 30d, $5000
], ASOF);
ok("sorted by value desc, then quietDays desc ⇒ B, C, A",
  ordered.map((x) => x.name).join(",") === "B,C,A", ordered.map((x) => x.name).join(","));

// ---- draft text: right message per stage, always the shop phone, real first name ----
ok("soft draft = following-up ask + phone", /following up/i.test(one({ date: "2026-08-28" })[0].draft) && /406-939-8301/.test(one({ date: "2026-08-28" })[0].draft));
ok("value draft offers financing", /financing/i.test(one({ date: "2026-08-24" })[0].draft));
ok("last-call draft offers to close the file", /close out/i.test(one({ date: "2026-08-01" })[0].draft));
ok("draft greets by first name", /^Hi Sam,/.test(one({ date: "2026-08-28" })[0].draft));
ok("service defaults to 'your project' when absent", /your project/.test(F.sweep([lead({ service: "", date: "2026-08-28" })], ASOF)[0].draft));

// ---- defensive: never throw on junk ----
ok("null entries skipped, no throw", F.sweep([null, lead({ date: "2026-08-28" }), undefined], ASOF).length === 1);
ok("non-array input ⇒ [] no throw", F.sweep(null, ASOF).length === 0 && F.sweep(undefined, ASOF).length === 0);
ok("value coerced to number", one({ value: "5000", date: "2026-08-28" })[0].value === 5000);

console.log("\n" + (fail ? "✗" : "✓") + " " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
