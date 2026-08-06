// Klyfton JOB PHASES / RETURN-TRIP PLANNER — turns the scopes on one bid into the ORDERED list of
// separate TRIPS the crew actually makes to that address.
//
// The problem this solves. On a new build MGSF is not on site once — it's on site up to five times,
// weeks or months apart, each time called in by the GC when the previous trade clears:
//
//   1. under-slab      spray the sub-grade BEFORE the slab pour
//   2. foundation-ext  foam the exterior of the poured basement walls, before backfill
//   3. rim-joist       foam the rim/band joist once the floor system is set
//   4. walls           foam the wall cavities after framing + electrical/plumbing rough-in
//   5. attic-ceiling   foam the attic/roof deck after trusses + sheathing are on
//
// The estimator's cart already holds several scopes per bid, but it has no idea which of them share
// a trip. Every scope carries its own mobilization, so five scopes bill five mobilizations whether
// that's five real trips or one. And the job minimum is applied once to the whole bid, so a bid can
// total fine while containing an individual trip that loses money on its own.
//
// This module adds the missing unit: the TRIP. Scopes assigned to the same phase = one trip = ONE
// mobilization, and every trip is checked against the job minimum independently.
//
// GROUNDED, NOT FABRICATED: no prices, minimums, or mobilization figures live here — they arrive
// from the caller's settings. This module only decides what groups with what, in what order, and
// whether each trip clears the floor the caller gave it. Sequence + inspection gates are the
// standard construction order (same reasoning as job-workflow.js), each deferring to the AHJ. The
// one hard MGSF rule is carried through: never cover spray foam before the insulation sign-off.
//
// Pure, keyless, deterministic. No Date.now, no I/O.

// Canonical MGSF return-trip sequence. `order` drives display; `seq:false` marks work that has no
// fixed slot in a build (retrofit, roofing, lifting) and is therefore its own standalone trip.
const PHASES = [
  { id: "under-slab",     name: "Under-Slab / Sub-Grade",   order: 1, seq: true,  calledInAfter: "Sub-grade prepped, vapor barrier and under-slab MEP set",     before: "Slab pour",                gate: "Under-slab insulation/vapor barrier inspected BEFORE the pour where required. Verify AHJ." },
  { id: "foundation-ext", name: "Foundation Exterior",      order: 2, seq: true,  calledInAfter: "Foundation walls poured and forms stripped",                   before: "Backfill",                 gate: "Foundation/damp-proofing inspection before backfill; protect board/coating per product TDS. Verify AHJ." },
  { id: "rim-joist",      name: "Rim / Band Joist",         order: 3, seq: true,  calledInAfter: "Floor system set, rim accessible",                             before: "Subfloor closes access",   gate: "Insulation/air-barrier inspection before cover. MGSF RULE: never cover spray foam before this sign-off." },
  { id: "walls",          name: "Wall Cavities",            order: 4, seq: true,  calledInAfter: "Framing complete, electrical + plumbing rough-in SIGNED OFF",  before: "Drywall",                  gate: "Rough-in inspections must close BEFORE insulation; then insulation/air-barrier inspection before cover. MGSF RULE: never cover spray foam before this sign-off. Verify AHJ." },
  { id: "attic-ceiling",  name: "Attic / Roof Deck",        order: 5, seq: true,  calledInAfter: "Trusses and sheathing on, structure dried in",                 before: "Ceiling finish",           gate: "Insulation/air-barrier inspection before cover; ignition/thermal barrier per IRC R316. MGSF RULE: never cover spray foam before this sign-off. Verify AHJ." },
  { id: "roofing",        name: "SPF Roofing & Coating",    order: 6, seq: false, calledInAfter: "Deck sound, dry, and within substrate temperature window",     before: "—",                        gate: "Per product TDS (mils/DFT, recoat window) + roofing permit. Verify AHJ." },
  { id: "coatings",       name: "Protective Coatings",      order: 7, seq: false, calledInAfter: "Substrate prepped and within cure/temperature window",         before: "—",                        gate: "Per product TDS (mils/DFT, recoat window). Verify AHJ." },
  { id: "concrete",       name: "Concrete Lifting / Void",  order: 8, seq: false, calledInAfter: "811 utility locate cleared",                                   before: "—",                        gate: "Call 811 before injection. Verify AHJ." },
  { id: "retrofit",       name: "Retrofit / Existing",      order: 9, seq: false, calledInAfter: "Access arranged with the occupant",                            before: "—",                        gate: "Occupant notification + re-occupancy timing per SDS; ignition/thermal barrier per IRC R316. Verify AHJ." },
  { id: "diagnostics",    name: "Diagnostics / BPI",        order: 10, seq: false, calledInAfter: "Envelope complete enough to test",                            before: "—",                        gate: "Test per BPI protocol; ASHRAE 62.2 ventilation check after air sealing." },
];

const PHASE_BY_ID = {};
PHASES.forEach((p) => { PHASE_BY_ID[p.id] = p; });

function phaseById(id) { return PHASE_BY_ID[String(id == null ? "" : id).trim().toLowerCase()] || null; }

function num(v) { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; }

