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

// ---- audit findings folded in (injected by the handler; optional + backward-compatible) ----
(() => {
  const withF = B.compose(Object.assign({}, data, { findings: [
    { severity: "high", title: "Stale bid: Black Hills", action: "Follow up today" },
    { severity: "medium", area: "AR aging", action: "Send reminder" },
    { severity: "low", title: "Minor thing", action: "later" },
    { severity: "high", title: "Fourth", action: "x" },
  ] }));
  ok("brief adds a 'Needs attention' section when findings present", /Needs attention:/.test(withF.text));
  ok("only red/amber findings shown, capped at 3", withF.stats.findings === 3, "n=" + withF.stats.findings);
  ok("low-severity finding excluded", !/Minor thing/.test(withF.text));
  ok("finding renders title → action", /Stale bid: Black Hills → Follow up today/.test(withF.text));
  ok("no findings ⇒ no 'Needs attention' section (backward-compatible)", !/Needs attention/.test(B.compose(data).text) && B.compose(data).stats.findings === 0);
})();

// ---- severity vocab: business-audit emits red/amber — those MUST surface in the brief (not silently dropped) ----
(() => {
  const withRA = B.compose(Object.assign({}, data, { findings: [
    { severity: "red", title: "3 certs EXPIRED", action: "Renew now" },
    { severity: "amber", title: "2 estimate(s) but 0 converted to a job", action: "Convert on Won" },
    { severity: "green", title: "Pipeline healthy", action: "keep going" },
  ] }));
  ok("red + amber (business-audit vocab) findings surface in the brief", /3 certs EXPIRED → Renew now/.test(withRA.text) && /0 converted to a job/.test(withRA.text));
  ok("green finding excluded (only red/amber shown)", !/Pipeline healthy/.test(withRA.text) && withRA.stats.findings === 2);
})();

// ---- CALL LIST (audit fix #1: leads die at the handoff — brief must hand over who to call) ----
(() => {
  const NOW = Date.parse("2026-08-07T00:00:00Z"); // fixed clock ⇒ deterministic
  const leads = [
    { name: "Alvin Newelham", phone: "406-480-6331", service: "duct-chase spray foam", status: "New", date: "2026-08-05" }, // uncontacted 2d
    { name: "Old VM", number: "555-1111", note: "left voicemail", status: "New", date: "2026-07-01" },                        // uncontacted ~37d (older ⇒ ranks first)
    { name: "Cold Contacted", phone: "555-2222", service: "attic foam", status: "Quoted", lastContact: "2026-07-20", value: 9000 }, // contacted but 18d cold
    { name: "Fresh Contacted", phone: "555-3333", status: "Quoted", lastContact: "2026-08-06" },  // contacted yesterday ⇒ NOT on list
    { name: "Dead One", phone: "555-4444", status: "Lost" },                                       // dead ⇒ excluded
    { name: "No Phone New", status: "New", date: "2026-08-04", service: "crawl space" },            // uncontacted, no phone
  ];
  const list = B.callList(leads, NOW);
  ok("call list excludes recently-contacted + dead leads", !list.some((c) => /Fresh Contacted|Dead One/.test(c.name)), JSON.stringify(list.map((c) => c.name)));
  ok("call list includes uncontacted (incl brand-new) + cold-contacted", list.length === 4, "n=" + list.length);
  ok("uncontacted rank FIRST, oldest-waiting first (Old VM before Newelham)", list[0].name === "Old VM" && list.findIndex((c) => c.name === "Alvin Newelham") < list.findIndex((c) => c.name === "Cold Contacted"));
  const newe = list.find((c) => c.name === "Alvin Newelham");
  ok("item carries name + phone + one-line ask + days waited", newe.phone === "406-480-6331" && newe.ask === "duct-chase spray foam" && newe.waited === 2 && newe.uncontacted === true);
  ok("cold-contacted lead flagged not-uncontacted with days-since-contact", (() => { const c = list.find((x) => x.name === "Cold Contacted"); return c && c.uncontacted === false && c.waited === 18; })());
  ok("missing phone renders as null (never fabricated)", list.find((c) => c.name === "No Phone New").phone === null);
  ok("ask falls back to 'follow up' when nothing on the record", B.callList([{ name: "X", status: "New", date: "2026-08-01" }], NOW)[0].ask === "follow up");
  ok("limit arg caps the list", B.callList(leads, NOW, 2).length === 2);
  ok("dead/empty ⇒ empty list, no throw", B.callList([{ status: "Lost" }], NOW).length === 0 && B.callList(null, NOW).length === 0);
  // wired into compose(): a callable far-past lead surfaces a 'Call today' section + stats.calls
  const withCalls = B.compose({ leads: [{ name: "ColdLead", phone: "555-9", service: "roof coat", status: "New", lastContact: "2020-01-01", value: 4000 }] });
  ok("compose surfaces a 'Call today' section when a lead needs contact", /Call today \(1\):/.test(withCalls.text) && /ColdLead · 555-9 · roof coat/.test(withCalls.text));
  ok("compose reports stats.calls", withCalls.stats.calls === 1);
  ok("no callable leads ⇒ no 'Call today' section (backward-compatible)", !/Call today/.test(B.compose({ leads: [{ name: "Recent", status: "Quoted", lastContact: "2035-01-01" }] }).text));
})();

// ---- isolated threshold check ----
ok("invoice owed exactly > 0.5 is included", B.compose({ invoices: [{ amt: 100, dep: 99 }] }).stats.invoices === 1);
ok("invoice fully paid by deposit (0 owed) excluded", B.compose({ invoices: [{ amt: 100, dep: 100 }] }).stats.invoices === 0);

// ---- Foreman top actions folded into the brief (injected, like findings) ----
(() => {
  const fm = { top: [
    { agent: "collector", label: "Collector", who: "Ray", action: "AR reminder", value: 5000, blocked: false },
    { agent: "bid-chaser", label: "Bid Chaser", who: "Deb", action: "reheat bid", value: 0, blocked: true },
  ] };
  const b = B.compose({ foreman: fm });
  ok("brief surfaces 'Approve next (Foreman)' with the top action + $", /Approve next \(Foreman\)/.test(b.text) && /Collector → Ray \(\$5,?000\)/.test(b.text));
  ok("a blocked foreman item is flagged BLOCKED in the brief", /Deb.*BLOCKED/.test(b.text));
  ok("foreman count lands in stats", b.stats.foreman === 2);
  ok("no foreman data ⇒ no Foreman section (backward-compatible)", !/Approve next/.test(B.compose({}).text) && B.compose({}).stats.foreman === 0);
})();

console.log("\n" + (fail ? "✗" : "✓") + " " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
