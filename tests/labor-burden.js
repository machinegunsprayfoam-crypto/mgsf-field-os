#!/usr/bin/env node
// Labor burden (api/labor-burden.js) — base wage → fully-loaded hourly cost (the number that belongs
// in job-cost's laborRate). Locks: statutory-only FICA baked in, all volatile burdens owner-entered,
// the understated-flag when workers'-comp/benefits are omitted (never invents a comp rate), the math,
// and the input guard. Keyless, deterministic. Run: node tests/labor-burden.js

const path = require("path");
const L = require(path.join(__dirname, "..", "api", "labor-burden.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }
const near = (a, b) => Math.abs(a - b) < 0.02;

console.log("Labor burden (wage → loaded cost)\n");

// ---- only FICA is baked in; nothing else invented ----
ok("employer FICA constant is the statutory 7.65%", L.EMPLOYER_FICA === 0.0765);
{
  const r = L.calc({ baseWage: 25 });
  ok("bare wage ⇒ FICA-only loaded (25 × 1.0765)", near(r.loadedHourly, 26.91));
  ok("bare wage ⇒ flagged UNDERSTATED (comp + benefits missing)", r.flags.length === 1 && /understated/i.test(r.flags[0]) && /comp/i.test(r.flags[0]) && /benefits/i.test(r.flags[0]));
  ok("never invents a workers'-comp rate (comp line = 0)", r.breakdown.workersComp === 0);
}

// ---- full burden math ----
{
  const r = L.calc({ baseWage: 25, hours: 8, compPct: 12, benefitsPct: 8, futaSutaPct: 2 });
  ok("loaded hourly = wage × (1 + FICA + comp + benefits + futa)", near(r.loadedHourly, 32.41), r.loadedHourly);
  ok("burden % reported", near(r.burdenPct, 29.6), r.burdenPct);
  ok("loaded cost = loaded hourly × hours", near(r.loadedCost, 259.28), r.loadedCost);
  ok("fully specified ⇒ no understated flag", r.flags.length === 0);
  ok("breakdown lines are per-hour dollars off the base wage", near(r.breakdown.workersComp, 3) && near(r.breakdown.employerFICA, 1.91));
}

// ---- flat $/hr benefit adds on top (not a % of wage) ----
{
  const r = L.calc({ baseWage: 20, compPct: 10, benefitsPerHour: 2.5 });
  ok("flat benefit added on top of the percent burdens", near(r.loadedHourly, 20 * (1 + 0.0765 + 0.10) + 2.5), r.loadedHourly);
  ok("flat benefit satisfies the benefits flag", r.flags.length === 0);
}

// ---- guards ----
ok("no base wage ⇒ error (no fabricated cost)", L.calc({}).ok === false && L.calc({ baseWage: 0 }).ok === false);
ok("negative inputs floored, never throws", L.calc({ baseWage: 25, compPct: -5 }).ok === true);
ok("ties to job-cost (feeds laborRate)", /job-cost/.test(L.calc({ baseWage: 25 }).feeds));

console.log("\n" + (fail ? "✗ " : "✓ ") + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
