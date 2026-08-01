// Klyfton JOB WORKFLOW / WIRING MAP — turns a set of trades (from a blueprint scope or entered by
// hand) into an ORDERED job workflow: which phase runs when, what each phase DEPENDS ON (the
// "wiring" — the predecessors that must finish first), the inspection GATE that closes each phase,
// and the prime/sub tag per trade. It's the missing piece between blueprint.js (reads the plan →
// scope → trades) and construction.js (prime/sub split): this sequences them into an executable plan.
//
// GROUNDED, NOT FABRICATED: the sequence + inspection gates are the standard GC construction order
// (IRC/IBC inspection sequence + trade logic — the same reasoning in the TRADES_EXPERT brain block),
// each carrying a "verify with the AHJ" pointer because inspection triggers/order vary by
// jurisdiction. No pricing, no durations invented (scheduling = mgsf-scheduling; dollars = doctrine).
// The one hard MGSF rule baked in: never cover spray foam before the insulation inspection.
//
// Pure, keyless, deterministic. GET -> the canonical sequence. POST { trades:[...] } -> the workflow
// for that job (only the phases whose trades are present, dependencies resolved to nearest present).

const construction = require("./construction");

// Canonical construction sequence. Each phase: trades it contains, the phases it depends on, and the
// inspection/sign-off that gates it. Ordered top→bottom = the order work happens.
const PHASES = [
  { id: "site",        name: "Site & Earthwork",        trades: ["sitework", "excavation", "soil-stabilization", "seawall"], dependsOn: [],                        gate: "Call 811 (utility locate) before any dig; grading/excavation permit + trench protection (OSHA Subpart P) per AHJ." },
  { id: "foundation",  name: "Foundation & Flatwork",   trades: ["concrete-flatwork", "concrete-lifting"],                    dependsOn: ["site"],                  gate: "Footing/rebar inspection BEFORE the pour; foundation inspection. Verify AHJ." },
  { id: "structure",   name: "Structure & Framing",     trades: ["framing", "metal", "masonry"],                              dependsOn: ["foundation"],            gate: "Framing/structural inspection BEFORE cover (+ steel anchor-bolt/weld, masonry reinforcing). Verify AHJ." },
  { id: "roof-dryin",  name: "Roof Dry-In",             trades: ["roofing-shingle", "spf-roofing"],                           dependsOn: ["structure"],             gate: "Weather-tight before interior work; roofing/ice-barrier per IRC R905 (Zone 6/7). Verify AHJ." },
  { id: "rough-in",    name: "Rough-Ins & Openings",    trades: ["electrical", "plumbing", "hvac", "fire", "doors-windows"],  dependsOn: ["structure"],             gate: "Electrical/plumbing/mechanical (+ fire) ROUGH-IN inspections BEFORE insulation/cover. Verify AHJ." },
  { id: "insulation",  name: "Insulation & Air Barrier", trades: ["spray-foam", "air-vapor"],                                 dependsOn: ["rough-in", "roof-dryin"], gate: "Insulation/air-barrier inspection BEFORE cover. MGSF RULE: never cover spray foam before this sign-off." },
  { id: "coatings",    name: "Coatings & Protection",   trades: ["coatings"],                                                 dependsOn: ["roof-dryin"],            gate: "Per product TDS (mils/DFT, recoat) + roofing/building permit. Verify AHJ." },
  { id: "finishes",    name: "Drywall & Finishes",      trades: ["drywall"],                                                  dependsOn: ["insulation"],            gate: "Fire-rated assemblies inspected before cover where required; then finish. Verify AHJ." },
  { id: "final",       name: "Final & Sign-off",        trades: [],                                                           dependsOn: ["finishes", "coatings"],  gate: "Final inspections (all trades) → certificate of occupancy / job close. Verify AHJ." },
];
const PHASE_IX = {}; PHASES.forEach((p, i) => { PHASE_IX[p.id] = i; });

function clean(s) { return String(s == null ? "" : s).trim().toLowerCase(); }

