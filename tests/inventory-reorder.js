#!/usr/bin/env node
// Inventory reorder-sweep decision logic — the pure core of api/inventory-reorder.js.
// Run: `node tests/inventory-reorder.js`. Keyless, deterministic, no network (KV/webhook are
// gated out of sweep()). Covers the reorder RULE (qty <= reorderAt), the short-fall math, the
// per-supplier grouping/sort, the draft-note text, and the defensive input handling — none of
// which calc-invariants or any other suite touches.

const path = require("path");
const R = require(path.join(__dirname, "..", "api", "inventory-reorder.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

console.log("Inventory reorder-sweep decision logic\n");

// ---- the reorder RULE: flag iff a reorder point is set AND qty <= reorderAt ----
ok("healthy stock (qty > reorderAt) is NOT flagged", R.sweep([{ item: "A", qty: 10, reorderAt: 5 }]).flagged === 0);
ok("at the line (qty == reorderAt) IS flagged (rule is <=)", R.sweep([{ item: "A", qty: 5, reorderAt: 5 }]).flagged === 1);
ok("below the line (qty < reorderAt) IS flagged", R.sweep([{ item: "A", qty: 2, reorderAt: 5 }]).flagged === 1);
ok("no reorder point (reorderAt <= 0) ⇒ untracked, not flagged", R.sweep([{ item: "A", qty: 0, reorderAt: 0 }]).flagged === 0);
ok("negative reorderAt ⇒ untracked, not flagged", R.sweep([{ item: "A", qty: 0, reorderAt: -3 }]).flagged === 0);
ok("zero qty with a real reorder point IS flagged", R.sweep([{ item: "A", qty: 0, reorderAt: 4 }]).flagged === 1);

// ---- short-fall math: short = max(0, reorderAt - qty) ----
ok("short-fall = reorderAt - qty", R.sweep([{ item: "A", qty: 2, reorderAt: 5 }]).items[0].short === 3);
ok("short-fall is 0 exactly at the line", R.sweep([{ item: "A", qty: 5, reorderAt: 5 }]).items[0].short === 0);

// ---- item naming: item OR name; blank name is skipped ----
ok("name falls back to `name` when `item` absent", R.sweep([{ name: "Gun tips", qty: 1, reorderAt: 3 }]).items[0].item === "Gun tips");
ok("blank/no item name is skipped (can't order a nameless line)", R.sweep([{ qty: 1, reorderAt: 3 }]).flagged === 0);

// ---- grouping by supplier: one order per vendor, suppliers + lines sorted ----
const multi = R.sweep([
  { item: "Zeta", qty: 1, reorderAt: 5, supplier: "Acme" },
  { item: "Alpha", qty: 0, reorderAt: 5, supplier: "Acme" },
  { item: "Beta", qty: 2, reorderAt: 5, supplier: "Best Foam" },
]);
ok("3 low items across 2 suppliers ⇒ flagged=3", multi.flagged === 3);
ok("grouped into 2 supplier orders", multi.suppliers === 2 && multi.orders.length === 2);
ok("suppliers sorted alphabetically (Acme before Best Foam)", multi.orders[0].supplier === "Acme" && multi.orders[1].supplier === "Best Foam");
ok("Acme order carries its 2 lines", multi.orders[0].lines.length === 2);
ok("lines within a supplier sorted by item (Alpha before Zeta)", multi.orders[0].lines[0].item === "Alpha" && multi.orders[0].lines[1].item === "Zeta");
ok("missing supplier ⇒ '(no supplier set)' bucket", R.sweep([{ item: "A", qty: 0, reorderAt: 2 }]).orders[0].supplier === "(no supplier set)");

// ---- draft note text: names the item, its counts, and the shop phone; never an order ----
const draft = R.sweep([{ item: "Reducer", qty: 1, unit: "gal", reorderAt: 4, supplier: "Acme" }]).orders[0].draftText;
ok("draft note mentions the item", /Reducer/.test(draft));
ok("draft note shows on-hand qty + unit", /1 gal on hand/.test(draft));
ok("draft note shows the reorder point", /reorder at 4/.test(draft));
ok("draft note carries MGSF phone (asks availability, doesn't order)", /406-939-8301/.test(draft) && /availability/i.test(draft));

// ---- defensive: never throw on junk input; unit is cleaned ----
ok("empty array ⇒ flagged 0, no throw", R.sweep([]).flagged === 0);
ok("non-array input ⇒ flagged 0, no throw", R.sweep(null).flagged === 0 && R.sweep(undefined).flagged === 0);
ok("null entries inside the list are skipped, no throw", R.sweep([null, { item: "A", qty: 0, reorderAt: 2 }, undefined]).flagged === 1);
ok("unit is preserved on a flagged line", R.sweep([{ item: "A", qty: 0, reorderAt: 2, unit: "sets" }]).items[0].unit === "sets");

console.log("\n" + (fail ? "✗" : "✓") + " " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
