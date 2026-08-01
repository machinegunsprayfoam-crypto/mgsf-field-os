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

function analyze(body) {
  const b = body || {};
  const out = { ok: true, basis: "ESTIMATE", units: "energy only (kWh / therms) — no dollars; apply the customer's rate for $" };
  if (b.electric && Array.isArray(b.electric.reads)) out.electric = analyzeFuel(b.electric, b);
  if (b.gas && Array.isArray(b.gas.reads)) out.gas = analyzeFuel(b.gas, b);
  const kwh = out.electric ? out.electric.annualUsage : 0;
  const therms = out.gas ? out.gas.annualUsage : 0;
  if (kwh || therms) out.siteEnergyMMBtu = siteEnergyMMBtu(kwh, therms);
  if (!out.electric && !out.gas) return { ok: false, error: "no_bills", note: "POST electric.reads and/or gas.reads" };
  return out;
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({ ok: true, service: "energy-audit", pure: true, guarantees: false,
      note: "POST { electric:{start,reads:[{end,usage}]}, gas:{...}, hdd?, typicalHdd?, reductionPct? }. " +
        "Returns annualized use, base-load vs seasonal split, optional weather-normalization + savings ESTIMATE. Energy units only — no dollars, no guarantees." });
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
module.exports.analyzeFuel = analyzeFuel;
module.exports.analyze = analyze;
module.exports.CONSTANTS = { THERM_BTU, KWH_BTU, THERM_KWH };
