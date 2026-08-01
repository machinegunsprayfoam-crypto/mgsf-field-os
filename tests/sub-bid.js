#!/usr/bin/env node
// Sub-bid — subcontractor bid intake + leveling (api/sub-bid.js). Run: `node tests/sub-bid.js`.
// Deterministic, keyless, no network. Covers scope baseline (required vs union), gap detection,
// low/high/spread, the cheapest-but-incomplete trap, mixed-trade + missing-amount warnings, and the
// guardrails: advisory only (never auto-accepts), amounts are owner-entered sub quotes (not MGSF price).

const path = require("path");
const A = require(path.join(__dirname, "..", "api", "sub-bid.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

console.log("Sub-bid (subcontractor bid intake + leveling)\n");

// ---- scope baseline ----
const bidsUnion = [{ sub: "A", trade: "electrical", amount: 100, scopeIncluded: ["panel", "wiring"] },
  { sub: "B", trade: "electrical", amount: 90, scopeIncluded: ["panel"] }];
ok("union scope when no required list", (() => { const n = A.normalizeScope(bidsUnion.map(A.cleanBid), null); return n.scope.length === 2 && /union/.test(n.basis); })());
ok("required scope overrides union", A.normalizeScope(bidsUnion.map(A.cleanBid), ["panel", "wiring", "fixtures"]).scope.length === 3);
ok("scope dedupes case-insensitively", A.normalizeScope([{ scopeIncluded: ["Panel", "panel", "WIRING"] }].map(A.cleanBid), null).scope.length === 2);

// ---- leveling: gaps, ranking, spread ----
const lv = A.level(bidsUnion);
ok("levels both bids", lv.ok === true && lv.bids.length === 2);
ok("lowest amount ranked #1", lv.bids.find((b) => b.rank === 1).sub === "B");
ok("B missing 'wiring' scope flagged", lv.bids.find((b) => b.sub === "B").scopeGaps.map((s) => s.toLowerCase()).includes("wiring") && lv.bids.find((b) => b.sub === "B").complete === false);
ok("A is complete scope", lv.bids.find((b) => b.sub === "A").complete === true);
ok("summary low/high/spread", lv.summary.low.amount === 90 && lv.summary.high.amount === 100 && lv.summary.spread === 10);
ok("spreadPct computed", lv.summary.spreadPct != null);

// ---- the cheapest-but-incomplete trap ----
ok("recommendation warns lowest is missing scope + names full-scope bid", /MISSING scope/i.test(lv.recommendation) && /A \(/.test(lv.recommendation));
ok("warning: not equal scope — level first", lv.warnings.some((w) => /equal scope/i.test(w)));
const clean2 = A.level([{ sub: "A", trade: "hvac", amount: 100, scopeIncluded: ["ductwork"] }, { sub: "B", trade: "hvac", amount: 120, scopeIncluded: ["ductwork"] }]);
ok("all-complete ⇒ recommendation notes lowest covers full scope", /covers the full scope/i.test(clean2.recommendation));

// ---- warnings + edge cases ----
ok("mixed trades warned", A.level([{ sub: "A", trade: "hvac", amount: 100 }, { sub: "B", trade: "electrical", amount: 90 }]).warnings.some((w) => /multiple trades/i.test(w)));
ok("missing amount warned + not ranked", (() => { const r = A.level([{ sub: "A", amount: 100, scopeIncluded: ["x"] }, { sub: "B", scopeIncluded: ["x"] }]); return r.warnings.some((w) => /No amount/i.test(w)) && r.bids.find((b) => b.sub === "B").rank === undefined; })());
ok("no bids ⇒ error", A.level([]).ok === false);
ok("single bid still levels", A.level([{ sub: "Solo", amount: 500, scopeIncluded: ["a"] }]).ok === true);

// ---- guardrails ----
ok("advisory label says never auto-accepted", /never auto-accepted/i.test(lv.label));
ok("recommendation never says 'accepted' or 'awarded'", !/accepted|awarded|auto-select/i.test(lv.recommendation));
ok("amounts echoed as entered, not recomputed", A.level([{ sub: "A", amount: 1234.5, scopeIncluded: ["x"] }]).bids[0].amount === 1234.5);

console.log("\n" + (fail ? "✗ " : "✓ ") + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
