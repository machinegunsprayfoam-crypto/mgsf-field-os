// Klyfton GOV PROGRAMS — the state-government + workforce/labor helper that rounds out the federal
// GovCon stack (api/samgov.js = federal opportunities; api/capability-statement.js = SDVOSB doc).
// This one answers: "how do I get registered to bid in MT/ND/SD/WY?", "does prevailing wage apply
// on this job?", and "what workforce money can I capture for hiring / apprentices / veterans?".
//
// GROUNDED, NEVER FABRICATED (doctrine golden rule #1): this is a CHECKLIST + WHERE-TO-VERIFY helper,
// not a legal/tax ruling. Rules, rates, %s, and portals change and vary by procuring agency, so every
// entry carries a `verify` pointer to the official source. Stable statutory facts (e.g. the $2,000
// Davis-Bacon threshold, WH-347 certified payroll) are stated; anything that drifts is flagged verify.
// Outward compliance is GUIDANCE — confirm with the authority / a CPA / an attorney before relying.
//
// Keyless, deterministic, no npm, no network — pure structured knowledge + query logic.
// POST { state?, contractValue?, federallyFunded?, publicWorks?, hiring?:{veteran,apprentice,newHire}, intent? }
// GET  -> the shape + the full state/federal/workforce reference.

function up(s) { return String(s == null ? "" : s).trim().toUpperCase(); }
function num(v, d) { const n = parseFloat(v); return Number.isFinite(n) ? n : d; }

const DAVIS_BACON_THRESHOLD = 2000; // statutory: federal construction contracts > $2,000 (stable since 1935)

// ---- Federal contracting + labor (what MGSF already leans on, plus the labor layer) ----
const FEDERAL = {
  registration: [
    { step: "Active SAM.gov registration (UEI) — renew yearly", url: "https://sam.gov", verify: "Confirm registration is ACTIVE before any award." },
    { step: "SDVOSB certification via SBA VetCert (free)", url: "https://veterans.certify.sba.gov", verify: "3-yr cert; unlocks SDVOSB set-aside + sole-source + VA 'Vets First'. Verify current eligibility rules." },
    { step: "Pull wage determinations for the solicitation", url: "https://sam.gov/wage-determinations", verify: "Each federal construction solicitation cites its own WD — use that one." },
  ],
  prevailingWage: {
    law: "Davis-Bacon Act", appliesWhen: "Federal (or federally-funded) construction contracts over $" + DAVIS_BACON_THRESHOLD,
    obligations: ["Pay the applicable Davis-Bacon prevailing wage + fringes by labor classification", "Submit weekly certified payroll (form WH-347)", "Post the wage determination on site"],
    url: "https://www.dol.gov/agencies/whd/government-contracts/construction",
    verify: "Threshold is statutory; rates come from the solicitation's wage determination. Confirm classifications with DOL/WHD.",
  },
};

// ---- Workforce / labor incentives (federal + WIOA baseline that runs through every state board) ----
const WORKFORCE = [
  { id: "wotc", name: "Work Opportunity Tax Credit (WOTC)", who: "New hires from target groups — including qualified veterans",
    value: "Up to ~$9,600 per qualified veteran hire (category-dependent)", how: "File IRS Form 8850 + ETA 9061 within 28 days of the start date, through the state workforce agency",
    url: "https://www.dol.gov/agencies/eta/wotc", verify: "Amounts/target groups change and the credit periodically lapses/renews — confirm it's active and the current cap.", trigger: ["veteran", "newHire"] },
  { id: "ojt", name: "WIOA On-the-Job Training (OJT) reimbursement", who: "Employers training an eligible new hire on the job",
    value: "Commonly up to ~50% of the trainee's wage during training", how: "Arrange BEFORE hiring through the local workforce board / American Job Center",
    url: "https://www.careeronestop.org", verify: "Reimbursement %, eligibility, and funds are set by the LOCAL board — confirm availability first.", trigger: ["newHire", "apprentice"] },
  { id: "apprenticeship", name: "Registered Apprenticeship", who: "Employers building a registered apprenticeship (some federal/IRA work rewards apprentice labor hours)",
    value: "Training-cost help + possible state tax credits; can satisfy federal apprenticeship labor-hour requirements", how: "Register a program at apprenticeship.gov / the state apprenticeship office",
    url: "https://www.apprenticeship.gov", verify: "State apprenticeship tax credits vary — confirm the current MT/ND/SD/WY program + amount.", trigger: ["apprentice"] },
];

