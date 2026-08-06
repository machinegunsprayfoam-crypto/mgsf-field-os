#!/usr/bin/env node
// Return-trip planner invariants — api/job-phases.js. Run: `node tests/job-phases.js`
//
// Same spirit as calc-money.js: assert the MATH IDENTITIES and the grouping rules, never doctrine
// prices (every dollar in here is a test fixture the caller supplies, not an MGSF price). The two
// identities that matter to the business:
//   1. one trip bills ONE mobilization no matter how many scopes ride on it
//   2. every trip clears the job minimum ON ITS OWN, not just in the bid total
// Plus the compatibility guarantee: scopes with no phase total exactly as they do today.
// Keyless, no npm, deterministic (no Date.now, no I/O).

const path = require("path");
const { planTrips, callSchedule, phaseById, PHASES } = require(path.join(__dirname, "..", "api", "job-phases"));

let pass = 0, fail = 0;
const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 0.005 : tol);
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }
function noBadNums(name, o) {
  let bad = null;
  (function walk(v) { if (bad !== null) return; if (typeof v === "number") { if (!Number.isFinite(v)) bad = v; }
    else if (v && typeof v === "object") Object.values(v).forEach(walk); })(o);
  ok(name + ": no NaN/Infinity", bad === null, bad === null ? undefined : "found " + bad);
}
// A scope shaped like the estimator's cart writes it.
const scope = (phase, cost, mob, gm) => ({ phase, cost, mob, gm, sell: gm ? cost / (1 - gm / 100) : cost, service: "foam" });

const SET = { minimum: 1500, minimumByPhase: { roofing: 4500 }, defaultGM: 0.5 };

console.log("Return-trip planner invariants — phase grouping / one-mob-per-trip / per-trip minimum\n");

/* ── phase table ─────────────────────────────────────────────────────────── */
(function phaseTable() {
  ok("phases: the five sequenced new-build trips exist in build order",
    PHASES.filter(p => p.seq).map(p => p.id).join(",") === "under-slab,foundation-ext,rim-joist,walls,attic-ceiling");
  ok("phases: order is strictly increasing", PHASES.every((p, i) => i === 0 || p.order > PHASES[i - 1].order));
  ok("phases: ids are unique", new Set(PHASES.map(p => p.id)).size === PHASES.length);
  ok("phases: every phase carries an inspection gate", PHASES.every(p => typeof p.gate === "string" && p.gate.length > 10));
  ok("phases: the cover-before-signoff rule rides on all three cavity trips",
    ["rim-joist", "walls", "attic-ceiling"].every(id => /never cover spray foam/i.test(phaseById(id).gate)));
  ok("phases: walls trip requires rough-in signed off first", /rough-in/i.test(phaseById("walls").calledInAfter + phaseById("walls").gate));
  ok("phases: standalone work is not sequenced", ["roofing", "coatings", "concrete", "retrofit"].every(id => phaseById(id).seq === false));
  ok("phaseById: unknown ⇒ null", phaseById("nope") === null && phaseById(null) === null && phaseById("") === null);
  ok("phaseById: case + whitespace tolerant", phaseById("  RIM-JOIST ") === phaseById("rim-joist"));
})();

/* ── identity 1: one trip bills one mobilization ─────────────────────────── */
(function oneMobPerTrip() {
  // Three scopes the crew sprays on a single visit, each entered carrying the same $1,500 mob.
  const one = planTrips([scope("walls", 5000, 1500, 50), scope("walls", 3000, 1500, 50), scope("walls", 2000, 1500, 50)], SET);
  ok("one trip from three same-phase scopes", one.trips.length === 1 && one.trips[0].scopeCount === 3);
  ok("mobilization billed once, not three times", one.trips[0].mobilization === 1500, one.trips[0].mobilization);
  ok("duplicate mobilization reported", one.trips[0].mobilizationSaved === 3000, one.trips[0].mobilizationSaved);
  // work = (5000-1500)+(3000-1500)+(2000-1500) = 5500; cost = 5500 + 1500 = 7000
  ok("cost = stripped work + one mob", near(one.trips[0].workCost, 5500) && near(one.trips[0].cost, 7000), one.trips[0].cost);
  ok("naive per-scope billing would have been 10000", near(one.trips[0].cost + one.trips[0].mobilizationSaved, 10000));

  // Same three scopes spread across three real return trips: three mobilizations, correctly.
  const three = planTrips([scope("rim-joist", 5000, 1500, 50), scope("walls", 3000, 1500, 50), scope("attic-ceiling", 2000, 1500, 50)], SET);
  ok("three phases ⇒ three trips", three.trips.length === 3);
  ok("three real trips bill three mobilizations", three.totals.mobilization === 4500, three.totals.mobilization);
  ok("nothing deduped when trips are genuinely separate", three.totals.mobilizationSaved === 0);
  ok("separate trips cost more than one combined trip", three.totals.cost > one.totals.cost);

  // The largest setup governs a shared trip.
  const mixed = planTrips([scope("walls", 5000, 1500, 50), scope("walls", 4000, 2200, 50)], SET);
  ok("shared trip takes the largest mobilization", mixed.trips[0].mobilization === 2200, mixed.trips[0].mobilization);
  noBadNums("one-mob", one);
})();

