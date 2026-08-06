// SPF takeoff engine — the real multi-area spray-foam estimator core. Where foam-calc.js sizes ONE
// area, this models a whole job the way it's actually sprayed: several assemblies (attic, walls, rim
// joist, cathedral, crawl, metal building…), each with its OWN depth or R-target, open- vs closed-
// cell, substrate condition, and scarfing allowance. It computes board-feet per area (BF = SF ×
// inches — DOCTRINE, never ÷12), condition-based + scarf waste, delivered R, sets to order, crew
// hours, then rolls the whole job up to material + labor + mobilization → price at the segment GM
// target × state multiplier, with the job minimum and a backward GM check.
//
// PURE + deterministic (no keys, no Date.now, no network). All money/physics constants mirror LOCKED
// mgsf-core doctrine (2026-07-16) — doctrine wins if they ever diverge. The 850 BF/hr crew rate, 12%
// waste and 5% buffer are APP DEFAULTS (not doctrine) — every one is overridable per area, so the
// tool models reality instead of forcing a single average. Never fabricates a customer number:
// an area with no depth AND no R-target is defaulted but FLAGGED "assumed — confirm".
//
// POST { areas:[{name,sqft,cell,inches|targetR,condition,scarf,waste,buffer,bfPerHr}], state, segment,
//        miles, prep, crew:{installers,helpers} } -> full takeoff + (when state+segment given) price
// GET  -> defaults/knobs.

// ---- LOCKED doctrine constants (mgsf-core) ----
const COST_PER_BF = { open: 0.122, closed: 0.982, roofing: 0.680 }; // $/BF
const R_PER_INCH  = { open: 3.6, closed: 6.5, roofing: 6.0 };       // roofing R is informational (depth-driven)
const RATE = { installer: 80, helper: 48 };                          // $/hr
const STATE_MULT = { MT: 1.00, ND: 1.05, SD: 1.00, WY: 1.12 };
const GM_TARGET = { residential: 0.55, commercial: 0.50, industrial: 0.48, government: 0.45 };
const JOB_MIN = 1200;
function mobilization(miles) { // doctrine tiers + $1.50/mi past 100
  const m = Math.max(0, num(miles, 0));
  let base = m < 25 ? 100 : m <= 50 ? 200 : 350;
  if (m > 100) base += (m - 100) * 1.5;
  return Math.round(base);
}
// Nominal set yields (ESTIMATE — lab figures; real yield drops on cold substrate, waste% covers it).
const YIELD_BF_PER_SET = { closed: 4000, open: 16000 }; // roofing set yield not locked → sets deferred

// ---- APP defaults (NOT doctrine — overridable per area) ----
const DEFAULT_BF_PER_HR = 850; // 2-person crew production rate
const DEFAULT_WASTE = 0.12;
const DEFAULT_BUFFER = 0.05;
// Condition-based extra waste (field reality: rough/overhead/tight substrates waste more foam).
const CONDITION_WASTE = { clean: 0, new: 0, standard: 0, smooth: 0, rough: 0.05, irregular: 0.05, uneven: 0.05, overhead: 0.03, tight: 0.03, crawl: 0.03, retrofit: 0.04, dirty: 0.03, gappy: 0.04 };
const SCARF_WASTE = 0.05; // closed-cell shave-to-flush (scarfing) trim allowance when scarf=true

function num(v, d) { const n = parseFloat(v); return Number.isFinite(n) ? n : (d == null ? null : d); }
function r2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function r1(n) { return Math.round((Number(n) || 0) * 10) / 10; }
function cellOf(s) { const t = String(s || "closed").toLowerCase(); if (t.indexOf("open") === 0) return "open"; if (t.indexOf("roof") === 0) return "roofing"; return "closed"; }
// Round required inches UP to the next practical 0.5" lift so delivered R meets/exceeds target.
function practicalInches(raw) { const x = Math.max(0, Number(raw) || 0); return Math.ceil(x * 2 - 1e-9) / 2; }

