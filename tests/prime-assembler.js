#!/usr/bin/env node
// Prime assembler — the GC rollup (api/prime-assembler.js). Run: `node tests/prime-assembler.js`.
// Deterministic, keyless, no network (nowMs injected). Covers self-perform vs sub split, sub-bid
// leveling + suggested choice, the compliance gate (blocked sub not includable), subs subtotal,
// owner-entered-vs-deferred markup, and the hard guardrails: MGSF price deferred/never fabricated,
// never auto-awards, sub amounts are the subs' own owner-entered quotes.

const path = require("path");
const A = require(path.join(__dirname, "..", "api", "prime-assembler.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

console.log("Prime assembler (GC prime-with-subs rollup)\n");

const NOW = Date.parse("2026-08-01T00:00:00Z");
const clearedElec = { name: "Ace Electric", trade: "electrical", docs: [
  { type: "subcontract", onFile: true }, { type: "w9", onFile: true },
  { type: "coi", onFile: true, expires: "2027-06-01" }, { type: "license", onFile: true, expires: "2027-06-01" },
  { type: "lien-waivers", onFile: true }, { type: "safety", onFile: true } ] };

const base = {
  job: { name: "Glendive Shop", customer: "Acme" },
  trades: ["spray foam", "spf roof", "electrical", "plumbing"],
  subBids: {
    electrical: [{ sub: "Ace Electric", amount: 9000, scopeIncluded: ["panel", "wiring", "fixtures"] }, { sub: "Bolt Co", amount: 8000, scopeIncluded: ["panel", "wiring"] }],
    plumbing: [{ sub: "Pipe Pros", amount: 5000, scopeIncluded: ["rough-in", "fixtures"] }],
  },
  subRecords: [clearedElec],
  nowMs: NOW,
};

// ---- self-perform vs sub split ----
const r = A.assemble(base);
ok("self-perform picks MGSF trades", r.selfPerform.some((s) => s.trade === "spray-foam") && r.selfPerform.some((s) => s.trade === "spf-roofing"));
ok("subs picks non-MGSF trades", r.subs.some((s) => s.trade === "electrical") && r.subs.some((s) => s.trade === "plumbing"));
ok("self-perform pricing deferred to doctrine", r.selfPerform.every((s) => s.pricing.deferred === true));
ok("self-perform rows are WIRED to their engine(s)", r.selfPerform.find((s) => s.trade === "spray-foam").engines.includes("foam-calc") && r.selfPerform.find((s) => s.trade === "spf-roofing").engines.includes("measure"));

// ---- sub-bid leveling + suggested choice (lowest FULL-scope) ----
const elec = r.subs.find((s) => s.trade === "electrical");
ok("chooses lowest FULL-scope bid, not lowest overall", elec.chosen.sub === "Ace Electric" && elec.chosen.complete === true);
ok("cheaper incomplete bid (Bolt) flagged via leveled warnings", (elec.warnings || []).some((w) => /equal scope/i.test(w)) || elec.leveled != null);

// ---- compliance gate ----
ok("cleared sub is includable", elec.compliance.readiness === "ready" && elec.includable === true);
const blockedRecord = Object.assign({}, clearedElec, { docs: clearedElec.docs.filter((d) => d.type !== "coi") });
const rBlocked = A.assemble(Object.assign({}, base, { subRecords: [blockedRecord] }));
ok("uninsured chosen sub ⇒ not includable + warning", rBlocked.subs.find((s) => s.trade === "electrical").includable === false && rBlocked.warnings.some((w) => /NOT compliance-cleared/i.test(w)));
ok("plumbing sub has no record ⇒ includable unknown + verify warning", r.subs.find((s) => s.trade === "plumbing").includable == null && r.warnings.some((w) => /No compliance record/i.test(w)));

// ---- money: subs subtotal, deferred vs owner markup ----
ok("subs subtotal = sum of chosen quotes (9000 + 5000)", r.totals.subsSubtotal === 14000);
ok("markup deferred when not entered", r.totals.primeMarkup.deferred === true);
const rMarkup = A.assemble(Object.assign({}, base, { markupPct: 10 }));
ok("owner markup applied when entered (10% of 14000)", rMarkup.totals.primeMarkup.amount === 1400 && rMarkup.totals.primeMarkup.source === "owner-entered");
ok("grand total is deferred (never fabricated)", r.totals.grand.deferred === true);

// ---- scope from blueprint (no explicit trades) ----
const fromScope = A.assemble({ scope: [{ trade: "spray foam" }, { trade: "electrical" }], subBids: {}, nowMs: NOW });
ok("derives trades from blueprint scope[]", fromScope.ok === true && fromScope.selfPerform.some((s) => s.trade === "spray-foam"));

// ---- guardrails ----
ok("DRAFT label + owner prices/approves", /DRAFT/.test(r.label) && /doctrine/i.test(r.disclaimer));
ok("proposal has a 3-day cancellation term", r.proposal.sections.some((s) => /3-day right of cancellation/i.test(s)));
ok("no fabricated MGSF customer price (self-perform deferred)", JSON.stringify(r.selfPerform).indexOf("\"amount\"") === -1);
ok("no trades ⇒ error", A.assemble({}).ok === false);

console.log("\n" + (fail ? "✗ " : "✓ ") + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
