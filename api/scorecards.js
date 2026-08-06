// Crew & rig scorecards — turns logged actuals into coaching signal. Given a set of jobs (each with a
// bid + logged actual), it ranks each crew and each rig on real yield (BF/set), productivity (BF/hr),
// margin adherence (actual-vs-bid pts), and foam overrun, splits the picture winter vs summer (MT cold
// territory), and surfaces the patterns you'd otherwise only feel — "who's consistently under yield,"
// "winter attics run over." Composes api/yield-variance.js per job; never fabricates a metric a job
// didn't carry (missing → skipped, not zeroed).
//
// PURE + deterministic. POST { records:[{crew,rig,date,bid:{…},actual:{…}}], winterMonths? } -> scorecards.
// GET -> shape.
const yv = require("./yield-variance");

function r1(n) { return Math.round((Number(n) || 0) * 10) / 10; }
function mean(arr) { const v = arr.filter((x) => x != null && Number.isFinite(x)); return v.length ? r1(v.reduce((s, x) => s + x, 0) / v.length) : null; }
const WINTER_DEFAULT = [11, 12, 1, 2, 3]; // Nov–Mar
function monthOf(dateStr) { const m = String(dateStr || "").match(/^(\d{4})-(\d{2})/); return m ? parseInt(m[2], 10) : null; }

function metricsOf(rec) {
  const v = yv.variance({ bid: rec.bid || {}, actual: rec.actual || {} });
  return {
    yield: v.efficiency.realYield,
    productivity: v.efficiency.realProductivity,
    marginDelta: v.margin.deltaPts,
    foamOverrunPct: v.variances.boardFeet.pct,
  };
}

function aggregate(records) {
  const m = records.map(metricsOf);
  const withMargin = m.filter((x) => x.marginDelta != null);
  const onBid = withMargin.filter((x) => x.marginDelta >= -1).length;
  return {
    jobs: records.length,
    avgYield: mean(m.map((x) => x.yield)),
    avgProductivity: mean(m.map((x) => x.productivity)),
    avgMarginDeltaPts: mean(m.map((x) => x.marginDelta)),
    avgFoamOverrunPct: mean(m.map((x) => x.foamOverrunPct)),
    onBidRatePct: withMargin.length ? r1((onBid / withMargin.length) * 100) : null,
  };
}

function groupBy(records, key) {
  const g = {};
  records.forEach((r) => { const k = String(r[key] || "").trim() || "(unassigned)"; (g[k] = g[k] || []).push(r); });
  return g;
}

function scorecards(body) {
  body = body || {};
  const records = Array.isArray(body.records) ? body.records : [];
  const winter = Array.isArray(body.winterMonths) && body.winterMonths.length ? body.winterMonths.map(Number) : WINTER_DEFAULT;

  const rank = (grp) => Object.keys(grp).map((name) => Object.assign({ name }, aggregate(grp[name])))
    // best margin adherence first; tie-break on yield
    .sort((a, b) => ((b.avgMarginDeltaPts == null ? -999 : b.avgMarginDeltaPts) - (a.avgMarginDeltaPts == null ? -999 : a.avgMarginDeltaPts)) || ((b.avgYield || 0) - (a.avgYield || 0)));

  const crews = rank(groupBy(records, "crew"));
  const rigs = rank(groupBy(records, "rig"));

  const win = records.filter((r) => winter.includes(monthOf(r.date)));
  const sum = records.filter((r) => { const mo = monthOf(r.date); return mo != null && !winter.includes(mo); });
  const bySeason = { winter: aggregate(win), summer: aggregate(sum) };

  // Pattern insights (only when the data supports them).
  const insights = [];
  if (crews.length >= 2) {
    const best = crews[0], worst = crews[crews.length - 1];
    if (best.avgMarginDeltaPts != null && worst.avgMarginDeltaPts != null && best.name !== worst.name)
      insights.push(`${best.name} holds margin best (${best.avgMarginDeltaPts} pts vs bid); ${worst.name} trails (${worst.avgMarginDeltaPts}).`);
  }
  if (bySeason.winter.avgYield != null && bySeason.summer.avgYield != null) {
    const d = r1(bySeason.summer.avgYield - bySeason.winter.avgYield);
    if (Math.abs(d) >= 100) insights.push(`Winter yield runs ${Math.abs(d)} BF/set ${d > 0 ? "below" : "above"} summer — factor it into cold-season bids.`);
  }
  crews.forEach((c) => { if (c.avgFoamOverrunPct != null && c.avgFoamOverrunPct > 8) insights.push(`${c.name} averages ${c.avgFoamOverrunPct}% foam over bid — coaching or waste-factor review.`); });

  return { ok: true, label: "SCORECARDS", jobs: records.length, crews, rigs, bySeason, insights };
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({ ok: true, configured: true,
      note: "POST { records:[{crew,rig,date,bid:{boardFeet,sets,laborHours,material,labor,sell}, actual:{boardFeet,sets,laborHours,material,labor}}], winterMonths? } → per-crew + per-rig yield/productivity/margin rankings, winter-vs-summer split, and pattern insights. Composes yield-variance; never fabricates a missing metric." });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  try { res.status(200).json(scorecards(body)); }
  catch (e) { res.status(200).json({ ok: false, error: String(e).slice(0, 140) }); }
};

module.exports.scorecards = scorecards;
module.exports.aggregate = aggregate;