// Sum condition waste from a free-text or array condition field (tokens matched against the table).
function conditionWaste(condition) {
  if (!condition) return 0;
  const toks = Array.isArray(condition) ? condition : String(condition).toLowerCase().split(/[\s,;/]+/);
  let w = 0; const seen = {};
  for (const t of toks) { if (CONDITION_WASTE[t] && !seen[t]) { w += CONDITION_WASTE[t]; seen[t] = 1; } }
  return w;
}

function computeArea(a, i) {
  a = a || {};
  const cell = cellOf(a.cell || a.type || a.foam);
  const sqft = Math.max(0, num(a.sqft != null ? a.sqft : a.area, 0));
  const flags = [];

  // Resolve thickness: explicit inches win; else from target R (rounded up to a practical lift);
  // else a per-cell default that we FLAG as assumed (doctrine: no silent assumptions in a bid).
  let inches = num(a.inches != null ? a.inches : a.thickness, null);
  const targetR = num(a.targetR != null ? a.targetR : a.rTarget, null);
  let basis = "inches";
  if (inches == null && targetR != null) { inches = practicalInches(targetR / R_PER_INCH[cell]); basis = "targetR"; }
  if (inches == null) { inches = cell === "closed" ? 2 : cell === "roofing" ? 1.5 : 3.5; basis = "assumed"; flags.push(`${a.name || "area " + (i + 1)}: no depth or R-target given — defaulted to ${inches}" (ASSUMED — confirm)`); }
  inches = Math.max(0, inches);
  const deliveredR = r1(inches * R_PER_INCH[cell]);
  if (basis === "targetR") flags.push(`${a.name || "area " + (i + 1)}: R-${targetR} → ${inches}" ${cell}-cell → delivered ≈ R-${deliveredR}`);

  // Board feet — DOCTRINE: SF × inches. (Never ÷ 12.)
  const boardFeet = sqft * inches;

  // Waste: base + condition + scarf, then a separate buffer. All overridable.
  const baseWaste = Math.min(0.6, Math.max(0, num(a.waste, DEFAULT_WASTE)));
  const condWaste = conditionWaste(a.condition);
  const scarf = a.scarf === true || a.scarf === "true";
  const scarfWaste = scarf ? SCARF_WASTE : 0;
  const buffer = Math.min(0.5, Math.max(0, num(a.buffer, DEFAULT_BUFFER)));
  const wasteFactor = r2(baseWaste + condWaste + scarfWaste);
  const appliedBoardFeet = boardFeet * (1 + wasteFactor) * (1 + buffer);

  const material = appliedBoardFeet * (COST_PER_BF[cell] || 0);
  const bfPerHr = Math.max(1, num(a.bfPerHr, DEFAULT_BF_PER_HR));
  const crewHours = appliedBoardFeet / bfPerHr;

  const yield_ = YIELD_BF_PER_SET[cell];
  const setsExact = yield_ ? appliedBoardFeet / yield_ : null;
  const setsToOrder = setsExact != null ? Math.ceil(setsExact - 1e-9) : null;

  return {
    name: String(a.name || "Area " + (i + 1)).slice(0, 60),
    cell, sqft, inches, basis, deliveredR,
    boardFeet: Math.round(boardFeet),
    wasteFactor, buffer,
    appliedBoardFeet: Math.round(appliedBoardFeet),
    material: r2(material),
    crewHours: r2(crewHours),
    setsExact: setsExact != null ? r2(setsExact) : null,
    setsToOrder,
    setsNote: yield_ ? null : "roofing set-yield not locked — order by board-feet",
    flags,
  };
}

