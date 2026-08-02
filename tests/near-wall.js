#!/usr/bin/env node
// Near-the-wall guard decision logic — the pure core that keeps a long hive turn from being
// hard-killed mid-synthesizer by the serverless function limit. `shouldSkipSynth` decides whether
// enough budget remains to start the synth; `bestAnswer` picks the fullest worker reply to return
// instead. Run: `node tests/near-wall.js`. Keyless, deterministic (elapsed is passed in, not read
// from a clock), no network.

const path = require("path");
const K = require(path.join(__dirname, "..", "api", "klyfton.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

console.log("Near-the-wall guard (skip synth under time pressure)\n");

// ---- shouldSkipSynth(elapsed, wall, reserve): skip once elapsed passes (wall - reserve) ----
const WALL = 55000, RES = 14000; // threshold = 41000ms
ok("plenty of time left ⇒ run the synth (don't skip)", K.shouldSkipSynth(1000, WALL, RES) === false);
ok("just under the threshold ⇒ run the synth", K.shouldSkipSynth(40999, WALL, RES) === false);
ok("exactly at the threshold ⇒ run (strict >)", K.shouldSkipSynth(41000, WALL, RES) === false);
ok("just past the threshold ⇒ skip the synth", K.shouldSkipSynth(41001, WALL, RES) === true);
ok("well past ⇒ skip", K.shouldSkipSynth(54000, WALL, RES) === true);
// bigger wall (Pro plan) pushes the skip point out
ok("Pro-sized wall (280k/14k) doesn't skip at 60s", K.shouldSkipSynth(60000, 280000, 14000) === false);
// reserve must be honored: a huge reserve makes us skip early
ok("large reserve trips the skip earlier", K.shouldSkipSynth(30000, WALL, 30000) === true, "thr=25000");

// ---- bestAnswer(answers): fullest non-empty worker reply, null/empty-safe ----
const A = { mind: "a", text: "short", model: "m1" };
const B = { mind: "b", text: "a much longer and more complete answer", model: "m2" };
const C = { mind: "c", text: "medium length reply here", model: "m3" };
ok("picks the fullest (longest) answer", K.bestAnswer([A, B, C]).mind === "b");
ok("order-independent (fullest still wins)", K.bestAnswer([B, A, C]).mind === "b");
ok("single answer returns itself", K.bestAnswer([A]).mind === "a");
ok("skips empty/blank-text entries", K.bestAnswer([{ mind: "x", text: "" }, A]).mind === "a");
ok("skips null entries, no throw", K.bestAnswer([null, A, undefined]).mind === "a");
ok("empty list ⇒ null (caller falls back)", K.bestAnswer([]) === null);
ok("non-array ⇒ null, no throw", K.bestAnswer(null) === null && K.bestAnswer(undefined) === null);
ok("all-empty ⇒ null", K.bestAnswer([{ mind: "x", text: "" }, { mind: "y" }]) === null);
ok("returned object keeps its model (for telemetry)", K.bestAnswer([A, B]).model === "m2");

console.log("\n" + (fail ? "✗" : "✓") + " " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
