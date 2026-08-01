#!/usr/bin/env node
// Klyfton — pure decision exports of api/klyfton.js (the Queen router). Run: `node tests/klyfton.js`.
// Deterministic, keyless, no network (only the exported pure helpers; no Anthropic call is made).
// Covers shouldSkipSynth (the time-budget guard), bestAnswer (pick the fullest worker answer),
// routerToolHint (LIVE/OFF capability status the router reads), toolBagBlock (non-empty tool bag),
// and assembleBrainBlocks (always returns brain text; short input ⇒ the full brain).

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

console.log("\n" + (fail ? "✗ " : "✓ ") + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
