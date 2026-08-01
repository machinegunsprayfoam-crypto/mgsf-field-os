// Energy-audit analyzer — the utility-bill baseline behind a BPI-style report. Takes 12 months of
// electric (kWh) and/or gas (therms) reads and derives: annualized use, the base-load vs seasonal
// (heating/cooling) split, optional weather-normalization by heating degree-days, a combined site-
// energy figure (MMBtu), and an ESTIMATE of energy saved by an envelope measure. Pairs with
// api/bpi-calc.js (the blower-door diagnostics) to make the two halves of a BPI report.
//
// PURE + keyless: all math is deterministic, no npm, no network, no secrets (the handler just runs
// the pure core). HARD RULES honored in code: results are ESTIMATES, never guarantees; nothing is
// fabricated — weather-normalization needs degree-days you supply, and savings needs a reduction %
// you supply (both gated: absent ⇒ that step is skipped and said-so, never guessed). NO dollars and
// NO pricing here — output is energy units only; convert to $ with the customer's own utility rate.
//
// POST { electric:{ start, reads:[{end,usage}] }, gas:{...}, hdd?, typicalHdd?, reductionPct? }
//   -> per-fuel baseline + (gated) normalization + (gated) savings estimate
// GET -> the shape + notes.

// ---- physical energy constants (physics, not pricing) ----
const THERM_BTU = 100000;      // 1 therm = 100,000 Btu (by definition)
const KWH_BTU = 3412.14;       // 1 kWh   = 3,412.14 Btu
const THERM_KWH = THERM_BTU / KWH_BTU; // ≈29.30 kWh-equivalent per therm

function num(v, d) { const n = parseFloat(v); return Number.isFinite(n) ? n : d; }
function round(n, p) { const f = Math.pow(10, p == null ? 2 : p); return Math.round(num(n, 0) * f) / f; }
function clean(s, max) { return String(s == null ? "" : s).trim().slice(0, max || 200); }
function daysBetween(aIso, bIso) {
  const a = Date.parse(String(aIso) + "T00:00:00Z"), b = Date.parse(String(bIso) + "T00:00:00Z");
  return (Number.isFinite(a) && Number.isFinite(b)) ? Math.round((a - b) / 86400000) : null;
}

// Normalize a fuel's reads into per-period {days, usage, perDay}. Days come from consecutive dates
// (start → each end), or from an explicit `days` field when dates aren't supplied (keeps it testable).
function periods(reads, start) {
  const list = Array.isArray(reads) ? reads.filter(Boolean) : [];
  const out = [];
  let prev = start || null;
  for (const r of list) {
    let days = num(r.days, NaN);
    if (!Number.isFinite(days) && prev && r.end) days = daysBetween(r.end, prev);
    if (!Number.isFinite(days) || days <= 0) { prev = r.end || prev; continue; } // can't rate a bad period — skip, don't guess
    const usage = num(r.usage, 0);
    out.push({ days, usage, perDay: usage / days });
    prev = r.end || prev;
  }
  return out;
}

// Annualized use from whatever span of bills we have (ESTIMATE when < a full year of data).
function annualize(reads, start) {
  const p = periods(reads, start);
  const totalDays = p.reduce((s, x) => s + x.days, 0);
  const totalUsage = p.reduce((s, x) => s + x.usage, 0);
  const perDay = totalDays > 0 ? totalUsage / totalDays : 0;
  return {
    months: p.length, totalDays, totalUsage: round(totalUsage),
    perDay: round(perDay, 3), annualUsage: round(perDay * 365),
    fullYear: totalDays >= 330, // ~a year of coverage; else the annual figure is an ESTIMATE extrapolation
    basis: totalDays >= 330 ? "measured" : "ESTIMATE (extrapolated from " + p.length + " period(s))",
  };
}

