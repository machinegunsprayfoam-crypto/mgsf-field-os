// Klyfton ELECTRICAL LOAD — dwelling service-load calc by the NEC Article 220 STANDARD method, plus
// conductor ampacity (NEC 310.16), breaker sizing (240.4), and voltage drop. For MGSF's move into GC
// work: size a service, or sanity-check a sub electrician's proposal.
//
// LIFE-SAFETY / NOT A DESIGN (hard rule): this is an ESTIMATE + planning aid. A LICENSED ELECTRICIAN
// and the AHJ must design, stamp, and permit the actual installation. NEC values are the published
// 2023 baseline — verify the AHJ's adopted edition. Never fabricated. No pricing.
//
// Keyless, deterministic, no npm.
// POST { action:"service"|"ampacity"|"vdrop", ... }
//   service: { area, smallAppliance?, laundry?, applianceVA?, applianceCount?, rangeVA?, dryerVA?, acVA?, heatVA?, volts? }
//   ampacity:{ awg }        vdrop:{ awg, amps, lengthFt, volts?, phase? }

function num(v, d) { const n = parseFloat(v); return Number.isFinite(n) ? n : d; }
function clean(s, max) { return String(s == null ? "" : s).trim().slice(0, max || 24); }
function round(n, p) { const f = Math.pow(10, p == null ? 1 : p); return Math.round(num(n, 0) * f) / f; }

// NEC 310.16 — copper ampacity by AWG (60/75/90 °C columns) + resistance (Ω/1000 ft, 75°C) for Vd.
// Common dwelling sizes. 240.4(D) small-conductor breaker caps: 14→15, 12→20, 10→30.
const WIRE = {
  "14": { a60: 15, a75: 20, a90: 25, ohmPer1000: 3.14, maxBreaker: 15 },
  "12": { a60: 20, a75: 25, a90: 30, ohmPer1000: 1.98, maxBreaker: 20 },
  "10": { a60: 30, a75: 35, a90: 40, ohmPer1000: 1.24, maxBreaker: 30 },
  "8":  { a60: 40, a75: 50, a90: 55, ohmPer1000: 0.778 },
  "6":  { a60: 55, a75: 65, a90: 75, ohmPer1000: 0.491 },
  "4":  { a60: 70, a75: 85, a90: 95, ohmPer1000: 0.308 },
  "3":  { a60: 85, a75: 100, a90: 110, ohmPer1000: 0.245 },
  "2":  { a60: 95, a75: 115, a90: 130, ohmPer1000: 0.194 },
  "1":  { a60: 110, a75: 130, a90: 150, ohmPer1000: 0.154 },
  "1/0": { a60: 125, a75: 150, a90: 170, ohmPer1000: 0.122 },
  "2/0": { a60: 145, a75: 175, a90: 195, ohmPer1000: 0.0967 },
  "3/0": { a60: 165, a75: 200, a90: 225, ohmPer1000: 0.0766 },
  "4/0": { a60: 195, a75: 230, a90: 260, ohmPer1000: 0.0608 },
};
const STD_SERVICE = [100, 125, 150, 200, 225, 320, 400]; // common dwelling service ampacities
const NEC_NOTE = "NEC 2023 baseline — verify the AHJ's adopted edition. ESTIMATE + planning aid; a licensed electrician + the AHJ must design, stamp, and permit. Not a permitted design.";

// NEC Table 220.42 general-load demand: first 3000 VA @ 100%, next 3001–120,000 @ 35%, remainder @ 25%.
function generalDemand(va) {
  let d = 0; const t1 = Math.min(va, 3000); d += t1;
  const t2 = Math.min(Math.max(va - 3000, 0), 117000); d += t2 * 0.35;
  const t3 = Math.max(va - 120000, 0); d += t3 * 0.25;
  return round(d);
}

