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
