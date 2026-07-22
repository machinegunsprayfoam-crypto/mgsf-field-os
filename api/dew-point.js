// Dew-point / substrate spray-safety — the #1 SPF condensation check. Foam sprayed on a substrate
// at or below dew point traps moisture and fails. Rule of thumb (and most foam TDS): substrate must
// be at least 5°F ABOVE the dew point. This computes dew point from air temp + RH (Magnus formula)
// and flags GO/CAUTION/NO-GO against the substrate temp. Pure math, no keys, no npm.
//
// POST { airTempF, humidityPct, substrateTempF }  ->  { dewPointF, spread, flag }
// GET  -> shape + the rule.

function num(v, d) { const n = parseFloat(v); return Number.isFinite(n) ? n : d; }
const MARGIN_F = 5;   // required substrate margin above dew point

// Magnus-Tetens dew point. T in °C, RH in %. a=17.62, b=243.12°C.
function dewPointC(tC, rh) {
  const a = 17.62, b = 243.12;
  const g = Math.log(Math.max(1, Math.min(100, rh)) / 100) + (a * tC) / (b + tC);
  return (b * g) / (a - g);
}
const f2c = (f) => (f - 32) * 5 / 9;
const c2f = (c) => c * 9 / 5 + 32;

function calc(body) {
  const airF = num(body.airTempF, null);
  const rh = num(body.humidityPct, null);
  if (airF == null || rh == null) return { ok: false, error: "need_airTempF_and_humidityPct" };
  const dpF = c2f(dewPointC(f2c(airF), rh));
  const substrateF = num(body.substrateTempF, airF);   // assume substrate ≈ air if not measured
  const spread = substrateF - dpF;

  let flag, advice;
  if (spread < 0) { flag = "NO-GO"; advice = "Substrate is at/below dew point — condensation forming. Do NOT spray."; }
  else if (spread < MARGIN_F) { flag = "CAUTION"; advice = `Only ${spread.toFixed(1)}°F above dew point — under the ${MARGIN_F}°F margin. Warm the substrate or wait.`; }
  else { flag = "GO"; advice = `Substrate ${spread.toFixed(1)}°F above dew point — clear to spray (still verify against the foam TDS).`; }

  return {
    ok: true, label: "ESTIMATE",
    airTempF: Math.round(airF * 10) / 10, humidityPct: Math.round(rh),
    dewPointF: Math.round(dpF * 10) / 10,
    substrateTempF: Math.round(substrateF * 10) / 10,
    marginF: MARGIN_F, spreadF: Math.round(spread * 10) / 10,
    flag, advice,
    note: "Substrate must be ≥5°F above dew point (TDS varies — always check the printed foam data sheet).",
  };
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({ ok: true, configured: true, shape: { airTempF: 0, humidityPct: 0, substrateTempF: 0 },
      rule: "Substrate ≥5°F above dew point to spray. Dew point from air temp + RH (Magnus formula)." });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  try { res.status(200).json(calc(body)); }
  catch (e) { res.status(200).json({ ok: false, error: String(e).slice(0, 140) }); }
};

module.exports.calc = calc;
