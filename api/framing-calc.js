// Klyfton FRAMING — carpentry takeoff: studs, plates, sheathing, joists/rafters, and board-feet, by
// on-center spacing + geometry. For GC work: quantify a framing package, or check a sub framer's count.
//
// GROUNDED, NOT A STRUCTURAL DESIGN (hard rule): takeoff is deterministic geometry (safe to compute).
// MEMBER SIZING / SPANS are a structural decision — this NEVER fabricates a span. Size joists/rafters/
// headers per the IRC span tables (R502.3.1 floors, R802.4/.5 rafters/ceilings) for the actual species,
// grade, spacing, and load, verified by the AHJ or a structural engineer. ESTIMATE quantities; add a
// real waste factor; no pricing.
//
// Keyless, deterministic, no npm. POST { action:"wall"|"joist"|"boardfeet", ... }

function num(v, d) { const n = parseFloat(v); return Number.isFinite(n) ? n : d; }
function clean(s, max) { return String(s == null ? "" : s).trim().slice(0, max || 12); }
function round(n, p) { const f = Math.pow(10, p == null ? 1 : p); return Math.round(num(n, 0) * f) / f; }

const SHEET_SQFT = 32;               // 4×8 sheathing panel
// Board-feet per linear foot by NOMINAL lumber size: BF/ft = (nom_thk × nom_wid) / 12.
const BF_PER_FT = { "2x4": 0.667, "2x6": 1.0, "2x8": 1.333, "2x10": 1.667, "2x12": 2.0, "2x2": 0.333, "1x6": 0.5 };
const SPAN_NOTE = "MEMBER SIZING is NOT computed here — size joists/rafters/headers per the IRC span tables (R502.3.1 floors, R802 rafters/ceilings) for the actual species, grade, spacing, and load, verified by the AHJ or a structural engineer.";
function bfPerFt(size) { const k = clean(size, 8).toLowerCase().replace(/\s/g, ""); return BF_PER_FT[k] != null ? BF_PER_FT[k] : null; }

function boardFeet(size, lengthFt, count) {
  const per = bfPerFt(size); const L = Math.max(0, num(lengthFt, 0)); const c = Math.max(0, Math.round(num(count, 1)));
  if (per == null) return { ok: false, error: "unknown_size", sizes: Object.keys(BF_PER_FT) };
  return { ok: true, size: clean(size, 8), lengthFt: L, count: c, bfPerFt: per, boardFeet: round(per * L * c) };
}

// Wall framing takeoff — studs (by OC) + king/jack studs per opening, plates, sheathing, board-feet.
function wallTakeoff(body) {
  const lengthFt = Math.max(0, num(body.lengthFt, 0));
  const heightFt = Math.max(0, num(body.heightFt, 8));
  const oc = [12, 16, 19.2, 24].indexOf(num(body.oc, 16)) >= 0 ? num(body.oc, 16) : 16;
  const openings = Math.max(0, Math.round(num(body.openings, 0)));
  const plates = Math.max(1, Math.round(num(body.plateRows, 3)));   // dbl top + single bottom = 3
  const waste = Math.min(0.4, Math.max(0, num(body.waste, 0.1)));
  const studSize = clean(body.studSize, 8) || "2x6";
  if (lengthFt <= 0) return { ok: false, error: "need_length", note: "Pass wall lengthFt (and heightFt, oc, openings)." };

  const lineStuds = Math.ceil((lengthFt * 12) / oc) + 1;
  const openingStuds = openings * 3;                                // ~2 king + 1 jack per opening (rough)
  const studs = Math.ceil((lineStuds + openingStuds) * (1 + waste));
  const plateLF = round(lengthFt * plates);
  const wallArea = round(lengthFt * heightFt);
  const sheathingSheets = Math.ceil((wallArea / SHEET_SQFT) * (1 + waste));

  const studBf = boardFeet(studSize, heightFt, studs);
  const plateBf = boardFeet(studSize, plateLF, 1);
  const totalBf = round((studBf.boardFeet || 0) + (plateBf.boardFeet || 0));
  return {
    ok: true, label: "ESTIMATE — framing takeoff (quantities + " + Math.round(waste * 100) + "% waste)",
    lengthFt, heightFt, oc, openings, studSize,
    studs, plates: plateLF + " LF (" + plates + " rows)", sheathingSheets, wallAreaSqft: wallArea,
    boardFeet: totalBf,
    note: "Takeoff estimate at " + oc + "\" OC with " + Math.round(waste * 100) + "% waste. Corners/tees/blocking vary — confirm on the plan. " + SPAN_NOTE,
    verify: ["Confirm opening count + header schedule from the plan.", SPAN_NOTE],
  };
}

// Joist / rafter takeoff — count by OC across the run; each member spans the width.
function joistTakeoff(body) {
  const runFt = Math.max(0, num(body.runFt, 0));      // length the members repeat along
  const spanFt = Math.max(0, num(body.spanFt, 0));    // clear span each member covers (for length + BF)
  const oc = [12, 16, 19.2, 24].indexOf(num(body.oc, 16)) >= 0 ? num(body.oc, 16) : 16;
  const size = clean(body.size, 8) || "2x10";
  const waste = Math.min(0.4, Math.max(0, num(body.waste, 0.1)));
  if (runFt <= 0 || spanFt <= 0) return { ok: false, error: "need_dims", note: "Pass runFt (length joists repeat along) and spanFt (clear span each covers)." };
  const count = Math.ceil((runFt * 12) / oc) + 1;
  const withWaste = Math.ceil(count * (1 + waste));
  const bf = boardFeet(size, spanFt, withWaste);
  return { ok: true, label: "ESTIMATE — joist/rafter takeoff", runFt, spanFt, oc, size,
    membersEstimate: withWaste, memberLengthFt: spanFt, boardFeet: bf.boardFeet,
    note: "Count by OC across the run (+" + Math.round(waste * 100) + "% waste); member length = the span. " + SPAN_NOTE,
    verify: ["Round member length UP to the next stock length (8/10/12/16 ft).", SPAN_NOTE] };
}

function analyze(body) {
  body = body || {};
  const action = clean(body.action, 12) || "wall";
  if (action === "joist" || action === "rafter") return joistTakeoff(body);
  if (action === "boardfeet") return boardFeet(body.size, body.lengthFt, body.count);
  return wallTakeoff(body);
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({ ok: true, service: "framing-calc", pure: true, priced: false, sizingNote: SPAN_NOTE,
      lumberSizes: Object.keys(BF_PER_FT), sheetSqft: SHEET_SQFT,
      actions: ["wall (studs/plates/sheathing/BF)", "joist|rafter (count + BF)", "boardfeet (size×length×count)"],
      note: "POST { action, lengthFt/heightFt/oc/openings/studSize (wall) | runFt/spanFt/oc/size (joist) }. Takeoff quantities + waste (deterministic geometry). MEMBER SIZING/spans are NOT computed — use the IRC span tables + the AHJ/engineer. No pricing." });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  try { res.status(200).json(analyze(body || {})); }
  catch (e) { res.status(200).json({ ok: false, error: String((e && e.message) || e).slice(0, 140) }); }
};

module.exports.boardFeet = boardFeet;
module.exports.wallTakeoff = wallTakeoff;
module.exports.joistTakeoff = joistTakeoff;
module.exports.analyze = analyze;
module.exports.BF_PER_FT = BF_PER_FT;
