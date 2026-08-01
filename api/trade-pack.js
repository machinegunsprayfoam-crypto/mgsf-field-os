// Klyfton TRADE PACK — each trade's own toolbox: the calculators it uses PLUS its specific needs —
// governing code, permit + inspections, licensing, safety, a spec checklist, and materials. Every
// trade is different; this is the one place that says what THAT trade needs.
//
// GROUNDED, NOT FABRICATED (doctrine + hard rules): code/permit/license/safety are the published
// baselines (NEC/IPC/IMC/IRC/IECC/ASHRAE/OSHA) — each carries a "verify the AHJ / the state board"
// pointer because editions + licensing vary by jurisdiction and change. No pricing. Calculators +
// materials come from the construction module (single source of truth). Trades without a curated pack
// fall back to an honest generic (calculators + materials + verify pointers) — never invented detail.
//
// Keyless, deterministic, no npm. GET -> all packs. POST { trade } -> that trade's pack.

const construction = require("./construction");

function clean(s, max) { return String(s == null ? "" : s).trim().slice(0, max || 60); }

// Curated per-trade needs. code/permit/license are strings; safety/checklist are arrays. Verify-flagged.
const PACKS = {
  electrical: {
    code: "NEC (NFPA 70) — Art. 220 load calc · 210 branch circuits/GFCI/AFCI · 250 grounding & bonding · 310.16 ampacity · 240 overcurrent. NEC 2023 baseline; verify the AHJ's adopted edition.",
    permit: "Electrical permit for new circuits/service. Inspections: rough-in (before cover) + final. Verify AHJ.",
    license: "Most jurisdictions require a licensed electrician (journeyman/master) for permitted work. MT/ND/SD/WY — verify with the state electrical board.",
    safety: ["De-energize + lock-out/tag-out (OSHA 1910.147) before working", "Arc-flash/shock PPE + boundaries per NFPA 70E", "Verify absence of voltage with a tested meter", "GFCI on temporary/site power"],
    checklist: ["Service size vs Art. 220 load calc", "Circuit count + AFCI/GFCI locations", "Grounding/bonding plan", "Panel schedule labeled", "Box fill + conduit fill per NEC ch. 3"],
  },
  plumbing: {
    code: "IPC (or UPC per AHJ) — Ch. 6 water supply + sizing (Tbl 604.3 WSFU) · Ch. 7 sanitary drainage (DFU) · Ch. 9 vents · Ch. 5 water heaters. Verify the AHJ's adopted code + edition.",
    permit: "Plumbing permit for new DWV/water piping/water heater. Inspections: rough-in (DWV + water, usually a pressure test) + final. Verify AHJ.",
    license: "Most jurisdictions require a licensed plumber for permitted work. MT/ND/SD/WY — verify with the state plumbing board.",
    safety: ["Confined-space entry (crawl/vault) per OSHA 1910.146", "Hot-work/torch fire watch + extinguisher", "Backflow prevention on cross-connections", "Scald control (mixing valve, ASSE 1017)"],
    checklist: ["Fixture-unit load → drain + supply sizing", "Vent sizing + trap-arm lengths", "Water heater sizing + T&P valve + pan/drain", "Pressure-test the rough-in", "Slope on horizontal drains (1/4\"/ft typ.)"],
  },
  hvac: {
    code: "IMC / IRC (Mechanical) + ACCA Manual J (load), S (equipment), D (ducts); ASHRAE 62.2 (ventilation); IECC (efficiency). Verify AHJ; a Manual J governs sizing.",
    permit: "Mechanical permit for equipment/ductwork/fuel-gas. Inspections: rough-in + final. Verify AHJ.",
    license: "HVAC typically needs a mechanical license + EPA 608 for refrigerant. MT/ND/SD/WY — verify with the state board.",
    safety: ["EPA 608 certification for refrigerant handling", "Combustion-safety (CAZ) + CO check on fuel-fired equipment", "Lift/rigging for rooftop/heavy units", "Electrical LOTO at the disconnect"],
    checklist: ["Manual J load (not rule of thumb)", "Manual S equipment selection", "Manual D duct sizing + external static pressure", "Combustion air + venting", "ASHRAE 62.2 whole-house ventilation"],
  },
  framing: {
    code: "IRC — R502 floors · R602 walls · R802 roof/ceiling; span tables R502.3.1 (joists), R802.4/.5 (rafters/ceiling joists); R507 decks; R602.3 fastening; R602.10 bracing. Verify AHJ; engineer anything outside the tables.",
    permit: "Building permit for structural framing. Inspections: foundation, framing (before cover), final. Verify AHJ.",
    license: "Carpentry itself is often unlicensed, but a GC/building registration is usually needed to pull the permit. MT/ND/SD/WY — verify with the state + local jurisdiction.",
    safety: ["Fall protection > 6 ft (OSHA 1926.501)", "Saw + nail-gun guarding + eye/ear PPE", "Ladder/scaffold setup + inspection", "Temporary bracing of walls/trusses until sheathed"],
    checklist: ["Member sizing per IRC span tables (or engineer)", "Header schedule at every opening", "Fastener/nailing schedule (R602.3)", "Wall bracing/shear per R602.10", "Truss layout + permanent bracing"],
  },
  // MGSF self-perform — deep detail lives in the mgsf-* skills; keep the pack compact + pointed there.
  "spray-foam": { code: "IRC R316 thermal + ignition barrier · IECC R-value (Zone 6/7); NCFI 11-035 TDS for our foam. Verify AHJ.", permit: "Insulation/building permit per AHJ; insulation inspection before cover.", license: "SPF applicator training/cert; verify state contractor registration.", safety: ["Isocyanate PPE + supplied-air respirator (mgsf-safety-osha)", "Re-occupancy time per the TDS", "Ventilation during + after spray"], checklist: ["Substrate + ambient/dew-point GO (dew-point tool)", "Set temp/pressure/ratio", "Thickness cores + R-value/code check", "Thermal/ignition barrier where required"] },
  "spf-roofing": { code: "IRC/IBC roofing + IECC; product TDS; wind uplift (verify engineer/AHJ).", permit: "Roofing/building permit per AHJ.", license: "SPF applicator cert; state contractor registration — verify.", safety: ["Fall protection > 6 ft", "Isocyanate PPE", "Overspray/wind control"], checklist: ["Substrate go/no-go", "Foam pass thickness + coating mils (DFT)", "Slope/drainage", "Recoat window"] },
  "coatings": { code: "Product TDS (mils/DFT, recoat) + IRC/IBC. Verify AHJ.", permit: "Usually none standalone; part of the roofing/building permit.", license: "State contractor registration — verify.", safety: ["PPE per SDS", "Ventilation", "Fall protection on roofs"], checklist: ["Surface prep + adhesion", "Wet/dry mil per coat", "Recoat/cure per TDS"] },
  "concrete-lifting": { code: "Product TDS; no structural stamp unless required — verify AHJ.", permit: "Often none for lifting; verify AHJ for structural work.", license: "State contractor registration — verify.", safety: ["Utility locate (811) before drilling", "Injection pressure control", "PPE per SDS"], checklist: ["Void volume estimate (concrete-calc)", "Lift iteratively — don't over-lift", "Seal injection holes"] },
  "air-vapor": { code: "IECC air-barrier + IRC R702/R703 water-resistive barrier & flashing; ASTM E2178/E2357 air-barrier performance; cold-climate (Zone 6/7) vapor-retarder class per IRC R702.7. Verify AHJ.", permit: "Usually part of the building/insulation permit; insulation/air-barrier inspection before cover. Verify AHJ.", license: "State contractor registration — verify.", safety: ["PPE per SDS (fluid-applied membranes)", "Ventilation during application", "Fall protection on elevations > 6 ft"], checklist: ["Continuity of the air barrier (6 sides) — no gaps at penetrations/transitions", "Correct vapor-retarder class for Zone 6/7 (warm-side)", "Flashing + lap direction shingle-style", "Blower-door target if specified"] },
  "soil-stabilization": { code: "Geotechnical resin TDS + a geotech engineer's recommendation; IBC/IRC ch. 18 foundations/soils where structural. Not a substitute for an engineered fix — verify AHJ + engineer.", permit: "Verify AHJ — structural/underpinning work often needs a permit + engineer's stamp.", license: "State contractor registration — verify; structural work may require a PE.", safety: ["Utility locate (811) before injection/drilling", "Injection-pressure + heave monitoring", "PPE per SDS"], checklist: ["Geotech report / soil bearing confirmed", "Injection plan + depth", "Monitor for heave — don't over-inject", "Engineer sign-off where structural"] },
  "seawall": { code: "Product TDS (hydrophobic closed-cell PU) + a marine/geotech engineer; USACE / state DEQ + local shoreline permits almost always apply. Verify AHJ + the water-body regulator.", permit: "Shoreline/marine work typically needs federal (USACE §404/§10), state (DEQ/DNRC), and local permits. Verify before any work.", license: "State contractor registration — verify; marine/structural may require a PE.", safety: ["Water-edge fall/drowning controls + PFDs", "Utility locate (811)", "PPE per SDS", "Weather/tide window"], checklist: ["Permits in hand (USACE + state + local)", "Void/leak mapping behind the wall", "Injection plan + seal", "Engineer sign-off where structural"] },
  masonry: { code: "TMS 402/602 (Building Code Requirements & Specification for Masonry Structures) + IBC ch. 21 / IRC ch. 6 & R606 (masonry walls); ASTM C90 (CMU), C270 (mortar), C476 (grout). Verify AHJ; engineer anything structural/seismic.", permit: "Building permit for structural masonry (walls, foundations, fireplaces). Inspections: footing/foundation, reinforcing/grout, final. Verify AHJ.", license: "Masonry itself is often unlicensed, but a GC/building registration is usually needed to pull the permit. MT/ND/SD/WY — verify with the state + local jurisdiction.", safety: ["Silica dust controls — cutting/mixing (OSHA 1926.1153)", "Scaffold setup + inspection (OSHA 1926 Subpart L)", "Material handling / lifting (block + mortar)", "Wall bracing until cured (limited-access zones per OSHA 1926.706)"], checklist: ["Mortar type (N/S/M per TMS 602) matches the load", "Reinforcing + grout cells per the drawings", "Control/expansion joints located", "Flashing + weeps at the base of veneer", "Cold-weather masonry protection (< 40°F)"] },
  metal: { code: "AISC 360 (structural steel) / AISI S100 (cold-formed) + IBC ch. 22; metal-building systems to MBMA. Engineered + stamped for structural — verify AHJ + engineer.", permit: "Building permit for structural steel / metal-building erection. Inspections: foundation/anchor bolts, framing, final. Verify AHJ.", license: "GC/building registration to pull the permit; welders per AWS D1.1 certification. MT/ND/SD/WY — verify.", safety: ["Fall protection > 6 ft — steel erection per OSHA 1926 Subpart R", "Crane/rigging + spotter", "Hot-work/welding fire watch + PPE", "Connections not final until bolted/welded per plan"], checklist: ["Anchor-bolt layout vs the stamped drawings", "Bolt torque / weld inspection (AWS D1.1)", "Bracing + purlin/girt layout", "Erection sequence per the manufacturer", "Engineer stamp on the building package"] },
  "roofing-shingle": { code: "IRC R905 (asphalt shingles, metal panels, underlayment) + IBC ch. 15; manufacturer install instructions govern the warranty; wind/uplift per the product listing + ASCE 7. Verify AHJ; ice-barrier required in Zone 6/7 (IRC R905.1.2).", permit: "Roofing/building permit per AHJ. Inspections: in-progress/underlayment (varies) + final. Verify AHJ.", license: "State contractor/roofing registration — verify with the state + local jurisdiction.", safety: ["Fall protection > 6 ft — roofs (OSHA 1926.501) + guardrails/PFAS", "Ladder + roof-jack setup", "Weather (wind/ice) window", "Material loading — distribute, don't point-load"], checklist: ["Ice-and-water barrier at eaves/valleys (Zone 6/7)", "Underlayment + drip edge", "Fastener count + pattern per the wind rating", "Flashing at penetrations/valleys/walls", "Ventilation (intake + ridge) balanced"] },
  drywall: { code: "GA-216 (gypsum application & finishing) + ASTM C840; IRC R702 (interior finishes) / R302 fire-rated & type-X assemblies; levels of finish per GA-214. Verify AHJ for rated assemblies.", permit: "Usually part of the building permit; a fire-rated/shaft-wall assembly is inspected before cover. Verify AHJ.", license: "State contractor registration — verify.", safety: ["Lift/handling of board (team lift or a panel hoist)", "Silica/dust controls when sanding — respirator", "Ladder/stilt safety", "Cut-tool + utility-knife PPE"], checklist: ["Correct board (type-X / mold-resistant / cement board) for the location", "Fastener spacing + screw depth", "Fire-rated assembly matches the listed UL/GA detail", "Finish level (GA-214 Level 0–5) per the spec", "Control joints on long runs"] },
  "doors-windows": { code: "IRC R308 (safety glazing) · R310 (emergency escape/egress openings) · R609 & manufacturer flashing instructions; IECC U-factor/SHGC for Zone 6/7; egress + fire-door ratings per IBC where applicable. Verify AHJ.", permit: "Building permit for new/enlarged openings (structural header) + egress changes. Inspections: framing/flashing + final. Verify AHJ.", license: "State contractor registration — verify.", safety: ["Glass handling + cut PPE", "Fall protection at upper-floor openings", "Header/opening temporary support until framed", "Lift for large glazing units"], checklist: ["Egress/EERO size at bedrooms (R310)", "Safety glazing at hazardous locations (R308)", "U-factor/SHGC meets IECC Zone 6/7", "Flashing + sill pan per the manufacturer (warranty)", "Header sized for the opening (framing-calc / engineer)"] },
  excavation: { code: "OSHA 1926 Subpart P (excavation & trenching — the governing safety code) + IRC ch. 4 / IBC ch. 18 (foundations, soils, grading & drainage). Verify AHJ; geotech for deep/unstable ground.", permit: "Grading/excavation permit varies by AHJ; call 811 (utility locate) before any dig — required, not optional. Verify AHJ.", license: "State contractor/excavation registration — verify. A competent person is required on-site (OSHA).", safety: ["811 utility locate BEFORE digging", "Protective system for trenches ≥ 5 ft — slope/shore/box (OSHA Subpart P)", "Competent person daily inspection", "Spoil pile ≥ 2 ft from the edge; no one under a suspended load"], checklist: ["811 locate ticket active", "Soil classification (A/B/C) → protective system", "Access/egress ≤ 25 ft in trenches ≥ 4 ft", "Dewatering + surface-water diversion", "Compaction + backfill per the geotech/spec"] },
  "concrete-flatwork": { code: "ACI 318 (structural concrete) / ACI 332 (residential) + IRC R403/R404/R506 (footings, foundations, slabs); ACI 117 tolerances. Verify AHJ; frost-depth footings per the local code.", permit: "Building permit for footings/foundations/structural slabs. Inspections: footing/rebar + foundation before pour. Verify AHJ.", license: "State contractor registration — verify.", safety: ["Wet-concrete skin/eye PPE (caustic) + wash station", "Silica controls when cutting/grinding", "Pump-line + boom safety", "Formwork bracing rated for the pour"], checklist: ["Footing depth below frost line (local)", "Rebar size/spacing + cover per ACI/drawings", "Vapor barrier under a heated slab", "Mix design + slump + air for freeze-thaw (Zone 6/7)", "Control/expansion joints + cure plan"] },
  fire: { code: "NFPA 13 (commercial) / 13R (low-rise residential) / 13D (1- & 2-family) sprinkler systems + NFPA 25 (inspection/testing); IFC/IBC ch. 9 where applicable. Design must be stamped — verify AHJ + fire marshal.", permit: "Fire-protection permit + plan review by the AHJ/fire marshal. Inspections: rough-in, hydrostatic test, final acceptance. Verify AHJ.", license: "Fire-suppression work almost always requires a licensed fire-protection contractor + NICET-certified designer. MT/ND/SD/WY — verify with the state fire marshal.", safety: ["Hot-work/torch fire watch + extinguisher", "Hydrostatic-test pressure controls", "Fall protection for overhead pipe", "Confined-space rules for risers/vaults"], checklist: ["Stamped hydraulic calc + design (NFPA 13/13R/13D)", "Head spacing + coverage per the listing", "Water supply / flow test adequate", "Hydrostatic test (200 psi / 2 hr) passed", "Fire-marshal final acceptance"] },
  sitework: { code: "IRC R401/R403 site prep & drainage + IBC ch. 18 / ch. 32 (grading, encroachments); asphalt to state DOT specs; ADA where public. Call 811 before subsurface work. Verify AHJ + the local engineering dept.", permit: "Site/grading + right-of-way/encroachment permits vary by AHJ; stormwater (SWPPP) if disturbing ≥ 1 acre (EPA/state). Verify AHJ.", license: "State contractor registration — verify. Public/DOT work has added prequalification.", safety: ["811 utility locate before subsurface work", "Traffic control / flagging in the ROW (MUTCD)", "Equipment + spotter (backing/loading)", "Silica + hot-asphalt PPE"], checklist: ["811 locate + survey/stakes", "Subgrade prep + base course compaction", "Positive drainage away from structures (min slope)", "SWPPP/erosion control if ≥ 1 acre", "ADA slopes/detectable warnings where public"] },
};
// Honest generic for trades without a curated pack.
const GENERIC = {
  code: "Governed by the AHJ's adopted building/trade code — verify the code + edition with the building official.",
  permit: "Permit + inspection requirements vary — verify with the AHJ.",
  license: "Licensing varies by state/jurisdiction — verify with the state board + local jurisdiction (MT/ND/SD/WY).",
  safety: ["Follow the OSHA standard for this trade + a job-specific JSA", "Trade-appropriate PPE"],
  checklist: ["Confirm scope + code path with the AHJ", "Material submittals / data sheets", "Inspection sign-offs"],
};