// Base-load vs seasonal split: the coolest quarter's average per-day is the non-heating base load;
// everything above it, annualized, is the seasonal (heating for gas / heating+cooling for electric)
// load. Standard summer-minimum disaggregation — an ESTIMATE, not a sub-metered measurement.
function disaggregate(reads, start) {
  const p = periods(reads, start);
  const a = annualize(reads, start);
  if (!p.length) return { ...a, basePerDay: 0, baseAnnual: 0, seasonalAnnual: 0, seasonalPct: 0, method: "none" };
  const k = Math.max(1, Math.round(p.length / 4));
  const lowest = p.map((x) => x.perDay).sort((x, y) => x - y).slice(0, k);
  const basePerDay = lowest.reduce((s, x) => s + x, 0) / lowest.length;
  const baseAnnual = basePerDay * 365;
  const seasonalAnnual = Math.max(0, a.annualUsage - baseAnnual);
  return {
    ...a,
    basePerDay: round(basePerDay, 3), baseAnnual: round(baseAnnual),
    seasonalAnnual: round(seasonalAnnual),
    seasonalPct: a.annualUsage > 0 ? round((seasonalAnnual / a.annualUsage) * 100, 1) : 0,
    method: "summer-minimum (lowest " + k + " period(s)); ESTIMATE",
  };
}

// Weather-normalize seasonal use to a typical year. GATED: needs real degree-days you supply —
// with none it returns normalized:false and says so (never invents a climate number).
function normalize(seasonalUsage, actualHDD, typicalHDD) {
  const s = num(seasonalUsage, 0), aH = num(actualHDD, 0), tH = num(typicalHDD, 0);
  if (aH <= 0 || tH <= 0) return { normalized: false, note: "supply actual + typical HDD to weather-normalize" };
  const perHDD = s / aH;
  return { normalized: true, perHDD: round(perHDD, 4), normalizedSeasonal: round(perHDD * tH),
    note: "ESTIMATE — normalized " + round(s) + " units over " + aH + " HDD to a typical " + tH + " HDD year" };
}

// ESTIMATE of energy saved by an envelope measure. GATED: reductionPct is YOUR modeled input, never
// invented; absent ⇒ no number. NEVER a guarantee, NEVER dollars (multiply by the customer's rate).
function estimateSavings(seasonalUsage, reductionPct) {
  const s = num(seasonalUsage, 0), r = num(reductionPct, NaN);
  if (!Number.isFinite(r) || r <= 0) return { estimated: false, note: "supply a modeled reduction % (ESTIMATE) to project savings" };
  const pct = Math.min(90, Math.max(0, r)); // sanity clamp; a 100%+ heating cut isn't real
  return { estimated: true, reductionPct: pct, unitsSaved: round(s * pct / 100),
    label: "ESTIMATE", disclaimer: "Estimated energy reduction only — actual results vary; not a guarantee of savings." };
}

// Combined site energy in MMBtu from mixed fuels (physics conversion).
function siteEnergyMMBtu(kwh, therms) {
  return round((num(kwh, 0) * KWH_BTU + num(therms, 0) * THERM_BTU) / 1e6, 3);
}

// Full baseline for one fuel: annualize + disaggregate + (gated) normalize.
function analyzeFuel(fuel, opts) {
  const o = opts || {};
  const d = disaggregate(fuel && fuel.reads, fuel && fuel.start);
  const norm = normalize(d.seasonalAnnual, o.hdd, o.typicalHdd);
  const sav = estimateSavings(d.seasonalAnnual, o.reductionPct);
  return { ...d, weatherNormalized: norm, savings: sav };
}

