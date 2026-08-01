// Klyfton R-VALUE / CODE-MIN — the assembly check the trade engines were missing. foam-calc gives
// board-feet; THIS turns foam thickness (+ optional batt) into an INSTALLED R-value and checks it
// against the IECC prescriptive minimum for MGSF's cold territory (Climate Zones 6 & 7 — MT/ND/SD/WY).
// Answers "does this hit code?" and "how much more foam to get there?" for spray foam, flash-and-batt,
// and roofing.
//
// GROUNDED, NOT FABRICATED (doctrine + hard rules):
//   • Installed R = thickness × R/inch. R/inch is PRODUCT-SPECIFIC: closed-cell default 7.1 (our NCFI
//     11-035 AgriThane, per the expert library) and open-cell 3.7 are LABELED, overridable defaults —
//     always "verify the TDS." Never a guaranteed performance claim.
//   • Code minimums are the published IECC 2021 prescriptive baseline (Table R402.1.3) — a factual
//     reference, flagged "verify the AHJ's adopted edition" (states adopt different IECC years; the
//     AHJ + U-factor/total-UA alternative paths win). This is sales-grade guidance, NOT a code ruling.
//   • No pricing. Zone defaults to 6 (our lane); 6 and 7 supported.
//
// Keyless, deterministic, no npm. POST { assembly, zone?, type?, thickness?, rPerInch?, battR? }  GET -> table.

function num(v, d) { const n = parseFloat(v); return Number.isFinite(n) ? n : d; }
function clean(s, max) { return String(s == null ? "" : s).trim().slice(0, max || 40); }
function round(n, p) { const f = Math.pow(10, p == null ? 1 : p); return Math.round(num(n, 0) * f) / f; }

// Typical R/inch — LABELED defaults, overridable, verify the product TDS.
const R_PER_INCH = { closed: 7.1, open: 3.7 }; // closed = NCFI 11-035 AgriThane (doctrine); open ~3.5–3.8
const R_RANGE = { closed: [5.8, 7.4], open: [3.4, 3.9] };

// IECC 2021 prescriptive minimums (Table R402.1.3), Climate Zones 6 & 7. `min` is the cavity-equivalent
// R used for a quick check; `paths` documents the continuous-insulation / U-factor alternatives.
const CODE = {
  "6": {
    ceiling:  { min: 60, paths: "R-60 (R-49 allowed only with a raised-heel/energy truss)" },
    wall:     { min: 20, paths: "R-20 cavity OR R-13+R-5 continuous OR R-20 continuous (U-factor/total-UA alternatives allowed)" },
    floor:    { min: 30, paths: "R-30 over unconditioned space" },
    basement: { min: 19, paths: "R-15 continuous OR R-19 cavity OR R-13+R-5 continuous" },
    crawl:    { min: 19, paths: "same as basement wall: R-15 ci OR R-19 cavity" },
    slab:     { min: 10, paths: "R-10 to 4 ft depth" },
  },
  "7": {
    ceiling:  { min: 60, paths: "R-60 (R-49 allowed only with a raised-heel/energy truss)" },
    wall:     { min: 20, paths: "R-20 cavity OR R-13+R-5 continuous OR R-20 continuous (U-factor/total-UA alternatives allowed)" },
    floor:    { min: 38, paths: "R-38 over unconditioned space" },
    basement: { min: 19, paths: "R-15 continuous OR R-19 cavity OR R-13+R-5 continuous" },
    crawl:    { min: 19, paths: "same as basement wall: R-15 ci OR R-19 cavity" },
    slab:     { min: 10, paths: "R-10 to 4 ft depth" },
  },
};
const ASSEMBLY_ALIASES = { wall: "wall", walls: "wall", ceiling: "ceiling", attic: "ceiling", roof: "ceiling", roofdeck: "ceiling",
  floor: "floor", basement: "basement", foundation: "basement", crawl: "crawl", crawlspace: "crawl", slab: "slab" };
