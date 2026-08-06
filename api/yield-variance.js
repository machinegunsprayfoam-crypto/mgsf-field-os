// Bid→actual variance engine — closes spray foam's biggest profit leak. After a job, the crew logs
// what was ACTUALLY used (board-feet / sets / hours / conditions); this compares it to the original
// bid and shows the truth: real yield (BF per set), real productivity (BF per hour), foam overrun,
// labor overrun, and the ACTUAL gross margin vs the bid margin at the same sell price. Without this
// you're flying blind on yield and labor efficiency — the two things that quietly eat SPF margin.
//
// PURE arithmetic — no keys, no npm, no Date.now, no network. Never fabricates: any figure the crew
// didn't log comes back null (not a guess), and derived numbers appear only when their inputs exist.
// Storage of actuals + the <90-second Field-Mode logging UI are the paired next step; this is the math.
//
// POST { bid:{boardFeet,sets,laborHours,material,labor,cost,sell}, actual:{boardFeet,sets,laborHours,
//        material,labor,costPerSet,costPerBF,laborRate,conditions,notes} } -> variances + verdict
// GET  -> shape.

function num(v, d) { const n = parseFloat(v); return Number.isFinite(n) ? n : (d === undefined ? null : d); }
function r1(n) { return Math.round((Number(n) || 0) * 10) / 10; }
function r2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
// Signed delta + percent-of-bid, only when both sides are known; else nulls (never invents).
function vary(actual, bid) {
  if (actual == null || bid == null) return { actual: actual, bid: bid, delta: null, pct: null };
  const delta = actual - bid;
  const pct = bid !== 0 ? r1((delta / bid) * 100) : null;
  return { actual: r2(actual), bid: r2(bid), delta: r2(delta), pct };
}

// Overrun thresholds (app defaults — overridable). A little over is normal; these flag the real bleed.
const FOAM_FLAG_PCT = 8;   // foam used > bid by this % → flag
const LABOR_FLAG_PCT = 10; // hours over bid by this % → flag

