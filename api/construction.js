// Klyfton CONSTRUCTION — the general-contractor / prime-with-subs layer. MGSF self-performs its
// trades (spray foam, SPF roofing, coatings, concrete lifting, soil/seawall) but Clifton also wants
// to run jobs as the PRIME with subcontractors under him for the trades MGSF doesn't self-perform.
// This module is the trade taxonomy ("branches of each trade") + the sub-management structure.
//
// GROUNDED, NOT FABRICATED (doctrine #1): the trade spine is the industry-standard CSI MasterFormat
// 2020 division framework (50 divisions, 00–49) — a real, published organizing standard, not an
// invented one. Material lists are a REPRESENTATIVE starter taxonomy per trade (extend per job),
// never exhaustive and never priced. The sub-compliance packet is grounded in real risk-transfer /
// tax / lien / labor requirements; anything regulatory carries a "verify per state / prime contract"
// pointer. NO pricing, no rates, no guarantees — pricing stays in mgsf-core doctrine.
//
// Keyless, deterministic, no npm, no network.
// POST { trades?:[...], job?:{...}, state?, federallyFunded?, publicWorks?, bondRequired? }
// GET  -> the division taxonomy + MGSF self-perform map + the sub packet template.

function low(s) { return String(s == null ? "" : s).trim().toLowerCase(); }
function clean(s, max) { return String(s == null ? "" : s).trim().slice(0, max || 80); }

// ---- CSI MasterFormat 2020 divisions (public standard framework; titles are widely published).
// group: the MasterFormat super-group. mgsf:true = a division MGSF self-performs in.
const DIVISIONS = [
  { n: "00", title: "Procurement & Contracting Requirements", group: "Contracting" },
  { n: "01", title: "General Requirements", group: "General" },
  { n: "02", title: "Existing Conditions", group: "Facility Construction" },
  { n: "03", title: "Concrete", group: "Facility Construction", mgsf: true },
  { n: "04", title: "Masonry", group: "Facility Construction" },
  { n: "05", title: "Metals", group: "Facility Construction" },
  { n: "06", title: "Wood, Plastics & Composites", group: "Facility Construction" },
  { n: "07", title: "Thermal & Moisture Protection", group: "Facility Construction", mgsf: true },
  { n: "08", title: "Openings (Doors & Windows)", group: "Facility Construction" },
  { n: "09", title: "Finishes", group: "Facility Construction", mgsf: true },
  { n: "10", title: "Specialties", group: "Facility Construction" },
  { n: "11", title: "Equipment", group: "Facility Construction" },
  { n: "12", title: "Furnishings", group: "Facility Construction" },
  { n: "13", title: "Special Construction", group: "Facility Construction" },
  { n: "14", title: "Conveying Equipment", group: "Facility Construction" },
  { n: "21", title: "Fire Suppression", group: "Facility Services" },
  { n: "22", title: "Plumbing", group: "Facility Services" },
  { n: "23", title: "HVAC", group: "Facility Services" },
  { n: "25", title: "Integrated Automation", group: "Facility Services" },
  { n: "26", title: "Electrical", group: "Facility Services" },
  { n: "27", title: "Communications", group: "Facility Services" },
  { n: "28", title: "Electronic Safety & Security", group: "Facility Services" },
  { n: "31", title: "Earthwork", group: "Site & Infrastructure", mgsf: true },
  { n: "32", title: "Exterior Improvements", group: "Site & Infrastructure", mgsf: true },
  { n: "33", title: "Utilities", group: "Site & Infrastructure" },
  { n: "34", title: "Transportation", group: "Site & Infrastructure" },
  { n: "35", title: "Waterway & Marine Construction", group: "Site & Infrastructure", mgsf: true },
];
const DIV_BY_N = {}; DIVISIONS.forEach((d) => { DIV_BY_N[d.n] = d; });