// NEC Article 220 STANDARD dwelling service-load calculation.
function service(body) {
  const area = Math.max(0, num(body.area, 0));
  const volts = num(body.volts, 240);
  if (area <= 0) return { ok: false, error: "need_area", note: "Pass conditioned floor area (ft²) for the 3 VA/ft² general lighting load." };
  const lighting = area * 3;                                   // 220.12: 3 VA/ft²
  const sa = Math.max(2, Math.round(num(body.smallAppliance, 2))) * 1500; // 220.52(A): ≥2 @ 1500
  const laundry = Math.max(1, Math.round(num(body.laundry, 1))) * 1500;   // 220.52(B): ≥1 @ 1500
  const generalVA = lighting + sa + laundry;
  const generalNet = generalDemand(generalVA);

  const applianceVA = Math.max(0, num(body.applianceVA, 0));   // sum of fixed appliance nameplates
  const applianceCount = Math.max(0, Math.round(num(body.applianceCount, 0)));
  const applianceNet = applianceCount >= 4 ? round(applianceVA * 0.75) : round(applianceVA); // 220.53: 4+ ⇒ 75%

  const dryerNet = body.dryerVA != null ? Math.max(5000, num(body.dryerVA, 0)) : 0;          // 220.54: min 5000
  const rangeNet = Math.max(0, num(body.rangeVA, 0));          // 220.55 (owner supplies demand VA; ranges use the table)
  const acVA = Math.max(0, num(body.acVA, 0)), heatVA = Math.max(0, num(body.heatVA, 0));
  const climateNet = Math.max(acVA, heatVA);                   // 220.60: larger of heat vs A/C at 100%

  const totalVA = round(generalNet + applianceNet + dryerNet + rangeNet + climateNet);
  const amps = volts > 0 ? round(totalVA / volts, 1) : 0;
  const service = STD_SERVICE.find((s) => s >= amps) || STD_SERVICE[STD_SERVICE.length - 1];

  return {
    ok: true, label: "ESTIMATE — NEC Article 220 standard method", method: "NEC 220 standard",
    breakdown: { generalVA, generalNet, applianceNet: applianceCount >= 4 ? applianceNet + " (75% demand, 4+ appliances)" : applianceNet,
      dryerNet, rangeNet, climateNet: climateNet + " (larger of A/C " + acVA + " vs heat " + heatVA + ")" },
    totalVA, volts, calculatedAmps: amps, recommendedService: service + "A",
    note: "Calculated load " + amps + "A → " + service + "A service (next standard size). " + NEC_NOTE,
    verify: ["Range/cooking loads use NEC Table 220.55 demand — enter the table demand VA, not nameplate.", "A licensed electrician must run the final calc + the AHJ permits it."],
  };
}

function ampacity(body) {
  const awg = clean(body.awg, 6);
  const w = WIRE[awg];
  if (!w) return { ok: false, error: "unknown_awg", sizes: Object.keys(WIRE) };
  const out = { ok: true, label: "ESTIMATE — NEC 310.16 (copper)", awg, ampacity60C: w.a60, ampacity75C: w.a75, ampacity90C: w.a90,
    note: "Terminations ≤100 A are commonly rated 60 °C; feeders/larger often 75 °C — use the column your equipment terminals allow. " + NEC_NOTE };
  if (w.maxBreaker) out.smallConductorBreakerMax = w.maxBreaker + "A (NEC 240.4(D))";
  return out;
}

function vdrop(body) {
  const awg = clean(body.awg, 6), w = WIRE[awg];
  if (!w) return { ok: false, error: "unknown_awg", sizes: Object.keys(WIRE) };
  const amps = Math.max(0, num(body.amps, 0)), L = Math.max(0, num(body.lengthFt, 0)), volts = num(body.volts, 240);
  const phase = num(body.phase, 1);
  const mult = phase === 3 ? 1.732 : 2;                        // 1φ two-way vs 3φ
  const vd = round((mult * L * amps * w.ohmPer1000) / 1000, 2);
  const pct = volts > 0 ? round((vd / volts) * 100, 2) : 0;
  return { ok: true, label: "ESTIMATE — voltage drop", awg, amps, lengthFt: L, volts, phase,
    voltageDrop: vd, dropPct: pct,
    withinRecommended: pct <= 3 ? "≤3% (branch OK)" : pct <= 5 ? "3–5% (watch — total should stay ≤5%)" : ">5% (upsize the conductor)",
    note: "NEC voltage-drop limits (3% branch / 5% total) are INFORMATIONAL recommendations (210.19/215.2 FPN), not mandatory. " + NEC_NOTE };
}

function analyze(body) {
  body = body || {};
  const action = clean(body.action, 16) || "service";
  if (action === "ampacity") return ampacity(body);
  if (action === "vdrop") return vdrop(body);
  return service(body);
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({ ok: true, service: "electrical-load", pure: true, priced: false, code: "NEC 2023 (verify AHJ edition)",
      actions: { service: "NEC 220 dwelling service load → amps + service size", ampacity: "NEC 310.16 conductor ampacity", vdrop: "voltage drop %" },
      wireSizes: Object.keys(WIRE),
      note: "POST { action:'service'|'ampacity'|'vdrop', ... }. ESTIMATE + planning aid only — a LICENSED ELECTRICIAN + the AHJ must design, stamp, and permit. NEC values are the 2023 baseline; verify the adopted edition. No pricing." });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  try { res.status(200).json(analyze(body || {})); }
  catch (e) { res.status(200).json({ ok: false, error: String((e && e.message) || e).slice(0, 140) }); }
};

module.exports.generalDemand = generalDemand;
module.exports.service = service;
module.exports.ampacity = ampacity;
module.exports.vdrop = vdrop;
module.exports.analyze = analyze;
module.exports.WIRE = WIRE;
module.exports.STD_SERVICE = STD_SERVICE;
