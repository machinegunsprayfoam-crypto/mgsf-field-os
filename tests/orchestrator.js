#!/usr/bin/env node
// Orchestrator loop invariants — plan → run → critique → bounded correction. Run: `node tests/orchestrator.js`
//
// The core is PURE: orchestrate() takes injected async run()/critique() fns, so we drive it with
// deterministic fakes (no network, no key, no Date/random). We assert the loop's behavioral
// invariants: retry-on-fail, stop-on-pass, respect the round cap, keep the BEST answer, feed the
// critique back, and never throw when an injected fn fails. Keyless, no npm, deterministic.

const path = require("path");
const O = require(path.join(__dirname, "..", "api", "orchestrator.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

console.log("Orchestrator loop invariants — plan/run/critique/correct\n");

// ---- parseCritique (pure verdict parsing) ----
(() => {
  const P = O.parseCritique;
  ok("parse: reads SCORE line", P("SCORE: 0.92\nlooks good").score === 0.92, P("SCORE: 0.92").score);
  ok("parse: SCORE=1 clamps to 1", P("SCORE: 1.0").score === 1);
  ok("parse: FIX captured", P("SCORE: 0.4\nFIX: add the price; cite the code").fix.length > 0);
  ok("parse: FIX splits into issues", P("SCORE: 0.4\nFIX: add price; cite code").issues.length === 2,
     JSON.stringify(P("SCORE: 0.4\nFIX: add price; cite code").issues));
  ok("parse: fail words w/o score ⇒ low", P("this is wrong and fabricated").score === 0.3);
  ok("parse: pass words w/o score ⇒ high", P("accurate and verified").score === 0.9);
  ok("parse: garbage ⇒ soft-pass 0.7 (no trap)", P("").score === 0.7);
  ok("parse: SCORE=0 stays 0", P("SCORE: 0").score === 0);
  ok("parse: out-of-range SCORE ignored ⇒ soft 0.7", P("SCORE: 2.5").score === 0.7, P("SCORE: 2.5").score);
})();

// helpers: a run() that tags the answer with the fixNote it saw, a critique() from a script of scores
const runEcho = (task, fixNote) => Promise.resolve("ANSWER[" + (fixNote ? "fixed" : "first") + "]");
function scriptedCritique(scores) { let i = 0; return () => Promise.resolve("SCORE: " + (scores[Math.min(i++, scores.length - 1)])); }

// ---- stop-on-pass: first answer good ⇒ exactly one round, no retry ----
(async () => {
  const r = await O.orchestrate({ task: "t", run: runEcho, critique: scriptedCritique([0.95]), rounds: 2 });
  ok("pass: ok", r.ok === true);
  ok("pass: one round only", r.rounds === 1, r.rounds);
  ok("pass: passed=true", r.passed === true);
  ok("pass: returns the first answer", r.answer === "ANSWER[first]", r.answer);

  // ---- retry-on-fail then pass: two rounds, second feeds fix back ----
  const r2 = await O.orchestrate({ task: "t", run: runEcho, critique: scriptedCritique([0.4, 0.9]), rounds: 2 });
  ok("retry: two rounds", r2.rounds === 2, r2.rounds);
  ok("retry: ends passed", r2.passed === true);
  ok("retry: second run saw the fix note", r2.answer === "ANSWER[fixed]", r2.answer);
  ok("retry: trace records round 0 as not-passed", r2.trace[0].passed === false);

  // ---- never passes: respects the round cap and returns BEST (highest score) ----
  const r3 = await O.orchestrate({ task: "t", run: runEcho, critique: scriptedCritique([0.3, 0.6, 0.5]), rounds: 1 });
  ok("cap: rounds = 1 retry ⇒ 2 attempts", r3.rounds === 2, r3.rounds);
  ok("cap: passed=false", r3.passed === false);
  ok("cap: keeps BEST score (0.6 > 0.3)", r3.score === 0.6, r3.score);

  // ---- hard cap: asking for 99 rounds is clamped to MAX_ROUNDS_CAP ----
  const r4 = await O.orchestrate({ task: "t", run: runEcho, critique: scriptedCritique([0.1]), rounds: 99 });
  ok("cap: never exceeds MAX+1 attempts", r4.rounds <= O._MAX_ROUNDS_CAP + 1, r4.rounds);

  // ---- resilience: run() throws ⇒ no crash, ok stays true, empty answer ----
  const rThrow = await O.orchestrate({ task: "t", run: () => { throw new Error("boom"); }, critique: scriptedCritique([0.9]), rounds: 1 });
  ok("resilient: run throw ⇒ no crash", rThrow.ok === true);
  ok("resilient: run throw ⇒ trace has error", !!rThrow.trace[0].error, JSON.stringify(rThrow.trace[0]));

  // ---- resilience: critique() throws ⇒ soft-accept answer (don't discard good work) ----
  const cThrow = await O.orchestrate({ task: "t", run: runEcho, critique: () => { throw new Error("bad critic"); }, rounds: 1 });
  ok("resilient: critic throw ⇒ ok", cThrow.ok === true);
  ok("resilient: critic throw ⇒ answer kept", cThrow.answer === "ANSWER[first]", cThrow.answer);

  // ---- guards: missing task / runners ----
  const g1 = await O.orchestrate({ task: "", run: runEcho, critique: scriptedCritique([1]) });
  ok("guard: no task ⇒ ok:false", g1.ok === false && g1.reason === "no_task");
  const g2 = await O.orchestrate({ task: "t" });
  ok("guard: no runners ⇒ ok:false", g2.ok === false && g2.reason === "no_runners");

  // ---- gating: unconfigured without a key ----
  ok("gate: isConfigured reflects env", typeof O.isConfigured() === "boolean");

  console.log("\n" + (fail ? "✗" : "✓") + " " + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
