#!/usr/bin/env node
// Framing — pure core of api/framing-calc.js. Run: `node tests/framing-calc.js`. Deterministic, keyless.
// Covers board-feet math, wall takeoff (studs by OC + opening studs + plates + sheathing + BF + waste),
// joist/rafter takeoff, and the guardrails: takeoff is ESTIMATE, member SIZING/spans are NOT computed
// (deferred to IRC tables + AHJ/engineer), no pricing.

const path = require("path");
const A = require(path.join(__dirname, "..", "api", "framing-calc.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

console.log("Framing (carpentry takeoff)\n");

// ---- board feet ----
ok("2x6 = 1.0 BF/ft", A.boardFeet("2x6", 10, 1).boardFeet === 10);
ok("2x4 = 0.667 BF/ft", A.boardFeet("2x4", 12, 1).boardFeet === 8);
ok("2x10 × 16ft × 3 = 80 BF", A.boardFeet("2x10", 16, 3).boardFeet === 80);
ok("unknown size ⇒ error + list", A.boardFeet("6x6", 10, 1).ok === false);

// ---- wall takeoff ----
const w = A.wallTakeoff({ lengthFt: 40, heightFt: 8, oc: 16, openings: 2, waste: 0 });
ok("line studs = ceil(L·12/OC)+1", w.studs === (Math.ceil(40 * 12 / 16) + 1) + 2 * 3, "studs=" + w.studs); // +3 per opening ×2
ok("plates = length × 3 rows", /120 LF/.test(w.plates));
ok("sheathing sheets = wallArea / 32 (ceil)", w.sheathingSheets === Math.ceil((40 * 8) / 32));
ok("board-feet computed for studs+plates", w.boardFeet > 0);
ok("waste increases stud count", A.wallTakeoff({ lengthFt: 40, oc: 16, openings: 0, waste: 0.1 }).studs > A.wallTakeoff({ lengthFt: 40, oc: 16, openings: 0, waste: 0 }).studs);
ok("24 OC yields fewer studs than 16 OC", A.wallTakeoff({ lengthFt: 40, oc: 24, waste: 0 }).studs < A.wallTakeoff({ lengthFt: 40, oc: 16, waste: 0 }).studs);
ok("bad OC defaults to 16", A.wallTakeoff({ lengthFt: 10, oc: 7, waste: 0 }).oc === 16);
ok("no length ⇒ error", A.wallTakeoff({}).ok === false);

// ---- joist takeoff ----
const j = A.joistTakeoff({ runFt: 30, spanFt: 12, oc: 16, size: "2x10", waste: 0 });
ok("joist count = ceil(run·12/OC)+1", j.membersEstimate === Math.ceil(30 * 12 / 16) + 1);
ok("member length = span", j.memberLengthFt === 12 && j.boardFeet > 0);
ok("missing dims ⇒ error", A.joistTakeoff({ runFt: 30 }).ok === false);

// ---- guardrails: sizing/spans NOT fabricated ----
ok("wall note defers spans to IRC tables + AHJ/engineer", /IRC span tables/i.test(w.note) && /engineer/i.test(w.note));
ok("joist note defers member sizing", /NOT computed|IRC span/i.test(j.note));
ok("labeled ESTIMATE takeoff", /ESTIMATE/.test(w.label) && /takeoff/i.test(w.label));
ok("no span numbers fabricated (no ft-in span figures in output)", !/\d+['’]-?\d*\"/.test(JSON.stringify(w)));
ok("no pricing anywhere", !/\$\d|"(price|cost|rate)"\s*:\s*\d/.test(JSON.stringify(w)));
ok("analyze routes actions", A.analyze({ action: "joist", runFt: 20, spanFt: 10 }).membersEstimate > 0 && A.analyze({ action: "boardfeet", size: "2x6", lengthFt: 8, count: 2 }).boardFeet === 16);

console.log("\n" + (fail ? "✗ " : "✓ ") + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
