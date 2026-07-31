#!/usr/bin/env node
// Geo mobilization invariants — the locked-doctrine tier math. Run: `node tests/geo.js`
// Pure/keyless: mobilization(miles) must match mgsf-core DOCTRINE exactly
// (<25 $100 · 25–50 $200 · 50+ $350 · +$1.50/mi past 100). Deterministic.

const path = require("path");
const G = require(path.join(__dirname, "..", "api", "geo.js"));
let pass = 0, fail = 0;
const near = (a, b) => Math.abs(a - b) <= 0.005;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

console.log("Geo mobilization invariants (locked doctrine tiers)\n");

// tier boundaries
ok("0 mi ⇒ $100 (<25 tier)", G.mobilization(0).total === 100 && G.mobilization(0).tier === "<25 mi");
ok("24 mi ⇒ $100", G.mobilization(24).total === 100);
ok("25 mi ⇒ $200 (25–50 tier)", G.mobilization(25).total === 200 && G.mobilization(25).tier === "25–50 mi");
ok("50 mi ⇒ $200 (boundary inclusive)", G.mobilization(50).total === 200);
ok("51 mi ⇒ $350 (50+ tier, no surcharge under 100)", G.mobilization(51).total === 350 && G.mobilization(51).tier === "50+ mi");
ok("100 mi ⇒ $350 (surcharge starts AFTER 100)", G.mobilization(100).total === 350 && G.mobilization(100).surcharge === 0);

// per-mile surcharge past 100
(() => {
  const m = G.mobilization(120);
  ok("120 mi ⇒ base 350 + 20*$1.50", m.base === 350 && near(m.surcharge, 30) && near(m.total, 380), JSON.stringify(m));
})();
ok("150 mi ⇒ $350 + 50*1.50 = $425", near(G.mobilization(150).total, 425), G.mobilization(150).total);

// monotonic: total never decreases as miles rise
(() => {
  let prev = -1, mono = true;
  for (let mi = 0; mi <= 300; mi += 7) { const t = G.mobilization(mi).total; if (t < prev) mono = false; prev = t; }
  ok("mobilization total is monotonic in miles", mono);
})();

// guards
ok("negative miles ⇒ bad_miles", G.mobilization(-5).ok === false);
ok("non-number ⇒ bad_miles", G.mobilization("abc").ok === false);
ok("no NaN in output", (() => { const m = G.mobilization(137.4); return Number.isFinite(m.total) && Number.isFinite(m.surcharge); })());

// gating (no key in test env)
ok("isConfigured reflects env (boolean)", typeof G.isConfigured() === "boolean");
(async () => {
  const g = await G.geocode("anywhere");
  ok("geocode unconfigured ⇒ not_configured (no fetch)", g.ok === false && (g.reason === "not_configured" || /geocode_/.test(g.reason)));
  ok("HQ constant present", /Glendive/.test(G._HQ));

  console.log("\n" + (fail ? "✗" : "✓") + " " + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