// ---- Trades ("branches"). Each maps to its CSI division. selfPerform = MGSF does it in-house;
// otherwise it's a SUB trade MGSF hires as prime. materials = representative starter list (extend
// per job; not exhaustive, not priced). keys = match terms.
const TRADES = [
  // MGSF self-perform
  { id: "spray-foam", name: "Spray Foam Insulation", div: "07", selfPerform: true, keys: ["spray foam", "spf", "insulation", "open cell", "closed cell", "attic", "crawl", "wall foam"], materials: ["closed-cell SPF", "open-cell SPF", "intumescent/ignition-barrier coating", "thermal-barrier coating"] },
  { id: "spf-roofing", name: "SPF Roofing", div: "07", selfPerform: true, keys: ["spf roof", "foam roof", "roofing", "recoat", "membrane roof"], materials: ["roofing-grade SPF", "silicone/acrylic roof coating", "primer", "granules", "roof patch"] },
  { id: "coatings", name: "Protective Coatings", div: "09", selfPerform: true, keys: ["coating", "polyurea", "elastomeric", "sealant", "waterproofing"], materials: ["polyurea", "elastomeric coating", "epoxy primer", "polyurethane topcoat"] },
  { id: "air-vapor", name: "Air & Vapor Barrier", div: "07", selfPerform: true, keys: ["air barrier", "vapor barrier", "air sealing", "weatherization"], materials: ["fluid-applied air barrier", "vapor retarder", "flashing", "sealant/caulk"] },
  { id: "concrete-lifting", name: "Concrete Lifting / Leveling", div: "03", selfPerform: true, keys: ["concrete lifting", "slab jacking", "polyjacking", "mudjacking", "leveling", "void fill"], materials: ["structural polyurethane foam", "void-fill foam"] },
  { id: "soil-stabilization", name: "Soil Stabilization", div: "31", selfPerform: true, keys: ["soil stabilization", "soil", "geotech foam", "ground stabilization"], materials: ["geotechnical polyurethane resin"] },
  { id: "seawall", name: "Seawall Stabilization", div: "35", selfPerform: true, keys: ["seawall", "bulkhead", "shoreline", "marine"], materials: ["hydrophobic closed-cell polyurethane", "sealant"] },
  // Common SUB trades MGSF hires as prime (not self-performed)
  { id: "excavation", name: "Excavation / Earthwork", div: "31", selfPerform: false, keys: ["excavation", "earthwork", "grading", "dig", "backfill"], materials: ["fill", "gravel base", "geotextile"] },
  { id: "concrete-flatwork", name: "Concrete Flatwork / Foundations", div: "03", selfPerform: false, keys: ["pour", "flatwork", "foundation", "footing", "rebar", "form"], materials: ["ready-mix concrete", "rebar", "wire mesh", "forms", "cure & seal"] },
  { id: "framing", name: "Framing / Carpentry", div: "06", selfPerform: false, keys: ["framing", "carpentry", "framer", "wood", "truss", "sheathing"], materials: ["dimensional lumber", "sheathing", "fasteners", "trusses"] },
  { id: "masonry", name: "Masonry", div: "04", selfPerform: false, keys: ["masonry", "block", "brick", "cmu", "mortar"], materials: ["CMU block", "brick", "mortar", "grout"] },
  { id: "metal", name: "Metal Building / Steel", div: "05", selfPerform: false, keys: ["steel", "metal building", "pole barn frame", "structural metal", "purlin"], materials: ["steel framing", "purlins", "metal panels", "fasteners"] },
  { id: "roofing-shingle", name: "Shingle / Metal Roofing", div: "07", selfPerform: false, keys: ["shingle", "metal roof panel", "standing seam", "asphalt roof"], materials: ["shingles", "metal roof panels", "underlayment", "flashing"] },
  { id: "drywall", name: "Drywall & Finishes", div: "09", selfPerform: false, keys: ["drywall", "sheetrock", "gypsum", "paint", "flooring", "finish"], materials: ["gypsum board", "joint compound", "paint", "flooring"] },
  { id: "doors-windows", name: "Doors & Windows", div: "08", selfPerform: false, keys: ["door", "window", "glazing", "opening", "overhead door"], materials: ["doors", "windows", "hardware", "flashing tape"] },
  { id: "plumbing", name: "Plumbing", div: "22", selfPerform: false, keys: ["plumb", "plumbing", "water line", "drain", "sewer", "fixtures"], materials: ["pipe & fittings", "fixtures", "water heater", "valves"] },
  { id: "hvac", name: "HVAC / Mechanical", div: "23", selfPerform: false, keys: ["hvac", "mechanical", "furnace", "heat pump", "ductwork", "air handler"], materials: ["furnace/heat pump", "ductwork", "registers", "refrigerant line"] },
  { id: "electrical", name: "Electrical", div: "26", selfPerform: false, keys: ["electric", "electrical", "wiring", "panel", "lighting", "service"], materials: ["wire", "panel/breakers", "devices", "fixtures", "conduit"] },
  { id: "fire", name: "Fire Suppression", div: "21", selfPerform: false, keys: ["fire suppression", "sprinkler", "fire protection"], materials: ["sprinkler pipe", "heads", "valves"] },
  { id: "sitework", name: "Site / Paving", div: "32", selfPerform: false, keys: ["paving", "asphalt", "site concrete", "sidewalk", "curb", "landscape"], materials: ["asphalt", "site concrete", "base course"] },
];

