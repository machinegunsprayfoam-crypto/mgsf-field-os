// Klyfton HVAC LOAD — heating/cooling load ESTIMATE, equipment tonnage + airflow (CFM), and the
// ASHRAE 62.2 ventilation requirement, for MGSF's cold territory (Climate Zones 6 & 7, MT/ND/SD/WY).
// For GC work: rough-size a system, or sanity-check a sub HVAC contractor's proposal.
//
// NOT A MANUAL J (hard rule): this is a RULE-OF-THUMB ESTIMATE. A proper ACCA Manual J load calc +
// Manual S (equipment) + Manual D (ducts) by a LICENSED HVAC contractor, and the AHJ, govern the real
// design. OVERSIZING short-cycles and hurts comfort/humidity — never upsize off this. No fabricated
// numbers, no pricing. (For POST-RETROFIT right-sizing anchored on installed output, see energy-audit.)
//
// Keyless, deterministic, no npm. POST { action:"load"|"tonnage"|"ventilation", area, tightness?, bedrooms?, coolingBtu? }

function num(v, d) { const n = parseFloat(v); return Number.isFinite(n) ? n : d; }
function clean(s, max) { return String(s == null ? "" : s).trim().slice(0, max || 16); }
function round(n, p) { const f = Math.pow(10, p == null ? 1 : p); return Math.round(num(n, 0) * f) / f; }

// Cold-climate (Zone 6/7) rule-of-thumb load factors, BTU/hr per ft² — RANGES, ESTIMATE only.
const BTU_PER_SF = {
  tight:   { heat: [15, 25], cool: [15, 22] },
  typical: { heat: [25, 35], cool: [20, 28] },
  leaky:   { heat: [35, 45], cool: [25, 35] },
};
const CFM_PER_TON = 400;                     // typical residential airflow
const HVAC_NOTE = "RULE-OF-THUMB ESTIMATE for Climate Zone 6/7 — NOT a Manual J. A licensed HVAC contractor must run ACCA Manual J/S/D and the AHJ permits it. Oversizing short-cycles and hurts comfort/humidity — do not upsize off this.";

function normTight(t) { const k = clean(t, 10).toLowerCase(); return BTU_PER_SF[k] ? k : "typical"; }

function tonnage(coolingBtu) {
  const btu = Math.max(0, num(coolingBtu, 0));
  const tons = round(btu / 12000, 1);
  return { coolingBtu: Math.round(btu), tons, cfm: Math.round(tons * CFM_PER_TON), cfmPerTon: CFM_PER_TON,
    note: "Tons = BTU/hr ÷ 12,000; airflow ≈ tons × " + CFM_PER_TON + " CFM. " + HVAC_NOTE };
}

function loadEstimate(body) {
  const area = Math.max(0, num(body.area, 0));
  if (area <= 0) return { ok: false, error: "need_area", note: "Pass conditioned floor area (ft²)." };
  const tight = normTight(body.tightness);
  const f = BTU_PER_SF[tight];
  const heat = { low: Math.round(area * f.heat[0]), high: Math.round(area * f.heat[1]) };
  const cool = { low: Math.round(area * f.cool[0]), high: Math.round(area * f.cool[1]) };
  const tonsLow = round(cool.low / 12000, 1), tonsHigh = round(cool.high / 12000, 1);
  return {
    ok: true, label: "ESTIMATE — rule of thumb, NOT a Manual J", area, tightness: tight,
    heatingBtu: heat, coolingBtu: cool,
    coolingTons: { low: tonsLow, high: tonsHigh }, airflowCfm: { low: Math.round(tonsLow * CFM_PER_TON), high: Math.round(tonsHigh * CFM_PER_TON) },
    factorsBtuPerSf: { heat: f.heat, cool: f.cool, basis: "cold-climate (Zone 6/7) rule of thumb" },
    note: HVAC_NOTE,
    verify: ["Get a Manual J — envelope, windows, orientation, infiltration, and internal gains move this a lot.", "Right-size to the Manual J load; never round up a ton 'to be safe'."],
  };
}

// ASHRAE 62.2-2019 whole-house ventilation: Qtot = 0.03·area + 7.5·(bedrooms+1)  [CFM].
function ventilation(body) {
  const area = Math.max(0, num(body.area, 0));
  const beds = Math.max(0, Math.round(num(body.bedrooms, 0)));
  if (area <= 0) return { ok: false, error: "need_area", note: "Pass floor area (ft²) and bedrooms." };
  const qtot = round(0.03 * area + 7.5 * (beds + 1));
  return { ok: true, label: "ESTIMATE — ASHRAE 62.2-2019", area, bedrooms: beds, ventilationCfm: qtot,
    note: "Whole-house target airflow (before infiltration credit). Tighter homes need mechanical ventilation to hit it — pairs with the air-sealing work. " + HVAC_NOTE };
}

function analyze(body) {
  body = body || {};
  const action = clean(body.action, 16) || "load";
  if (action === "tonnage") return { ok: true, ...tonnage(body.coolingBtu) };
  if (action === "ventilation") return ventilation(body);
  return loadEstimate(body);
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({ ok: true, service: "hvac-load", pure: true, priced: false, climate: "Zone 6/7 rule of thumb",
      factors: BTU_PER_SF, cfmPerTon: CFM_PER_TON,
      actions: ["load (heating/cooling BTU + tons + CFM)", "tonnage (cooling BTU → tons + CFM)", "ventilation (ASHRAE 62.2)"],
      note: "POST { action, area, tightness?(tight/typical/leaky), bedrooms?, coolingBtu? }. RULE-OF-THUMB ESTIMATE — NOT a Manual J. A licensed HVAC contractor (Manual J/S/D) + the AHJ govern the real design; oversizing short-cycles. No pricing." });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  try { res.status(200).json(analyze(body || {})); }
  catch (e) { res.status(200).json({ ok: false, error: String((e && e.message) || e).slice(0, 140) }); }
};

module.exports.tonnage = tonnage;
module.exports.loadEstimate = loadEstimate;
module.exports.ventilation = ventilation;
module.exports.analyze = analyze;
module.exports.BTU_PER_SF = BTU_PER_SF;
