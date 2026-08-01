#!/usr/bin/env node
// Business audit — pure audit() core of api/business-audit.js. Run: `node tests/business-audit.js`.
// Deterministic (asOfMs injected — no Date.now in core), keyless, no network. Covers each finding
// area (pipeline, stale bids, close rate, cold leads, AR aging, overdue jobs, concentration, margin),
// severity ranking (red first), summary counts, and the guardrails: margin is only graded when a
// target is SUPPLIED (never a fabricated GM), findings trace to records, no pricing invented.

const path = require("path");
const A = require(path.join(__dirname, "..", "api", "business-audit.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }
const ASOF = Date.parse("2026-08-01");
const find = (r, area) => r.findings.find((f) => f.area === area);

console.log("Business audit (decision-ready findings)\n");

// ---- healthy-ish book ----
const good = A.audit({
  leads: [{ status: "new", value: 5000, lastContact: "2026-07-31" }],
  jobs: [{ status: "scheduled", value: 12000, date: "2026-08-10", customer: "Acme" }],
  estimates: [{ status: "sent", total: 9000, lastContact: "2026-07-31" }],
  invoices: [{ paid: false, amt: 6000, dep: 1000, due: "2026-08-15" }],
}, { asOfMs: ASOF });
ok("returns ok + GUIDANCE label", good.ok === true && /GUIDANCE/.test(good.label));
ok("pipeline sums open leads + jobs", find(good, "Pipeline").metric.pipeline === 17000);
ok("warm leads ⇒ green", find(good, "Leads").severity === "green");
ok("current AR (not overdue) ⇒ green", find(good, "Cash / AR").severity === "green");
ok("no stale bids ⇒ green sales", find(good, "Sales").severity === "green");
ok("margin off without a target ⇒ green + explains", find(good, "Margin").severity === "green" && /never invents/.test(find(good, "Margin").detail));

// ---- distressed book ----
const bad = A.audit({
  leads: [{ status: "new", value: 8000, lastContact: "2026-06-01" }],              // cold 30d+
  jobs: [{ status: "scheduled", value: 12000, date: "2026-07-20", customer: "Acme" }], // overdue
  estimates: [{ status: "sent", total: 9000, lastContact: "2026-07-01" }],          // stale 21d+
  invoices: [{ paid: false, amt: 6000, dep: 1000, due: "2026-06-15" }],             // 30d+ overdue
}, { asOfMs: ASOF });
ok("cold lead 30d+ ⇒ red", find(bad, "Leads").severity === "red");
ok("stale bid 21d+ ⇒ red", find(bad, "Sales").severity === "red");
ok("AR 30d+ overdue ⇒ red + real balance", find(bad, "Cash / AR").severity === "red" && find(bad, "Cash / AR").metric.overdueValue === 5000);
ok("overdue scheduled job ⇒ red Ops finding", find(bad, "Ops") && find(bad, "Ops").severity === "red");
ok("red findings sort to the top", bad.findings[0].severity === "red");
ok("headline flags action-now count", /need action now/.test(bad.headline) && bad.summary.red >= 3);

// ---- amber (cooling, not dead) ----
const warm = A.audit({
  estimates: [{ status: "sent", total: 4000, lastContact: "2026-07-27" }],  // 5d → stale 7-21? 5<7 so not stale
  leads: [{ status: "new", value: 3000, lastContact: "2026-07-22" }],       // 10d → cold amber
  invoices: [{ paid: false, amt: 1000, dep: 0, due: "2026-07-28" }],        // 4d overdue amber
}, { asOfMs: ASOF });
ok("lead quiet 7-30d ⇒ amber", find(warm, "Leads").severity === "amber");
ok("invoice 1-30d overdue ⇒ amber", find(warm, "Cash / AR").severity === "amber");

// ---- close rate (needs ≥5 decided) ----
const cr = A.audit({
  leads: [{ status: "won" }, { status: "won" }, { status: "won" }, { status: "lost" }, { status: "lost" }, { status: "new", value: 100 }],
}, { asOfMs: ASOF });
ok("close rate graded when ≥5 decided", /Close rate 60%/.test(find(cr, "Close rate").title) && find(cr, "Close rate").metric.ratePct === 60);

// ---- concentration ----
const conc = A.audit({
  leads: [{ status: "new", value: 20000, customer: "BigCo" }, { status: "new", value: 2000, customer: "Small" }],
}, { asOfMs: ASOF });
ok("one customer >40% of pipeline ⇒ concentration risk", find(conc, "Risk") && /BigCo/.test(find(conc, "Risk").title));

// ---- margin graded ONLY when a target is supplied ----
const margin = A.audit({
  jobs: [{ status: "scheduled", value: 0, revenue: 10000, cost: 6000 }],
}, { asOfMs: ASOF, targetGm: 0.45 });
ok("margin graded vs supplied target (40% < 45% ⇒ not green)", /Blended GM 40%/.test(find(margin, "Margin").title) && find(margin, "Margin").severity !== "green");
ok("no fabricated GM target anywhere when none supplied", find(good, "Margin").metric === null);

// ---- COMPLIANCE: cert/license expiry (data-driven, days-UNTIL) ----
const certFind = (r) => r.findings.find((f) => f.area === "Compliance");
ok("all certs far in the future ⇒ green", certFind(A.audit({ certs: [{ name: "Fall Protection", expires: "2027-03-14" }, { name: "Forklift", expires: "2028-03-14" }] }, { asOfMs: ASOF })).severity === "green");
ok("cert within 60d ⇒ red (renew now)", certFind(A.audit({ certs: [{ name: "X", expires: "2026-09-05" }] }, { asOfMs: ASOF })).severity === "red");
ok("expired cert ⇒ red", certFind(A.audit({ certs: [{ name: "Y", expires: "2026-06-01" }] }, { asOfMs: ASOF })).severity === "red" && /EXPIRED/.test(certFind(A.audit({ certs: [{ name: "Y", expires: "2026-06-01" }] }, { asOfMs: ASOF })).title));
ok("cert 61–120d out ⇒ amber (plan ahead)", certFind(A.audit({ certs: [{ name: "Z", expires: "2026-11-09" }] }, { asOfMs: ASOF })).severity === "amber");
ok("cert with no expiry ⇒ amber 'missing an expiry'", A.audit({ certs: [{ name: "NoDate" }] }, { asOfMs: ASOF }).findings.some((f) => f.area === "Compliance" && /missing an expiry/.test(f.title)));
ok("no certs supplied ⇒ no Compliance finding (nothing fabricated)", !certFind(A.audit({}, { asOfMs: ASOF })));

// ---- guardrails ----
ok("empty book ⇒ ok, no throw, pipeline amber", (() => { const r = A.audit({}, { asOfMs: ASOF }); return r.ok === true && find(r, "Pipeline").severity === "amber"; })());
ok("no pricing/$ rate fabricated in findings", !/"(price|rate)"\s*:\s*\d/.test(JSON.stringify(good)));

console.log("\n" + (fail ? "✗ " : "✓ ") + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