// Cost-weighted blend of the per-scope gross margins on a trip. Scopes store gm as a whole percent
// (the cart writes Math.round(gm*100)); anything <= 1 is read as an already-normalised fraction.
function blendGM(scopes, fallback) {
  let wsum = 0, w = 0;
  for (const s of scopes) {
    const raw = num(s.gm);
    if (raw <= 0) continue;
    const g = raw > 1 ? raw / 100 : raw;
    const weight = Math.max(0, num(s.cost));
    if (weight <= 0) continue;
    wsum += g * weight; w += weight;
  }
  const blended = w > 0 ? wsum / w : num(fallback);
  // A margin at or above 1 would divide by zero (or flip sign) downstream.
  return blended > 0 && blended < 0.95 ? blended : num(fallback);
}

// Plan the trips for one bid.
//
//   scopes  — cart lines. Each may carry { phase, cost, mob, sell, gm, service }.
//   opts    — { minimum, minimumByPhase:{id:$}, defaultGM }. All money comes from the caller.
//
// Scopes with no recognised phase are NOT invented into one. They stay in an "unassigned" group that
// bills exactly the way the estimator bills today — every scope keeping its own mobilization and its
// own sell — so bids saved before phases existed total to the same number they always did.
function planTrips(scopes, opts) {
  opts = opts || {};
  const list = Array.isArray(scopes) ? scopes : [];
  const minByPhase = opts.minimumByPhase || {};
  const baseMin = num(opts.minimum);
  const defaultGM = num(opts.defaultGM);

  const groups = new Map();
  const unassigned = [];
  for (const s of list) {
    const p = phaseById(s && s.phase);
    if (!p) { unassigned.push(s); continue; }
    if (!groups.has(p.id)) groups.set(p.id, []);
    groups.get(p.id).push(s);
  }

  const trips = [];
  const warnings = [];

  for (const p of PHASES) {
    const members = groups.get(p.id);
    if (!members || !members.length) continue;                 // pick-and-choose: unused phases vanish

    // ONE mobilization for the trip. When scopes disagree, the largest setup governs — you mobilize
    // once, to the heaviest requirement on that trip.
    const mobilization = members.reduce((m, s) => Math.max(m, num(s.mob)), 0);
    const mobBilledSeparately = members.reduce((a, s) => a + num(s.mob), 0);

    // Work cost = every scope's cost with its own mobilization stripped back out, then one added.
    const workCost = members.reduce((a, s) => a + Math.max(0, num(s.cost) - num(s.mob)), 0);
    const cost = workCost + mobilization;

    const gm = blendGM(members, defaultGM);
    const minimum = num(minByPhase[p.id] != null ? minByPhase[p.id] : baseMin);
    const atMargin = gm > 0 ? cost / (1 - gm) : cost;
    const sell = Math.max(minimum, atMargin);

    const clearsMinimum = atMargin >= minimum;
    const shortfall = clearsMinimum ? 0 : minimum - atMargin;
    const mobSaved = Math.max(0, mobBilledSeparately - mobilization);

    trips.push({
      phase: p.id, name: p.name, order: p.order, sequenced: p.seq,
      calledInAfter: p.calledInAfter, before: p.before, gate: p.gate,
      scopeCount: members.length,
      scopes: members,
      workCost, mobilization, cost, gm, minimum,
      sell, clearsMinimum, shortfall,
      mobilizationSaved: mobSaved,
    });

    if (!clearsMinimum) {
      warnings.push({
        level: "minimum", phase: p.id,
        message: p.name + " prices at " + Math.round(atMargin) + " but this is a separate trip with a "
          + Math.round(minimum) + " minimum — it is billed at the minimum, short " + Math.round(shortfall)
          + ". Combine it with an adjacent trip or reprice it.",
      });
    }
    if (mobSaved > 0) {
      warnings.push({
        level: "mobilization", phase: p.id,
        message: p.name + " holds " + members.length + " scopes on one trip — "
          + Math.round(mobSaved) + " of duplicate mobilization removed.",
      });
    }
  }

  trips.sort((a, b) => a.order - b.order);

  // Legacy / unphased lines: bill exactly as before, untouched.
  const legacy = {
    scopeCount: unassigned.length,
    scopes: unassigned,
    cost: unassigned.reduce((a, s) => a + num(s.cost), 0),
    sell: unassigned.reduce((a, s) => a + num(s.sell), 0),
  };
  if (unassigned.length) {
    warnings.push({
      level: "unassigned", phase: null,
      message: unassigned.length + " scope" + (unassigned.length === 1 ? " is" : "s are") + " not assigned to a trip — "
        + "billed individually, each carrying its own mobilization. Assign a phase to group them.",
    });
  }

  const totals = {
    tripCount: trips.length + (unassigned.length ? 1 : 0),
    workCost: trips.reduce((a, t) => a + t.workCost, 0) + legacy.cost,
    mobilization: trips.reduce((a, t) => a + t.mobilization, 0),
    cost: trips.reduce((a, t) => a + t.cost, 0) + legacy.cost,
    sell: trips.reduce((a, t) => a + t.sell, 0) + legacy.sell,
    mobilizationSaved: trips.reduce((a, t) => a + t.mobilizationSaved, 0),
  };

  return { trips, unassigned: legacy, totals, warnings };
}

// The customer/GC-facing call order: which trip, what has to be true before MGSF shows up, and the
// gate that closes it. Sequenced phases first in build order, standalone work after.
function callSchedule(plan) {
  const trips = (plan && plan.trips) || [];
  return trips.map((t, i) => ({
    step: i + 1, phase: t.phase, name: t.name,
    calledInAfter: t.calledInAfter, before: t.before, gate: t.gate,
    sequenced: t.sequenced, sell: t.sell,
  }));
}

module.exports = { planTrips, callSchedule, phaseById, PHASES };
