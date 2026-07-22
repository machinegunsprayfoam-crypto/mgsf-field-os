// BPI / blower-door math — the numbers behind diagnostics-led selling and code compliance.
// Pure physics, no keys, no npm. Turns a blower-door reading into ACH50, the ASHRAE 62.2
// ventilation target, and the "your house leaks like a ___ hole" sales visual the owner uses.
//
// POST any of:
//   { floorArea, ceilingHeight }              -> volume
//   { cfm50 }  OR  { ach50 }  (+ volume)      -> converts between them
//   { bedrooms }                              -> ASHRAE 62.2 ventilation target
//   { nFactor }                               -> natural-ACH divisor (LBL; ~18 for MT/ND/SD/WY Zone 6/7)
// GET -> the shape + notes.
//
// Nothing here is a code ruling — R-value/ventilation code numbers live in the Codes & Permits
// and BPI expert docs. This is the arithmetic; verify against the AHJ and the printed protocol.

function num(v, d) { const n = parseFloat(v); return Number.isFinite(n) ? n : d; }

// Effective leakage "hole" at 50 Pa via the sharp-edged orifice equation:
//   Q = Cd · A · sqrt(2·ΔP/ρ),  air ρ≈1.2 kg/m³, ΔP=50 Pa, Cd≈0.6
// -> ~7.5 CFM50 per square inch of open hole. Sales-grade approximation, not a metered EqLA.
const CFM50_PER_IN2 = 7.5;

function calc(body) {
  const floorArea = Math.max(0, num(body.floorArea, 0));            // ft²
  const ceilingHeight = Math.max(0, num(body.ceilingHeight, 8));    // ft
  let volume = Math.max(0, num(body.volume, floorArea * ceilingHeight)); // ft³
  const bedrooms = Math.max(0, Math.round(num(body.bedrooms, 0)));
  const nFactor = Math.min(30, Math.max(10, num(body.nFactor, 18)));// LBL N-factor, cold-climate default

  let cfm50 = num(body.cfm50, null);
  let ach50 = num(body.ach50, null);

  // Convert between CFM50 and ACH50 when we have volume.
  if (cfm50 == null && ach50 != null && volume > 0) cfm50 = (ach50 * volume) / 60;
  if (ach50 == null && cfm50 != null && volume > 0) ach50 = (cfm50 * 60) / volume;

  const out = { ok: true, label: "ESTIMATE", inputs: { floorArea, ceilingHeight, bedrooms, nFactor } };
  if (volume > 0) out.volume = Math.round(volume);

  if (cfm50 != null) out.cfm50 = Math.round(cfm50);
  if (ach50 != null) out.ach50 = Math.round(ach50 * 100) / 100;

  // Natural (annual-average) ACH ≈ ACH50 / N-factor  (LBL simplified model).
  if (ach50 != null) {
    out.naturalACH = Math.round((ach50 / nFactor) * 1000) / 1000;
    // A quick tightness read against common BPI/code marks.
    out.tightness =
      ach50 <= 3 ? "Very tight — verify mechanical ventilation (62.2) is present" :
      ach50 <= 5 ? "Tight (near new-construction target)" :
      ach50 <= 7 ? "Moderate — good air-sealing candidate" :
      ach50 <= 10 ? "Leaky — strong air-sealing ROI" : "Very leaky — big air-sealing win";
  }

  // ASHRAE 62.2-2019 whole-house target airflow: Qtot = 0.03·floorArea + 7.5·(bedrooms+1)  [CFM]
  if (floorArea > 0) {
    const qtot = 0.03 * floorArea + 7.5 * (bedrooms + 1);
    out.vent62_2_cfm = Math.round(qtot);
    out.vent62_2_note = "ASHRAE 62.2-2019 total target (before any infiltration credit). Tighter homes need mechanical ventilation to hit it.";
  }

  // Diagnostics-led sales visual: total leakage as ONE hole.
  if (cfm50 != null && cfm50 > 0) {
    const holeIn2 = cfm50 / CFM50_PER_IN2;
    out.equivalentHole = {
      squareInches: Math.round(holeIn2),
      squareFeet: Math.round((holeIn2 / 144) * 100) / 100,
      plainEnglish: `At 50 Pa this house leaks like a ${Math.round(holeIn2)} in² hole in the wall` +
        (holeIn2 >= 144 ? ` — about ${(holeIn2 / 144).toFixed(1)} sq ft, a wide-open window.` : "."),
      assumption: "Sharp-edged orifice, Cd≈0.6, 50 Pa (~7.5 CFM50/in²). Sales visual, not a metered EqLA.",
    };
  }

  out.doc = "Full protocol: BPI Expert V3 (Drive) — combustion safety, 62.2 sizing, duct testing.";
  return out;
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({ ok: true, configured: true,
      shape: { floorArea: 0, ceilingHeight: 8, volume: 0, cfm50: 0, ach50: 0, bedrooms: 0, nFactor: 18 },
      notes: "Provide cfm50 OR ach50 (+ floorArea/ceilingHeight for volume). Returns ACH50, natural ACH, 62.2 target, and the equivalent-hole sales visual." });
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