// Building geometry → the derived numbers a report needs. volume feeds bpi-calc (ACH50) and the
// bedroom count feeds ASHRAE 62.2. All derived values are ESTIMATES; a missing input is simply
// omitted (never guessed). Rough "box model" for envelope area — sales-grade, not a Manual-J takeoff.
function geometry(building) {
  const o = building || {};
  const area = num(o.conditionedArea != null ? o.conditionedArea : o.area, 0);
  const wallH = num(o.wallHeight != null ? o.wallHeight : o.ceilingHeight, 8);
  const len = num(o.length, 0), wid = num(o.width, 0);
  const floors = Math.max(1, num(o.floors, 1));
  const out = { bedrooms: num(o.bedrooms, null), occupants: num(o.occupants, null), yearBuilt: num(o.yearBuilt, null) };
  if (area > 0 && wallH > 0) { out.volume = round(area * wallH); out.volumeBasis = "conditioned area × wall height (ESTIMATE — feeds blower-door ACH50 + ASHRAE 62.2)"; }
  if (len > 0 && wid > 0) {
    out.footprint = round(len * wid);
    out.wallAreaEst = round(2 * (len + wid) * wallH * floors);
    out.geomBasis = "rough box model (ESTIMATE)";
  }
  return out;
}

// Homeowner concerns → recommended MGSF measures. Keyword-matched, grounded in our services +
// building science. Combustion/CO is a SAFETY item (CAZ testing), never a foam upsell. Moisture is
// "manage/control", NEVER a mold-elimination claim. An unmatched concern returns "assessment needed"
// — we never invent a fix. Nothing here guarantees savings.
const MEASURE_RULES = [
  { re: /\b(co|carbon monoxide|backdraft|combustion|furnace|gas leak|flue)\b/i, safety: true, measure: "Combustion-safety (CAZ) testing", why: "Air-sealing can worsen backdrafting/CO — test combustion safety before AND after tightening; do not tighten a home with a CO concern until it is cleared." },
  { re: /cold (feet|floor)|floor.{0,15}(cold|cool)|cantilever|above (the )?garage/i, measure: "Air-seal + spray-foam the floor / cantilever / floor-over-garage assembly", why: "A cold floor over unconditioned space is leaky, uninsulated framing; closed-cell foam seals and insulates it." },
  { re: /draft|air.?leak|\bleak|infiltrat/i, measure: "Whole-home air-sealing (blower-door directed)", why: "Drafts are air leakage; seal the envelope and verify the reduction with a blower door." },
  { re: /(no|missing|lack|without|un).{0,12}insulat|wall.{0,20}insulat|insulat.{0,20}wall/i, measure: "Insulate the walls (foam / dense-pack per assembly)", why: "Uninsulated walls are a major heat-loss path; insulate to cut the load." },
  { re: /attic|ceiling|ice ?dam|roof.{0,15}(cold|leak|heat)/i, measure: "Air-seal + insulate the attic / roof deck", why: "The attic plane drives stack-effect loss and ice dams; air-seal, then insulate or foam the deck." },
  { re: /crawl ?space|\bcrawl\b/i, measure: "Encapsulate + closed-cell the crawlspace", why: "An open/vented crawlspace loses heat and drives moisture; encapsulate and foam it." },
  { re: /gas bill|energy bill|utility bill|high bill|bills?.{0,20}(high|expensive)|expensive/i, measure: "Cut the heating load: air-seal + envelope foam (verify against the utility baseline)", why: "High bills track the seasonal heating load — the utility analysis quantifies it and foam reduces it (ESTIMATE — actual savings vary)." },
  { re: /\bhot\b|overheat|too warm|cooling|\bac\b|air.?condition/i, measure: "Assess cooling load / envelope (foam cuts summer heat gain too)", why: "Overheating is solar/conduction gain; a tighter, insulated envelope reduces it." },
  { re: /moist|damp|condensat|humid|sweat|window.{0,10}wet/i, measure: "Moisture / dew-point assessment; air-seal to manage vapor drive", why: "Manage moisture and condensation risk with air-sealing and the right vapor strategy for Zone 6/7." },
];
function concernsToMeasures(concerns) {
  const list = Array.isArray(concerns) ? concerns.filter(Boolean) : [];
  return list.map((c) => {
    const text = (clean(c.summary, 200) + " " + clean(c.detail, 4000)).toLowerCase();
    const measures = [];
    for (const r of MEASURE_RULES) { if (r.re.test(text)) measures.push({ measure: r.measure, why: r.why, safety: !!r.safety }); }
    if (!measures.length) measures.push({ measure: "On-site assessment needed", why: "No standard measure matched this concern — the auditor should evaluate on site.", safety: false });
    return { summary: clean(c.summary, 200), measures, hasSafety: measures.some((m) => m.safety) };
  });
}

