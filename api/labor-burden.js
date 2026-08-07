// Labor burden — turn a base hourly WAGE into the fully-LOADED hourly cost (what an hour of that
// worker actually costs MGSF once you add payroll taxes, workers' comp, and benefits). This is the
// number that belongs in job-cost's `laborRate`: costing a job on the bare wage understates it and
// quietly eats margin. Pure math, keyless, no npm, deterministic.
//
// HONESTY: the ONLY rate baked in is the employer FICA share (7.65% = 6.2% Social Security + 1.45%
// Medicare) — that's federal law, not a guess. Everything volatile and business-specific — workers'
// comp (state + class-code + your experience mod; for spray foam/roofing it's a BIG number),
// FUTA/SUTA, and benefits — is OWNER-ENTERED. We never invent a comp rate; if you leave it 0 the
// result is flagged as understated. Not tax/payroll advice — confirm exact figures with your provider.
//
// POST { baseWage, hours?, compPct?, futaSutaPct?, benefitsPct?, benefitsPerHour?, otherPct? }
// GET  -> shape + which inputs are owner-supplied.

const EMPLOYER_FICA = 0.0765;   // 6.2% SS + 1.45% Medicare (employer share) — statutory, not estimated
function num(v, d) { const n = parseFloat(v); return Number.isFinite(n) ? n : d; }
function money(n) { return Math.round(n * 100) / 100; }
function pct(v) { return Math.max(0, num(v, 0)) / 100; }

function calc(body) {
  body = body || {};
  const baseWage = Math.max(0, num(body.baseWage, 0));
  if (!baseWage) return { ok: false, error: "need_baseWage", note: "Enter the worker's base hourly wage." };
  const hours = Math.max(0, num(body.hours, 1));

  const comp = pct(body.compPct);             // workers' comp — OWNER INPUT (state/class/mod-specific)
  const futaSuta = pct(body.futaSutaPct);     // federal + state unemployment — OWNER INPUT
  const benefitsPct = pct(body.benefitsPct);  // benefits as % of wage — OWNER INPUT
  const otherPct = pct(body.otherPct);        // any other %-of-wage burden — OWNER INPUT
  const benefitsPerHour = Math.max(0, num(body.benefitsPerHour, 0)); // flat $/hr benefit — OWNER INPUT

  // Percent burdens apply to the base wage; the flat benefit is added on top.
  const pctBurden = EMPLOYER_FICA + comp + futaSuta + benefitsPct + otherPct;
  const loadedHourly = money(baseWage * (1 + pctBurden) + benefitsPerHour);
  const burdenDollars = money(loadedHourly - baseWage);
  const burdenPct = Math.round((burdenDollars / baseWage) * 1000) / 10;
  const loadedCost = money(loadedHourly * hours);

  const line = (rate) => money(baseWage * rate);
  const breakdown = {
    baseWage: money(baseWage),
    employerFICA: line(EMPLOYER_FICA),
    workersComp: line(comp),
    futaSuta: line(futaSuta),
    benefitsPct: line(benefitsPct),
    benefitsPerHour: money(benefitsPerHour),
    other: line(otherPct),
  };

  // Flag the big owner-input gaps so a bare-wage-plus-FICA number is never mistaken for the real cost.
  const missing = [];
  if (comp === 0) missing.push("workers'-comp %");
  if (benefitsPct === 0 && benefitsPerHour === 0) missing.push("benefits");
  const flags = missing.length
    ? ["UNDERSTATED — add " + missing.join(" + ") + " (from your broker/payroll provider) for a true loaded cost."]
    : [];

  return {
    ok: true, currency: "USD",
    baseWage: money(baseWage), hours,
    loadedHourly, loadedCost, burdenDollars, burdenPct,
    breakdown, flags,
    feeds: "Use loadedHourly as job-cost's laborRate for a true job cost.",
    note: "Only the 7.65% employer FICA is statutory; workers' comp, FUTA/SUTA, and benefits are your figures — nothing invented. Not tax/payroll advice.",
  };
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({ ok: true, configured: true,
      shape: { baseWage: 0, hours: 1, compPct: "(owner)", futaSutaPct: "(owner)", benefitsPct: "(owner)", benefitsPerHour: "(owner)", otherPct: "(owner)" },
      baked: { employerFICA: EMPLOYER_FICA },
      note: "Turns base wage → fully-loaded hourly cost. Only employer FICA (7.65%) is baked in; every other burden is owner-entered (workers' comp is state/class-specific). Feeds job-cost laborRate." });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  try { res.status(200).json(calc(body || {})); }
  catch (e) { res.status(200).json({ ok: false, error: String(e).slice(0, 140) }); }
};

module.exports.calc = calc;
module.exports.EMPLOYER_FICA = EMPLOYER_FICA;
