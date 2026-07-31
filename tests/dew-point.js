#!/usr/bin/env node
// Dew-point spray-safety flag + margin thresholds. Run: `node tests/dew-point.js`.
// calc-invariants covers the physical invariant (dp ≤ air, monotonic in RH); THIS suite
// covers the GO/CAUTION/NO-GO decision — the actual spray-safety call — plus the 5°F margin,
// substrate defaulting, input errors, and RH clamping. Pure, keyless, deterministic.

const path = require("path");
const { calc } = require(path.join(__dirname, "..", "api", "dew-point.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

console.log("Dew-point spray-safety — flag + margin thresholds\n");

// ---- input validation ----
ok("missing airTempF ⇒ error", calc({ humidityPct: 50 }).ok === false);
ok("missing humidityPct ⇒ error", calc({ airTempF: 60 }).ok === false);
ok("error names the missing inputs", calc({}).error === "need_airTempF_and_humidityPct");

// ---- physical reference: 100% RH ⇒ dew point ≈ air temp ----
(() => {
  const d = calc({ airTempF: 68, humidityPct: 100, substrateTempF: 68 });
  ok("100% RH ⇒ dew point ≈ air temp (±1°F)", Math.abs(d.dewPointF - 68) <= 1, d.dewPointF);
})();

// ---- the GO / CAUTION / NO-GO flag against the 5°F margin ----
(() => {
  const base = calc({ airTempF: 70, humidityPct: 50, substrateTempF: 70 });
  const dp = base.dewPointF;                 // reference dew point for these inputs
  ok("baseline exposes a dew point", typeof dp === "number" && isFinite(dp), dp);

  const nogo = calc({ airTempF: 70, humidityPct: 50, substrateTempF: dp - 5 });
  ok("substrate below dew point ⇒ NO-GO", nogo.flag === "NO-GO", nogo.flag + " spread=" + nogo.spreadF);
  ok("NO-GO advice says do not spray", /do not spray/i.test(nogo.advice), nogo.advice);

  const caution = calc({ airTempF: 70, humidityPct: 50, substrateTempF: dp + 2 });
  ok("0–5°F above dew point ⇒ CAUTION", caution.flag === "CAUTION", caution.flag + " spread=" + caution.spreadF);

  const go = calc({ airTempF: 70, humidityPct: 50, substrateTempF: dp + 10 });
  ok("≥5°F above dew point ⇒ GO", go.flag === "GO", go.flag + " spread=" + go.spreadF);

  ok("flag is always one of GO/CAUTION/NO-GO", ["GO", "CAUTION", "NO-GO"].indexOf(go.flag) >= 0);
  ok("marginF is the documented 5°F", go.marginF === 5, go.marginF);
})();

// ---- substrate defaults to air temp when not measured ----
(() => {
  const d = calc({ airTempF: 72, humidityPct: 40 });
  ok("substrate defaults to air temp", d.substrateTempF === 72, d.substrateTempF);
  ok("spread = air − dew point when substrate omitted", Math.abs(d.spreadF - (72 - d.dewPointF)) <= 0.1, d.spreadF);
})();

// ---- monotonic: higher humidity ⇒ higher dew point (safety gets tighter) ----
(() => {
  const lo = calc({ airTempF: 65, humidityPct: 40, substrateTempF: 65 }).dewPointF;
  const hi = calc({ airTempF: 65, humidityPct: 85, substrateTempF: 65 }).dewPointF;
  ok("higher RH ⇒ higher dew point", hi > lo, lo + " -> " + hi);
})();

// ---- RH clamping: out-of-range humidity never yields NaN/Infinity or a throw ----
(() => {
  const over = calc({ airTempF: 60, humidityPct: 150, substrateTempF: 45 });
  ok("RH>100 clamped, finite dew point", over.ok === true && isFinite(over.dewPointF), JSON.stringify(over).slice(0, 60));
  const zero = calc({ airTempF: 60, humidityPct: 0, substrateTempF: 45 });
  ok("RH<=0 clamped, finite dew point (no -Infinity)", zero.ok === true && isFinite(zero.dewPointF), zero.dewPointF);
})();

// ---- labeling: advisory, never a guarantee (defers to the foam TDS) ----
(() => {
  const d = calc({ airTempF: 70, humidityPct: 50, substrateTempF: 80 });
  ok("result labeled ESTIMATE", d.label === "ESTIMATE", d.label);
  ok("note defers to the printed foam data sheet", /data sheet|TDS/i.test(d.note), d.note);
})();

console.log("\n" + (fail ? "✗" : "✓") + " " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
