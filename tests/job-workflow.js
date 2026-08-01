#!/usr/bin/env node
// Job workflow / wiring map — pure workflow() core of api/job-workflow.js. Run: `node tests/job-workflow.js`.
// Deterministic, keyless, no network. Covers: canonical phase ordering, prime/sub tagging per trade,
// dependency ("wiring") resolution to the nearest PRESENT phase when a phase is skipped, the always-
// closing final phase, the MGSF critical foam-inspection gate, inspection gates carry verify-AHJ,
// unknown trades captured (never fabricated), edges match dependsOn, and the guardrails (no pricing).

const path = require("path");
const A = require(path.join(__dirname, "..", "api", "job-workflow.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }
const stepOf = (r, phase) => r.steps.find((s) => s.phase === phase);

console.log("Job workflow / wiring map\n");

// ---- full build: site → foundation → structure → rough-in → insulation(MGSF) → drywall → final ----
const r = A.workflow(["sitework", "concrete-flatwork", "framing", "electrical", "plumbing", "hvac", "spray-foam", "drywall"]);
ok("returns ok + GUIDANCE label", r.ok === true && /GUIDANCE/.test(r.label));
ok("phases are in canonical order", r.steps.map((s) => s.phase).join(",") === "site,foundation,structure,rough-in,insulation,finishes,final");
ok("order is 1..n sequential", r.steps.every((s, i) => s.order === i + 1));
ok("spray-foam tagged self-perform", stepOf(r, "insulation").trades.some((t) => t.id === "spray-foam" && t.role === "self-perform"));
ok("framing tagged subcontract", stepOf(r, "structure").trades.some((t) => t.id === "framing" && t.role === "subcontract"));
ok("insulation is MGSF self-perform phase", stepOf(r, "insulation").mgsfSelfPerform === true);
ok("foundation depends on site", stepOf(r, "foundation").dependsOn.includes("site"));
ok("insulation depends on rough-in", stepOf(r, "insulation").dependsOn.includes("rough-in"));
ok("final always closes the job", stepOf(r, "final") && stepOf(r, "final").order === r.steps.length);
ok("critical foam gate fires when foam in scope", /never drywall\/close over spray foam/.test(r.criticalGate || ""));
ok("every phase gate carries a verify-AHJ pointer", r.steps.every((s) => /AHJ|811|sign-off|inspection/i.test(s.gate)));

// ---- dependency resolution when a phase is skipped (no structure) ----
const skip = A.workflow(["concrete-flatwork", "electrical"]);  // foundation + rough-in, NO structure
ok("rough-in with no structure resolves dep back to nearest present (foundation)", stepOf(skip, "rough-in").dependsOn.includes("foundation") && !stepOf(skip, "rough-in").dependsOn.includes("structure"));

// ---- no foam ⇒ no critical foam gate ----
const noFoam = A.workflow(["framing", "drywall"]);
ok("no foam ⇒ criticalGate null", noFoam.criticalGate === null);

// ---- edges mirror dependsOn ----
const edgeCount = r.steps.reduce((n, s) => n + s.dependsOn.length, 0);
ok("edges match total dependsOn count", r.edges.length === edgeCount);
ok("edges are {from,to} present-phase pairs", r.edges.every((e) => r.steps.some((s) => s.phase === e.from) && r.steps.some((s) => s.phase === e.to)));

// ---- unknown trades captured, never fabricated ----
const unk = A.workflow(["framing", "spaceship"]);
ok("unknown trade captured in unknownTrades", unk.unknownTrades.includes("spaceship") && !unk.steps.some((s) => s.trades.some((t) => t.id === "spaceship")));

// ---- empty scope ⇒ no steps ----
ok("empty scope ⇒ no steps (nothing to sequence)", A.workflow([]).steps.length === 0);
ok("non-array scope ⇒ safe empty", A.workflow(null).ok === true && A.workflow(null).steps.length === 0);

// ---- guardrails ----
ok("no pricing/duration fabricated", !/\$\d|"(price|cost|days|hours|duration)"\s*:\s*\d/.test(JSON.stringify(r)));

console.log("\n" + (fail ? "✗ " : "✓ ") + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