function pack(tradeId) {
  const t = construction.tradeById(tradeId);
  if (!t) return { ok: false, error: "unknown_trade", trades: (construction.TRADES || []).map((x) => x.id) };
  const calculators = construction.engineFor(t.id).filter((e) => e !== "sub-bid");
  const k = PACKS[t.id] || GENERIC;
  return {
    ok: true, label: "GUIDANCE — verify code/permit/license with the AHJ + state board", trade: t.id, name: t.name,
    division: t.div, selfPerform: t.selfPerform,
    calculators, materials: t.materials || [],
    code: k.code, permit: k.permit, license: k.license, safety: k.safety || GENERIC.safety, checklist: k.checklist || GENERIC.checklist,
    curated: !!PACKS[t.id],
    note: (t.selfPerform ? "MGSF self-perform trade — deep detail in the mgsf-* skills. " : "Usually subcontracted — this pack sizes the job + checks the sub's scope. ") + "All code/permit/license items are GUIDANCE; verify with the AHJ + state board.",
  };
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({ ok: true, service: "trade-pack", pure: true, priced: false,
      packs: (construction.TRADES || []).map((t) => ({ trade: t.id, name: t.name, curated: !!PACKS[t.id], calculators: construction.engineFor(t.id).filter((e) => e !== "sub-bid") })),
      note: "POST { trade } for that trade's toolbox: calculators + code + permit + license + safety + spec checklist + materials. GUIDANCE — verify code/permit/license with the AHJ + state board. No pricing." });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  try { res.status(200).json(pack(clean(body.trade, 40))); }
  catch (e) { res.status(200).json({ ok: false, error: String((e && e.message) || e).slice(0, 140) }); }
};

module.exports.pack = pack;
module.exports.PACKS = PACKS;
module.exports.GENERIC = GENERIC;
