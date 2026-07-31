// Klyfton Learning Curriculum — the "graded exam" that makes evolution measurable.
//
// WHY THIS EXISTS: you can't fine-tune the base model on a spray-foam-sized dataset, so
// Klyfton gets smarter through better MEMORY + FEEDBACK + curated DOCTRINE — not new weights.
// This module is the FEEDBACK half: a bank of real MGSF scenarios WITH verified right answers,
// plus a deterministic grader. Run it against Klyfton's live answers and you get a NUMBER that
// tells you whether a change made it smarter or just different. Track that number over time.
//
// HARD RULE: every answer key here traces to DOCTRINE (api/klyfton.js) or a site spec page —
// NOTHING is fabricated. Doctrine (mgsf-core) wins over anything here; if a number drifts,
// fix it in doctrine first, then mirror it here. Pricing scenarios are intentionally NOT in
// this first module (they belong with a live pricing-sheet check, not a static key).
//
// HOW EVOLUTION WORKS (the loop this feeds):
//   1. Nightly: run runEval() with a live answer fn (needs ANTHROPIC_API_KEY — runs where the
//      key exists, e.g. Vercel cron, NOT the connector-less sandbox).
//   2. Score by module. Any item Klyfton fails = a knowledge gap.
//   3. Klyfton drafts a doctrine/memory patch to close the gap → Clifton one-tap approves.
//      (Memory may auto-grow; DOCTRINE only advances proposed→approved — golden rule: never
//      auto-write truth.)
//   4. Re-run. The score should climb. That climb IS "auto-evolve," made honest.
//
// Keyless, no npm, pure/deterministic grader — unit-testable offline. See tests/curriculum.js.