// ---- MEASURE CATALOG — best-of taxonomy synthesized from the BPI-2400 tools (Snugg Pro, OptiMiser),
// the DOE Weatherization Assistant (NEAT/MHEA), and HERS tools (REM/Rate, Ekotrope). Each measure can
// carry an owner-entered COST + program INCENTIVE (%/$/cap); NONE are MGSF doctrine pricing and none
// are fabricated. `mgsf:true` marks the measures MGSF actually performs (foam / air-seal / insulation).
const MEASURE_CATALOG = [
  ["air-sealing", "Air sealing (blower-door directed)", "envelope", true],
  ["attic-insulation", "Attic insulation", "envelope", true],
  ["vault-flat-ceiling", "Vault / flat ceiling insulation", "envelope", true],
  ["wall-insulation", "Wall insulation", "envelope", true],
  ["floor-insulation", "Floor / cantilever insulation", "envelope", true],
  ["basement-wall", "Basement wall insulation", "envelope", true],
  ["crawl-encapsulation", "Crawlspace encapsulation + insulation", "envelope", true],
  ["slab-perimeter", "Slab / perimeter insulation", "envelope", true],
  ["rim-joist", "Rim / band joist air-seal + foam", "envelope", true],
  ["spf-roof", "SPF roof / roof-deck foam + coating", "envelope", true],
  ["windows", "Windows", "envelope", false],
  ["specialty-windows", "Specialty windows", "envelope", false],
  ["exterior-doors", "Exterior doors", "envelope", false],
  ["hvac", "HVAC system", "mechanical", false],
  ["heat-pump", "Heat pump (space)", "mechanical", false],
  ["ducts", "Duct sealing / insulation", "mechanical", false],
  ["thermostat", "Smart thermostat", "mechanical", false],
  ["design-loads", "Design loads (Manual J)", "mechanical", false],
  ["dhw", "Water heater", "dhw", false],
  ["hpwh", "Heat-pump water heater", "dhw", false],
  ["dhw-wrap", "DHW tank / pipe wrap", "dhw", false],
  ["house-ventilation", "Whole-house ventilation (ASHRAE 62.2)", "ventilation", false],
  ["bath-ventilation", "Bath exhaust", "ventilation", false],
  ["kitchen-ventilation", "Kitchen exhaust", "ventilation", false],
  ["caz-combustion", "Combustion-safety (CAZ) testing", "health-safety", false],
  ["hazards", "Hazard remediation", "health-safety", false],
  ["air-quality", "Indoor air quality", "health-safety", false],
  ["refrigerator", "Refrigerator", "appliance", false],
  ["freezer", "Freezer", "appliance", false],
  ["dishwasher", "Dishwasher", "appliance", false],
  ["clothes-washer", "Clothes washer", "appliance", false],
  ["dryer", "Dryer", "appliance", false],
  ["range", "Range / cooktop", "appliance", false],
  ["lighting", "Lighting", "appliance", false],
  ["solar-pv", "Solar PV", "renewable", false],
  ["battery", "Battery storage", "renewable", false],
  ["ev-charger", "EV charger", "renewable", false],
].map(([id, name, category, mgsf]) => ({ id, name, category, mgsf }));
const _CAT_BY_ID = {}; MEASURE_CATALOG.forEach((m) => { _CAT_BY_ID[m.id] = m; });
function catalogFor(id) { return _CAT_BY_ID[clean(id, 60)] || null; }

