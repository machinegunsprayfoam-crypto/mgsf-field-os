// Measure helper — roof & wall area math for estimating. Pure geometry, no keys, no npm.
//   Roof: sloped area = footprint × slope factor, where slope factor = sqrt(1 + (rise/12)²).
//         squares = area / 100. (Footprint = flat plan area under the roof.)
//   Wall: gross area = perimeter × height; net = gross − openings.
// Turns a tape measure into the numbers foam-calc / coating-calc need. Feed the result's area
// straight into those. No fabrication — everything is the caller's measurements.
//
// POST { mode:"roof"|"wall", ... }  ->  area + derived counts
// GET  -> shapes.

function num(v, d) { const n = parseFloat(v); return Number.isFinite(n) ? n : d; }

function roof(body) {
  const footprint = Math.max(0, num(body.footprint, 0));         // ft² plan area
  const rise = Math.max(0, num(body.pitchRise, num(body.rise, 4))); // rise per 12" run
  const wastePct = Math.min(0.6, Math.max(0, num(body.waste, 0.1)));
  const slopeFactor = Math.sqrt(1 + Math.pow(rise / 12, 2));
  const area = footprint * slopeFactor;
  const areaWithWaste = area * (1 + wastePct);
  return {
    ok: true, mode: "roof", label: "ESTIMATE",
    inputs: { footprint, pitch: rise + ":12", waste: wastePct },
    slopeFactor: Math.round(slopeFactor * 1000) / 1000,
    roofAreaSqft: Math.round(area),
    roofAreaWithWaste: Math.round(areaWithWaste),
    squares: Math.round((area / 100) * 10) / 10,
    note: "Sloped area = footprint × sqrt(1+(rise/12)²). Feed roofAreaWithWaste into coating-calc/foam-calc.",
  };
}

function wall(body) {
  const perimeter = Math.max(0, num(body.perimeter, 0));         // linear ft
  const height = Math.max(0, num(body.height, 0));               // ft
  const gables = Math.max(0, num(body.gableArea, 0));            // extra triangle area, optional
  const openings = Math.max(0, num(body.openings, 0));           // ft² of doors/windows to subtract
  const gross = perimeter * height + gables;
  const net = Math.max(0, gross - openings);
  return {
    ok: true, mode: "wall", label: "ESTIMATE",
    inputs: { perimeter, height, gableArea: gables, openings },
    grossAreaSqft: Math.round(gross),
    netAreaSqft: Math.round(net),
    note: "Net wall = perimeter × height + gables − openings. Feed netAreaSqft into foam-calc.",
  };
}

function calc(body) {
  const mode = String(body.mode || "").toLowerCase();
  if (mode === "wall") return wall(body);
  if (mode === "roof") return roof(body);
  // Infer: perimeter+height => wall, footprint => roof.
  if (body.perimeter != null || body.height != null) return wall(body);
  if (body.footprint != null) return roof(body);
  return { ok: false, error: "specify mode:'roof' (footprint,pitchRise) or 'wall' (perimeter,height)" };
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({ ok: true, configured: true,
      roof: { mode: "roof", footprint: 0, pitchRise: 4, waste: 0.1 },
      wall: { mode: "wall", perimeter: 0, height: 0, gableArea: 0, openings: 0 } });
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