function tradeMatch(text) {
  const q = low(text); if (!q) return null;
  // longest key match wins so "spray foam roof" prefers the roof branch when explicit
  let best = null, bestLen = 0;
  for (const t of TRADES) { for (const k of t.keys) { if (q.indexOf(k) >= 0 && k.length > bestLen) { best = t; bestLen = k.length; } } }
  return best;
}
function tradeById(id) { return TRADES.find((t) => t.id === low(id)) || null; }
function divisionFor(text) {
  const t = tradeMatch(text); if (t) return { ...DIV_BY_N[t.div], trade: t.id, tradeName: t.name, selfPerform: t.selfPerform };
  // fall back to a direct division-number or title hint
  const q = low(text);
  const d = DIVISIONS.find((x) => q.indexOf(x.title.toLowerCase()) >= 0 || q === x.n);
  return d ? { ...d } : null;
}

// ---- Subcontractor compliance packet — what a sub must satisfy BEFORE working under MGSF as prime.
// Grounded in real risk-transfer / tax / lien / labor requirements. Regulatory items carry verify.
function subPacket(opts) {
  opts = opts || {};
  const items = [
    { id: "subcontract", name: "Signed subcontract agreement", why: "Scope, schedule, pay terms, indemnification, and flow-down of the prime contract's obligations.", required: true },
    { id: "w9", name: "W-9", why: "Tax ID for 1099 reporting.", required: true },
    { id: "coi", name: "Certificate of Insurance — GL + Workers' Comp + Auto", why: "MGSF named ADDITIONAL INSURED + waiver of subrogation; protects the prime from the sub's liability.", required: true, verify: "Confirm the limits your prime contract / GC requires; see mgsf-insurance-bonding." },
    { id: "license", name: "Valid contractor license / registration", why: "The sub must be licensed/registered for the trade in the job's state.", required: true, verify: "License rules vary by state + trade — verify (see mgsf-workforce-labor / mgsf-codes-permits)." },
    { id: "lien-waivers", name: "Lien waivers (progress + final)", why: "Conditional on progress draws, unconditional on final payment — protects the owner + prime from sub liens.", required: true, verify: "Waiver form + timing rules vary by state (MT/ND/SD/WY)." },
    { id: "safety", name: "Safety / OSHA acknowledgment", why: "Site safety plan + OSHA compliance; SPF/isocyanate areas need the re-occupancy + PPE rules (mgsf-safety-osha).", required: true },
  ];
  if (opts.bondRequired) items.push({ id: "bond", name: "Payment/Performance bond", why: "Required when the prime contract or public owner requires bonding down to the sub.", required: true, verify: "Only when the prime contract requires it — see mgsf-insurance-bonding." });
  if (opts.federallyFunded || opts.publicWorks) items.push({ id: "prevailing-wage", name: "Prevailing-wage certified payroll (flow-down)", why: "On Davis-Bacon / state prevailing-wage jobs, the sub must pay the wage determination and file certified payroll (WH-347). The prime is responsible for collecting it.", required: true, verify: "Applies on federal/federally-funded (>$2k) + MT state public works — see mgsf-workforce-labor / api/gov-programs.js." });
  return { role: "subcontractor", note: "Collect ALL required items before the sub starts work — the prime (MGSF) carries the risk if a sub is uninsured/unlicensed.", items };
}