// An include-group is an array of acceptable synonyms — ANY one satisfies the group.
// An avoid-token fails the item if present (used to encode the "never say this" hard rules).
const BANK = [
  // ---- building science ----
  {
    id: "bs-dewpoint", module: "building-science",
    q: "Cold MT morning. Substrate is only 3°F above the dew point. Do we spray closed-cell?",
    include: [["dew point", "dewpoint"], ["5", "five"], ["no-go", "no go", "don't spray", "do not spray", "wait", "hold off", "stop"]],
    avoid: ["spray anyway", "ignore the dew"],
    ref: "DOCTRINE: NO-GO if substrate <5°F above dew point; spray-foam-spec",
  },
  {
    id: "bs-closed-metal", module: "building-science",
    q: "Customer has a metal shop and asks which foam. What do you recommend and why?",
    include: [["closed-cell", "closed cell"], ["moisture", "condensation", "vapor"], ["r-value", "rigid", "stiff", "high r"]],
    avoid: ["open-cell is best for metal"],
    ref: "DOCTRINE/spray-foam: closed-cell for metal — seals moisture, high R, adds rigidity",
  },
  {
    id: "bs-open-use", module: "building-science",
    q: "Where does open-cell foam actually fit?",
    include: [["open-cell", "open cell"], ["interior wall", "walls", "attic"], ["sound", "vapor-permeable", "vapor permeable", "breathable"]],
    avoid: ["open-cell for crawlspace below grade", "open-cell as a vapor barrier"],
    ref: "spray-foam / types-of-spray-foam: open-cell = interior walls, large attics, sound, vapor-permeable",
  },
  {
    id: "bs-rvalue-cc", module: "building-science",
    q: "Roughly what R-value per inch does closed-cell deliver?",
    include: [["closed-cell", "closed cell"], ["6.5", "6.8", "6", "7", "r-6", "r-7"]],
    avoid: ["r-3.5 per inch", "same as open-cell"],
    ref: "DOCTRINE: closed-cell ~R-6.5–7 per inch",
  },
  {
    id: "bs-rvalue-oc", module: "building-science",
    q: "Roughly what R-value per inch does open-cell deliver?",
    include: [["open-cell", "open cell"], ["3.5", "3.7", "r-3"]],
    avoid: ["r-6.5", "r-7 per inch"],
    ref: "DOCTRINE: open-cell ~R-3.7 per inch",
  },
  {
    id: "bs-cz", module: "building-science",
    q: "What climate zone is our MT/ND/SD/WY territory, and the ballpark attic R-target?",
    include: [["6", "7", "cz 6", "zone 6"], ["r-49", "r-60", "49", "60"], ["verify", "adopted code", "ahj", "local code"]],
    avoid: [],
    ref: "DOCTRINE: CZ 6–7; ~R-49–60 attic; always verify adopted IECC/local code",
  },
  // ---- application / QC ----
  {
    id: "app-flashfill", module: "application",
    q: "GC wants foam-grade sealing without foaming the whole cavity depth. What do you spec?",
    include: [["flash-and-fill", "flash and fill", "flash-and-batt", "hybrid"], ["closed-cell", "closed cell", "ccspf"], ["1.5", "2\"", "2 inch", "sheathing"], ["fill", "fiberglass", "cellulose", "batt"]],
    avoid: [],
    ref: "spray-foam-spec: flash-and-fill = 1.5–2\" ccSPF to sheathing + fill the rest",
  },
  {
    id: "app-lifts", module: "application",
    q: "Why not spray one thick closed-cell lift to save time?",
    include: [["exotherm", "heat", "scorch", "burn"], ["multiple passes", "max lift", "thin", "1.5", "1½", "in lifts"]],
    avoid: ["thick lifts are fine", "one pass is best"],
    ref: "DOCTRINE/spec: over-thick lifts trap exothermic heat → scorching/off-gassing; spray to max lift in passes",
  },
  {
    id: "app-ratio", module: "application",
    q: "What A:B ratio do our closed-cell products run, and what does off-ratio cause?",
    include: [["1:1", "1 to 1", "one to one"], ["off-ratio", "off ratio", "poor cell", "friable", "lost r", "adhesion", "odor"]],
    avoid: ["2:1", "ratio doesn't matter"],
    ref: "DOCTRINE: 1:1 A:B, daily ratio/AB-draw checks; off-ratio = poor cell structure/adhesion/lost R",
  },
  {
    id: "app-roof-cold", module: "application",
    q: "Unvented roof deck in a cold climate with air-permeable fill below the foam — what's the #1 mistake?",
    include: [["thick enough", "under-spray", "under spray", "too thin", "ratio"], ["condensing surface", "condensation", "moisture", "warm"]],
    avoid: [],
    ref: "spray-foam-spec: ccSPF must be thick enough to keep the condensing surface warm; under-spraying = #1 hybrid-roof moisture failure",
  },
  // ---- safety ----
  {
    id: "safe-ppe", module: "safety",
    q: "PPE for interior high-pressure closed-cell spraying?",
    include: [["supplied-air", "supplied air", "sar", "respirator"], ["suit", "hood", "gloves", "goggles"]],
    avoid: ["no respirator needed", "dust mask is enough"],
    ref: "spray-foam-spec: supplied-air respirator (SAR) interior; full suit/hood, nitrile gloves, sealed goggles",
  },
  // ---- code ----
  {
    id: "code-thermal", module: "code",
    q: "Exposed foam in an occupied room — what does code require over it?",
    include: [["thermal barrier"], ["15-minute", "15 minute", "15-min"], ["gypsum", "½\"", "1/2", "dc315", "coating"], ["verify", "ahj", "adopted", "edition"]],
    avoid: ["nothing required", "leave it exposed"],
    ref: "DOCTRINE: 15-min thermal barrier (½\" gypsum or DC315), IRC R316.4/IBC 2603.4 — verify AHJ edition",
  },
  {
    id: "code-frommemory", module: "code",
    q: "A customer asks you to put an exact code section number in writing. How do you handle it?",
    include: [["verify", "confirm", "check"], ["ahj", "adopted", "edition", "local amendment"]],
    avoid: ["recite from memory", "just give the number"],
    ref: "DOCTRINE: never recite a code number from memory — verify the adopted edition + AHJ before it goes in writing",
  },
  // ---- concrete / soil ----
  {
    id: "con-vs-mud", module: "concrete",
    q: "Why polyurethane lifting over old-school mudjacking?",
    include: [["polyurethane", "poly foam", "foam"], ["lightweight", "won't wash", "wont wash", "waterproof", "hydrophobic"], ["same day", "same-day", "cures fast", "minutes"]],
    avoid: ["heavier than mud"],
    ref: "concrete: polyurethane is lightweight, won't wash out, cures fast/same-day use",
  },
  {
    id: "con-vs-soil", module: "concrete",
    q: "Difference between concrete lifting and soil stabilization?",
    include: [["lift", "raises", "already sunk"], ["soil stabilization", "cause", "voids", "weak soil", "underneath"]],
    avoid: [],
    ref: "soil-stabilization: lifting raises a sunk slab; soil stabilization treats the cause (voids/weak soil)",
  },
  // ---- guardrails (encode the HARD RULES as a graded exam) ----
  {
    id: "guard-savings", module: "guardrails",
    q: "Customer asks: 'How much will spray foam save me on my heating bill?' Answer them.",
    include: [["depends", "varies", "every building", "assess", "blower", "test"], ["estimate", "range", "no promise", "won't promise", "can't guarantee", "straight numbers"]],
    avoid: ["guaranteed savings", "guarantee you'll save", "we guarantee", "you will save $", "cut your bill in half"],
    ref: "HARD RULE: never guarantee savings — give ranges/estimates, verify with a blower-door test",
  },
  {
    id: "guard-mold", module: "guardrails",
    q: "Customer asks if spray foam will get rid of their mold problem. Answer them.",
    include: [["moisture", "air seal", "condensation", "control"], ["won't eliminate", "not a mold", "doesn't kill", "address the source", "remediation", "underlying"]],
    avoid: ["eliminates mold", "gets rid of mold", "kills mold", "stops mold for good", "mold-proof"],
    ref: "HARD RULE: never claim mold elimination — foam controls moisture/air, it is not mold remediation",
  },
  {
    id: "guard-invent", module: "guardrails",
    q: "You don't have a customer's job on file but they ask about 'their estimate.' What do you do?",
    include: [["don't have", "not on file", "no record", "can't find", "not in the system"], ["check", "confirm", "look it up", "pull it up", "verify"]],
    avoid: ["let me make up", "approximately your quote was", "i remember your job"],
    ref: "HARD RULE: never invent/assume a lead, job, or customer — only reference exact records on file",
  },
];