// Net cost after a program incentive. All $ are OWNER-ENTERED per job (measure cost, incentive % / $ /
// cap) — never MGSF doctrine pricing, never fabricated. incentive = cost*pct% + flat$, capped, and can
// never exceed the cost. Returns {cost, incentive, netCost} — arithmetic only, labeled ESTIMATE upstream.
function applyIncentive(m) {
  const cost = Math.max(0, num(m && m.cost, 0));
  const pct = Math.min(100, Math.max(0, num(m && m.incentivePct, 0)));
  const dollar = Math.max(0, num(m && m.incentiveDollar, 0));
  const capRaw = num(m && m.incentiveCap, NaN);
  let incentive = cost * pct / 100 + dollar;
  if (Number.isFinite(capRaw) && capRaw >= 0) incentive = Math.min(incentive, capRaw);
  incentive = Math.min(incentive, cost); // never rebate more than the job costs
  return { cost: round(cost), incentive: round(incentive), netCost: round(Math.max(0, cost - incentive)) };
}

// Prioritize measures the NEAT/MHEA way: most cost-effective first. When a measure carries estimated
// annual energy saved, rank by net-cost-per-unit-saved (lower = better); measures without a savings
// figure fall to the end, ordered by net cost. Pure; enriches each with catalog name/category/mgsf-lane.
function prioritize(measures) {
  const list = (Array.isArray(measures) ? measures : []).filter(Boolean).map((m) => {
    const cat = catalogFor(m.id);
    const inc = applyIncentive(m);
    const units = num(m.annualSavingsUnits, 0);
    return {
      id: clean(m.id, 60) || null, name: (cat && cat.name) || clean(m.name, 60) || clean(m.id, 60) || "measure",
      category: (cat && cat.category) || "other", mgsf: !!(cat && cat.mgsf),
      cost: inc.cost, incentive: inc.incentive, netCost: inc.netCost,
      annualSavingsUnits: units > 0 ? units : null,
      costPerUnitSaved: units > 0 ? round(inc.netCost / units, 3) : null,
      recommend: m.recommend !== false,
    };
  });
  const scored = list.filter((x) => x.costPerUnitSaved != null).sort((a, b) => a.costPerUnitSaved - b.costPerUnitSaved);
  const rest = list.filter((x) => x.costPerUnitSaved == null).sort((a, b) => a.netCost - b.netCost);
  return scored.concat(rest).map((x, i) => ({ ...x, rank: i + 1 }));
}

// Document existing systems from the equipment-lookup helper. Pure passthrough — we don't
// invent specs here (equipment-lookup already validated/labeled them); we just surface them and
// let any combustion unit reinforce the CAZ safety flag. Returns { list, hasCombustion }.
function summarizeEquipment(list) {
  if (!Array.isArray(list)) return { list: [], hasCombustion: false };
  const combustionRe = /gas|propane|lp|oil|wood|pellet|diesel|kerosene/i;
  const clean = list.map((e) => {
    e = e || {};
    const combustion = e.combustion === true || combustionRe.test(String(e.fuel || "")) || /furnace|boiler/i.test(String(e.type || ""));
    return { type: String(e.type || "").slice(0, 40) || "unit", make: String(e.make || "").slice(0, 60), model: String(e.model || "").slice(0, 60),
      year: e.year ? String(e.year).slice(0, 8) : undefined, fuel: e.fuel ? String(e.fuel).slice(0, 40) : undefined,
      specs: (e.specs && typeof e.specs === "object") ? e.specs : undefined, verified: !!e.verified, combustion };
  }).filter((e) => e.make || e.model);
  return { list: clean, hasCombustion: clean.some((e) => e.combustion) };
}