/* ── identity 2: the margin identity holds per trip ──────────────────────── */
(function marginIdentity() {
  const p = planTrips([scope("walls", 8000, 1500, 50)], SET);
  const t = p.trips[0];
  ok("sell × (1 − gm) = cost when above the minimum", near(t.sell * (1 - t.gm), t.cost, 0.01), t.sell);
  ok("blended gm returned as a fraction", t.gm > 0 && t.gm < 1, t.gm);

  // Cost-weighted blend: 9000 of cost at 40% and 1000 at 60% ⇒ 42%.
  const b = planTrips([scope("walls", 9000, 0, 40), scope("walls", 1000, 0, 60)], SET);
  ok("gm blends cost-weighted, not naive-average", near(b.trips[0].gm, 0.42, 0.001), b.trips[0].gm);

  // A scope with no usable margin falls back to the caller's default rather than dividing by zero.
  const z = planTrips([{ phase: "walls", cost: 4000, mob: 0, gm: 0 }], SET);
  ok("missing gm ⇒ caller default, no divide-by-zero", near(z.trips[0].gm, 0.5) && Number.isFinite(z.trips[0].sell));
  const insane = planTrips([{ phase: "walls", cost: 4000, mob: 0, gm: 140 }], SET);
  ok("gm ≥ 95% rejected ⇒ caller default (never negative/infinite sell)", near(insane.trips[0].gm, 0.5) && insane.trips[0].sell > 0);
  noBadNums("margin", insane);
})();

/* ── identity 3: every trip clears the minimum on its own ────────────────── */
(function perTripMinimum() {
  // A small rim-joist visit inside a large bid: the bid total is healthy, the trip is not.
  const p = planTrips([scope("walls", 30000, 1500, 50), scope("rim-joist", 400, 0, 50)], SET);
  const rim = p.trips.find(t => t.phase === "rim-joist");
  ok("small trip is billed at the minimum, not at margin", rim.sell === 1500, rim.sell);
  ok("small trip flagged as not clearing", rim.clearsMinimum === false);
  ok("shortfall quantified", near(rim.shortfall, 1500 - 800), rim.shortfall);
  ok("a warning names the trip", p.warnings.some(w => w.level === "minimum" && w.phase === "rim-joist"));
  ok("the big trip clears on its own", p.trips.find(t => t.phase === "walls").clearsMinimum === true);
  ok("bid total being healthy does NOT suppress the per-trip flag", p.totals.sell > 50000 && rim.clearsMinimum === false);

  // Roofing carries its own, higher floor.
  const r = planTrips([scope("roofing", 1000, 0, 50)], SET);
  ok("roofing trip uses its own minimum", r.trips[0].minimum === 4500 && r.trips[0].sell === 4500, r.trips[0].sell);
  // Identical cost, different phase: $1,000 at 50% prices to $2,000 — clears the $1,500 wall floor,
  // does not clear the $4,500 roofing floor. The floor is per-phase, not per-bid.
  const w = planTrips([scope("walls", 1000, 0, 50)], SET);
  ok("non-roofing trip uses the base minimum", w.trips[0].minimum === 1500, w.trips[0].minimum);
  ok("same cost clears on walls, priced at margin", w.trips[0].clearsMinimum === true && near(w.trips[0].sell, 2000), w.trips[0].sell);
  ok("same cost does NOT clear on roofing", r.trips[0].clearsMinimum === false);
  ok("minimum never drags a healthy trip DOWN", planTrips([scope("walls", 40000, 0, 50)], SET).trips[0].sell > 1500);
})();