function takeoff(body) {
  body = body || {};
  const areasIn = Array.isArray(body.areas) ? body.areas : (body.area || body.sqft ? [body] : []);
  const areas = areasIn.slice(0, 40).map(computeArea);
  const flags = [];
  areas.forEach((a) => a.flags.forEach((f) => flags.push(f)));

  const totalBF = areas.reduce((s, a) => s + a.boardFeet, 0);
  const appliedBF = areas.reduce((s, a) => s + a.appliedBoardFeet, 0);
  const material = r2(areas.reduce((s, a) => s + a.material, 0));
  const crewHours = r2(areas.reduce((s, a) => s + a.crewHours, 0));
  const setsByCell = {};
  areas.forEach((a) => { if (a.setsToOrder != null) setsByCell[a.cell] = (setsByCell[a.cell] || 0) + a.appliedBoardFeet; });
  const setsToOrder = {};
  Object.keys(setsByCell).forEach((c) => { setsToOrder[c] = Math.ceil(setsByCell[c] / YIELD_BF_PER_SET[c] - 1e-9); });

  // Labor: crew hours × crew rate. Default 1 installer + 1 helper (overridable).
  const installers = Math.max(0, num(body.crew && body.crew.installers, 1));
  const helpers = Math.max(0, num(body.crew && body.crew.helpers, 1));
  const laborRate = installers * RATE.installer + helpers * RATE.helper;
  const labor = r2(crewHours * laborRate);

  const mob = mobilization(body.miles);
  const prep = Math.max(0, num(body.prep, 0)); // optional separate prep/removal line
  const cost = r2(material + labor + mob + prep);

  const out = {
    ok: true, label: "ESTIMATE",
    formula: "BF = square feet × inches (never ÷12)",
    areas,
    totals: { boardFeet: totalBF, appliedBoardFeet: appliedBF, material, laborHours: crewHours, labor, mobilization: mob, prep, setsToOrder, cost },
    flags,
  };

  // Price only when we know the segment (GM target) and state (multiplier) — else quantities only.
  const segment = String(body.segment || "").toLowerCase();
  const state = String(body.state || "").toUpperCase();
  if (GM_TARGET[segment] && STATE_MULT[state]) {
    const gm = GM_TARGET[segment];
    const mult = STATE_MULT[state];
    let price = cost / (1 - gm);
    price = price * mult;
    let minApplied = false;
    if (price < JOB_MIN) { price = JOB_MIN; minApplied = true; }
    price = Math.round(price);
    const gmActual = price > 0 ? r1(((price - cost) / price) * 100) : 0;
    out.price = {
      segment, state, gmTarget: Math.round(gm * 100), stateMultiplier: mult,
      price, jobMinimumApplied: minApplied,
      gmActualPct: gmActual,
      underTarget: gmActual < Math.round(gm * 100) - 0.05,
    };
    if (out.price.underTarget) flags.push(`Margin ${gmActual}% is under the ${Math.round(gm * 100)}% ${segment} target — raise price, cut scope, or accept as a strategic call.`);
  } else {
    out.priceNote = "Add state (MT/ND/SD/WY) + segment (residential/commercial/industrial/government) to price it; quantities are complete.";
  }
  return out;
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({ ok: true, configured: true,
      defaults: { bfPerHr: DEFAULT_BF_PER_HR, waste: DEFAULT_WASTE, buffer: DEFAULT_BUFFER, conditionWaste: CONDITION_WASTE, scarfWaste: SCARF_WASTE },
      doctrine: { costPerBF: COST_PER_BF, rPerInch: R_PER_INCH, rate: RATE, stateMult: STATE_MULT, gmTarget: GM_TARGET, jobMin: JOB_MIN },
      note: "POST { areas:[{name,sqft,cell,inches|targetR,condition,scarf}], state, segment, miles }. BF = SF × inches. Constants are locked doctrine; bfPerHr/waste/buffer are overridable app defaults." });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  try { res.status(200).json(takeoff(body)); }
  catch (e) { res.status(200).json({ ok: false, error: String(e).slice(0, 140) }); }
};

module.exports.takeoff = takeoff;
module.exports.computeArea = computeArea;
module.exports.mobilization = mobilization;
module.exports.practicalInches = practicalInches;
module.exports.conditionWaste = conditionWaste;