// ---- State procurement + labor. Real anchors; anything that drifts is flagged verify. ----
const STATES = {
  MT: {
    name: "Montana",
    registration: [
      { step: "Register as a vendor in eMACS (State Procurement Bureau)", url: "https://emacs.mt.gov", verify: "eMACS is the state's bid + vendor system — confirm the current registration flow." },
      { step: "Construction Contractor Registration with MT DLI", url: "https://erd.dli.mt.gov", verify: "Required to work as a construction contractor in MT; verify current fee + independent-contractor rules." },
    ],
    prevailingWage: { has: true, law: "Montana prevailing wage ('Little Davis-Bacon')", appliesWhen: "State/local public-works construction over the state threshold",
      obligations: ["Pay MT prevailing wage/fringes (standard vs heavy construction districts)", "Out-of-state contractors: register + 1% gross-receipts tax on public works"],
      url: "https://erd.dli.mt.gov/labor-standards/", verify: "Rates set by MT DLI by district/trade — pull the current rate book; confirm the dollar threshold." },
    preference: { has: true, note: "MT reciprocal preference — matches the preference another state gives its own bidders against MT bidders.", verify: "Confirm current reciprocal-preference rule." },
  },
  ND: {
    name: "North Dakota",
    registration: [
      { step: "Register in the ND state vendor system (OMB State Procurement)", url: "https://www.omb.nd.gov/state-procurement", verify: "Confirm the current ND vendor-registration portal + any bidders-list sign-up." },
      { step: "Check ND contractor licensing (ND Secretary of State) for work over the license threshold", url: "https://sos.nd.gov", verify: "ND requires a contractor license above a dollar threshold — verify current amount + class." },
    ],
    prevailingWage: { has: false, note: "No state prevailing-wage law (as of last check) — federal Davis-Bacon still applies on federally-funded work.", verify: "Confirm with ND Dept of Labor before assuming none applies." },
    preference: { has: true, note: "ND resident/reciprocal preference for resident bidders.", verify: "Confirm current ND preference rule." },
  },
  SD: {
    name: "South Dakota",
    registration: [
      { step: "Register as a vendor with SD state procurement (Bureau of Human Resources & Administration)", url: "https://bhr.sd.gov/procurement/", verify: "Confirm the current SD vendor self-registration / bid-list portal." },
      { step: "Check SD contractor excise tax + any licensing", url: "https://dor.sd.gov", verify: "SD levies a contractor's excise tax on realty work — confirm rate + registration." },
    ],
    prevailingWage: { has: false, note: "No state prevailing-wage law (as of last check) — federal Davis-Bacon still applies on federally-funded work.", verify: "Confirm with SD Dept of Labor & Regulation." },
    preference: { has: true, note: "SD resident/reciprocal preference.", verify: "Confirm current SD preference rule." },
  },
  WY: {
    name: "Wyoming",
    registration: [
      { step: "Register as a vendor with WY Administration & Information (A&I) Procurement", url: "https://ai.wyo.gov", verify: "Confirm the current WY vendor-registration / bid portal (e.g. WyoBid)." },
      { step: "Check WY contractor registration/licensing (often local/municipal in WY)", url: "https://wyomingworkforce.org", verify: "General-contractor licensing in WY is largely local — verify the jurisdiction's rule." },
    ],
    prevailingWage: { has: false, note: "No state prevailing-wage law (WY repealed it, as of last check) — federal Davis-Bacon still applies on federally-funded work.", verify: "Confirm with WY Dept of Workforce Services." },
    preference: { has: true, note: "WY has a strong resident preference (and WY-labor/materials preference) on public works.", verify: "Confirm the current preference percentage." },
  },
};
const STATE_NAMES = { MONTANA: "MT", "NORTH DAKOTA": "ND", "SOUTH DAKOTA": "SD", WYOMING: "WY" };
function normState(s) { const u = up(s); if (STATES[u]) return u; return STATE_NAMES[u] || null; }

// ---- Query functions (pure) ----
function stateProfile(code) { const c = normState(code); if (!c) return null; return { state: c, ...STATES[c] }; }

