#!/usr/bin/env node
// Weather — pure spray-window go/no-go core of api/weather.js. Run: `node tests/weather.js`.
// Deterministic, keyless, no network (only the exported pure helpers; the handler's NWS/geocode
// fetches are not exercised). Covers parseWind (string → higher number), cToF, worst(), and the
// conservative assessHour ladder: rain %, cold/hot temp, the dew-point spread rule (condensation
// risk), and wind/overspray — each escalating GO → CAUTION → NOGO. Thresholds only, no fabrication.

const path = require("path");
const A = require(path.join(__dirname, "..", "api", "weather.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

console.log("Weather (spray-window go/no-go)\n");

// ---- parseWind: NWS windSpeed strings ----
ok("parseWind takes the higher number in a range", A.parseWind("5 to 10 mph") === 10);
ok("parseWind single value", A.parseWind("12 mph") === 12);
ok("parseWind null/none ⇒ null", A.parseWind(null) === null && A.parseWind("calm") === null);

// ---- cToF ----
ok("cToF 0°C = 32°F", A.cToF(0) === 32);
ok("cToF 100°C = 212°F", A.cToF(100) === 212);
ok("cToF null ⇒ null", A.cToF(null) === null);

// ---- worst() escalation ----
ok("worst keeps the more severe level", A.worst("GO", "CAUTION") === "CAUTION" && A.worst("NOGO", "CAUTION") === "NOGO");

// ---- assessHour: a clean ideal hour is GO ----
const good = A.assessHour({ temp: 65, dewpoint: 45, wind: 5, pop: 0 });
ok("ideal conditions ⇒ GO, no reasons", good.level === "GO" && good.reasons.length === 0);

// ---- rain ----
ok("pop ≥ 50% ⇒ NOGO", A.assessHour({ temp: 65, dewpoint: 45, wind: 5, pop: 60 }).level === "NOGO");
ok("pop 25–49% ⇒ CAUTION", A.assessHour({ temp: 65, dewpoint: 45, wind: 5, pop: 30 }).level === "CAUTION");

// ---- temperature ----
ok("temp < 35°F ⇒ NOGO (cold)", A.assessHour({ temp: 30, dewpoint: 10, wind: 5, pop: 0 }).level === "NOGO");
ok("temp 35–44°F ⇒ CAUTION (cool)", A.assessHour({ temp: 40, dewpoint: 20, wind: 5, pop: 0 }).level === "CAUTION");
ok("temp > 100°F ⇒ CAUTION (hot)", A.assessHour({ temp: 105, dewpoint: 50, wind: 5, pop: 0 }).level === "CAUTION");

// ---- dew-point spread (condensation) — surface must sit ≥5°F above dew point ----
ok("dew spread < 5°F ⇒ NOGO (condensation)", A.assessHour({ temp: 50, dewpoint: 47, wind: 5, pop: 0 }).level === "NOGO");
ok("dew spread 5–7°F ⇒ CAUTION (tight)", A.assessHour({ temp: 50, dewpoint: 44, wind: 5, pop: 0 }).level === "CAUTION");
ok("dew spread ≥ 8°F ⇒ GO (on that axis)", A.assessHour({ temp: 60, dewpoint: 45, wind: 5, pop: 0 }).level === "GO");

// ---- wind / overspray ----
ok("wind > 20 mph ⇒ NOGO (overspray)", A.assessHour({ temp: 65, dewpoint: 45, wind: 25, pop: 0 }).level === "NOGO");
ok("wind 16–20 mph ⇒ CAUTION", A.assessHour({ temp: 65, dewpoint: 45, wind: 18, pop: 0 }).level === "CAUTION");

// ---- worst-of wins across axes; reasons captured ----
const multi = A.assessHour({ temp: 30, dewpoint: 29, wind: 25, pop: 80 });
ok("multiple failures ⇒ NOGO with several reasons", multi.level === "NOGO" && multi.reasons.length >= 3);

console.log("\n" + (fail ? "✗ " : "✓ ") + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
