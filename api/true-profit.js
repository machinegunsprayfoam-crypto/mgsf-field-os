// True fully-loaded job profit — "did this job ACTUALLY make money, after everything?" Job-cost gives
// material + labor + drive + overhead; this adds the costs that quietly eat margin: equipment wear on
// the rig/guns, an allocated slice of insurance, and the OPPORTUNITY COST of the rig being tied up for
// N days (a low-dollar job that ties the rig up all week can beat a bigger one on paper but lose on
// profit-per-day). Headline metric = profit PER DAY and per rig-hour, so the jobs that "destroy the
// week" show themselves.
//
// PURE arithmetic — no keys, no npm, no Date.now. Composes on api/job-cost.js for the base cost. Never
// fabricates: the loaded adders (wear/insurance/opportunity) default to 0 and are INCLUDED only when
// you supply a rate — the output lists exactly which loaded components were counted, so nothing is
// silently invented. Everything overridable; labeled ESTIMATE (internal what-if, not a customer quote).
//
// POST { ...job-cost fields (material,laborHours,laborRate|laborFlat,miles,overheadPct,targetGm,sell),
//        days, rigHours, rigWearPerHr, insurancePerDay, rigDayRate, minDayProfit } -> fully-loaded P&L
// GET  -> defaults + suggested typical ranges (owner tunes to their real numbers).
const jc = require("./job-cost");

function num(v, d) { const n = parseFloat(v); return Number.isFinite(n) ? n : (d === undefined ? null : d); }
function r0(n) { return Math.round(Number(n) || 0); }
function r1(n) { return Math.round((Number(n) || 0) * 10) / 10; }

function trueProfit(body) {
  body = body || {};
  const base = jc.calc(body);                 // material + labor + drive + overhead → totalCost
  const baseCost = base.breakdown.totalCost;

  const days = Math.max(0.5, num(body.days, 1));
  const rigHours = Math.max(0, num(body.rigHours, days * 8));  // default 8 rig-hrs/day
  const wearPerHr = Math.max(0, num(body.rigWearPerHr, 0));    // opt-in — 0 unless owner supplies
  const insPerDay = Math.max(0, num(body.insurancePerDay, 0));
  const rigDayRate = Math.max(0, num(body.rigDayRate, 0));     // opportunity cost of the rig tied up

  const equipmentWear = rigHours * wearPerHr;
  const insurance = insPerDay * days;
  const opportunity = rigDayRate * days;
  const loadedAdders = equipmentWear + insurance + opportunity;
  const fullyLoadedCost = baseCost + loadedAdders;

  // Which loaded components were actually counted (transparency — nothing invented).
  const included = [];
  if (wearPerHr > 0) included.push("equipment wear");
  if (insPerDay > 0) included.push("insurance allocation");
  if (rigDayRate > 0) included.push("rig opportunity cost");
  const skipped = [];
  if (wearPerHr <= 0) skipped.push("equipment wear");
  if (insPerDay <= 0) skipped.push("insurance allocation");
  if (rigDayRate <= 0) skipped.push("rig opportunity cost");

  const out = {
    ok: true, label: "ESTIMATE (fully-loaded, internal)",
    days, rigHours,
    breakdown: {
      base: base.breakdown,                    // material/labor/drive/directCost/overhead/totalCost
      equipmentWear: r0(equipmentWear),
      insurance: r0(insurance),
      opportunity: r0(opportunity),
      loadedAdders: r0(loadedAdders),
      fullyLoadedCost: r0(fullyLoadedCost),
    },
    loaded: { included, skipped },
    targetGm: base.targetGm,
  };

  // If a sell price is supplied, report the true (fully-loaded) profit and the per-day / per-hour reads.
  const sell = num(body.sell, null);
  if (sell != null && sell > 0) {
    const profit = sell - fullyLoadedCost;
    const trueGm = sell > 0 ? profit / sell : 0;
    const profitPerDay = profit / days;
    const profitPerRigHour = rigHours > 0 ? profit / rigHours : null;
    const minDayProfit = num(body.minDayProfit, null);
    out.atSell = {
      sell: r0(sell),
      fullyLoadedProfit: r0(profit),
      trueGmPct: r1(trueGm * 100),
      profitPerDay: r0(profitPerDay),
      profitPerRigHour: profitPerRigHour != null ? r0(profitPerRigHour) : null,
      // How much the loaded adders shaved off the headline (material+labor+drive+overhead) margin.
      vsBaseProfit: r0((sell - baseCost) - profit),
    };
    const flags = [];
    if (base.targetGm != null && trueGm < base.targetGm) flags.push(`True margin ${out.atSell.trueGmPct}% is under the ${Math.round(base.targetGm * 100)}% target once fully loaded.`);
    if (minDayProfit != null && profitPerDay < minDayProfit) flags.push(`Profit/day $${out.atSell.profitPerDay} is below your $${r0(minDayProfit)}/day floor — this job ties the rig up for thin money.`);
    if (profit < 0) flags.push("Fully-loaded LOSS — walk away or reprice.");
    if (skipped.length) flags.push(`Not counted (add rates for a truer number): ${skipped.join(", ")}.`);
    out.atSell.flags = flags;
    out.atSell.verdict = profit < 0 ? "NO-GO" : (base.targetGm != null && trueGm >= base.targetGm) ? "GO" : "THIN";
  }
  return out;
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({ ok: true, configured: true,
      defaults: { rigHoursPerDay: 8, rigWearPerHr: 0, insurancePerDay: 0, rigDayRate: 0 },
      suggested: { rigWearPerHr: "10–20 $/hr (rig+gun wear/rebuilds/hours)", insurancePerDay: "15–40 $/day (GL+auto+WC slice)", rigDayRate: "opportunity cost of the rig for a day you could be on another job" },
      note: "POST job-cost fields + { days, rigHours, rigWearPerHr, insurancePerDay, rigDayRate, sell, minDayProfit }. Adds equipment wear + insurance + rig opportunity cost on top of job-cost; headline is profit PER DAY. Loaded adders default 0 (opt-in) and the output lists what was/ wasn't counted — nothing invented. Internal what-if, not a customer quote." });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  try { res.status(200).json(trueProfit(body)); }
  catch (e) { res.status(200).json({ ok: false, error: String(e).slice(0, 140) }); }
};

module.exports.trueProfit = trueProfit;
