#!/usr/bin/env node
// Trade estimate — pure core of api/trade-estimate.js. Run: `node tests/trade-estimate.js`.
// Deterministic, keyless. Covers line pricing (material + labor from OWNER rates), unpriced-line
// handling (never guessed), subtotal/markup/tax (owner-only, else deferred), total, the MGSF-doctrine
// deferral, and the guardrails: DRAFT, owner-priced, nothing fabricated.

const path = require("path");
const A = require(path.join(__dirname, "..", "api", "trade-estimate.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

console.log("Trade estimate (owner-rate pricing)\n");

// ---- line pricing ----
const l = A.priceLine({ desc: "12/2 romex", qty: 500, unit: "ft", unitCost: 0.65, laborHours: 8, laborRate: 55 });
ok("material = qty × unit cost", l.material === 325);
ok("labor = hours × rate", l.labor === 440);
ok("line total = material + labor", l.lineTotal === 765 && l.priced === true);
ok("no rate ⇒ unpriced, $0, not guessed", (() => { const u = A.priceLine({ desc: "panel", qty: 1 }); return u.priced === false && u.material === 0 && /not estimated/i.test(u.unpriced); })());
ok("labor-only line prices", A.priceLine({ desc: "trim out", laborHours: 10, laborRate: 60 }).lineTotal === 600);

// ---- estimate totals ----
const e = A.estimate({ trade: "electrical", lineItems: [
  { desc: "wire", qty: 500, unit: "ft", unitCost: 0.65, laborHours: 8, laborRate: 55 },   // 325 + 440
  { desc: "panel", qty: 1, unitCost: 400, laborHours: 6, laborRate: 55 },                  // 400 + 330
], markupPct: 15, taxPct: 6 });
ok("subtotal material", e.subtotalMaterial === 725);
ok("subtotal labor", e.subtotalLabor === 770);
ok("subtotal = material + labor", e.subtotal === 1495);
ok("markup owner-entered (15% of subtotal)", e.markup.amount === round(1495 * 0.15) && e.markup.source === "owner-entered");
ok("tax owner-entered on materials (6% of 725)", e.tax.amount === round(725 * 0.06) && e.tax.on === "materials");
ok("total = subtotal + markup + tax", e.total === round(1495 + 1495 * 0.15 + 725 * 0.06));
function round(n) { return Math.round(n * 100) / 100; }

// ---- deferrals ----
const noMk = A.estimate({ trade: "electrical", lineItems: [{ desc: "x", qty: 1, unitCost: 100 }] });
ok("markup deferred when not entered (not assumed)", noMk.markup.deferred === true);
ok("tax deferred when not entered", noMk.tax.deferred === true);
ok("total w/o markup/tax = subtotal", noMk.total === 100);

// ---- unpriced warning ----
const up = A.estimate({ lineItems: [{ desc: "a", qty: 1, unitCost: 50 }, { desc: "b", qty: 2 }] });
ok("unpriced line counted + warned, contributes $0", up.unpricedLines === 1 && /1 line/.test(up.warning) && up.subtotal === 50);

// ---- MGSF doctrine deferral ----
ok("MGSF self-perform trade → doctrine note", /LOCKED doctrine/i.test(A.estimate({ trade: "spray-foam", lineItems: [{ desc: "foam", qty: 1, unitCost: 1 }] }).doctrineNote || ""));
ok("non-MGSF trade → no doctrine note", A.estimate({ trade: "electrical", lineItems: [{ desc: "x", qty: 1, unitCost: 1 }] }).doctrineNote === undefined);

// ---- guardrails ----
ok("labeled DRAFT + owner rates", /DRAFT/.test(e.label) && /your rates/i.test(e.label));
ok("note says nothing fabricated", /OWNER-ENTERED/.test(e.note) && /fabricated/i.test(e.note));
ok("no line items ⇒ error", A.estimate({}).ok === false);
ok("rates only from input — empty estimate has no invented dollars", (() => { const z = A.estimate({ lineItems: [{ desc: "x" }] }); return z.subtotal === 0 && z.total === 0; })());

console.log("\n" + (fail ? "✗ " : "✓ ") + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