function variance(body) {
  body = body || {};
  const bid = body.bid || {};
  const act = body.actual || {};
  const thr = body.thresholds || {};
  const foamThr = num(thr.foamPct, FOAM_FLAG_PCT);
  const laborThr = num(thr.laborPct, LABOR_FLAG_PCT);

  // ---- pull the two sides (log-only; nothing assumed) ----
  const bidBF = num(bid.boardFeet != null ? bid.boardFeet : bid.bf);
  const bidSets = num(bid.sets);
  const bidHours = num(bid.laborHours != null ? bid.laborHours : bid.hours);
  const bidMaterial = num(bid.material);
  const bidLabor = num(bid.labor);
  const bidCost = num(bid.cost != null ? bid.cost : (bidMaterial != null && bidLabor != null ? bidMaterial + bidLabor : undefined));
  const sell = num(bid.sell != null ? bid.sell : bid.price);

  let actBF = num(act.boardFeet != null ? act.boardFeet : act.bf);
  const actSets = num(act.sets != null ? act.sets : act.setsUsed);
  const actHours = num(act.laborHours != null ? act.laborHours : act.hours);
  const costPerSet = num(act.costPerSet);
  const costPerBF = num(act.costPerBF);
  const laborRate = num(act.laborRate);
  // If actual BF wasn't logged but sets + a known BF/set were, derive it (mark derived).
  let actBFDerived = false;
  if (actBF == null && actSets != null && num(act.bfPerSet) != null) { actBF = actSets * num(act.bfPerSet); actBFDerived = true; }

  // ---- actual costs (only from logged/derivable inputs) ----
  let actMaterial = num(act.material);
  if (actMaterial == null && actSets != null && costPerSet != null) actMaterial = actSets * costPerSet;
  else if (actMaterial == null && actBF != null && costPerBF != null) actMaterial = actBF * costPerBF;
  let actLabor = num(act.labor);
  if (actLabor == null && actHours != null && laborRate != null) actLabor = actHours * laborRate;
  const actCost = (actMaterial != null && actLabor != null) ? actMaterial + actLabor : null;

  // ---- efficiency truths (the profit-leak metrics) ----
  const realYield = (actBF != null && actSets) ? r1(actBF / actSets) : null;   // real BF per set
  const bidYield = (bidBF != null && bidSets) ? r1(bidBF / bidSets) : null;
  const realProductivity = (actBF != null && actHours) ? r1(actBF / actHours) : null; // real BF/hr
  const bidProductivity = (bidBF != null && bidHours) ? r1(bidBF / bidHours) : null;

  // ---- margins at the SAME sell price ----
  const marginBidPct = (sell && bidCost != null && sell > 0) ? r1(((sell - bidCost) / sell) * 100) : null;
  const marginActualPct = (sell && actCost != null && sell > 0) ? r1(((sell - actCost) / sell) * 100) : null;
  const marginDeltaPts = (marginBidPct != null && marginActualPct != null) ? r1(marginActualPct - marginBidPct) : null;

  const variances = {
    boardFeet: vary(actBF, bidBF),
    sets: vary(actSets, bidSets),
    laborHours: vary(actHours, bidHours),
    material: vary(actMaterial, bidMaterial),
    labor: vary(actLabor, bidLabor),
    cost: vary(actCost, bidCost),
  };

  // ---- flags + plain-English verdict ----
  const flags = [];
  if (variances.boardFeet.pct != null && variances.boardFeet.pct > foamThr) flags.push(`Foam used ${variances.boardFeet.pct}% over bid — yield/waste ran high.`);
  if (variances.sets.delta != null && variances.sets.delta > 0) flags.push(`${variances.sets.delta} set(s) over the bid.`);
  if (variances.laborHours.pct != null && variances.laborHours.pct > laborThr) flags.push(`Labor ${variances.laborHours.pct}% over bid hours — productivity ran low.`);
  if (marginDeltaPts != null && marginDeltaPts < 0) flags.push(`Actual margin ${marginActualPct}% is ${Math.abs(marginDeltaPts)} pts under the bid margin ${marginBidPct}%.`);
  if (realYield != null && bidYield != null && realYield < bidYield) flags.push(`Real yield ${realYield} BF/set vs ${bidYield} bid — set count assumption was optimistic.`);

  let verdict;
  if (marginDeltaPts == null && variances.cost.delta == null) verdict = "Log actual sets + hours (and the sell price) to see true margin variance.";
  else if ((marginDeltaPts != null && marginDeltaPts >= -1) && flags.length === 0) verdict = "On-bid — foam and labor tracked the estimate.";
  else {
    const driver = (variances.material.delta || 0) >= (variances.labor.delta || 0) ? "foam/material" : "labor";
    verdict = `Came in ${marginDeltaPts != null ? (marginDeltaPts < 0 ? "under" : "over") + " bid margin by " + Math.abs(marginDeltaPts) + " pts" : "off bid"} — biggest driver: ${driver}.`;
  }

  return {
    ok: true, label: "ACTUALS",
    variances,
    efficiency: { realYield, bidYield, realProductivity, bidProductivity, actualBFDerived: actBFDerived },
    margin: { bidPct: marginBidPct, actualPct: marginActualPct, deltaPts: marginDeltaPts, sell: sell != null ? r2(sell) : null },
    actualCost: actCost != null ? r2(actCost) : null,
    bidCost: bidCost != null ? r2(bidCost) : null,
    conditions: act.conditions ? String(act.conditions).slice(0, 200) : null,
    notes: act.notes ? String(act.notes).slice(0, 500) : null,
    flags, verdict,
  };
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({ ok: true, configured: true,
      defaults: { foamFlagPct: FOAM_FLAG_PCT, laborFlagPct: LABOR_FLAG_PCT },
      note: "POST { bid:{boardFeet,sets,laborHours,material,labor,cost,sell}, actual:{boardFeet,sets,laborHours,material,labor,costPerSet,laborRate,conditions,notes} } → true yield/labor/margin variance vs the bid. Never fabricates a number the crew didn't log." });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  try { res.status(200).json(variance(body)); }
  catch (e) { res.status(200).json({ ok: false, error: String(e).slice(0, 140) }); }
};

module.exports.variance = variance;