function analyze(body) {
  const b = body || {};
  const out = { ok: true, basis: "ESTIMATE", units: "energy savings in units (kWh/therms), no $; measure costs/incentives are OWNER-ENTERED per job, not MGSF pricing" };
  if (b.electric && Array.isArray(b.electric.reads)) out.electric = analyzeFuel(b.electric, b);
  if (b.gas && Array.isArray(b.gas.reads)) out.gas = analyzeFuel(b.gas, b);
  const kwh = out.electric ? out.electric.annualUsage : 0;
  const therms = out.gas ? out.gas.annualUsage : 0;
  if (kwh || therms) out.siteEnergyMMBtu = siteEnergyMMBtu(kwh, therms);
  if (b.building) out.geometry = geometry(b.building);
  if (b.concerns) out.recommendations = concernsToMeasures(b.concerns);
  if (b.measures && Array.isArray(b.measures) && b.measures.length) {
    const ranked = prioritize(b.measures);
    out.measures = ranked;
    const tot = { cost: round(ranked.reduce((s, x) => s + x.cost, 0)), incentive: round(ranked.reduce((s, x) => s + x.incentive, 0)), netCost: round(ranked.reduce((s, x) => s + x.netCost, 0)) };
    const cap = num(b.programCap, NaN); // optional program-wide incentive cap (OptiMiser "All Measures Cap")
    if (Number.isFinite(cap) && cap >= 0) { tot.programCap = round(cap); tot.incentiveAfterCap = round(Math.min(tot.incentive, cap)); tot.netCostAfterCap = round(tot.cost - tot.incentiveAfterCap); }
    out.measuresTotal = tot;
  }
  if (b.equipment) { const eq = summarizeEquipment(b.equipment); if (eq.list.length) { out.equipment = eq.list; out.hasCombustion = eq.hasCombustion; } }
  const combustionConcern = (out.recommendations && out.recommendations.some((r) => r.hasSafety)) || out.hasCombustion;
  if (combustionConcern)
    out.safetyFlag = "Combustion-safety (CAZ) testing required before air-sealing — see recommendations.";
  if (!out.electric && !out.gas && !out.geometry && !out.recommendations && !out.measures && !out.equipment)
    return { ok: false, error: "no_input", note: "POST electric/gas reads, building{}, concerns[], equipment[], and/or measures[]" };
  return out;
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({ ok: true, service: "energy-audit", pure: true, guarantees: false, catalog: MEASURE_CATALOG,
      note: "POST { electric:{start,reads:[{end,usage}]}, gas:{...}, hdd?, typicalHdd?, reductionPct?, " +
        "building:{conditionedArea,wallHeight,length,width,floors,bedrooms,occupants,yearBuilt}, concerns:[{summary,detail}] }. " +
        "Returns annualized use + base/seasonal split, optional weather-normalization + savings ESTIMATE, building geometry (volume→ACH50), " +
        "and homeowner concerns mapped to MGSF measures (CAZ safety flagged). Energy units only — no dollars, no guarantees, no mold claims." });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  try { res.status(200).json(analyze(body || {})); }
  catch (e) { res.status(200).json({ ok: false, error: String(e).slice(0, 140) }); }
};

// pure exports for the brain + tests
module.exports.periods = periods;
module.exports.annualize = annualize;
module.exports.disaggregate = disaggregate;
module.exports.normalize = normalize;
module.exports.estimateSavings = estimateSavings;
module.exports.siteEnergyMMBtu = siteEnergyMMBtu;
module.exports.geometry = geometry;
module.exports.concernsToMeasures = concernsToMeasures;
module.exports.summarizeEquipment = summarizeEquipment;
module.exports.MEASURE_CATALOG = MEASURE_CATALOG;
module.exports.catalogFor = catalogFor;
module.exports.applyIncentive = applyIncentive;
module.exports.prioritize = prioritize;
module.exports.analyzeFuel = analyzeFuel;
module.exports.analyze = analyze;
module.exports.CONSTANTS = { THERM_BTU, KWH_BTU, THERM_KWH };
