// Klyfton CONCRETE-CALC — the quantity engine for the concrete self-perform trades that had none:
// slab lifting/leveling, void fill, and seawall injection. Foam-calc does spray foam by board-feet;
// this does polyurethane by VOID VOLUME → cured pounds → sets. Same discipline as foam-calc.
//
// GROUNDED, NEVER FABRICATED (doctrine #1 + hard rules):
//   • Volume is deterministic geometry from the dimensions given — never guessed.
//   • Cured-foam POUNDS = volume × density. Density is PRODUCT-SPECIFIC; a labeled typical default
//     (4.0 lb/ft³, structural lifting foam) is used ONLY as an overridable ESTIMATE — always
//     "verify against the product TDS." SETS are computed only when the owner gives the set weight
//     (varies by supplier) — otherwise omitted, never invented.
//   • NO customer price. Pricing is deferred to mgsf-estimator doctrine (locked $/lb, GM, mobilization).
//   • Soil stabilization is BLOCKED in doctrine (Terra-Lok pending) — geometry is returned but the
//     result is flagged blocked; no quote.
//
// Keyless, deterministic, no npm. POST { mode, ...dims, density?, lbsPerSet?, waste? }  GET -> shape.

function num(v, d) { const n = parseFloat(v); return Number.isFinite(n) ? n : d; }
function clean(s, max) { return String(s == null ? "" : s).trim().slice(0, max || 40); }
function round(n, p) { const f = Math.pow(10, p == null ? 2 : p); return Math.round(num(n, 0) * f) / f; }

// Typical structural lifting-foam density — an ESTIMATE default, overridable, always verify the TDS.
const DEFAULT_DENSITY = 4.0;                 // lb/ft³ (common high-density lifting foam; range ~2.75–6)
const DENSITY_RANGE = [2.75, 6.0];
const MODES = ["lift", "void", "seawall", "soil"];

// Derive the void VOLUME (ft³) from whatever dimensions are given. Deterministic; missing ⇒ null.
function voidVolume(opts) {
  opts = opts || {};
  const direct = num(opts.volumeCuFt != null ? opts.volumeCuFt : opts.volume, null);
  if (direct != null && direct >= 0) return { volumeCuFt: round(direct), basis: "volume provided" };
  // slab lift / area × settlement gap (inches)
  const area = num(opts.area, null);
  if (area != null && area > 0 && opts.avgLiftInches != null) {
    const gap = Math.max(0, num(opts.avgLiftInches, 0));
    return { volumeCuFt: round(area * gap / 12), basis: "area × average lift/gap (in÷12)" };
  }
  // box void: length × width × depth (all ft; depthInches allowed)
  const L = num(opts.length, null), W = num(opts.width, null);
  const depthFt = opts.depth != null ? num(opts.depth, null) : (opts.depthInches != null ? num(opts.depthInches, 0) / 12 : null);
  if (L > 0 && W > 0 && depthFt != null && depthFt >= 0) return { volumeCuFt: round(L * W * depthFt), basis: "length × width × depth" };
  // seawall: wall length × height × average gap behind wall (inches)
  const wl = num(opts.wallLength, null), wh = num(opts.wallHeight, null);
  if (wl > 0 && wh > 0 && opts.avgGapInches != null) {
    const gap = Math.max(0, num(opts.avgGapInches, 0));
    return { volumeCuFt: round(wl * wh * gap / 12), basis: "wall length × height × avg gap (in÷12)" };
  }
  return null;
}

// Cured-foam material from volume. Pounds always (with a density); sets only with a set weight.
function material(volumeCuFt, opts) {
  opts = opts || {};
  const waste = Math.min(0.5, Math.max(0, num(opts.waste, 0.1)));   // default 10% waste, clamp 0–50%
  const densityGiven = opts.density != null;
  const density = Math.max(0.5, Math.min(20, num(opts.density, DEFAULT_DENSITY)));
  const volWithWaste = round(volumeCuFt * (1 + waste));
  const pounds = round(volWithWaste * density);
  const out = { volumeCuFt: round(volumeCuFt), wastePct: round(waste * 100, 0), volumeWithWaste: volWithWaste,
    density, densitySource: densityGiven ? "owner-entered" : ("typical ESTIMATE default — verify the product TDS (range " + DENSITY_RANGE[0] + "–" + DENSITY_RANGE[1] + " lb/ft³)"),
    poundsCured: pounds };
  const lbsPerSet = num(opts.lbsPerSet, null);
  if (lbsPerSet != null && lbsPerSet > 0) {
    out.lbsPerSet = round(lbsPerSet);
    out.setsExact = round(pounds / lbsPerSet, 2);
    out.setsToOrder = Math.ceil(pounds / lbsPerSet);
  } else {
    out.setsNote = "Enter lbsPerSet (product/supplier-specific) to get sets — not invented.";
  }
  return out;
}

function calc(body) {
  body = body || {};
  const mode = MODES.indexOf(clean(body.mode, 12)) >= 0 ? clean(body.mode, 12) : "void";
  const vol = voidVolume(body);
  if (!vol) return { ok: false, error: "need_dimensions", mode,
    note: "Provide dimensions: lift ⇒ {area, avgLiftInches}; void ⇒ {length,width,depth} or {volumeCuFt}; seawall ⇒ {wallLength,wallHeight,avgGapInches}." };
  const mat = material(vol.volumeCuFt, body);
  const out = { ok: true, label: "ESTIMATE — quantities only (owner prices via doctrine)", mode, basis: vol.basis, ...mat };
  out.pricing = { deferred: true, how: "Price via mgsf-estimator doctrine: cured pounds × locked $/lb + mobilization, to the segment GM target. Never quote from this draft directly." };
  out.verify = ["Verify the void volume on site (probe/observation) — settlement gaps vary across a slab.",
    "Confirm foam density + set weight against the product TDS before ordering."];
  if (mode === "seawall") out.verify.push("Seawall/marine: closed-cell hydrophobic foam only; confirm the assembly + permitting (AHJ / marine).");
  if (mode === "soil") { out.blocked = true; out.blockedReason = "Soil stabilization is BLOCKED in doctrine (Terra-Lok pending) — geometry only, do NOT quote or dispatch."; }
  if (mode === "lift") out.verify.push("Lift is iterative — inject to raise, don't over-lift; the gap estimate is a starting volume, not a guarantee.");
  return out;
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({ ok: true, service: "concrete-calc", pure: true, priced: false, modes: MODES,
      defaults: { density: DEFAULT_DENSITY, densityRange: DENSITY_RANGE, waste: 0.1 },
      note: "POST { mode:'lift|void|seawall|soil', dims, density?, lbsPerSet?, waste? }. Void volume → cured pounds (× density) → sets (only with lbsPerSet). Density default is a TYPICAL ESTIMATE — verify the product TDS. No pricing (deferred to doctrine); soil is blocked (Terra-Lok pending)." });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  try { res.status(200).json(calc(body || {})); }
  catch (e) { res.status(200).json({ ok: false, error: String((e && e.message) || e).slice(0, 140) }); }
};

module.exports.voidVolume = voidVolume;
module.exports.material = material;
module.exports.calc = calc;
module.exports.DEFAULT_DENSITY = DEFAULT_DENSITY;
module.exports.MODES = MODES;