function normAssembly(a) { const k = clean(a, 20).toLowerCase().replace(/[^a-z]/g, ""); return ASSEMBLY_ALIASES[k] || null; }
function normZone(z) { const n = String(num(z, 6)); return CODE[n] ? n : "6"; }
function normType(t) { return String(t == null ? "closed" : t).toLowerCase().indexOf("open") === 0 ? "open" : "closed"; }

// Installed R from foam thickness (+ optional batt R for flash-and-batt). Deterministic.
function installedR(opts) {
  opts = opts || {};
  const type = normType(opts.type);
  const rpi = num(opts.rPerInch, R_PER_INCH[type]);
  const thickness = Math.max(0, num(opts.thickness, 0));
  const foamR = round(thickness * rpi);
  const battR = Math.max(0, num(opts.battR, 0));
  return { type, rPerInch: rpi, thickness, foamR, battR, total: round(foamR + battR),
    rPerInchSource: opts.rPerInch != null ? "owner-entered" : ("typical ESTIMATE — verify the TDS (range " + R_RANGE[type][0] + "–" + R_RANGE[type][1] + " R/in)") };
}

function codeMin(zone, assembly) { const z = normZone(zone), a = normAssembly(assembly); if (!a) return null; return { zone: z, assembly: a, ...CODE[z][a] }; }

function check(body) {
  body = body || {};
  const a = normAssembly(body.assembly);
  if (!a) return { ok: false, error: "unknown_assembly", assemblies: Object.keys(CODE["6"]), note: "Pass assembly: wall|ceiling(attic/roof)|floor|basement|crawl|slab." };
  const zone = normZone(body.zone);
  const R = installedR(body);
  const code = CODE[zone][a];
  const meets = body.thickness != null || body.battR != null ? R.total >= code.min : null;
  const out = {
    ok: true, label: "ESTIMATE — sales-grade code check, NOT a code ruling", zone, assembly: a,
    installed: R,
    code: { min: code.min, paths: code.paths, basis: "IECC 2021 prescriptive (Table R402.1.3)", verify: "Verify the AHJ's adopted IECC edition + local amendments; U-factor / total-UA compliance paths also allowed." },
    meets,
  };
  if (meets === false) {
    out.shortfallR = round(code.min - R.total);
    out.addThicknessIn = round(out.shortfallR / R.rPerInch, 2); // more foam of the same product to close the gap
    out.note = "Short of the prescriptive minimum by R-" + out.shortfallR + " — about " + out.addThicknessIn + "\" more " + R.type + "-cell foam (or add a continuous-insulation layer / use the U-factor path). Verify with the AHJ.";
  } else if (meets === true) {
    out.note = "Meets/exceeds the IECC 2021 prescriptive cavity minimum for Zone " + zone + " " + a + " (R-" + R.total + " ≥ R-" + code.min + ") — still verify the AHJ + the actual product TDS.";
  } else {
    out.note = "Enter thickness (and battR for flash-and-batt) to check against the R-" + code.min + " minimum.";
  }
  return out;
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({ ok: true, service: "rvalue-calc", pure: true, priced: false,
      rPerInchDefaults: R_PER_INCH, zones: Object.keys(CODE), assemblies: Object.keys(CODE["6"]), codeTable: CODE,
      note: "POST { assembly, zone?(6/7, default 6), type?(closed/open), thickness(in), rPerInch?, battR? }. Installed R = thickness × R/inch (+ batt); checks against the IECC 2021 prescriptive minimum for Zone 6/7 and tells you how much more foam to hit code. R/inch defaults are typical ESTIMATES — verify the TDS. Code values are the IECC 2021 baseline — verify the AHJ's adopted edition. Sales-grade guidance, not a code ruling. No pricing." });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  try { res.status(200).json(check(body || {})); }
  catch (e) { res.status(200).json({ ok: false, error: String((e && e.message) || e).slice(0, 140) }); }
};

module.exports.installedR = installedR;
module.exports.codeMin = codeMin;
module.exports.check = check;
module.exports.R_PER_INCH = R_PER_INCH;
module.exports.CODE = CODE;
