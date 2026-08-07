#!/usr/bin/env node
// Klyfton — pure decision exports of api/klyfton.js (the Queen router). Run: `node tests/klyfton.js`.
// Deterministic, keyless, no network (only the exported pure helpers; no Anthropic call is made).
// Covers shouldSkipSynth (the time-budget guard), bestAnswer (pick the fullest worker answer),
// routerToolHint (LIVE/OFF capability status the router reads), toolBagBlock (non-empty tool bag),
// assembleBrainBlocks (always returns brain text; short input ⇒ the full brain), isActionCommand
// (pure-command bypass), and applyMemoryContext (memory-warm routing enrichment).

const path = require("path");
const A = require(path.join(__dirname, "..", "api", "klyfton.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

console.log("Klyfton (Queen router pure exports)\n");

// ---- shouldSkipSynth(elapsed, wall, reserve): skip when elapsed > wall - reserve ----
ok("plenty of time left ⇒ don't skip", A.shouldSkipSynth(1000, 30000, 5000) === false);
ok("into the reserve window ⇒ skip", A.shouldSkipSynth(26000, 30000, 5000) === true);
ok("exactly at the threshold ⇒ don't skip (strict >)", A.shouldSkipSynth(25000, 30000, 5000) === false);
ok("one ms past the threshold ⇒ skip", A.shouldSkipSynth(25001, 30000, 5000) === true);

// ---- bestAnswer: the fullest (longest-text) worker answer wins ----
ok("picks the longest-text answer", A.bestAnswer([{ text: "short" }, { text: "a much longer answer" }, { text: "mid one" }]).text === "a much longer answer");
ok("skips entries with no text", A.bestAnswer([{ text: "" }, {}, { text: "real" }]).text === "real");
ok("empty array ⇒ null", A.bestAnswer([]) === null);
ok("non-array ⇒ null", A.bestAnswer(null) === null && A.bestAnswer("x") === null);

// ---- routerToolHint: LIVE/OFF capability status ----
const hint = A.routerToolHint();
ok("routerToolHint returns a non-empty string", typeof hint === "string" && hint.length > 0);
ok("lists a LIVE section with a known keyless tool", /LIVE:.*foam-calc/s.test(hint));
ok("lists an OFF section", /OFF:/.test(hint));
ok("tells the router to prefer LIVE-tool minds", /LIVE/.test(hint) && /tool/i.test(hint));

// ---- WIRING INTEGRITY: every tool advertised LIVE must map to a real api/<name>.js module ----
// (if the router says a tool is LIVE but the file was renamed/removed, minds get recruited for a
//  phantom capability. This guards that drift — same class as the brain↔retriever guard.)
const fs = require("fs");
const apiDir = path.join(__dirname, "..", "api");
const ALIAS = { "geo-mobilization": "geo" };   // the one advertised name that isn't its own filename
const liveMatch = hint.match(/LIVE:\s*([^\n]+)/);
const liveTools = liveMatch ? liveMatch[1].split(",").map((s) => s.trim()).filter(Boolean) : [];
ok("LIVE list is non-trivial", liveTools.length >= 20);
const phantom = liveTools.filter((t) => !fs.existsSync(path.join(apiDir, (ALIAS[t] || t) + ".js")));
ok("every LIVE tool maps to a real api/<name>.js (no phantom capability)", phantom.length === 0, phantom.join(","));

// ---- toolBagBlock: the tool inventory the brain sees ----
const bag = A.toolBagBlock();
ok("toolBagBlock returns a non-empty string", typeof bag === "string" && bag.length > 0);

// ---- assembleBrainBlocks: always returns brain text; short input ⇒ full brain ----
const brief = A.assembleBrainBlocks("hi");
ok("very short input ⇒ full brain text (non-empty)", typeof brief === "string" && brief.length > 200);
const scoped = A.assembleBrainBlocks("what closed-cell foam R-value hits code in a Zone 7 attic");
ok("real question ⇒ still returns brain text", typeof scoped === "string" && scoped.length > 0);
ok("foam query still pulls FOAM SPECS", scoped.includes("FOAM SPECS"));

// ---- in-depth trade knowledge: a trade question pulls the TRADES_EXPERT block (grounded in code) ----
const tr = A.assembleBrainBlocks("how do I size an electrical service panel and what GFCI is required");
ok("electrical query ⇒ brain carries TRADES EXPERT + cites NEC", tr.includes("TRADES EXPERT") && /NEC/.test(tr));
const plumb = A.assembleBrainBlocks("drain and vent sizing plus water heater T&P");
ok("plumbing query ⇒ TRADES EXPERT + cites IPC", plumb.includes("TRADES EXPERT") && /IPC/.test(plumb));

// ---- isActionCommand: pure-command bypass (skips Queen API call for clear field commands) ----
console.log("\n-- isActionCommand --");
// Should match → returns a ready plan (no null)
ok("'update job 42 to Completed' ⇒ scheduling plan", (function() {
  const p = A.isActionCommand("update job 42 to Completed");
  return p && p.minds[0] === "scheduling" && p.complexity === "simple" && p.confidence === 1.0;
})());
ok("'mark job as done' ⇒ scheduling plan", (function() {
  const p = A.isActionCommand("mark job as done");
  return p && p.minds[0] === "scheduling";
})());
ok("'close job for TK Barn' ⇒ scheduling plan", (function() {
  const p = A.isActionCommand("close job for TK Barn");
  return p && p.minds[0] === "scheduling";
})());
ok("'add lead for John Smith' ⇒ general plan", (function() {
  const p = A.isActionCommand("add lead for John Smith");
  return p && p.minds[0] === "general" && p.complexity === "simple";
})());
ok("'new lead: ABC Farms 406-555-1234' ⇒ general plan", (function() {
  const p = A.isActionCommand("new lead: ABC Farms 406-555-1234");
  return p && p.minds[0] === "general";
})());
ok("'schedule job for Monday at 8am' ⇒ scheduling plan", (function() {
  const p = A.isActionCommand("schedule job for Monday at 8am");
  return p && p.minds[0] === "scheduling";
})());
ok("'create invoice for Shadehill LLC' ⇒ finance plan", (function() {
  const p = A.isActionCommand("create invoice for Shadehill LLC");
  return p && p.minds[0] === "finance";
})());
ok("'job completed for Deere dealership' ⇒ scheduling plan", (function() {
  const p = A.isActionCommand("job completed for Deere dealership");
  return p && p.minds[0] === "scheduling";
})());
// Should NOT match → returns null (questions are not commands)
ok("long question ⇒ null (not a command)", A.isActionCommand("what is the best foam to use for a metal building roof in Zone 7?") === null);
ok("empty string ⇒ null", A.isActionCommand("") === null);
ok("greeting ⇒ null", A.isActionCommand("hey what's up") === null);
ok("message with attachment ⇒ null (always defer photo messages to Queen)", A.isActionCommand("update job", [{ kind: "image", data: "x" }]) === null);
ok("action plan has no routing_raw (bypass skips Queen call)", (function() {
  const p = A.isActionCommand("update job to Completed");
  return p && p.routing_raw === null;
})());
ok("action plan intents is empty object", (function() {
  const p = A.isActionCommand("add lead for Dave");
  return p && typeof p.intents === "object" && Object.keys(p.intents).length === 0;
})());

// ---- applyMemoryContext: memory-warm routing enrichment ----
console.log("\n-- applyMemoryContext --");
const basePlan = { minds: ["estimator"], complexity: "complex", confidence: 0.9, intents: {}, routing_raw: null };
// Adds a memory-relevant mind not already in plan.
ok("recall with AR note ⇒ adds ar_collections to complex plan", (function() {
  const rec = { semantic: true, results: [{ note: "invoice for Shadehill $4,200 still unpaid, AR aging 45 days" }] };
  const p = A.applyMemoryContext(basePlan, rec);
  return p.minds.includes("ar_collections") && p.minds.includes("estimator");
})());
ok("recall with margin note ⇒ adds finance to complex plan", (function() {
  const rec = { semantic: true, results: [{ note: "margin leak on the Deere job, job cost ran over budget" }] };
  const p = A.applyMemoryContext(basePlan, rec);
  return p.minds.includes("finance") && p.minds.includes("estimator");
})());
ok("recall with govcon note ⇒ adds govcon to complex plan", (function() {
  const rec = { semantic: true, results: [{ note: "SAM.gov solicitation W912EF-26 for spray foam closes Aug 15" }] };
  const p = A.applyMemoryContext(basePlan, rec);
  return p.minds.includes("govcon");
})());
ok("recall with scheduling note ⇒ adds scheduling to complex plan", (function() {
  const rec = { semantic: true, results: [{ note: "crew schedule for Langford job, appointment on Tuesday" }] };
  const p = A.applyMemoryContext(basePlan, rec);
  return p.minds.includes("scheduling");
})());
// Never exceeds hive cap (4).
ok("never exceeds cap=4 even with many memory hits", (function() {
  const rec = { semantic: true, results: [
    { note: "invoice cash flow payment AR margin profit" },
    { note: "SAM.gov federal SDVOSB solicitation" },
    { note: "schedule appointment crew timeline" },
    { note: "marketing social post ad campaign" },
    { note: "safety PPE JSA OSHA respirator" },
  ]};
  const p = A.applyMemoryContext({ minds: ["estimator"], complexity: "complex", confidence: 0.9, intents: {}, routing_raw: null }, rec);
  return p.minds.length <= 4;
})());
// Simple plans stay simple (no ballooning).
ok("simple plan ⇒ not enriched (complexity guard)", (function() {
  const simple = { minds: ["estimator"], complexity: "simple", confidence: 0.9, intents: {}, routing_raw: null };
  const rec = { semantic: true, results: [{ note: "invoice overdue payment" }] };
  const p = A.applyMemoryContext(simple, rec);
  return p.minds.length === 1 && !p.minds.includes("finance");
})());
// Null / missing recall ⇒ plan unchanged.
ok("null recall ⇒ plan unchanged", (function() {
  const p = A.applyMemoryContext(basePlan, null);
  return p === basePlan;
})());
ok("empty results ⇒ plan unchanged", (function() {
  const p = A.applyMemoryContext(basePlan, { semantic: true, results: [] });
  return p.minds.length === basePlan.minds.length;
})());
// Never adds duplicate minds.
ok("mind already in plan ⇒ not duplicated", (function() {
  const plan = { minds: ["estimator", "finance"], complexity: "complex", confidence: 0.9, intents: {}, routing_raw: null };
  const rec = { semantic: true, results: [{ note: "invoice billing AR margin profit payment" }] };
  const p = A.applyMemoryContext(plan, rec);
  return p.minds.filter((m) => m === "finance").length === 1;
})());
// Null plan / missing minds field ⇒ safe return.
ok("null plan ⇒ returns null (safe)", A.applyMemoryContext(null, { results: [] }) === null);
ok("plan without minds ⇒ returns plan as-is", (function() {
  const bad = { complexity: "complex" };
  return A.applyMemoryContext(bad, { results: [{ note: "invoice" }] }) === bad;
})());

// ---- Queen upgrade exports are present ----
console.log("\n-- export sanity --");
ok("ACTION_CMD_PATTERNS exported + non-empty", Array.isArray(A.ACTION_CMD_PATTERNS) && A.ACTION_CMD_PATTERNS.length > 0);
ok("MEMORY_MIND_MAP exported + non-empty", Array.isArray(A.MEMORY_MIND_MAP) && A.MEMORY_MIND_MAP.length > 0);
ok("isActionCommand is a function", typeof A.isActionCommand === "function");
ok("applyMemoryContext is a function", typeof A.applyMemoryContext === "function");

console.log("\n" + (fail ? "✗ " : "✓ ") + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
