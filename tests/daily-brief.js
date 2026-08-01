#!/usr/bin/env node
// Daily-brief compose() decision logic — the pure core of api/daily-brief.js (what the morning brief
// surfaces). Run: `node tests/daily-brief.js`. Keyless, no network. compose() reads the clock for
// "today/this week", so tests use far-PAST (always overdue/cold) and far-FUTURE (never) dated records
// to stay deterministic, and assert the date-independent logic exactly: active/dead filtering, the
// open-invoice threshold, AR + pipeline sums, and the brief's structure/formatting. No pricing here —
// these are the customer's own AR/pipeline dollars, not MGSF rates.

const path = require("path");
const B = require(path.join(__dirname, "..", "api", "daily-brief.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

console.log("Daily-brief compose() decision logic\n");

const data = {
  jobs: [
    { status: "Scheduled", value: 5000, date: "2020-01-01", customer: "OldJob" }, // active, far past ⇒ overdue
    { status: "Paid", value: 9999, date: "2020-01-01", customer: "Done" },        // paid ⇒ excluded
    { status: "In Progress", value: 3000, date: "2035-01-01", customer: "Future" }, // active, far future
  ],
  leads: [
    { status: "New", value: 2000, lastContact: "2020-01-01" },   // active, far past ⇒ cold
    { status: "Lost", value: 9999 },                             // dead ⇒ excluded
    { status: "Quoted", value: 1500, lastContact: "2035-01-01" }, // active, future ⇒ not cold
  ],
  invoices: [
    { amt: 1000, dep: 200, due: "2020-01-01" }, // open, 800 owed, overdue
    { amt: 500, dep: 0, paid: true },           // paid ⇒ excluded
    { amt: 100, dep: 99.6 },                    // owed 0.4 ≤ 0.5 ⇒ excluded (rounding noise)
    { amt: 300, dep: 0, due: "2035-01-01" },    // open, 300 owed, not late
  ],
};
const r = B.compose(data);
const st = r.stats;

// ---- active/dead filtering (feeds pipeline + counts) ----
ok("paid/cancel/complete jobs excluded, active kept ⇒ text '2 jobs'", /2 jobs/.test(r.text), r.text);
ok("dead leads (won/lost/…) excluded ⇒ text '2 leads'", /2 leads/.test(r.text));
ok("pipeline = active leads + active jobs (3500 + 8000 = 11500)", st.pipeline === 11500, "pipe=" + st.pipeline);

// ---- open-invoice threshold + AR sum ----
ok("open invoices = paid!==true AND (amt-dep) > 0.5 ⇒ 2", st.invoices === 2, "inv=" + st.invoices);
ok("AR = sum of amounts owed (800 + 300 = 1100)", st.ar === 1100, "ar=" + st.ar);
ok("0.4-owed invoice excluded (rounding-noise guard)", st.ar === 1100 && st.invoices === 2);

// ---- clock-relative counts made deterministic with far dates ----
ok("far-past open job ⇒ overdue = 1", st.overdue === 1, "overdue=" + st.overdue);
ok("far-future job ⇒ not overdue, not this week", st.week === 0 && st.today === 0);
ok("far-past-contact lead ⇒ cold = 1 + coldVal 2000", st.cold === 1 && st.coldVal === 2000);
ok("far-future-contact lead ⇒ not cold", st.cold === 1);
ok("far-past-due invoice ⇒ arLate = 1", st.arLate === 1);

// ---- brief structure + money formatting ----
ok("brief has a Klyfton header line", /^Klyfton .*Brief/.test(r.text));
ok("brief shows AR formatted with $ + comma", /Owed to you: \$1,100/.test(r.text));
ok("brief shows pipeline formatted", /Pipeline: \$11,500/.test(r.text));
ok("brief lists the cold-lead line", /Cold leads: 1 quiet 7d\+/.test(r.text));

// ---- defensive: empty / missing data never throws ----
const empty = B.compose({});
ok("empty data ⇒ pipeline 0, no throw", empty.stats.pipeline === 0);
ok("empty data ⇒ 0 invoices, 0 cold", empty.stats.invoices === 0 && empty.stats.cold === 0);
ok("empty data ⇒ 'nothing scheduled' today line", /Today: nothing scheduled/.test(empty.text));
ok("missing arrays default safely", B.compose({ jobs: null, leads: undefined }).stats.pipeline === 0);

// ---- isolated threshold check ----
ok("invoice owed exactly > 0.5 is included", B.compose({ invoices: [{ amt: 100, dep: 99 }] }).stats.invoices === 1);
ok("invoice fully paid by deposit (0 owed) excluded", B.compose({ invoices: [{ amt: 100, dep: 100 }] }).stats.invoices === 0);

console.log("\n" + (fail ? "✗" : "✓") + " " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
