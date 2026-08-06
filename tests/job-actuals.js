#!/usr/bin/env node
// Regression suite for the rig-side actuals log (api/job-actuals.js) — the Yield-Intelligence data
// spine. Locks: jobId required, typed/clean normalization, drum-lot gather (from sets + explicit),
// BF derived from sets×nominal-yield (marked, roofing deferred), spray-time-vs-on-site productivity,
// chain-of-custody completeness/missing, variance handoff shape, and NO fabrication of unlogged
// values. Gated storage stays inert/honest without Supabase. Keyless. Run: node tests/job-actuals.js

const path = require("path");
const ja = require(path.join(__dirname, "..", "api", "job-actuals.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

console.log("Job actuals (rig-side session log) invariants\n");

// ---- normalize: required jobId + typing ----
(() => {
  ok("no jobId → not ok, error", ja.normalize({}).ok === false && ja.normalize({}).errors.some((e) => /jobId/i.test(e)));
  const n = ja.normalize({ jobId: "J-100", crew: "Daniel", rig: "Rig 1", setsUsed: [{ cell: "closed", sets: 3, lot: "A123" }, { cell: "open", sets: 1 }] });
  ok("ok with jobId", n.ok === true);
  ok("sets typed (cell normalized)", n.record.setsUsed[0].cell === "closed" && n.record.setsUsed[1].cell === "open");
})();

// ---- drum lots gathered from sets + explicit, deduped ----
(() => {
  const n = ja.normalize({ jobId: "J-1", setsUsed: [{ cell: "closed", sets: 2, lot: "A1" }], drumLots: ["A1", "B2"] });
  ok("lots merged + deduped", n.record.drumLots.length === 2 && n.record.drumLots.includes("A1") && n.record.drumLots.includes("B2"));
})();

// ---- BF derived from sets × nominal yield, flagged; roofing deferred ----
(() => {
  const n = ja.normalize({ jobId: "J-2", setsUsed: [{ cell: "closed", sets: 3 }] });
  ok("closed 3 sets × 4000 = 12000 BF (derived)", n.record.boardFeet === 12000 && n.record.boardFeetDerived === true, n.record.boardFeet);
  const explicit = ja.normalize({ jobId: "J-2b", boardFeet: 9000, setsUsed: [{ cell: "closed", sets: 3 }] });
  ok("logged BF wins over derivation", explicit.record.boardFeet === 9000 && explicit.record.boardFeetDerived === false);
  const roof = ja.normalize({ jobId: "J-2c", setsUsed: [{ cell: "roofing", sets: 2 }] });
  ok("roofing set-yield deferred (error, not fabricated)", roof.errors.some((e) => /roofing set-yield/i.test(e)));
})();

// ---- spray efficiency: gun time vs on-site time ----
(() => {
  const e = ja.sprayEfficiency({ sprayStart: "2026-08-06T14:00:00Z", sprayStop: "2026-08-06T18:00:00Z", onsiteStart: "2026-08-06T13:00:00Z", onsiteStop: "2026-08-06T21:00:00Z" });
  ok("spray 240 min", e.sprayMin === 240, e.sprayMin);
  ok("on-site 480 min", e.onsiteMin === 480, e.onsiteMin);
  ok("productive 50%", e.productivePct === 50, e.productivePct);
  const none = ja.sprayEfficiency({});
  ok("no timestamps → nulls (nothing invented)", none.sprayMin === null && none.productivePct === null);
})();

// ---- chain-of-custody: complete vs missing ----
(() => {
  const full = ja.normalize({ jobId: "J-3", setsUsed: [{ cell: "closed", sets: 2, lot: "A1" }], substrateTemp: 45, ambientTemp: 55, photos: [{ url: "x", tag: "after" }], signoff: "Jane" }).record;
  const coc = ja.chainOfCustody(full);
  ok("full package complete", coc.complete === true && coc.missing.length === 0);
  ok("coc carries lots + conditions + photos + signoff", coc.lots.length === 1 && coc.conditions.substrateTemp === 45 && coc.photos.length === 1 && coc.signoff === "Jane");
  const bare = ja.chainOfCustody(ja.normalize({ jobId: "J-4" }).record);
  ok("bare package flags what's missing", bare.complete === false && bare.missing.includes("photos") && bare.missing.includes("signoff"));
})();

// ---- variance handoff shape (feeds yield-variance) ----
(() => {
  const rec = ja.normalize({ jobId: "J-5", boardFeet: 13200, setsUsed: [{ cell: "closed", sets: 4 }], laborHours: 20, substrateTemp: 25, mixNotes: "winter mix" }).record;
  const vi = ja.varianceInput(rec);
  ok("variance input has BF + sets + hours", vi.boardFeet === 13200 && vi.sets === 4 && vi.laborHours === 20);
  ok("variance input rolls conditions", /winter mix/.test(vi.conditions) && /25°F substrate/.test(vi.conditions));
})();

// ---- photo tags normalized/bounded ----
(() => {
  const n = ja.normalize({ jobId: "J-6", photos: [{ url: "a", tag: "BEFORE" }, { url: "b", tag: "weird" }] });
  ok("known tag lowercased, unknown → 'photo'", n.record.photos[0].tag === "before" && n.record.photos[1].tag === "photo");
})();

// ---- pure exports present (callers depend on these; storage is gated inside the handler) ----
(() => {
  ok("pure exports present", typeof ja.normalize === "function" && typeof ja.chainOfCustody === "function" && typeof ja.sprayEfficiency === "function" && typeof ja.varianceInput === "function");
})();

// ---- empty/garbage safe ----
(() => {
  let threw = false; try { ja.normalize(null); ja.chainOfCustody(null); ja.varianceInput(null); ja.sprayEfficiency(null); } catch { threw = true; }
  ok("null inputs never throw", threw === false);
})();

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