// Split a job's trades into MGSF self-perform vs subs, attach the sub packet template.
function primeSubStructure(body) {
  body = body || {};
  const raw = Array.isArray(body.trades) ? body.trades : [];
  const resolved = raw.map((t) => {
    const tr = tradeById(t) || tradeMatch(t);
    if (!tr) return { input: clean(t), matched: false, note: "No trade match — classify manually (self-perform vs sub)." };
    return { input: clean(t), trade: tr.id, name: tr.name, division: tr.div, divisionTitle: (DIV_BY_N[tr.div] || {}).title, role: tr.selfPerform ? "self-perform (MGSF)" : "subcontract" };
  });
  const selfPerform = resolved.filter((r) => r.role && r.role.indexOf("self") === 0);
  const subs = resolved.filter((r) => r.role === "subcontract");
  const out = { prime: "Machine Gun Spray Foam & Concrete Lifting, LLC", selfPerform, subs, unmatched: resolved.filter((r) => r.matched === false) };
  if (subs.length) out.subPacket = subPacket(body);
  return out;
}

function analyze(body) {
  body = body || {};
  const out = { ok: true, label: "GUIDANCE", framework: "CSI MasterFormat 2020 (50 divisions, 00–49)",
    disclaimer: "Trade taxonomy + prime/sub structure — starter framework, not exhaustive and NOT priced (pricing lives in mgsf-core doctrine). Regulatory items carry a verify pointer; confirm licensing/insurance/lien/wage rules per state + prime contract." };
  if (body.query || body.trade) { const d = divisionFor(body.query || body.trade); if (d) out.division = d; }
  if (Array.isArray(body.trades) && body.trades.length) out.structure = primeSubStructure(body);
  else out.subPacket = subPacket(body);
  out.selfPerform = TRADES.filter((t) => t.selfPerform).map((t) => ({ id: t.id, name: t.name, division: t.div }));
  return out;
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({ ok: true, service: "construction", grounded: true, fabricates: false, priced: false,
      framework: "CSI MasterFormat 2020 (50 divisions, 00–49)", divisions: DIVISIONS,
      trades: TRADES.map((t) => ({ id: t.id, name: t.name, division: t.div, selfPerform: t.selfPerform, materials: t.materials })),
      subPacketTemplate: subPacket({}),
      note: "POST { trades:[...], state?, federallyFunded?, publicWorks?, bondRequired? } to split a job into MGSF self-perform vs subs and get each sub's compliance packet; or { query } to map a trade to its CSI division. GUIDANCE only — starter taxonomy, no pricing, verify regulatory items per state/contract." });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  try { res.status(200).json(analyze(body || {})); }
  catch (e) { res.status(200).json({ ok: false, error: String((e && e.message) || e).slice(0, 140) }); }
};

// pure exports for the brain + tests
module.exports.DIVISIONS = DIVISIONS;
module.exports.TRADES = TRADES;
module.exports.tradeMatch = tradeMatch;
module.exports.tradeById = tradeById;
module.exports.divisionFor = divisionFor;
module.exports.subPacket = subPacket;
module.exports.primeSubStructure = primeSubStructure;
module.exports.analyze = analyze;