// Does prevailing wage apply, and what does it obligate? Federal Davis-Bacon + state layer.
function prevailingWage(opts) {
  opts = opts || {};
  const value = num(opts.contractValue, null);
  const federallyFunded = !!opts.federallyFunded;
  const publicWorks = opts.publicWorks !== false; // assume public works unless told otherwise
  const out = { label: "GUIDANCE", federal: null, state: null, verify: "Prevailing-wage applicability is set by the procuring agency + funding source — confirm on the solicitation." };
  // Federal Davis-Bacon
  if (federallyFunded && publicWorks) {
    const over = value == null ? null : value > DAVIS_BACON_THRESHOLD;
    out.federal = { law: FEDERAL.prevailingWage.law, applies: over === null ? "likely (verify contract value vs $" + DAVIS_BACON_THRESHOLD + ")" : (over ? "yes" : "no (at/under $" + DAVIS_BACON_THRESHOLD + ")"),
      obligations: FEDERAL.prevailingWage.obligations, url: FEDERAL.prevailingWage.url };
  } else {
    out.federal = { law: FEDERAL.prevailingWage.law, applies: "only on federal/federally-funded construction over $" + DAVIS_BACON_THRESHOLD };
  }
  // State layer
  const c = normState(opts.state);
  if (c) { const pw = STATES[c].prevailingWage;
    out.state = pw.has
      ? { state: c, applies: publicWorks ? "yes on state/local public works (verify threshold)" : "n/a (not public works)", law: pw.law, obligations: pw.obligations || [], url: pw.url, verify: pw.verify }
      : { state: c, applies: "no state prevailing-wage law", note: pw.note, verify: pw.verify };
  }
  return out;
}

// Which workforce incentives fit this hire?
function workforcePrograms(opts) {
  opts = opts || {};
  const h = opts.hiring || opts;
  const flags = []; if (h.veteran) flags.push("veteran"); if (h.apprentice) flags.push("apprentice"); if (h.newHire || h.veteran || h.apprentice) flags.push("newHire");
  const want = flags.length ? WORKFORCE.filter((p) => p.trigger.some((t) => flags.includes(t))) : WORKFORCE.slice();
  const c = normState(opts.state);
  return { label: "GUIDANCE", state: c || null, programs: want.map((p) => ({ id: p.id, name: p.name, who: p.who, value: p.value, how: p.how, url: p.url, verify: p.verify })),
    note: "Amounts + availability vary and change — verify each on its official source before counting on it. Not tax advice; confirm credits with your CPA." };
}

// Assemble a registration/bid checklist for a jurisdiction.
function checklist(opts) {
  opts = opts || {};
  const j = up(opts.jurisdiction || opts.state || "FEDERAL");
  if (j === "FEDERAL" || j === "FED" || j === "US") return { jurisdiction: "FEDERAL", steps: FEDERAL.registration };
  const c = normState(j); if (!c) return { jurisdiction: j, steps: [], note: "Unknown jurisdiction — use FEDERAL or MT/ND/SD/WY." };
  return { jurisdiction: c, name: STATES[c].name, steps: STATES[c].registration, preference: STATES[c].preference };
}

function analyze(body) {
  const b = body || {};
  const out = { ok: true, label: "GUIDANCE",
    disclaimer: "Grounded checklist + where-to-verify — NOT a legal/tax ruling. Rules, rates, %s, and portals change and vary by agency; confirm on the official source. Outward compliance is guidance — verify with the authority / CPA / attorney." };
  const c = normState(b.state);
  if (c) out.state = stateProfile(c);
  out.prevailingWage = prevailingWage(b);
  out.workforce = workforcePrograms(b);
  out.registration = checklist({ jurisdiction: b.state ? c : (b.jurisdiction || "FEDERAL") });
  out.federalRegistration = FEDERAL.registration;
  return out;
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({ ok: true, service: "gov-programs", grounded: true, fabricates: false,
      states: Object.keys(STATES), federal: FEDERAL, workforce: WORKFORCE, stateDetail: STATES,
      note: "POST { state?, contractValue?, federallyFunded?, publicWorks?, hiring:{veteran,apprentice,newHire}, intent? }. " +
        "Returns state vendor-registration + bid-preference checklist, prevailing-wage applicability (federal Davis-Bacon + state), and matching workforce incentives. " +
        "GUIDANCE only — every item carries a verify pointer; confirm current rules/rates/portals on the official source." });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  try { res.status(200).json(analyze(body || {})); }
  catch (e) { res.status(200).json({ ok: false, error: String((e && e.message) || e).slice(0, 140) }); }
};

// pure exports for the brain + tests
module.exports.normState = normState;
module.exports.stateProfile = stateProfile;
module.exports.prevailingWage = prevailingWage;
module.exports.workforcePrograms = workforcePrograms;
module.exports.checklist = checklist;
module.exports.analyze = analyze;
module.exports.STATES = STATES;
module.exports.FEDERAL = FEDERAL;
module.exports.WORKFORCE = WORKFORCE;
module.exports.DAVIS_BACON_THRESHOLD = DAVIS_BACON_THRESHOLD;
