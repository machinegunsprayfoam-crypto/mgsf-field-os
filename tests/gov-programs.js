#!/usr/bin/env node
// Gov-programs — state-gov + workforce/labor helper (api/gov-programs.js). Run: `node tests/gov-programs.js`.
// Deterministic, keyless, no network. Covers state normalization + profiles, prevailing-wage
// applicability (federal Davis-Bacon threshold + state layer, incl. states with NO state PW),
// workforce-incentive matching, checklist assembly, analyze wiring, and the never-fabricate guardrail
// (every entry carries a verify pointer; disclaimer present; GUIDANCE not a ruling).

const path = require("path");
const A = require(path.join(__dirname, "..", "api", "gov-programs.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

console.log("Gov-programs (state-gov + workforce/labor helper)\n");

// ---- normState + profiles ----
ok("normState code MT", A.normState("mt") === "MT");
ok("normState full name Montana", A.normState("Montana") === "MT");
ok("normState unknown → null", A.normState("California") === null);
["MT", "ND", "SD", "WY"].forEach((c) => {
  const p = A.stateProfile(c);
  ok(c + " profile has registration steps", p && Array.isArray(p.registration) && p.registration.length > 0);
  ok(c + " every registration step has a verify pointer", p.registration.every((s) => !!s.verify));
});
ok("unknown state profile → null", A.stateProfile("CA") === null);

// ---- prevailing wage: federal Davis-Bacon threshold ----
ok("Davis-Bacon threshold is $2,000", A.DAVIS_BACON_THRESHOLD === 2000);
const fedOver = A.prevailingWage({ federallyFunded: true, publicWorks: true, contractValue: 50000 });
ok("federal PW applies when funded + over threshold", fedOver.federal.applies === "yes");
const fedUnder = A.prevailingWage({ federallyFunded: true, publicWorks: true, contractValue: 1500 });
ok("federal PW does not apply at/under $2,000", /^no/.test(fedUnder.federal.applies));
const fedNoVal = A.prevailingWage({ federallyFunded: true, publicWorks: true });
ok("federal PW 'likely (verify)' when value unknown", /likely/.test(fedNoVal.federal.applies));
const notFed = A.prevailingWage({ federallyFunded: false });
ok("not federally funded ⇒ federal PW only-on-federal note", /only on federal/.test(notFed.federal.applies));

// ---- prevailing wage: state layer (MT has it; ND/SD/WY do not) ----
const mt = A.prevailingWage({ state: "MT", publicWorks: true });
ok("MT has a state prevailing-wage law", mt.state.law && /Montana/.test(mt.state.law) && /yes/.test(mt.state.applies));
["ND", "SD", "WY"].forEach((c) => {
  const r = A.prevailingWage({ state: c, publicWorks: true });
  ok(c + " has no state prevailing-wage law", /no state prevailing-wage/.test(r.state.applies) && !!r.state.verify);
});

// ---- workforce incentives ----
const vet = A.workforcePrograms({ hiring: { veteran: true }, state: "MT" });
ok("veteran hire surfaces WOTC", vet.programs.some((p) => p.id === "wotc"));
ok("workforce carries a verify pointer + not-tax-advice note", !!vet.programs[0].verify && /CPA/.test(vet.note));
const appr = A.workforcePrograms({ hiring: { apprentice: true } });
ok("apprentice hire surfaces apprenticeship + OJT", appr.programs.some((p) => p.id === "apprenticeship") && appr.programs.some((p) => p.id === "ojt"));
ok("no hiring flags ⇒ all programs listed", A.workforcePrograms({}).programs.length === A.WORKFORCE.length);

// ---- checklist ----
ok("federal checklist has SAM.gov step", A.checklist({ jurisdiction: "federal" }).steps.some((s) => /SAM\.gov/.test(s.step)));
ok("MT checklist carries state name + preference", (() => { const c = A.checklist({ state: "MT" }); return c.name === "Montana" && c.preference && c.preference.has === true; })());
ok("unknown jurisdiction ⇒ empty steps + note", A.checklist({ jurisdiction: "ZZ" }).steps.length === 0);

// ---- analyze wiring + guardrails ----
const res = A.analyze({ state: "MT", federallyFunded: true, contractValue: 100000, publicWorks: true, hiring: { veteran: true } });
ok("analyze returns state + PW + workforce + registration", !!res.state && !!res.prevailingWage && !!res.workforce && !!res.registration);
ok("analyze is GUIDANCE with a disclaimer (never a ruling)", res.label === "GUIDANCE" && /NOT a legal\/tax ruling/i.test(res.disclaimer));
ok("analyze MT+federal shows both PW layers", res.prevailingWage.federal.applies === "yes" && /yes/.test(res.prevailingWage.state.applies));
ok("analyze always includes federal registration path", Array.isArray(res.federalRegistration) && res.federalRegistration.length > 0);
// no-input still safe
const bare = A.analyze({});
ok("analyze with no input still returns guidance (no fabrication)", bare.ok === true && !!bare.disclaimer && !!bare.workforce);

// every FEDERAL + WORKFORCE entry carries a source/verify (grounded, not invented)
ok("every federal registration step has a url", A.FEDERAL.registration.every((s) => /^https?:\/\//.test(s.url || "")));
ok("every workforce program has url + verify", A.WORKFORCE.every((p) => /^https?:\/\//.test(p.url) && !!p.verify));

console.log("\n" + (fail ? "✗ " : "✓ ") + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