/* ── pick-and-choose: hybrid builds and retrofits ────────────────────────── */
(function pickAndChoose() {
  const hybrid = planTrips([scope("under-slab", 4000, 1500, 50), scope("attic-ceiling", 6000, 1500, 50)], SET);
  ok("unused phases simply do not appear", hybrid.trips.length === 2 && hybrid.trips.map(t => t.phase).join(",") === "under-slab,attic-ceiling");
  ok("trips come back in build order regardless of entry order",
    planTrips([scope("attic-ceiling", 1e4, 0, 50), scope("under-slab", 1e4, 0, 50), scope("walls", 1e4, 0, 50)], SET)
      .trips.map(t => t.phase).join(",") === "under-slab,walls,attic-ceiling");
  ok("retrofit stands alone with no build sequence", planTrips([scope("retrofit", 9000, 1500, 50)], SET).trips[0].sequenced === false);
  ok("empty bid ⇒ empty plan, no throw", planTrips([], SET).trips.length === 0 && planTrips([], SET).totals.sell === 0);
  ok("null/garbage input ⇒ empty plan, no throw", planTrips(null, SET).trips.length === 0 && planTrips(undefined).trips.length === 0);

  const full = planTrips(["under-slab", "foundation-ext", "rim-joist", "walls", "attic-ceiling"].map(p => scope(p, 6000, 1500, 50)), SET);
  ok("full new build = five trips", full.trips.length === 5 && full.totals.tripCount === 5);
  ok("full new build bills five mobilizations", full.totals.mobilization === 7500, full.totals.mobilization);
  noBadNums("full-build", full);
})();

/* ── compatibility: bids saved before phases existed ─────────────────────── */
(function legacy() {
  const legacyScopes = [{ cost: 5000, mob: 1500, gm: 50, sell: 10000 }, { cost: 3000, mob: 1500, gm: 50, sell: 6000 }];
  const p = planTrips(legacyScopes, SET);
  ok("unphased scopes are not invented into a phase", p.trips.length === 0 && p.unassigned.scopeCount === 2);
  ok("unphased scopes keep their own sell exactly", p.unassigned.sell === 16000 && p.totals.sell === 16000, p.totals.sell);
  ok("unphased scopes keep their own cost exactly (mobs untouched)", p.unassigned.cost === 8000);
  ok("an honest warning explains why they were not grouped", p.warnings.some(w => w.level === "unassigned"));
  ok("unrecognised phase string falls back to unassigned, never dropped",
    planTrips([{ phase: "made-up-phase", cost: 1000, sell: 2000 }], SET).unassigned.scopeCount === 1);

  // Mixed bid: phased lines group, legacy lines pass through, nothing is lost.
  const mixed = planTrips([scope("walls", 5000, 1500, 50), { cost: 2000, mob: 500, gm: 50, sell: 4000 }], SET);
  ok("mixed bid counts both a trip and the loose group", mixed.totals.tripCount === 2);
  ok("mixed bid loses no scope", mixed.trips[0].scopeCount + mixed.unassigned.scopeCount === 2);
})();

/* ── the GC-facing call schedule ─────────────────────────────────────────── */
(function schedule() {
  const p = planTrips(["walls", "under-slab", "rim-joist"].map(x => scope(x, 6000, 1500, 50)), SET);
  const s = callSchedule(p);
  ok("schedule is numbered from 1 in build order", s.map(x => x.step).join(",") === "1,2,3" && s[0].phase === "under-slab");
  ok("each step says what must be true before MGSF is called in", s.every(x => x.calledInAfter && x.calledInAfter.length > 5));
  ok("each step carries its inspection gate", s.every(x => x.gate && x.gate.length > 10));
  ok("under-slab is called in before the pour", /pour/i.test(s[0].before));
  ok("empty plan ⇒ empty schedule, no throw", callSchedule({ trips: [] }).length === 0 && callSchedule(null).length === 0);
})();

/* ── totals are internally consistent ────────────────────────────────────── */
(function totals() {
  const p = planTrips(["under-slab", "walls", "attic-ceiling"].map(x => scope(x, 7000, 1500, 45)), SET);
  ok("totals.cost = Σ trip cost", near(p.totals.cost, p.trips.reduce((a, t) => a + t.cost, 0)));
  ok("totals.sell = Σ trip sell", near(p.totals.sell, p.trips.reduce((a, t) => a + t.sell, 0)));
  ok("totals.mobilization = Σ trip mobilization", near(p.totals.mobilization, p.trips.reduce((a, t) => a + t.mobilization, 0)));
  ok("totals.workCost + totals.mobilization = totals.cost", near(p.totals.workCost + p.totals.mobilization, p.totals.cost));
  ok("sell ≥ cost on every trip (never sells below cost)", p.trips.every(t => t.sell >= t.cost));
  ok("adding a scope to an existing trip never adds a mobilization", (() => {
    const before = planTrips([scope("walls", 5000, 1500, 50)], SET).totals.mobilization;
    const after = planTrips([scope("walls", 5000, 1500, 50), scope("walls", 5000, 1500, 50)], SET).totals.mobilization;
    return before === after;
  })());
  ok("negative/garbage cost is floored, never negative work", planTrips([{ phase: "walls", cost: -500, mob: 100, gm: 50 }], SET).trips[0].workCost === 0);
  noBadNums("totals", p);
})();

console.log("\n" + (fail ? "✗" : "✓") + " " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
