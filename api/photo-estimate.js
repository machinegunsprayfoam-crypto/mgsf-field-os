// Estimate-from-photo pipeline — turn a field photo + a few measurements into a DRAFT estimate
// skeleton in one call. The Klyfton hive reads the photo/customer description and extracts the
// inputs (service, dimensions, substrate); this module does the deterministic math by stitching
// the existing helpers: measure.js (area) -> foam-calc.js (board-feet + sets). It NEVER invents
// measurements and NEVER invents a customer price — quantities are labeled ESTIMATE and pricing is
// explicitly deferred to mgsf-estimator doctrine (locked rates, GM target, state multiplier,
// mobilization). Draft-only, for the owner to price and approve. No npm.
//
// POST {
//   service, visionNotes,                      // what the hive saw / customer said
//   area | measure:{mode,footprint|perimeter,height,...},   // area directly, or dims to compute it
//   type:"closed"|"open", thickness, waste, costPerSet       // foam knobs (costPerSet optional, owner's)
// } -> { scope, area, foam:{boardFeet,setsToOrder,...}, pricing:{deferred}, verify:[...] }
// GET -> shape.

const measure = require("./measure");
const foam = require("./foam-calc");

function num(v, d) { const n = parseFloat(v); return Number.isFinite(n) ? n : d; }
function clean(s, max) { return String(s == null ? "" : s).trim().slice(0, max || 200); }

function estimate(body) {
  const service = clean(body.service, 60) || "spray foam insulation";
  const visionNotes = clean(body.visionNotes || body.notes, 500);

  // 1) Area — use a direct area if given, else compute it from measurements via measure.js.
  let area = num(body.area, null);
  let areaSource = "provided";
  let measured = null;
  if (area == null && body.measure && typeof body.measure === "object") {
    measured = measure.calc(body.measure);
    if (measured && measured.ok) {
      area = measured.mode === "roof"
        ? num(measured.roofAreaWithWaste, num(measured.roofAreaSqft, null))
        : num(measured.netAreaSqft, null);
      areaSource = "measured (" + measured.mode + ")";
    }
  }

  const verify = [];
  const missing = [];
  if (area == null) missing.push("area (SF) — pass area, or measure:{mode,dims}");
  if (visionNotes) verify.push("Confirm photo read against the site: " + visionNotes);

  // 2) Foam quantities — only when we have an area. foam-calc keeps the BF = area × inches rule.
  let foamOut = null;
  if (area != null) {
    const type = /open/i.test(clean(body.type, 12)) ? "open" : "closed";
    foamOut = foam.calc({
      type,
      area,
      thickness: body.thickness,   // foam-calc defaults 2" closed / 3.5" open if absent
      waste: body.waste,
      costPerSet: body.costPerSet, // ONLY if the owner passes their real per-set cost; never invented
    });
    if (body.thickness == null) verify.push("Confirm target thickness (drives board-feet) — used foam-calc default.");
    if (body.costPerSet == null) verify.push("Material cost omitted (no costPerSet given) — pull from doctrine/supplier pricing.");
  }

  // 3) Pricing is NOT computed here — it belongs to mgsf-estimator doctrine.
  const pricing = {
    deferred: true,
    how: "Price via mgsf-estimator: material (BF × doctrine cost constant) + labor + mobilization tier, " +
         "× state multiplier, priced to the segment GM target (res 55 / com 50 / ind 48 / gov 45), " +
         "$1,200 job minimum. Soil stabilization is BLOCKED (Terra-Lok pending); coatings are proposed-only.",
    note: "No customer price is generated here — quantities only. Never quote from this draft directly.",
  };

  return {
    ok: missing.length === 0,
    draftOnly: true,
    label: "ESTIMATE — DRAFT (owner prices + approves)",
    service,
    visionNotes: visionNotes || null,
    area: area != null ? Math.round(area) : null,
    areaSource,
    measure: measured,
    foam: foamOut,
    pricing,
    missing,
    verify,
    nextStep: missing.length
      ? "Provide the missing input(s), then re-run."
      : "Run the quantities through mgsf-estimator for a priced, GM-checked bid; then owner approves before it goes out.",
  };
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({ ok: true, configured: true, draftOnly: true,
      note: "POST a service + area (or measure:{mode,dims}) + foam knobs. Stitches measure->foam-calc into a draft quantity estimate. Pricing is deferred to mgsf-estimator doctrine; never invents a price." });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  try { res.status(200).json(estimate(body)); }
  catch (e) { res.status(200).json({ ok: false, error: String(e).slice(0, 140) }); }
};

module.exports.estimate = estimate;
