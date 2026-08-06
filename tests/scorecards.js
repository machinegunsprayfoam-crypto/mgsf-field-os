#!/usr/bin/env node
// Regression suite for crew/rig scorecards (api/scorecards.js). Locks: per-crew/per-rig aggregation of
// real yield/productivity/margin from job actuals (via yield-variance), margin-adherence ranking,
// winter-vs-summer split, pattern insights, and no fabrication (missing metrics skipped, not zeroed).
// Keyless, deterministic. Run: node tests/scorecards.js

const path = require("path");
const sc = require(path.join(__dirname, "..", "api", "scorecards.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

// Crew A: an over-bid summer job + an on-bid winter job. Crew B: one clean summer job.
const RECORDS = [
  { crew: "A", rig: "Rig 1", date: "2026-07-10",
    bid: { boardFeet: 12000, sets: 3, laborHours: 16, material: 11784, labor: 2048, sell: 30000 },
    actual: { boardFeet: 13200, sets: 4, laborHours: 20, material: 13096, labor: 2560 } },   // yield 3300, prod 660, margin -6.1, overrun +10
  { crew: "A", rig: "Rig 1", date: "2026-01-15",
    bid: { boardFeet: 10000, sets: 2, laborHours: 12, material: 9820, labor: 1536, sell: 24000 },
    actual: { boardFeet: 10000, sets: 2, laborHours: 12, material: 9820, labor: 1536 } },     // yield 5000, prod 833.3, margin 0, overrun 0
  { crew: "B", rig: "Rig 2", date: "2026-07-20",
    bid: { boardFeet: 8000, sets: 2, laborHours: 10, material: 7856, labor: 1280, sell: 20000 },
    actual: { boardFeet: 8000, sets: 2, laborHours: 10, material: 7856, labor: 1280 } },      // yield 4000, prod 800, margin 0, overrun 0
];

console.log("Crew/rig scorecards invariants\n");

// ---- per-crew aggregation ----
(() => {
  const o = sc.scorecards({ records: RECORDS });
  const A = o.crews.find((c) => c.name === "A"), B = o.crews.find((c) => c.name === "B");
  ok("two crews", o.crews.length === 2);
  ok("A jobs = 2", A.jobs === 2);
  ok("A avg yield = mean(3300,5000) = 4150", A.avgYield === 4150, A.avgYield);
  ok("A avg productivity = mean(660,833.3) = 746.7", A.avgProductivity === 746.7, A.avgProductivity);
  ok("A avg foam overrun = mean(10,0) = 5", A.avgFoamOverrunPct === 5, A.avgFoamOverrunPct);
  ok("A avg margin delta is negative (ran under bid)", A.avgMarginDeltaPts < 0, A.avgMarginDeltaPts);
  ok("B on-bid (margin delta ~0)", Math.abs(B.avgMarginDeltaPts) <= 1);
})();

// ---- ranking: best margin adherence first (B over A) ----
(() => {
  const o = sc.scorecards({ records: RECORDS });
  ok("B ranked above A (better margin adherence)", o.crews[0].name === "B", o.crews.map((c) => c.name).join(">"));
})();

// ---- per-rig aggregation ----
(() => {
  const o = sc.scorecards({ records: RECORDS });
  ok("two rigs", o.rigs.length === 2);
  ok("Rig 1 carries A's two jobs", o.rigs.find((r) => r.name === "Rig 1").jobs === 2);
})();

// ---- winter vs summer split ----
(() => {
  const o = sc.scorecards({ records: RECORDS });
  ok("summer has 2 jobs (Jul ×2)", o.bySeason.summer.jobs === 2, o.bySeason.summer.jobs);
  ok("winter has 1 job (Jan)", o.bySeason.winter.jobs === 1, o.bySeason.winter.jobs);
  ok("winter yield computed (5000)", o.bySeason.winter.avgYield === 5000, o.bySeason.winter.avgYield);
})();

// ---- insights surface (coaching) ----
(() => {
  const o = sc.scorecards({ records: RECORDS });
  ok("insight names best-vs-worst margin", o.insights.some((s) => /holds margin best/i.test(s)));
})();

// ---- no fabrication: a job missing actual sets doesn't invent yield ----
(() => {
  const o = sc.scorecards({ records: [{ crew: "C", date: "2026-07-01", bid: { boardFeet: 5000, sets: 1, sell: 12000 }, actual: {} }] });
  const C = o.crews.find((c) => c.name === "C");
  ok("no actuals → yield null (not zeroed)", C.avgYield === null, C.avgYield);
  ok("still counts the job", C.jobs === 1);
})();

// ---- unassigned crew grouping + empty body ----
(() => {
  const o = sc.scorecards({ records: [{ date: "2026-07-01", bid: { boardFeet: 5000, sets: 1, laborHours: 6, sell: 12000 }, actual: { boardFeet: 5000, sets: 1, laborHours: 6 } }] });
  ok("missing crew → '(unassigned)'", o.crews[0].name === "(unassigned)");
  let threw = false, e = null; try { e = sc.scorecards({}); } catch { threw = true; }
  ok("empty body: no throw, ok:true, zero jobs", threw === false && e.ok === true && e.jobs === 0);
})();

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
