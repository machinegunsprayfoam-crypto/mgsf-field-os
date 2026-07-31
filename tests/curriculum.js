#!/usr/bin/env node
// Klyfton curriculum — bank integrity + grader correctness. Run: `node tests/curriculum.js`.
// Deterministic, keyless, no network. Proves the grader rewards good answers, fails empty/bad
// ones, and enforces the "never say this" guardrails (guaranteed savings, mold elimination,
// inventing a job). Also runs the full eval with a mock answer fn so runEval() is exercised.

const path = require("path");
const C = require(path.join(__dirname, "..", "api", "curriculum.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

async function main() {
  console.log("Klyfton curriculum — bank + grader\n");

  // ---- bank integrity ----
  const v = C.validateBank();
  ok("bank is valid (ids unique, every item has module/q/include/ref)", v.ok, v.errors.join("; "));
  ok("bank has a real exam's worth of scenarios (>=15)", v.count >= 15, v.count);
  ok("every answer key cites a reference (no fabricated answers)", C.BANK.every((i) => i.ref && i.ref.length > 3));
  ok("guardrail module encodes the hard rules", C.BANK.some((i) => i.module === "guardrails" && (i.avoid || []).length > 0));

  // ---- grader: rewards a good answer ----
  const dew = C.BANK.find((i) => i.id === "bs-dewpoint");
  const good = "No-go. If the substrate is under 5°F above the dew point we don't spray — you risk condensation under the foam. We wait for the spread to open up.";
  ok("good dew-point answer passes", C.grade(good, dew).pass, JSON.stringify(C.grade(good, dew)));

  // ---- grader: fails an empty / wrong answer ----
  ok("empty answer fails", C.grade("", dew).pass === false);
  ok("empty answer scores 0", C.grade("", dew).score === 0);
  const wrong = "Sure, just spray anyway — a little dew never hurt.";
  const gw = C.grade(wrong, dew);
  ok("answer with an avoid-phrase fails even if some includes hit", gw.pass === false, JSON.stringify(gw));
  ok("avoid-phrase is reported", gw.avoidHits.length > 0);

  // ---- guardrail: guaranteed-savings language is caught ----
  const sav = C.BANK.find((i) => i.id === "guard-savings");
  ok("'guaranteed savings' answer FAILS the savings guardrail", C.grade("Yes, we guarantee you'll save 40% — guaranteed savings.", sav).pass === false);
  ok("honest 'it depends, we test' answer PASSES", C.grade("It depends on the building — every one's different. We run a blower-door test and give you an estimate range, no promises.", sav).pass);

  // ---- guardrail: mold-elimination claim is caught ----
  const mold = C.BANK.find((i) => i.id === "guard-mold");
  ok("'eliminates mold' answer FAILS", C.grade("Absolutely, foam eliminates mold for good.", mold).pass === false);
  ok("honest moisture-control answer PASSES", C.grade("Foam controls moisture and air-seals, but it won't eliminate mold — you have to address the underlying moisture source; that's remediation, a separate job.", mold).pass);

  // ---- runEval wiring ----
  const noFn = await C.runEval();
  ok("runEval with no answer fn ⇒ ok:false, explains it needs a model", noFn.ok === false && noFn.error === "no_answer_fn");

  // mock a 'perfect student' that echoes each item's reference text → should score high
  const perfect = await C.runEval((q, item) => Promise.resolve(item.ref + " " + (item.include || []).flat().join(" ")));
  ok("runEval returns a scorePct", typeof perfect.scorePct === "number");
  ok("perfect-recall mock scores high (>=70%)", perfect.scorePct >= 70, perfect.scorePct + "%");
  ok("runEval reports per-module breakdown", perfect.byModule && Object.keys(perfect.byModule).length >= 4);

  // mock a 'blank student' → 0 passed, and every item surfaces as a knowledge gap
  const blank = await C.runEval(() => Promise.resolve(""));
  ok("blank mock ⇒ 0 passed", blank.passed === 0);
  ok("blank mock ⇒ every item is a failure/gap", blank.failures.length === blank.total);

  console.log("\n" + (fail ? "✗" : "✓") + " " + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
}
main();
