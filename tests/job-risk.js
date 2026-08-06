#!/usr/bin/env node
// Regression suite for the "Should We Take It?" job-risk score (api/job-risk.js). Locks: weighted
// factor scoring, TAKE/RAISE PRICE/WALK thresholds, worst-of margin (GM or profit/day), assessed-only
// denominator (never penalizes for a factor you didn't supply), ranked reasons + top driver, and no
// fabrication (unsupplied factors are listed as not-assessed). Keyless, deterministic. Run: node tests/job-risk.js

const path = require("path");
const jr = require(path.join(__dirname, "..", "api", "job-risk.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

console.log("Job-risk ('Should We Take It?') invariants\n");

// ---- high-risk job → WALK (clean integer math) ----
(() => {
  // miles 75 → 10/20 ; weather nogo → 25/25 ; access [confined] → 6/15 ; substrate unknown → 15/15 ;
  // pastOverrunPct 25 → 15/15 ; crewLoad heavy → 10/10 ; margin NOT supplied (skipped).
  const o = jr.score({ miles: 75, weather: "nogo", access: ["confined"], substrate: "unknown", pastOverrunPct: 25, crewLoad: "heavy" });
  ok("sum 81 / max 100 → score 81", o.riskScore === 81, o.riskScore);
  ok("verdict WALK (>60)", o.verdict === "WALK");
  ok("top driver = weather", o.topDriver === "weather", o.topDriver);
  ok("margin listed not-assessed (never invented)", o.notAssessed.includes("margin") && !o.assessed.includes("margin"));
  ok("reasons ranked, weather first", /^weather:/.test(o.reasons[0]));
})();

// ---- low-risk job → TAKE ----
(() => {
  const o = jr.score({ miles: 10, weather: "go", access: [], substrate: "known", trueGmPct: 55, targetGmPct: 45, pastOverrunPct: 0, crewLoad: "light" });
  ok("low score", o.riskScore <= 10, o.riskScore);
  ok("verdict TAKE (≤30)", o.verdict === "TAKE");
  ok("good margin contributes 0", o.contributions.find((c) => c.factor === "margin").points === 0);
})();

// ---- mid-risk → RAISE PRICE ----
(() => {
  const o = jr.score({ miles: 60, weather: "caution", access: ["lift", "winter"], substrate: "some" });
  ok("score in RAISE band", o.riskScore > 30 && o.riskScore <= 60, o.riskScore);
  ok("verdict RAISE PRICE", o.verdict === "RAISE PRICE");
})();

// ---- weather severity mapping ----
(() => {
  ok("weather go = 0 pts", jr.score({ weather: "go" }).contributions[0].points === 0);
  ok("weather caution = 12.5 pts", jr.score({ weather: "caution" }).contributions[0].points === 12.5);
  ok("weather nogo = 25 pts", jr.score({ weather: "nogo" }).contributions[0].points === 25);
  // sprayable-days form
  const d = jr.score({ sprayDaysNeeded: 4, sprayDaysAvailable: 1 });
  ok("1/4 sprayable days → high weather risk", d.contributions[0].points === 18.8, d.contributions[0].points);
})();

// ---- access tags stack + cap ----
(() => {
  const one = jr.score({ access: ["confined"] }).contributions[0];
  ok("confined alone = 0.4 → 6 pts", one.points === 6, one.points);
  const many = jr.score({ access: ["lift", "confined", "occupied", "winter", "height"] }).contributions[0];
  ok("many tags cap at max 15", many.points === 15 && many.sev === 1);
})();

// ---- margin: worst of trueGM shortfall and profit/day shortfall ----
(() => {
  // GM fine (50≥45 → 0) but profit/day below floor → margin risk from per-day.
  const o = jr.score({ trueGmPct: 50, targetGmPct: 45, profitPerDay: 1000, minDayProfit: 4000 });
  const m = o.contributions.find((c) => c.factor === "margin");
  ok("per-day shortfall drives margin risk", /profit\/day/.test(m.why) && m.points === 18.8, m.points);
})();

// ---- assessed-only denominator: sparse input isn't penalized for missing factors ----
(() => {
  const o = jr.score({ weather: "go" });
  ok("only weather assessed → score 0 (go)", o.riskScore === 0);
  ok("6 factors listed not-assessed", o.notAssessed.length === 6, o.notAssessed.length);
  ok("note explains partial scoring", /not assessed/i.test(o.note));
})();

// ---- overridable thresholds + weights ----
(() => {
  const o = jr.score({ weather: "caution", thresholds: { take: 40, raise: 90 } });
  // caution alone → 25/25 = 100? no: only weather assessed → 12.5/25 = 50 → within raise(90) but >take(40)
  ok("custom thresholds shift verdict", o.verdict === "RAISE PRICE", o.riskScore + " " + o.verdict);
})();

// ---- empty body: no throw, unscored ----
(() => {
  let threw = false, o = null;
  try { o = jr.score({}); } catch { threw = true; }
  ok("empty: no throw, ok:true", threw === false && o.ok === true);
  ok("empty: null score, UNSCORED", o.riskScore === null && o.verdict === "UNSCORED");
})();

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
