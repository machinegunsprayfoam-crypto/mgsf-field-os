// "Should We Take It?" job-risk score — a pre-accept gut-check in numbers. Before you schedule a job,
// score it on the things that actually blow up an SPF week: drive distance, the spray-weather window,
// access difficulty, substrate uncertainty, thin margin (from the fully-loaded profit engine), past
// yield variance on similar work, and current crew load. Out comes one score (0 = safe, 100 = danger)
// and a verdict: TAKE / RAISE PRICE / WALK — with the reasons ranked so you see the top driver.
//
// PURE + deterministic — no keys, no npm, no Date.now. Composes the numbers the other engines already
// produce (true-profit's trueGm/profitPerDay, geo miles, dew-point GO/NO-GO, yield-variance history).
// Never fabricates: only the factors you supply are scored, the denominator is the assessed factors
// only, and the output lists which factors were NOT assessed. Weights are overridable app defaults.

function num(v, d) { const n = parseFloat(v); return Number.isFinite(n) ? n : (d === undefined ? null : d); }
function r1(n) { return Math.round((Number(n) || 0) * 10) / 10; }
function clamp01(x) { return Math.max(0, Math.min(1, x)); }

// Max risk points per factor (weight). Weather + margin carry the most — they kill jobs fastest.
const W = { distance: 20, weather: 25, access: 15, substrate: 15, margin: 25, pastVariance: 15, crewLoad: 10 };
const ACCESS_W = { lift: 0.3, confined: 0.4, occupied: 0.3, winter: 0.4, height: 0.3, tight: 0.3, roof: 0.3, remote: 0.3 };
const WEATHER_SEV = { go: 0, caution: 0.5, nogo: 1 };
const SUBSTRATE_SEV = { known: 0, some: 0.5, unknown: 1 };
const CREW_SEV = { light: 0, normal: 0.3, heavy: 1 };

function score(body) {
  body = body || {};
  const W2 = Object.assign({}, W, body.weights || {});
  const contrib = []; // {factor, points, max, sev, why}
  const add = (factor, sev, why) => { const max = W2[factor] || 0; const points = r1(clamp01(sev) * max); contrib.push({ factor, points, max, sev: r1(clamp01(sev)), why }); };

  // Distance — farther = more fuel/time/wear/risk. Linear to ~150 mi (geo.js owns the $).
  const miles = num(body.miles);
  if (miles != null) add("distance", miles / 150, `${Math.round(miles)} mi from base`);

  // Spray-weather window — label ('go'/'caution'/'nogo') or sprayDaysAvailable vs sprayDaysNeeded.
  const w = body.weather != null ? String(body.weather).toLowerCase() : null;
  if (w != null && WEATHER_SEV[w] != null) add("weather", WEATHER_SEV[w], `spray window: ${w.toUpperCase()}`);
  else {
    const need = num(body.sprayDaysNeeded), have = num(body.sprayDaysAvailable);
    if (need != null && have != null && need > 0) add("weather", (need - have) / need, `${have}/${need} sprayable days in window`);
  }

  // Access difficulty — tags stack (capped).
  if (Array.isArray(body.access) && body.access.length) {
    let a = 0; const hit = [];
    body.access.forEach((t) => { const k = String(t).toLowerCase(); if (ACCESS_W[k]) { a += ACCESS_W[k]; hit.push(k); } });
    add("access", clamp01(a), `access: ${hit.join(", ") || "none scored"}`);
  }

  // Substrate uncertainty — unknown substrate = unknown yield.
  const s = body.substrate != null ? String(body.substrate).toLowerCase() : null;
  if (s != null && SUBSTRATE_SEV[s] != null) add("substrate", SUBSTRATE_SEV[s], `substrate: ${s}`);

  // Margin thinness — from fully-loaded true GM vs target, and/or profit-per-day vs floor. Worst wins.
  const trueGm = num(body.trueGmPct), tgt = num(body.targetGmPct);
  const ppd = num(body.profitPerDay), floor = num(body.minDayProfit);
  let mSev = null, mWhy = "";
  if (trueGm != null && tgt != null) { const sev = trueGm >= tgt ? 0 : clamp01((tgt - trueGm) / (tgt * 0.5)); mSev = sev; mWhy = `true GM ${trueGm}% vs ${tgt}% target`; }
  if (ppd != null && floor != null && floor > 0) { const sev = ppd >= floor ? 0 : clamp01((floor - ppd) / floor); if (mSev == null || sev > mSev) { mSev = sev; mWhy = `profit/day $${Math.round(ppd)} vs $${Math.round(floor)} floor`; } }
  if (mSev != null) add("margin", mSev, mWhy);

  // Past performance — average yield/BF overrun % on similar work (from yield-variance history).
  const over = num(body.pastOverrunPct);
  if (over != null) add("pastVariance", over / 25, `~${r1(over)}% avg overrun on similar jobs`); // 25%+ = max

  // Crew load / fatigue — a stacked schedule turns an ok job into a bad week.
  const c = body.crewLoad != null ? String(body.crewLoad).toLowerCase() : null;
  if (c != null && CREW_SEV[c] != null) add("crewLoad", CREW_SEV[c], `crew load: ${c}`);

  const sumPoints = contrib.reduce((s, x) => s + x.points, 0);
  const sumMax = contrib.reduce((s, x) => s + x.max, 0);
  const riskScore = sumMax > 0 ? Math.round((sumPoints / sumMax) * 100) : null;

  const th = body.thresholds || {};
  const takeMax = num(th.take, 30), raiseMax = num(th.raise, 60);
  let verdict = "UNSCORED";
  if (riskScore != null) verdict = riskScore <= takeMax ? "TAKE" : riskScore <= raiseMax ? "RAISE PRICE" : "WALK";

  const ranked = contrib.slice().sort((a, b) => b.points - a.points);
  const assessed = contrib.map((x) => x.factor);
  const notAssessed = Object.keys(W2).filter((f) => !assessed.includes(f));

  return {
    ok: true, label: "ESTIMATE (pre-accept risk)",
    riskScore, verdict,
    topDriver: ranked.length ? ranked[0].factor : null,
    reasons: ranked.map((x) => `${x.factor}: +${x.points} pts (${x.why})`),
    contributions: contrib,
    assessed, notAssessed,
    note: notAssessed.length ? `Scored on ${assessed.length} factor(s); not assessed: ${notAssessed.join(", ")}. Add them for a truer score.` : "All factors assessed.",
  };
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({ ok: true, configured: true, weights: W,
      note: "POST { miles, weather:go|caution|nogo (or sprayDaysNeeded/Available), access:[lift,confined,occupied,winter,...], substrate:known|some|unknown, trueGmPct+targetGmPct and/or profitPerDay+minDayProfit, pastOverrunPct, crewLoad:light|normal|heavy }. Returns a 0-100 risk score + TAKE/RAISE PRICE/WALK. Only supplied factors are scored; nothing invented." });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  try { res.status(200).json(score(body)); }
  catch (e) { res.status(200).json({ ok: false, error: String(e).slice(0, 140) }); }
};

module.exports.score = score;