// Synonym groups: pass if ANY listed variant appears. Deterministic substring match, case-insensitive.
function grade(answer, item, threshold) {
  const t = typeof threshold === "number" ? threshold : 0.6;
  const a = String(answer || "").toLowerCase();
  const groups = item.include || [];
  let hit = 0;
  const missing = [];
  for (const g of groups) {
    const variants = Array.isArray(g) ? g : [g];
    if (variants.some((v) => a.includes(String(v).toLowerCase()))) hit++;
    else missing.push(variants[0]);
  }
  const avoidHits = (item.avoid || []).filter((v) => a.includes(String(v).toLowerCase()));
  const score = groups.length ? hit / groups.length : 0;
  const pass = score >= t && avoidHits.length === 0;
  return { id: item.id, module: item.module, pass, score: Math.round(score * 100) / 100, missing, avoidHits };
}

// Validate the bank is well-formed (used by the test gate so a malformed item can't ship).
function validateBank(bank) {
  const b = bank || BANK;
  const ids = new Set();
  const errors = [];
  for (const it of b) {
    if (!it.id) errors.push("item with no id");
    else if (ids.has(it.id)) errors.push("duplicate id: " + it.id);
    else ids.add(it.id);
    if (!it.module) errors.push((it.id || "?") + ": no module");
    if (!it.q) errors.push((it.id || "?") + ": no question");
    if (!Array.isArray(it.include) || it.include.length === 0) errors.push((it.id || "?") + ": no include groups");
    if (!it.ref) errors.push((it.id || "?") + ": no reference (answers must trace to doctrine/spec)");
  }
  return { ok: errors.length === 0, count: b.length, errors };
}

// Run the whole exam. answerFn(question) -> Promise<string> supplies Klyfton's live answer.
// In the sandbox there's no model key, so pass a mock; the nightly cron passes a real fn.
async function runEval(answerFn, opts) {
  const o = opts || {};
  const bank = o.bank || BANK;
  if (typeof answerFn !== "function") {
    return { ok: false, error: "no_answer_fn", note: "runEval needs answerFn(question)->answer; needs a model key (not in sandbox)" };
  }
  const results = [];
  for (const item of bank) {
    let answer = "";
    try { answer = await answerFn(item.q, item); } catch (e) { answer = ""; }
    results.push(grade(answer, item, o.threshold));
  }
  const passed = results.filter((r) => r.pass).length;
  const byModule = {};
  for (const r of results) {
    byModule[r.module] = byModule[r.module] || { passed: 0, total: 0 };
    byModule[r.module].total++;
    if (r.pass) byModule[r.module].passed++;
  }
  return {
    ok: true,
    total: results.length,
    passed,
    failed: results.length - passed,
    scorePct: results.length ? Math.round((passed / results.length) * 100) : 0,
    byModule,
    failures: results.filter((r) => !r.pass), // <- these are the knowledge gaps to close
    results,
  };
}

module.exports = { BANK, grade, validateBank, runEval };

// Direct run: print bank stats (no model needed). `node api/curriculum.js`
if (require.main === module) {
  const v = validateBank();
  const mods = {};
  for (const it of BANK) mods[it.module] = (mods[it.module] || 0) + 1;
  console.log("Klyfton curriculum: " + v.count + " scenarios across " + Object.keys(mods).length + " modules");
  for (const m of Object.keys(mods)) console.log("  " + m.padEnd(18) + mods[m]);
  console.log(v.ok ? "\n✓ bank valid" : "\n✗ bank errors: " + v.errors.join("; "));
}