// Given the trades present on a job, return the ordered workflow: only phases with a present trade
// (plus "final" which always closes), each phase's present trades tagged prime/sub, and dependencies
// resolved to the nearest EARLIER present phase (so a skipped phase doesn't dangle the chain).
function workflow(tradeIds, opts) {
  opts = opts || {};
  const wanted = new Set((Array.isArray(tradeIds) ? tradeIds : []).map(clean).filter(Boolean));
  const unknown = [...wanted].filter((t) => !construction.tradeById(t));
  const knownWanted = [...wanted].filter((t) => construction.tradeById(t));

  // which phases are "present" (have at least one wanted trade)
  const present = PHASES.filter((p) => p.trades.some((t) => wanted.has(t)));
  const presentIds = new Set(present.map((p) => p.id));
  const includeFinal = present.length > 0;                       // final closes any real job
  const active = PHASES.filter((p) => presentIds.has(p.id) || (p.id === "final" && includeFinal));

  // resolve each phase's dependsOn to the nearest earlier PRESENT phase (skip absent ones)
  const activeIds = new Set(active.map((p) => p.id));
  function resolveDeps(p) {
    const out = new Set();
    for (const dep of p.dependsOn) {
      if (activeIds.has(dep)) { out.add(dep); continue; }
      // walk back through the absent dependency's own deps to the nearest present ancestor
      const stack = [...(PHASES[PHASE_IX[dep]] || {}).dependsOn || []];
      while (stack.length) { const d = stack.shift(); if (activeIds.has(d)) out.add(d); else stack.push(...((PHASES[PHASE_IX[d]] || {}).dependsOn || [])); }
    }
    return [...out];
  }

  const steps = active.map((p, order) => {
    const trades = p.trades.filter((t) => wanted.has(t)).map((t) => {
      const td = construction.tradeById(t);
      return { id: t, name: td ? td.name : t, role: td && td.selfPerform ? "self-perform" : "subcontract" };
    });
    return {
      order: order + 1, phase: p.id, name: p.name,
      trades,
      dependsOn: resolveDeps(p),
      gate: p.gate,
      mgsfSelfPerform: trades.some((t) => t.role === "self-perform"),
    };
  });

  // the "wiring": flat edge list predecessor -> phase (handy for a dependency diagram)
  const edges = [];
  steps.forEach((s) => s.dependsOn.forEach((d) => edges.push({ from: d, to: s.phase })));

  const foamStep = steps.find((s) => s.trades.some((t) => t.id === "spray-foam" || t.id === "spf-roofing" || t.id === "air-vapor"));

  return {
    ok: true,
    label: "GUIDANCE — standard GC sequence + inspection gates; verify triggers/order with the AHJ. No pricing, no durations.",
    trades: knownWanted, unknownTrades: unknown,
    steps, edges,
    criticalGate: foamStep ? "Insulation inspection gates the cover — never drywall/close over spray foam before the sign-off." : null,
    note: "Order = the sequence work happens; dependsOn = what must finish first (the wiring). Durations/scheduling = mgsf-scheduling; who's prime/sub = construction; dollars = doctrine.",
  };
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({
      ok: true, service: "job-workflow", pure: true, priced: false,
      sequence: PHASES.map((p) => ({ phase: p.id, name: p.name, trades: p.trades, dependsOn: p.dependsOn, gate: p.gate })),
      note: "POST { trades:[...] } (trade ids from construction, e.g. from a blueprint scope) → the ordered workflow + dependency wiring + inspection gates for that job. GUIDANCE — verify with the AHJ.",
    });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body; if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } } body = body || {};
  const trades = Array.isArray(body.trades) ? body.trades : (Array.isArray(body.scope) ? body.scope : []);
  try { res.status(200).json(workflow(trades, body)); }
  catch (e) { res.status(200).json({ ok: false, error: String((e && e.message) || e).slice(0, 160) }); }
};

module.exports.workflow = workflow;
module.exports.PHASES = PHASES;
