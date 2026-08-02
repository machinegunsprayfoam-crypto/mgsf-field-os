// Klyfton DRYWALL — takeoff for a drywall/finish package (GC estimate, or check a sub's count).
// First of the sub-trade quantity engines that were missing (masonry/drywall/roofing/etc. previously
// deferred to trade-estimate). For the crew + Clifton's nephews: plain, forgiving, LOUD about ESTIMATE.
//
// GROUNDED, NOT FABRICATED (hard rules): the SHEET count is pure geometry (area ÷ sheet size + waste) —
// solid. Consumables (screws / joint compound / tape) are standard rules-of-thumb tied to GA-216
// fastener spacing + GA-214 finish levels, exposed as OVERRIDABLE coverage assumptions (nothing hidden)
// and clearly labeled ESTIMATE — verify against the actual product coverage + finish level. No pricing
// (dollars = trade-estimate owner rates / doctrine). Board TYPE (type-X / mold-resistant / cement board)
// is a code/location call — pick it per GA-216 + the AHJ, this only counts sheets.
//
// Keyless, deterministic, no npm. POST { wallArea, ceilingArea | area, sheet, waste, ... } · GET -> shape.

function num(v, d) { const n = parseFloat(v); return Number.isFinite(n) ? n : (d || 0); }
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// Standard gypsum board sizes → coverage (sq ft). 4-ft wide × length. Definitional geometry.
const SHEET_SQFT = { "4x8": 32, "4x9": 36, "4x10": 40, "4x12": 48, "4x14": 56, "4x16": 64 };
// Screws per 4x8 sheet by field on-center (GA-216 typical: 16" o.c. walls, 12" o.c. ceilings). ESTIMATE.
const SCREWS_PER_SHEET_4x8 = { 16: 32, 12: 40, 8: 52 };

function takeoff(body) {
  body = body || {};
  const area = body.area != null ? Math.max(0, num(body.area)) : (Math.max(0, num(body.wallArea)) + Math.max(0, num(body.ceilingArea)));
  const skey = String(body.sheet || "4x8").toLowerCase();
  const sheet = SHEET_SQFT[skey] ? skey : "4x8";
  const sheetSqft = SHEET_SQFT[sheet];
  const waste = clamp(num(body.waste, 0.1), 0, 0.6);              // default 10% — real jobs have offcuts
  const oc = [8, 12, 16].indexOf(num(body.screwOC, 16)) >= 0 ? num(body.screwOC, 16) : 16;

  // coverage assumptions — overridable + surfaced so nothing is a hidden fabricated number (all ESTIMATE)
  const mudSqftPerGal = clamp(num(body.mudCoverageSqftPerGal, 125), 40, 400);   // ready-mix, all coats, typical
  const tapeFtPerSqft = clamp(num(body.tapeFtPerSqft, 0.4), 0.1, 1.5);          // ~1 roll (500 ft) per ~1250 sqft

  if (area <= 0) return { ok: false, error: "no_area", note: "Enter wallArea + ceilingArea (or a single area) in sq ft." };

  const areaWithWaste = area * (1 + waste);
  const sheets = Math.ceil(areaWithWaste / sheetSqft);
  const screwsPerSheet = SCREWS_PER_SHEET_4x8[oc] * (sheetSqft / 32);           // scale by sheet size
  const screws = Math.round(sheets * screwsPerSheet);
  const mudGallons = Math.ceil(area / mudSqftPerGal);
  const tapeFt = Math.round(area * tapeFtPerSqft);

  return {
    ok: true,
    label: "ESTIMATE — sheet count is geometry (solid); screws/mud/tape are GA-216/GA-214 rules-of-thumb — verify against the product coverage + finish level. No pricing.",
    inputs: { area: Math.round(area), sheet, sheetSqft, wastePct: Math.round(waste * 100), screwOC_in: oc },
    // solid geometry
    sheetsToOrder: sheets,
    areaWithWaste: Math.round(areaWithWaste),
    // consumables — ESTIMATE (assumptions echoed so they're transparent + overridable)
    consumables: {
      screws: screws, screwsNote: "≈ " + Math.round(screwsPerSheet) + "/sheet @ " + oc + "\" o.c. (GA-216) — ESTIMATE",
      jointCompoundGallons: mudGallons, mudNote: "ready-mix, all coats @ ~" + mudSqftPerGal + " sqft/gal — ESTIMATE, varies by GA-214 finish level",
      tapeFeet: tapeFt, tapeNote: "@ ~" + tapeFtPerSqft + " ft/sqft — ESTIMATE",
    },
    note: "Counts sheets only — pick board TYPE (type-X / mold-resistant / cement board) per GA-216 + the AHJ. Fire-rated assemblies must match the listed UL/GA detail. Pricing = trade-estimate (your rates).",
  };
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({ ok: true, service: "drywall-calc", pure: true, priced: false,
      shape: { wallArea: 0, ceilingArea: 0, area: 0, sheet: "4x8|4x10|4x12…", waste: 0.1, screwOC: 16, mudCoverageSqftPerGal: 125, tapeFtPerSqft: 0.4 },
      note: "POST wall+ceiling area (sq ft) → sheets to order + screws/mud/tape ESTIMATE. Sheet count is geometry; consumables are GA-216/GA-214 rules-of-thumb (verify). No pricing." });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body; if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  try { res.status(200).json(takeoff(body || {})); }
  catch (e) { res.status(200).json({ ok: false, error: String((e && e.message) || e).slice(0, 160) }); }
};

module.exports.takeoff = takeoff;
module.exports.SHEET_SQFT = SHEET_SQFT;
