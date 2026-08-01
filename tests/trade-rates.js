#!/usr/bin/env node
// Trade rates — pure rate-memory core of api/trade-rates.js. Run: `node tests/trade-rates.js`.
// Deterministic, keyless, no network. Covers the rate map build, applyRates (fills MISSING rates only,
// never overrides owner input), key normalization, and the guardrail that nothing is fabricated.

const path = require("path");
const A = require(path.join(__dirname, "..", "api", "trade-rates.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

console.log("Trade rates (per-trade rate memory)\n");

// ---- rate map + key ----
ok("rateKey normalizes trade + item", A.rateKey("Electrical", " 12/2 Romex ") === A.rateKey("electrical", "12/2 romex"));
const map = A.toRateMap([{ trade: "electrical", item: "12/2 romex", unit: "ft", unit_cost: 0.65, labor_rate: 55 }]);
ok("toRateMap keys by trade|item", map[A.rateKey("electrical", "12/2 romex")].unitCost === 0.65);

// ---- applyRates: fill missing only ----
const r = A.applyRates([{ desc: "12/2 romex", qty: 500 }], map, "electrical");
ok("fills missing unit cost from saved", r.lineItems[0].unitCost === 0.65 && r.lineItems[0]._filledCost === true);
ok("fills missing labor rate + unit", r.lineItems[0].laborRate === 55 && r.lineItems[0].unit === "ft");
ok("filled count + note", r.filled === 2 && /pre-filled/.test(r.note));
// NEVER override an owner-entered rate
const keep = A.applyRates([{ desc: "12/2 romex", qty: 500, unitCost: 0.99 }], map, "electrical");
ok("does NOT override a rate the owner already typed", keep.lineItems[0].unitCost === 0.99 && !keep.lineItems[0]._filledCost);
// no match ⇒ untouched
const none = A.applyRates([{ desc: "mystery item", qty: 1 }], map, "electrical");
ok("no saved match ⇒ line untouched, honest note", none.lineItems[0].unitCost === undefined && none.filled === 0 && /No saved rates matched/.test(none.note));
// wrong trade ⇒ no match
ok("rates are trade-scoped (plumbing ≠ electrical)", A.applyRates([{ desc: "12/2 romex" }], map, "plumbing").filled === 0);

// ---- guardrail: nothing invented ----
ok("empty map fills nothing", A.applyRates([{ desc: "x", qty: 1 }], {}, "electrical").filled === 0);
ok("empty rows ⇒ empty map (no fabricated rates)", Object.keys(A.toRateMap([])).length === 0);

console.log("\n" + (fail ? "✗ " : "✓ ") + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
