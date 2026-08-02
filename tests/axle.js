#!/usr/bin/env node
// tests/axle.js — Axle: time prime mover. Tests PROGRAMS structure + tick logic.
// Keyless, no network. `node tests/axle.js`.

const axle = require("../api/axle");
const { PROGRAMS, tick, isSunday } = axle;

let pass = 0, fail = 0;
function ok(label, cond) { if (cond) { pass++; } else { fail++; console.error("  FAIL:", label); } }

// ---- PROGRAM registry ----
ok("PROGRAMS exists", PROGRAMS && typeof PROGRAMS === "object");
ok("daily program defined", !!PROGRAMS.daily);
ok("weekly program defined", !!PROGRAMS.weekly);
ok("workers program defined", !!PROGRAMS.workers);
ok("money program defined", !!PROGRAMS.money);
ok("all program defined", !!PROGRAMS.all);

// ---- Scheduled cadence programs have real cron strings ----
ok("daily has cron schedule", PROGRAMS.daily && typeof PROGRAMS.daily.cadence === "string" && PROGRAMS.daily.cadence !== "manual");
ok("weekly has cron schedule", PROGRAMS.weekly && typeof PROGRAMS.weekly.cadence === "string" && PROGRAMS.weekly.cadence !== "manual");

// ---- Manual preset programs are marked manual ----
ok("workers is manual", PROGRAMS.workers && PROGRAMS.workers.cadence === "manual");
ok("money is manual", PROGRAMS.money && PROGRAMS.money.cadence === "manual");
ok("all is manual", PROGRAMS.all && PROGRAMS.all.cadence === "manual");

// ---- Turns are arrays of { name, note } ----
for (const [key, prog] of Object.entries(PROGRAMS)) {
  ok(key + " has turns array", Array.isArray(prog.turns) && prog.turns.length > 0);
  ok(key + " turns have names", prog.turns.every(t => typeof t.name === "string" && t.name.length > 0));
  ok(key + " turns have notes", prog.turns.every(t => typeof t.note === "string" && t.note.length > 0));
  ok(key + " has label", typeof prog.label === "string" && prog.label.length > 0);
}

// ---- Each preset turns known gears ----
const KNOWN_GEARS = new Set(["axle.daily", "axle.weekly", "pipeline.sweep", "certs.watch",
  "roofmaint.sweep", "followup.scheduled"]);
for (const [key, prog] of Object.entries(PROGRAMS)) {
  ok(key + " only turns known gears", prog.turns.every(t => KNOWN_GEARS.has(t.name)));
}

// ---- workers preset covers field-ops gears ----
const workerGears = new Set(PROGRAMS.workers.turns.map(t => t.name));
ok("workers includes certs.watch", workerGears.has("certs.watch"));
ok("workers includes roofmaint.sweep", workerGears.has("roofmaint.sweep"));

// ---- money preset covers revenue gears ----
const moneyGears = new Set(PROGRAMS.money.turns.map(t => t.name));
ok("money includes pipeline.sweep", moneyGears.has("pipeline.sweep"));
ok("money includes followup.scheduled", moneyGears.has("followup.scheduled"));

// ---- all preset includes all daily + weekly gears (superset) ----
const allGears = new Set(PROGRAMS.all.turns.map(t => t.name));
const dailyGears = PROGRAMS.daily.turns.map(t => t.name);
const weeklyGears = PROGRAMS.weekly.turns.map(t => t.name);
ok("all is superset of daily gears", dailyGears.every(g => allGears.has(g)));
ok("all is superset of weekly gears", weeklyGears.every(g => allGears.has(g)));

// ---- isSunday ----
ok("isSunday null → not sunday (uses now — depends on when test runs; just checks no throw)", typeof isSunday(null) === "boolean");
ok("isSunday 2026-07-26 (Sunday) → true", isSunday("2026-07-26T12:00:00Z") === true);
ok("isSunday 2026-07-27 (Monday) → false", isSunday("2026-07-27T12:00:00Z") === false);
ok("isSunday bad string → false", isSunday("not-a-date") === false);

// ---- tick: unknown cadence ----
(async () => {
  const r = await tick("nonexistent_program");
  ok("tick unknown program → ok:false", r && !r.ok);
  ok("tick unknown program → error key", r && r.error === "unknown_program");
  ok("tick unknown program → lists known programs", Array.isArray(r && r.programs) && r.programs.includes("daily"));
})().then(() => {
  // ---- tick: Sunday guard ----
  return tick("daily", "2026-07-26T12:00:00Z");
}).then((r) => {
  ok("tick sunday → ok:true (not an error)", r && r.ok);
  ok("tick sunday → skipped", r && r.skipped === "sunday");
}).then(() => {
  // ---- tick: workers preset on a weekday (no Supabase; gearbox still runs in-memory) ----
  return tick("workers", "2026-07-28T12:00:00Z"); // Monday
}).then((r) => {
  ok("tick workers weekday → ok:true", r && r.ok);
  ok("tick workers weekday → cadence=workers", r && r.cadence === "workers");
  ok("tick workers weekday → drove >0 gears", typeof r.drove === "number" && r.drove > 0);
}).then(() => {
  // ---- tick: money preset ----
  return tick("money", "2026-07-28T12:00:00Z");
}).then((r) => {
  ok("tick money weekday → ok:true", r && r.ok);
  ok("tick money weekday → cadence=money", r && r.cadence === "money");
  ok("tick money is marked blocked (followup.scheduled is an owner gear)", r && r.blocked === true);
}).then(() => {
  // ---- tick: all preset ----
  return tick("all", "2026-07-28T12:00:00Z");
}).then((r) => {
  ok("tick all weekday → ok:true", r && r.ok);
  ok("tick all weekday → drove >=5 gears", r && r.drove >= 5);
}).then(() => {
  console.log("\n" + (fail ? "  ✗ " : "  ✓ ") + (pass + fail) + " passed, " + fail + " failed  — axle programs + tick logic");
  process.exit(fail ? 1 : 0);
}).catch((e) => {
  console.error("UNCAUGHT:", e);
  process.exit(1);
});
