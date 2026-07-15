// Ask Klyfton AI — the Klyfton "Hive" field assistant for Machine Gun Spray Foam.
// Not one generalist model: a Queen router recruits specialist minds in proportion
// to the job (like ant/bee recruitment), they work in parallel, then a synthesizer +
// critic merges and fact-checks the answer before it reaches the crew.
//
// Runs as a Vercel serverless function. No npm deps (uses global fetch).
// Requires env var ANTHROPIC_API_KEY (Vercel → Settings → Environment Variables).
// Optional env var CREW_CODE: if set, the client must send a matching { code }.

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

// Model roles. Router is a cheap/fast classifier; the workers + critic are the smart tier.
// Tuned for cost: Sonnet workers/critic (~60-80% cheaper than Opus, still sharp).
// Bump WORKER/CRITIC to "claude-opus-4-8" for max smarts, or drop to "claude-haiku-4-5" for cheapest.
const ROUTER_MODEL = "claude-haiku-4-5";
const WORKER_MODEL = "claude-sonnet-5";
const CRITIC_MODEL = "claude-sonnet-5";

// ---- Monthly cost cap (opt-in) ------------------------------------------------
// Reuses the same Vercel KV / Upstash the sync module uses. Dormant unless KV is
// attached AND KLYFTON_MONTHLY_BUDGET_USD is set. Spend is tracked per calendar
// month (UTC) under mgsf:klyfton_cost:YYYY-MM; the key rolls over automatically.
// Scan env by suffix (case-insensitive) so any prefix/casing the storage
// integration injects works — e.g. Storage_KV_REST_API_URL from the Upstash
// marketplace store. Mirrors the resolver in api/sync.js.
function _kvEnv(suffixRe, excludeRe) {
  for (const k of Object.keys(process.env)) {
    if (excludeRe && excludeRe.test(k)) continue;
    if (suffixRe.test(k) && process.env[k]) return process.env[k];
  }
  return undefined;
}
const KV_URL = _kvEnv(/KV_REST_API_URL$/i) || _kvEnv(/REST_API_URL$/i) || _kvEnv(/UPSTASH_REDIS_REST_URL$/i);
const KV_TOKEN = _kvEnv(/KV_REST_API_TOKEN$/i, /READ_ONLY/i) || _kvEnv(/REST_API_TOKEN$/i, /READ_ONLY/i);
// Default budget $50/mo. Override in Vercel with KLYFTON_MONTHLY_BUDGET_USD (set it to
// "0" to turn the cap off entirely and just track spend).
const _budgetRaw = process.env.KLYFTON_MONTHLY_BUDGET_USD;
const MONTHLY_BUDGET_USD = (_budgetRaw != null && _budgetRaw !== "") ? (parseFloat(_budgetRaw) || 0) : 50;
const KV_ON = !!(KV_URL && KV_TOKEN);

// USD per 1M tokens [input, output] — sticker prices (ignore intro discounts on
// purpose so the cap errs on the safe side: it stops a hair early, never late).
const PRICE = {
  "claude-haiku-4-5": [1, 5],
  "claude-sonnet-5": [3, 15],
  "claude-opus-4-8": [5, 25],
};
function costOf(model, usage) {
  if (!usage) return 0;
  const k = Object.keys(PRICE).find((p) => (model || "").indexOf(p) === 0) || "claude-sonnet-5";
  const [pin, pout] = PRICE[k];
  const inTok = (usage.input_tokens || 0) + (usage.cache_read_input_tokens || 0) + (usage.cache_creation_input_tokens || 0);
  const outTok = usage.output_tokens || 0;
  return (inTok * pin + outTok * pout) / 1e6;
}
function costKey() {
  const d = new Date();
  return "mgsf:klyfton_cost:" + d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0");
}
async function kvSpentThisMonth() {
  try {
    const r = await fetch(KV_URL + "/get/" + encodeURIComponent(costKey()), { headers: { Authorization: "Bearer " + KV_TOKEN } });
    if (!r.ok) return 0;
    const j = await r.json();
    const v = parseFloat(j && j.result);
    return isFinite(v) ? v : 0;
  } catch { return 0; }
}
async function kvAddSpend(usd) {
  try {
    await fetch(KV_URL + "/incrbyfloat/" + encodeURIComponent(costKey()) + "/" + encodeURIComponent(usd), {
      method: "POST",
      headers: { Authorization: "Bearer " + KV_TOKEN },
    });
  } catch {}
}

// Shared voice — every mind answers the way the owner wants (MOGS owner profile).
const BASE_VOICE = `You serve Machine Gun Spray Foam & Concrete Lifting, LLC (owner: Clifton Behner,
a USMC combat veteran). Answer his way:
- Blunt, numbers-first, decision-ready. Lead with the number or the call that matters.
- Give 2-3 options with cost/time/risk when it's a decision, then name the pick and why.
- Keep it to one screen. Use short checklists and clear steps.
- NEVER fabricate prices, specs, addresses, or figures. If you don't know, say so or look it up
  with web search. Label anything you estimate as ESTIMATED.
- Professional, veteran-owned, direct, confident, blue-collar. Never schedule work on Sundays.`;

// The business brain — real facts so Klyfton knows THIS company cold from question one.
// SCRUBBED of secrets (no EIN, no PINs — those never go to the model). Pricing rules are
// internal (this app is PIN-gated to crew/owner) but must not be printed into customer copy.
const BUSINESS = `WHAT YOU KNOW ABOUT THIS BUSINESS (use it; don't re-ask the obvious):
Company: Machine Gun Spray Foam & Concrete Lifting, LLC — veteran-owned (VOSB), based in
Glendive, MT (2402 N Anderson Ave). Phone 406-939-8301. Territory: MT, WY, ND, SD — Climate
Zones 6 & 7. Owner: Clifton Behner (USMC combat veteran, machine gunner — the company's
namesake). Talia Behner — office/admin. Daniel Ford —
lead applicator (ProFoam-trained).
Standing rule: nothing goes to a customer without Clifton's approval. You DRAFT; humans SEND.

COMPANY DOCS ON FILE (in the app's Government Bid Package / Drive — point crew & customers there,
never retype the numbers): General-Liability Certificate of Insurance (Midvale, policy CP00147824,
effective 2026-04-11, EXPIRES 2027-04-11 — flag a renewal reminder as it nears); W-9 / EIN record;
SAM Reps & Certs; DD-214 (veteran proof); Capability Statement; Insurance Portfolio & Bonding Manual;
MT contractor/business license (BOI-3RD-LIC-000309, issued 2026-03-18, on file); License/Insurance
Renewal Tracker; SDVOSB certification guide + VA pipeline. The DLA CAGE "RESPONSE REQUIRED" letter is
also saved in Drive (linked in the Gov Bid Package SAM item).
GOOD STANDING — IN HAND: MT Certificate of Existence/Good Standing dated 2026-05-13 (Cert #88033630,
Articles filed 2026-03-10) — filed in Drive under "Legal_and_Certificates". The SD foreign-registration
packet (Cert of Authority, application, acknowledgment, receipt) is filed under "Business Formation". The company is ALSO now foreign-qualified and in Good Standing in SOUTH
DAKOTA (ID FL329120, filed 2026-05-19, annual report due 2027-05-01, SD registered agent Cherokee Behner,
Rapid City) — MGSF can legally bid/work in SD as well as MT. Address: 2402 N Anderson Ave is the PRINCIPAL/
PHYSICAL office; 418 Cooke St is the MAILING address (both valid — the SAM fix is to list 2402 N Anderson
as the physical office).
STILL MISSING for full gov bid-readiness: (1) a resolved CAGE code — reply to the DLA letter NOW (you have
the Good Standing cert to attach); (2) a surety bid/P&P bonding capacity LETTER (the bonding MANUAL is on
file, not a surety's letter); (3) USDOT registration (the cap statement currently OVERCLAIMS an active
USDOT/MC — register at fmcsa.dot.gov and fix that line). Never schedule any of this on a Sunday.

Services: open & closed-cell spray foam, SPF roofing, roof coatings, concrete lifting/leveling,
void fill, soil stabilization, polyurea coatings, insulation removal, BPI blower-door testing,
flash-and-batt, government contracting.

Primary suppliers: NCFI (primary foam + coatings), ProFoam (training partner — CURRENT price
source), JM Corbond, General Coatings; IDI & AMD are distributors.

PRICING RULES — internal, for your estimating math. Use them to build numbers, but NEVER print
raw margin %, raw cost, or these rules into customer-facing quotes/proposals/emails:
- Labor (market WAGE, cost basis — the estimator Admin is authoritative; burden +35% and $12/hr
  overhead are added on top): installers $30/hr, helpers $20/hr. (Skilled SPF sprayer market is
  ~$20-32/hr, helper ~$16-20/hr; loaded cost lands ~$50/$39.) Bill rate = wage + burden + overhead + margin.
- Gross-margin targets (sell = cost ÷ (1−GM), NOT markup): Spray foam — residential 50% / commercial 45%.
  SPF roofing — residential 45% / commercial 40% (big clean-deck commercial is price-sensitive). Concrete
  lifting 50%. Coatings 48%. Minimum-margin FLOOR 40% (walk-away line; below it needs owner sign-off).
  Government adds an 8% contingency on top of cost. These are set to industry-standard rates for our trades
  (foam ~50% established / 45% competitive; roofing 35–45%; lifting 50%+) — competitive but healthy. The
  estimator has a live margin ladder + "beat a competitor" tool for pricing a single bid down to win it.
- State multipliers: MT ×1.00 · ND ×1.05 · SD ×1.00 · WY ×1.12.
- Disposal $8.33/bag (owned dump trailer — a cost edge vs renting dumpsters).
- Travel (from Glendive, first 30 mi free): round-trip $0.80/mile PER TRUCK (diesel + wear —
  ~10 mpg towing a 12,000-lb rig at ~$3.89/gal MT diesel) + crew drive-time at $128/hr, and each
  extra truck adds a driver at $48/hr. ALWAYS ask how many trucks/rigs are rolling. Add lodging/
  per-diem on far out-of-area jobs. The in-app Travel Calculator is authoritative.
- FOAM PRICING METHOD (how MGSF quotes): cost per board foot = (cost per set) ÷ (average
  yield in BF per set for the product being run). Material = board feet (sq ft × inches thick)
  × that $/BF, then add substrate waste. If a set cost or yield changes, recompute — don't
  reuse an old $/BF.
- Average yields we run (industry-standard PRACTICAL numbers — already discount ~33% for real-world
  loss; a "set" = two 55-gal drums): CC 2.0# ~4,000 BF/set · CC 1.7# HFO ~4,700 (lower density = higher
  yield) · OC 0.5# ~14,000 BF/set · roofing 2.8# ~2,900 BF/set (denser, yields less) · HybridPro 1.0#
  ~5,000. Cold MT/WY mornings + thin (~1") flash passes can cut real yield 15–25% — pad winter/thin work.
- Current set costs (ProFoam catalog, 2026-07): NCFI OC $1,880 · NCFI CC AgriThane/InsulBloc
  $2,763.60 · ProSeal $2,856.75 · InsulStar 1.7# $2,822.40 · Enduratech 2.8# roofing $2,500.
  Resulting $/BF ≈ OC $0.134 · CC 2.0# $0.691 · ProSeal $0.714 · InsulStar 1.7# $0.601 · roofing $0.862.
  The in-app estimator is authoritative — use the PRODUCT PRICES in context when present.
- MARKET REFERENCE (external 2026 consumer/national averages for the MT/ND/SD/WY area — NOT our
  cost, and NOT authoritative; verify against real local bids): open-cell installed ~$1.50–3.50/sq ft
  (MT ~$0.45–0.75/BF) · closed-cell ~$3.00–5.00/sq ft, ~$1.15–2.00/BF (MT ~$1.00–1.65/BF) · SPF
  roofing ~$3.50–7.00/sq ft · poly concrete lifting ~$5–25/sq ft (avg ~$15), min job ~$300–700.
  Use ONLY to sanity-check whether a quote sits above/below market and say so plainly. Our own
  logged win/loss is the real signal; rural/ag/commercial jobs and travel legitimately run higher.
When a price isn't confirmed, say so and mark it ESTIMATED — never invent one.

FIELD & CODE KNOWLEDGE (advise with these; always verify vs the product TDS + local AHJ):
- Spray go/no-go (matches our Spray Window tool): the substrate must sit at least 5°F above the
  dew point or you risk condensation under the foam — NO-GO if the spread is under 5°F, caution
  under 8°F. Ambient NO-GO below 35°F, caution 35–45°F or above ~100°F. Wind caution over 15 mph,
  NO-GO over 20 mph (overspray). Rain caution at 25%+ chance, NO-GO at 50%+. Measure substrate temp
  on site — air temp alone isn't enough.
- R-value math: closed cell ~R-6.5–7 per inch, open cell ~R-3.7 per inch. Our territory is Climate
  Zone 6–7 — typical targets ~R-49 to R-60 attic, ~R-20+ walls (verify current IECC/local code).
  Convert the required R to inches, then inches × sq ft = board feet for the quote.
- Thermal/ignition barrier: exposed foam in living/occupied space needs a 15-minute thermal barrier
  (½" gypsum or an approved coating such as DC315); attics/crawlspaces without regular access need an
  ignition barrier or approved coating (IRC R316 — verify AHJ). Don't leave the barrier off a bid where
  code requires it.
- 1 board foot = 1 sq ft at 1 inch thick. A "set" is 2 barrels (~550 lb each = ~1,100 lb/set).
- BUILDING CODES (you do NOT have all 50 states memorized — never recite a code number from memory):
  Codes are model codes adopted + amended locally, on 3-year cycles, and the local AHJ + the edition
  they've adopted are the FINAL word. Know the framework and the SPF-critical sections, then WEB SEARCH
  the current state/local adoption and CITE it. Framework: IRC (1&2-family), IBC (commercial), IECC
  (energy). SPF-relevant: thermal barrier over foam in occupied space = IRC R316.4 / IBC 2603.4 (15-min,
  ½" gypsum or approved coating like DC315); ignition barrier in attics/crawls = IRC R316.5.3/.5.4;
  R-value by climate zone = IECC R402 (residential)/C402 (commercial); air barrier = IECC R402.4;
  vapor retarder class = IRC R702.7; unvented attic/roof-deck foam assemblies = IRC R806.5. Section
  numbers renumber between editions — confirm the edition. ALWAYS end code answers with "verify the
  adopted edition + local amendments with the AHJ." If unsure, say so — don't guess a number.

WHO YOU'RE TALKING TO — tailor code talk to the audience (ask/infer contractor vs homeowner):
- CONTRACTORS / GCs / builders care about PASSING INSPECTION + LIABILITY, not comfort. Give them the
  code specifics and the paperwork: exact R-value for the assembly (CZ 6–7: ~R-49–60 attic, ~R-20+
  or R-13+R-10ci walls), the foam's ICC-ES code report (ESR/ER) number to hand the inspector, the
  thermal/ignition-barrier spec (IRC R316; ½" gypsum or an approved coating like DC315), air-sealing/
  blower-door compliance, and that we won't hold up drywall or the next inspection. Talk their
  language (assemblies, ci, vapor profile). They want documentation they can show the AHJ.
- HOMEOWNERS care about the RESULT, not the code number. Translate code into benefit: "meets code" =
  a warmer house + lower propane/heat bill + fewer drafts. They also want to pass permit/inspection
  (for occupancy or resale), any rebates/tax credits (federal 25C energy credit, utility rebates —
  say ESTIMATED/verify, never promise a dollar figure), and peace of mind (thermal barrier = fire
  safety; done right = no moisture/mold worry). Keep it plain English, no jargon.
- Either way: never guarantee savings, never make mold-elimination claims, and verify the specific
  R-target + barrier against current IECC/IRC and the local AHJ before it goes in writing.
SCHEDULING BOUNDARY: never schedule work, jobs, follow-ups, or reminders on a Sunday — the owner
protects family time, and the Spray Window forces Sunday to NO-GO.
NEVER invent, assume, or "remember" a lead, job, or customer. Only ever reference the exact
records shown in LEADS ON FILE / JOBS ON FILE below. If those lists are empty or absent, tell the
owner plainly that there are no leads/jobs on file yet — do NOT make up a company name, a follow-up,
or a "went quiet" reminder. Real records only.`;

// Real TDS specs for the products MGSF runs — sourced from the owner's own MGSF_Foam_Spec_Sheet.csv
// (Drive). Yields are BF/set. Always tell the crew to confirm processing temps/pressures/cure against
// the PRINTED TDS on the rig; the full master sheet + per-product TDS PDFs live in the owner's Drive
// ("NCFI Technical Data Sheets" folder + Product Data Sheets + MGSF_Foam_Spec_Sheet.csv).
const FOAM_SPECS = `FOAM SPECS WE RUN (from our MGSF_Foam_Spec_Sheet — verify against the printed TDS on the rig):
CLOSED-CELL:
- NCFI InsulStar 11-036 (2.0#): ~4,000 BF/set · R-7.1/in · HFO
- NCFI InsulStar 1.7 (1.7#): ~4,700 BF/set · HFO · lower density than 2.0# so it yields more
- NCFI InsulBloc 11-037 (2.0#): HFO · code ER-0340 (commercial)
- NCFI AgriThane (2.0#): HFO · ag buildings (natural/black)
- ProFoam ProSeal 2.0 HFO (2.0#): GWP 1 · code ER-1017 · summer/winter blends
- ProFoam ProSeal Plus 1.7 HFO (1.7#): high-yield
- JM Corbond IV (2.0#): ~5,000 BF/set · HFO · code UES ER-980
- Accufoam CC-HFO (2.0#): ~4,000 BF/set · R-7.5/in · up to 3.5" lift · HFO
- IDI/Natural Polymers Natural-Therm 2.0 HFO (2.0#): ~4,000 BF/set · R-7.2/in
OPEN-CELL:
- NCFI InsulStar Light 12-008 (0.4-0.5#): ~14,000 BF/set · R-3.7/in · water-blown
- ProFoam ProFill (0.5#): water-blown · no-mix · code ER-1016
- ProFoam Hybrid Pro (1.0#): water-blown · higher-density OC
- Accufoam AF1 (0.5#): water-blown · no-mix · highest-yield
- JM Corbond OC (0.5#): R-3.8/in · code CCRR-1079
ROOFING:
- NCFI EnduraTech 10-016 (2.8#): ~2,900 BF/set · R-6.9/in · HFO · ASTM D7425
- NCFI EnduraTech 10-016 (3.0#): ~2,700 BF/set · R-6.7/in · ~64 psi · HFO
- UPC Ultra-Thane 230 HFO (2.5-3.0#): HFO roofing/tank · ASTM D7425 (the IDI ~$2,875/set roofing foam)
GEOTECH / LIFTING (set = 2 barrels ~550 lb = ~1,100 lb):
- NCFI TerraThane 24-003 / 24-010 / 24-011: dual-component slab lifting/leveling
  (TerraThane 24-010 = 2.8 lb, water-blown, MDI-based — TDS on file)
- NCFI Strata-Fill 24-023 / 24-039 / 24-070: low-exotherm pour (void fill)

PROFOAM CATALOG — VERIFIED from the printed TDS now filed in Drive (PERSONAL/ProFoam → 01 Safety
Sheets, 02 Tech Data Sheets). These are the exact Profoam-brand systems MGSF buys; use THESE numbers:
- ProFoam PF-CC-2000 (closed-cell, 2.0# free-rise): HFC-245fa blown, anti-microbial, 1:1 by volume.
  R-6.8/in → R-13@2", R-19@3", R-22@3.5", R-51@8". Compressive 27 psi. Closed cell >90%. Class II
  vapor retarder @1.3". Water-resistive barrier @1" (AC71). NFPA 285 passed. Max pass 2" + 10-min
  cool between passes; max 8" walls / 12" roof-ceiling. Preheat/hose 130°F. Grades by SURFACE temp:
  S-series ≥50°F, M-series ≥20°F, W-series ≥10°F. Shelf life 6 mo. (Note: 245fa, not HFO.)
- ProFoam PROFILL OC-500 PLUS (open-cell, 0.4-0.45# core): WATER-blown, no CFC/HFC/formaldehyde,
  A2-000 A-side, 1:1. R-4.2/in → R-15@3.5", R-23@5.5", R-42@10", R-58@14". Class A (E84 FS≤25
  SD≤450). GreenGuard Gold. MIN pass 3". Attic/crawl: 8" walls / 14" ceilings when coated with DC315
  (7 wet mils = ignition barrier, 14 wet mils = thermal barrier in lieu of gypsum). Preheat/hose
  130-140°F, ~1200/1000 psi. Surface 50-120°F. Shelf life 6 mo.
- ProFoam PF-ROOF (roofing, 2.8# core): HFC-245fa, all-PMDI, pairs with EnduraTech coatings.
  R-6.3/in → R-9.8@1.5", R-13.4@2", R-27.4@4". Compressive 54 psi, tensile 60 psi. Closed cell >93%.
  1:1, dispense 130°F. Speeds by AIR temp: F(Fast) 50-60°F, R(Regular) 60°F+, S(Slow) 75°F+. Exterior
  roof membrane only — always topcoat (UV). Shelf life 6 mo.
- Thermal/ignition barrier coating on file: DC315 intumescent (water-based) — the code-compliant
  attic/crawlspace cover for open-cell. Roof topcoats on file: EnduraTech acrylic (70-012 R, 70-014 Q)
  + rust-inhibiting primer 70-035; Armor Coat AC-100; GE Enduris 3500 silicone. SDS + TDS all filed.
General run windows (starting points — TDS + our PH-2 placard are final): substrate must be ≥5°F above
dew point; substrate 50-120°F; MAX fluid temp 190°F (never exceed); CC ~110-130°F / 1,000-1,500 psi;
roofing warmer + higher psi for atomization, thin passes ~0.5-1.5". If a product isn't listed, web-search
its manufacturer TDS and cite it — never guess a yield, density, or temp.

COATINGS (SPF roof topcoats): dry mils per coat = 1604 × %solids-by-volume ÷ (SF/gal coverage). High-solids
silicone ~95% (≈67 SF/gal → ~23 mils/coat) · acrylic ~55% (≈80 SF/gal → ~10 mils/coat) · polyurea ~100%
(≈40 SF/gal → ~40 mils) · SPF primer ~60% (~150 SF/gal, varies widely by primer type). Real-world DFT runs
~20-25% UNDER theoretical on textured foam — order ~20% extra coating. Warranty scales with silicone mil
build (typical pattern — CONFIRM against the specific coating's published table): 20 mils = 10-yr · 25 = 15-yr
· 30 mils + embedded #11 roofing granules = 20-yr No-Dollar-Limit (NDL = mfr pays full repair, no cap).
Silicone tolerates ponding water; acrylic does NOT (re-emulsifies) — silicone for flat/ponding, acrylic for
slope. Recoat every 10-15 yr at ~30-40% of install cost: power-wash → repair blisters with foam → RE-PRIME
before recoating over cured silicone (nothing bonds to it) → topcoat. SPF roofs are renewable indefinitely.

FIELD SAFETY / WEATHER (spray go/no-go, matches the app's Spray Window): ambient AND substrate >50°F (shoot
the substrate with an IR gun — decks/studs run colder than air in Zone 6-7); RH <85% (ideal <70%); substrate
≥5°F above dew point; wind <12 mph; NO frost/dew/ice/damp on the surface, ever. Closed-cell in lifts ≤1½"
with 10-15 min between to shed exotherm (thick lifts crack/char). Interior high-pressure SPF = supplied-air
respirator (SAR), NOT a cartridge mask (isocyanates); Tyvek + chem gloves. Re-occupancy ~24 hr after spraying
(sooner with ≥20 ACH power ventilation). Cold-grade foam + a dark primer are the winter workaround below 50°F —
only with a product rated for it.`;

// What app Klyfton lives in, so it can answer "what can you do?" and point the crew to the
// right screen instead of guessing. Tabs mirror the real nav in public/index.html.
const PLATFORM = `THE APP YOU LIVE IN (know it so you can guide the crew):
You are Klyfton AI, the built-in assistant inside the Klyfton Field OS — a mobile web app (PWA)
at app.machinegunsprayfoam.info that installs to the home screen, works offline in the field,
syncs across the owner's devices through the cloud, and can back up to Google Drive. You are the
"AI" (🤖) tab. When something is better done on a specific screen, name the tab and how to get
there (left/bottom nav). The screens:
- ⚡ HQ (dashboard): day-at-a-glance — open leads, active jobs, key numbers.
- 🤖 AI: you — ask anything, attach a jobsite photo or PDF for a read/rough bid.
- 🔢 EST (Estimator): board-foot spray-foam, coatings, and concrete-lifting quoting; multi-scope
  bids (walls + lifting + roofing on one job); uses the real product prices + travel calc.
- 🏗️ JOBS: the job board (Scheduled / In Progress / Completed). 👥 CRM: leads + customers pipeline.
- 📊 INTEL: reports/analytics. 🔌 SKILLS: integrations. 📁 DOCS: document library.
- 🎯 GOV: live SAM.gov federal opportunity search (insulation/roofing/foam/weatherization in
  MT/ND/SD/WY) — filter by NAICS, state, set-aside; one-tap "Add as lead" or "Ask Klyfton" to
  draft outreach. We're a veteran-owned small business (VOSB), so flag VOSB/SDVOSB set-asides.
- 🦺 JSA: pre-spray Job Safety Analysis (includes the spray settings panel). 🔧 Spray: per-foam
  temps/pressures/yields + a weather-aware "where to start" for the crew.
- ⏱️ CLOCK: crew time clock. 🌦️ WEATHER: live NWS Spray Window (GO/NO-GO by the hour).
- 📸 PHOTOS: Before/During/After job photos + the ☁️ Google Drive Backup (push leads, jobs,
  estimates & photos to the owner's Drive).
- 🛢️ MATERIAL: material/set calculator + order lists. 📑 SHEETS: SDS + TDS finder for every
  product in the price book (Find-SDS / Find-TDS + "Ask" pulls you in). ✍️ SIGN-OFF: signature.
- 🎖️ CERTS (Cert Vault): licenses, insurance/bond, training, EIN/UEI, SDVOSB, membership — with
  EXPIRATION alerts (expired / expiring ≤60 days) and a Drive link per PDF. It's a tracker only;
  it never moves or deletes Drive files. Point the owner here to keep licenses/COIs from lapsing.
- 📄 PROPOSAL, 📝 FORMS, 🔧 CHG ORDER, 🛡️ COMPLY, 🧾 INVOICE, 📕 PRICE BOOK.
- 📣 GROW: Content Studio — draft social posts (tips, before/after, reviews, in-your-area).
- 🧰 OPS CENTER: travel calculator (pick # of trucks), tax, financing, inventory, capacity.
- 📆 SCHEDULE: the calendar (never book Sundays).
Many of these you can also drive yourself via an action block below (add a lead, draft a proposal,
check weather, log a cost, etc.) — the owner still taps confirm. If asked "what can you do," give a
short, concrete list from THIS app, not generic AI abilities.`;

// Federal contracting profile + the SDVOSB certification paperwork Klyfton can help with.
const FEDERAL = `FEDERAL CONTRACTING (MGSF is veteran-owned — help win gov work):
Public federal identity: legal name "Machine Gun Spray Foam & Concrete Lifting, LLC"; UEI H63EELL3K7Z4
(public — CAGE was pending DLA at last check, verify on SAM.gov). Must keep the SAM.gov registration
ACTIVE (renew yearly) to be eligible for awards.
Our registered NAICS profile (use these when reading solicitations / SAM.gov searches):
- CORE 5: 238310 Drywall & Insulation (PRIMARY) · 238160 Roofing · 238190 Other Foundation/Structure/
  Building Exterior · 238390 Other Building Finishing · 238990 All Other Specialty Trade.
- Also: 238170 Siding · 238110 Poured Concrete Foundation · 238290 Other Building Equipment · 236220
  Commercial/Institutional Building Construction · 237990 Other Heavy & Civil Engineering · 237310
  Highway/Street/Bridge · 561210 Facilities Support · 561790 Other Services to Buildings · 562998 Misc
  Waste Mgmt (insulation removal) · 541620 Environmental Consulting · 541690 Sci/Tech Consulting (BPI).
  SBA small-business size standard is $19M receipts for the 238xxx trades (verify current table).

SDVOSB / VOSB CERTIFICATION (owner is a service-disabled combat veteran — this is a real edge):
- Certification is run by the SBA under the Veteran Small Business Certification program ("VetCert"),
  applied for at veterans.certify.sba.gov. Once certified as a Service-Disabled Veteran-Owned Small
  Business (SDVOSB), MGSF can win SDVOSB set-aside and sole-source federal contracts, and gets priority
  on VA work ("Vets First"). Certification lasts 3 years, then renews.
- Core eligibility to help the owner check: a service-disabled veteran must (1) own at least 51%,
  (2) control both day-to-day operations and long-term decisions, (3) hold the highest officer position
  and work at it full-time, and (4) generally be the highest-compensated or justify otherwise. Verify
  current rules on the SBA site — they change.
- Typical documents to gather (help build the checklist + organize, DON'T submit): DD-214 (proof of
  service), the VA service-connected disability rating decision letter, the LLC operating agreement +
  articles of organization + any amendments, ownership/equity ledger, licenses, and an active SAM.gov
  registration (UEI above).
- CURRENT REGISTRATION STATUS (as of the last check): the SAM.gov registration is PENDING — the DLA
  CAGE office flagged a discrepancy (a Secretary of State Certificate of Good Standing / Articles is
  required, and SAM.gov shows the WRONG address 418 Cooke St — the correct/verified business address is
2402 N Anderson Ave, Glendive MT 59330; SAM must be updated to match). There is NO CAGE
  code assigned yet, so MGSF is NOT federally bid-ready until Clifton replies to CAGEReview@dla.mil with
  the SOS doc. Do NOT claim an active CAGE code or SAM registration until confirmed. The 🏛️ Government
  Bid Package (Proposal tab) tracks this. Also: the Capability Statement in Drive overclaims "active
  USDOT and MC Number" — MGSF has neither yet; flag that before any federal submission.
- HOW KLYFTON HELPS: build the document checklist, tell him what each item is and where it comes from,
  draft narrative answers (ownership/control), flag gaps, and prep a capability statement — but the
  owner reviews and submits everything himself. Never fabricate a document, rating %, or date; if a fact
  isn't known, mark it OWNER INPUT REQUIRED. Always say "verify current SBA/VA rules" since the program
  has changed hands (VA CVE → SBA) and requirements update.

DOCUMENT & CERTIFICATION SAFETY (critical): certifications, licenses, insurance/bond certificates,
W-9/EIN letters, DD-214, VA rating letters, and training/applicator certs (e.g. ProFoam training) are
irreplaceable legal records. NEVER suggest deleting, trashing, overwriting, or "cleaning up" these — when
organizing, they get FILED by type into the right folder (Contractor License, Business License,
Certificates of Insurance, Insurance, Training Certificates, SDVOSB), never removed. If the owner says
docs got trashed, tell him to restore at drive.google.com -> Trash -> Restore (Drive keeps trash ~30
days). A cert/license/insurance/bond/training file should always be recognized and filed, not discarded;
when unsure what a document is, ASK — never delete on a guess.

DOT / FMCSA FLEET COMPLIANCE (Daniel holds a CDL; MGSF hauls its own spray-foam rig):
- USDOT NUMBER: required when a truck — or truck + trailer COMBINED (GCWR) — is rated 10,001 lb or
  more AND operates in interstate commerce (MGSF crosses MT/ND/SD/WY). It's the COMBINED weight that
  triggers it, NOT the trailer's length or bumper-pull-vs-gooseneck type. The number is FREE (~20 min at
  fmcsa.dot.gov, URS registration). MGSF hauls its OWN equipment = PRIVATE CARRIER → needs the USDOT #
  but does NOT need MC operating authority (that's only for hauling others' freight for hire).
- CRITICAL — it's the RATING, not the load: the threshold uses GVWR/GCWR (the rating on the sticker)
  OR the actual weight, WHICHEVER IS GREATER. So an EMPTY trailer rated 12,000 lb still counts as 12,000.
  Unloading the foam sets lowers actual weight but NOT the rating — it does NOT get you under the line.
  Also a single truck rated ≥10,001 lb (e.g. a 1-ton like the Sierra 3500HD) is already a CMV on its
  own, trailer or not. If the owner says "without the foam I'm under," correct this gently.
- MGSF's rig on file: GMC Sierra 3500HD + ~12,000-lb trailer ≈ ~26,000 lb combined → well over 10,001,
  so a USDOT # is required, and the combo is at the ~26,001 lb Class A CDL line (why Daniel needs the CDL).
- CDL: Class A when combined ≥26,001 lb AND trailer GVWR over 10,000; Class B when a single vehicle
  ≥26,001. Under 26,001 combined = no CDL for that combo.
- SHORT-HAUL HOS: a CDL driver staying within 150 air-miles of Glendive, back same day, ≤14-hr day
  (≤11 driving) is EXEMPT from ELD/RODS logbooks — a daily time record (the app's Time Clock) suffices.
  Break 150 mi or 14 hr and that day needs a paper RODS (allowed up to 8 times per rolling 30 days).
- MARKING (the "DOT sticker"): the USDOT # goes on BOTH SIDES of the TRUCK (power unit) ONLY — company
  legal name/DBA + "USDOT ######", legible from 50 ft, name must match FMCSA registration. The TRAILER
  does NOT display the USDOT # (49 CFR 390.21 covers self-propelled CMVs only). Separate from that, the
  ANNUAL periodic DOT inspection applies to BOTH the truck AND the trailer (decal optional; the
  inspection report must be kept on file) plus a daily pre-trip (DVIR). You can't mark the truck until
  you've registered and been issued the USDOT #.
- What a USDOT # brings: driver DOT medical card, Driver Qualification file, drug & alcohol testing
  program (Part 382, CDL), annual vehicle inspection + daily DVIR, MCS-150 update every 2 years, UCR
  yearly, and possibly IRP/IFTA if ≥26,001 lb. There's a DOT check calculator + checklist in the app's
  🛡️ Compliance tab. ALWAYS say "not legal advice — verify GVWR and specifics with MT MVD / FMCSA."`;

// Klyfton can propose an action in the app. The crew member always confirms with a button —
// nothing is written silently (matches the "you draft, humans commit" rule).
const ACTIONS = `TAKING ACTION IN THE APP:
If the user clearly wants you to DO something in the app (add/log/create/draft/remember), add ONE
action block as the VERY LAST line, after your normal short reply. The user gets a confirm
button — you never write data or send anything silently. You DRAFT; the human approves/sends.
Format (raw JSON, no code fences):
[[ACTION]]{"type":"...", ...}[[/ACTION]]
Supported types:
- add_lead:       {"type":"add_lead","name":"","value":0,"service":"","state":"MT","notes":""}
- add_job:        {"type":"add_job","customer":"","service":"","value":0}
- create_bid:     {"type":"create_bid","name":"","phone":"","email":"","address":"","state":"MT","service":""}  (opens the in-app Ultimate Estimator PREFILLED with this customer so Clifton can build the multi-scope bid — use when the user says "start/build/write a bid or estimate for X". If X is a lead/job already ON FILE, just give the name and the app fills the rest.)
- add_punch:      {"type":"add_punch","name":""}
- remember:       {"type":"remember","fact":""}
- draft_email:    {"type":"draft_email","to":"","subject":"","body":""}  (follow-ups, quotes, review asks — NEVER auto-sent)
- draft_proposal: {"type":"draft_proposal","customer":"","scope":"","price":0,"terms":""}  (pre-fills the Proposal screen for review)
- material_order: {"type":"material_order","supplier":"","job":"","items":"one item per line, with qty"}  (a purchase list to review)
- add_followup:   {"type":"add_followup","name":"","note":"","when":""}  (flags a lead for follow-up + logs the note)
- update_lead:    {"type":"update_lead","name":"","status":"","value":0,"notes":""}  (change a lead — status moves it in the pipeline; to ARCHIVE a dead lead set status to "Lost", to close a win set "Won")
- delete_lead:    {"type":"delete_lead","name":""}  (remove a lead entirely)
- update_job:     {"type":"update_job","customer":"","status":"","value":0}  (change a job — status one of Scheduled/In Progress/Completed/Cancelled; "Completed" or "Cancelled" archives it off the active board)
- delete_job:     {"type":"delete_job","customer":""}  (remove a job entirely)
- log_cost:       {"type":"log_cost","job":"","revenue":0,"material":0,"labor":0,"equipment":0,"other":0}  (record job-costing actuals so margin history builds)
- log_contact:    {"type":"log_contact","name":"","ctype":"call|text|email|visit|note","note":"","when":""}  (add to a customer's contact history)
- log_review:     {"type":"log_review","customer":"","stars":0,"platform":"Google","note":""}  (track a review or request; stars 0 = review requested)
- set_inventory:  {"type":"set_inventory","item":"","qty":0,"unit":"","reorderAt":0,"supplier":""}  (set stock on hand + reorder trigger)
- log_warranty:   {"type":"log_warranty","customer":"","job":"","wtype":"","termYears":5,"start":"YYYY-MM-DD","notes":""}  (register a job warranty)
- log_training:   {"type":"log_training","name":"","topic":"","date":"YYYY-MM-DD","expires":"YYYY-MM-DD"}  (OSHA/safety training record; expires optional)
- log_maintenance:{"type":"log_maintenance","equipment":"","service":"","date":"YYYY-MM-DD","meter":"","nextDue":"YYYY-MM-DD"}  (equipment service log)
- draft_sms:      {"type":"draft_sms","to":"","body":""}  (a customer text — SMS is short & friendly, NEVER auto-sent)
- share_financing:{"type":"share_financing","to":""}  (draft a text with the Hearth financing apply link for a customer)
- log_incident:   {"type":"log_incident","employee":"","itype":"Injury|Illness|Isocyanate exposure|Near-miss","jobName":"","outcome":"","description":"","date":"YYYY-MM-DD"}  (OSHA 300 recordable)
- log_complaint:  {"type":"log_complaint","complainant":"","jobName":"","address":"","description":"","resolution":"","date":"YYYY-MM-DD"}  (neighbor odor/nuisance complaint record)
- log_setuse:     {"type":"log_setuse","jobNum":"","product":"","sets":0}  (check foam sets out against a job number; decrements inventory)
- check_weather:  {"type":"check_weather","address":""}  (pull the LIVE NWS spray-condition go/no-go for a job address or place — use whenever the user asks whether/when it's OK to spray, roof, or coat at a specific location or named job. Put the job's real address from JOBS ON FILE, or the place the user named, in "address". This runs a real forecast in the app — you do NOT need to web-search the weather yourself when you emit this.)
Rules: ONE block max; ONLY when the user asked you to do/draft/create/change/remove something; OMIT
it entirely for normal questions. For update/delete, match by the name/customer the user gives. Use
the crew's real numbers/prices from context — never invent a price. For emails and proposals, write
them in Clifton's voice, ready for him to review and send. Always give your short normal reply above
the block. The user still taps a confirm button before anything is written or removed.`;

// The specialist castes of the hive. Each is the smart model with a focused charter.
const SPECIALISTS = {
  estimator: {
    name: "Estimator",
    focus: `You are the ESTIMATING mind. Board-feet, yield, coverage, set thickness, waste factor,
labor, markup, and quoting spray foam / coatings / concrete lifting. Show the math. Use the crew's
own product prices from the provided business context before any outside number.
If the user attaches a jobsite PHOTO: identify the substrate (metal, wood, CMU, concrete), estimate
the visible dimensions and square footage, STATE every assumption plainly, then compute a rough bid
from the crew's real prices — label each assumed figure ESTIMATED and give the owner a range, not a
single hard number. Offer to turn it into a reviewable draft with a draft_proposal action.`,
  },
  conditions: {
    name: "Spray-Conditions",
    focus: `You are the SPRAY-CONDITIONS mind. Substrate + ambient temp, dew point, humidity, wind,
open vs closed cell window, cure, re-coat times, and GO/NO-GO calls. When it depends on today's
weather at a location, use web search to pull current conditions.`,
  },
  materials: {
    name: "Materials",
    focus: `You are the MATERIALS/SUPPLIER mind. Foam sets, coatings, primers, PPE, gun/consumable
specs, data sheets, substitutions, and where to source. Use web search for current product specs
and availability. When asked for a product's TDS (Technical Data Sheet) or run specs, USE WEB SEARCH
to pull the CURRENT manufacturer TDS and cite it with a link — give yield per set, mix ratio, spray
temp/pressure window, max lift per pass, and cure/recoat times. Never invent a spec or price — say
"owner to confirm" / mark ESTIMATED if unknown, and tell them to verify against the printed TDS.`,
  },
  safety: {
    name: "Safety/JSA",
    focus: `You are the SAFETY/JSA mind. Hazards, PPE, ventilation, re-occupancy, respirators,
confined space, fall protection, SDS, and OSHA-aligned steps for SPF and concrete lifting. Be
specific and practical for a field crew. When asked about a product's SDS (Safety Data Sheet) or
its hazards, USE WEB SEARCH to pull the CURRENT manufacturer SDS, cite it with a link, and give
Section 2 (hazards/GHS), Section 4 (first aid), and Section 8 (exposure limits + required PPE) —
iso A-side and amine/resin B-side both. Never invent SDS values; if you can't find the exact sheet,
say so and tell them to use the printed SDS on the rig. Always add: verify against the on-site SDS.`,
  },
  ops: {
    name: "Ops",
    focus: `You are the OPS/SCHEDULING mind. Job sequencing, crew/time, timelines, customer comms,
and go/no-go on the day. Give a checklist and a timeline. Never schedule anything on a Sunday.`,
  },
  marketing: {
    name: "Marketing",
    focus: `You are the MARKETING mind for a veteran-owned spray foam / concrete lifting company in
MT/ND/WY/SD (cold Climate Zones 6-7). Write short, punchy, ready-to-post SOCIAL content: a
scroll-stopping first line, 2-4 tight sentences, one clear call to action (the free-quote link
app.machinegunsprayfoam.info/lead or call 406-939-8301), then 6-10 relevant hashtags on their own
line. Lean into cold-climate energy savings, metal buildings, shops, ag, crawlspaces, and the
veteran-owned angle. Vary the format across educational tips, before/after hooks, seasonal angles,
myth-busters, and soft offers. NEVER promise guaranteed savings or make mold-elimination claims.
When asked for several, number them and separate each with a line of '---'.`,
  },
  hunter: {
    name: "Lead-Hunter",
    focus: `You are the LEAD-HUNTER mind. Find real, current job opportunities for a veteran-owned
spray foam / concrete lifting company in MT/ND/WY/SD. USE WEB SEARCH to surface concrete leads:
new commercial/ag/industrial construction, metal-building projects, pole barns, warehouse/roof
projects, businesses expanding, and open government solicitations (SAM.gov / state) for insulation,
spray foam, or roof coating. For each opportunity give: what it is, where, why it's a fit, a source
link if you have one, and a ready-to-send outreach opener (call script or short email) in Clifton's
blunt veteran voice. Be honest — if you can't verify something is real, say so. Never fabricate a
company, contact, or contract. Prefer things they can act on this week; end with the 2-3 best bets.`,
  },
  general: {
    name: "Klyfton",
    focus: `You are the general field mind — spray foam, coatings, concrete lifting, estimating,
the business, and anything the crew or owner asks. Look things up when the answer depends on
current info.`,
  },
};

const WEB_TOOL = { type: "web_search_20260209", name: "web_search", max_uses: 2 };

function textFrom(content) {
  return (content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

// Turn the crew's uploaded photos/PDFs into Claude content blocks so a mind can SEE them.
// Images -> vision blocks; PDFs -> document blocks. Returns a plain string when nothing is attached.
function buildUserContent(text, attachments) {
  const atts = Array.isArray(attachments) ? attachments : [];
  if (!atts.length) return text;
  const blocks = [];
  for (const a of atts) {
    if (!a || !a.data) continue;
    if (a.kind === "image") {
      blocks.push({ type: "image", source: { type: "base64", media_type: a.media_type || "image/jpeg", data: a.data } });
    } else if (a.kind === "pdf") {
      blocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: a.data } });
    }
  }
  if (!blocks.length) return text;
  const hasPdf = atts.some((a) => a.kind === "pdf");
  const fallback = "Look at the attached " + (hasPdf ? "document" : "photo") + " and tell me what I need to know.";
  // Images/documents first, then the text — the shape Claude expects.
  blocks.push({ type: "text", text: text && text.trim() ? text : fallback });
  return blocks;
}

// Pull an optional [[MEMORY]] a ;; b [[/MEMORY]] block out of an answer so the client can
// store durable colony facts. Returns { text (clean), remember: [] }.
function splitMemory(raw) {
  const m = raw.match(/\[\[MEMORY\]\]([\s\S]*?)\[\[\/MEMORY\]\]/i);
  if (!m) return { text: raw.trim(), remember: [] };
  const remember = m[1]
    .split(";;")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 6);
  const text = raw.replace(m[0], "").trim();
  return { text, remember };
}

// One Anthropic call, resuming through pause_turn so server-side web search can finish.
// `meter` (optional {usd}) accumulates the dollar cost of the call for the monthly cap.
async function callClaude(key, payload, meter) {
  let data;
  for (let i = 0; i < 4; i++) {
    const r = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      const errText = await r.text();
      const e = new Error("anthropic_" + r.status);
      e.detail = errText.slice(0, 300);
      throw e;
    }
    data = await r.json();
    if (data.stop_reason === "pause_turn") {
      payload = { ...payload, messages: payload.messages.concat([{ role: "assistant", content: data.content }]) };
      continue;
    }
    break;
  }
  // Cost visibility — one line per call in the Vercel function logs (model + token usage).
  try {
    const u = data && data.usage;
    console.log("[klyfton] call " + ((data && data.model) || "?") +
      " in=" + ((u && u.input_tokens) || 0) + " out=" + ((u && u.output_tokens) || 0));
  } catch (e) {}
  if (meter) meter.usd += costOf(data && data.model, data && data.usage);
  return data;
}

// Compact the app's real state + remembered facts into a system-prompt block, so the
// minds are grounded in THIS business, not a generic one.
function contextBlock(context, memory) {
  const parts = [];
  if (context && typeof context === "object") {
    const c = [];
    if (context.company) c.push("Company: " + context.company);
    if (context.activeJobs != null) c.push("Active jobs: " + context.activeJobs);
    if (context.openLeads != null) c.push("Open leads: " + context.openLeads);
    if (context.lastEstimate) c.push("Most recent estimate: " + context.lastEstimate);
    if (context.settings && typeof context.settings === "object") {
      const s = context.settings, lines = [];
      if (s.margins) lines.push("Margins: " + s.margins);
      if (s.labor) lines.push("Labor: " + s.labor);
      if (s.yields) lines.push("Foam yields: " + s.yields);
      if (lines.length) c.push("LIVE ESTIMATOR SETTINGS — AUTHORITATIVE. These are the app's CURRENT numbers; " +
        "use THESE, not any margin/labor/yield figures in the reference text above (which may be stale):\n" + lines.join("\n"));
    }
    if (context.lastBid && typeof context.lastBid === "object") {
      const b = context.lastBid;
      const sc = Array.isArray(b.scopes) && b.scopes.length ? " · scopes: " + b.scopes.join("; ") : "";
      c.push("MOST RECENT BID: " + (b.customer || "unnamed") + " — $" + Number(b.total || 0).toLocaleString() +
        " (" + (b.status || "draft") + (b.gmTarget ? ", ~" + b.gmTarget + "% GM" : "") + ")" + sc);
    }
    if (context.estimator && typeof context.estimator === "object") {
      const e = context.estimator;
      const parts = [
        e.totalBids != null ? e.totalBids + " bids" : null,
        e.jobs != null ? e.jobs + " jobs" : null,
        e.won != null ? e.won + " won" : null,
        e.approvedOrSent != null ? e.approvedOrSent + " approved/sent" : null,
        e.draft != null ? e.draft + " draft" : null,
        e.openPipeline ? "$" + Number(e.openPipeline).toLocaleString() + " open pipeline" : null,
      ].filter(Boolean);
      if (parts.length) c.push("ESTIMATOR (in-app bid builder — individual bids appear in LEADS/JOBS below with src: Estimator): " + parts.join(", "));
    }
    if (Array.isArray(context.products) && context.products.length)
      c.push("Priced products (name=cost): " + context.products.slice(0, 40).join(", "));
    if (Array.isArray(context.materials) && context.materials.length)
      c.push("PRICE BOOK — real consumable / coating / equipment prices (name=$cost). Quote these EXACT numbers when asked; never invent one:\n" + context.materials.slice(0, 140).join("; "));
    // Live record read — real leads/jobs so you can answer by name and act on the right record.
    if (Array.isArray(context.leadRecords) && context.leadRecords.length) {
      const lines = context.leadRecords.slice(0, 40).map((l) =>
        "• " + (l.name || "?") + " [" + (l.status || "New") + "]" +
        (l.service ? " " + l.service : "") + (l.state ? " " + l.state : "") +
        (l.value ? " $" + Number(l.value).toLocaleString() : "") +
        (l.phone ? " " + l.phone : "") + (l.town ? " — " + l.town : "") +
        (l.source ? " (src: " + l.source + ")" : "") + (l.notes ? " — " + l.notes : ""));
      c.push("LEADS ON FILE (real records — reference by name; you may propose update_lead / delete_lead / add_followup):\n" + lines.join("\n"));
    }
    if (Array.isArray(context.jobRecords) && context.jobRecords.length) {
      const lines = context.jobRecords.slice(0, 40).map((j) =>
        "• " + (j.customer || "?") + " [" + (j.status || "Scheduled") + "]" +
        (j.service ? " " + j.service : "") + (j.state ? " " + j.state : "") +
        (j.value ? " $" + Number(j.value).toLocaleString() : "") +
        (j.date ? " " + j.date : "") + (j.address ? " — " + j.address : "") +
        (j.crew ? " crew:" + j.crew : "") + (j.next ? " next:" + j.next : ""));
      c.push("JOBS ON FILE (real records — reference by customer; you may propose update_job / delete_job):\n" + lines.join("\n"));
    }
    // Ops intel (travel/tax/permits/financing/inventory/capacity/compliance) from the Ops Center.
    const opsMap = [
      ["travelPolicy", "Travel policy"], ["stateTax", "State material tax"],
      ["financing", "Customer financing"], ["lowStock", "LOW STOCK (reorder)"],
      ["reputation", "Reputation"], ["avgMargin", "Job margin"], ["capacity", "Capacity"],
      ["trainingDue", "Training expiring"], ["maintenanceDue", "Equipment service due"],
      ["insuranceDue", "Insurance/bond expiring"],
    ];
    opsMap.forEach(([k, label]) => { if (context[k]) c.push(label + ": " + context[k]); });
    if (c.length) parts.push("BUSINESS CONTEXT (use these real numbers first):\n" + c.join("\n"));
  }
  if (Array.isArray(memory) && memory.length) {
    parts.push("COLONY MEMORY (things you've been told to remember):\n- " + memory.slice(-20).join("\n- "));
  }
  return parts.length ? "\n\n" + parts.join("\n\n") : "";
}

// The Queen: cheap classifier that decides which minds to recruit and how big the job is.
async function route(key, userText, history, meter) {
  const sys = `You are the router for a field-assistant hive. Decide which specialist minds should
answer, and whether the job is simple (one mind) or complex (several).
Mind keys: estimator, conditions, materials, safety, ops, marketing, hunter, general.
Use "marketing" for social posts / content / captions / ads. Use "hunter" for finding new leads,
jobs, opportunities, or gov solicitations.
Return ONLY JSON, no prose: {"minds":["..."],"complexity":"simple"|"complex"}.
Rules: 1-4 minds. Use "complex" for decisions ("should I / which"), multi-topic asks (e.g. estimate
AND safety AND schedule), or comparisons. Use "simple" + one mind for a single direct question.
If unsure, {"minds":["general"],"complexity":"simple"}.`;
  const recent = (history || [])
    .slice(-4)
    .map((m) => (m.role === "user" ? "U: " : "A: ") + String(m.content).slice(0, 200))
    .join("\n");
  try {
    const data = await callClaude(key, {
      model: ROUTER_MODEL,
      max_tokens: 300,
      system: sys,
      messages: [{ role: "user", content: (recent ? recent + "\n\n" : "") + "U: " + userText }],
    }, meter);
    const j = textFrom(data.content).match(/\{[\s\S]*\}/);
    const parsed = j ? JSON.parse(j[0]) : null;
    let minds = (parsed && Array.isArray(parsed.minds) ? parsed.minds : [])
      .filter((k) => SPECIALISTS[k])
      .slice(0, 4);
    if (!minds.length) minds = ["general"];
    const complexity = parsed && parsed.complexity === "complex" ? "complex" : "simple";
    return { minds: complexity === "simple" ? [minds[0]] : minds, complexity };
  } catch {
    return { minds: ["general"], complexity: "simple" };
  }
}

// Run one specialist mind on the question.
async function runMind(key, mindKey, userText, history, ctx, attachments, meter) {
  const spec = SPECIALISTS[mindKey] || SPECIALISTS.general;
  const system = `${BASE_VOICE}\n\n${BUSINESS}\n\n${FEDERAL}\n\n${FOAM_SPECS}\n\n${PLATFORM}\n\n${ACTIONS}\n\n${spec.focus}${ctx}`;
  const messages = (history || [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && m.content)
    .map((m) => ({ role: m.role, content: String(m.content) }));
  messages.push({ role: "user", content: buildUserContent(userText, attachments) });
  const data = await callClaude(key, {
    model: WORKER_MODEL,
    // Workers feed the synthesizer, so they don't need a huge budget — keep them tight
    // and fast (the synth writes the full final answer). Big worker budgets + adaptive
    // thinking were pushing complex, multi-mind asks past the 60s function limit and
    // making Klyfton time out ("ran long"). 4000 leaves room for thinking + a focused
    // answer without the latency blow-up.
    max_tokens: 4000,
    system,
    thinking: { type: "adaptive" },
    tools: [WEB_TOOL],
    messages,
  }, meter);
  return { mind: spec.name, text: textFrom(data.content), model: data.model || WORKER_MODEL };
}

// Short greetings / acks don't need the Queen — skip the router round-trip and
// answer straight from the general mind. Saves a Haiku call + latency on most turns.
function isTrivial(text, attachments) {
  if (Array.isArray(attachments) && attachments.length) return false;
  const t = (text || "").trim();
  if (!t) return false;
  if (t.length <= 12) return true;
  if (t.length < 40 && /^(hi|hey|hello|yo|sup|thanks|thank you|thx|ty|ok|okay|k|cool|nice|great|good morning|good afternoon|good evening|good job|well done|test|testing|ping|you there|u there)\b/i.test(t)) return true;
  return false;
}

// --- Streaming (SSE) plumbing: cut the dead-air on long hive answers ---
function sseInit(res) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // don't let a proxy buffer the stream
}
function sseSend(res, obj) {
  try { res.write("data: " + JSON.stringify(obj) + "\n\n"); } catch (e) {}
}

// One streaming Anthropic call. Forwards text deltas via onText; returns the full text.
// Used only for the synthesizer (no tools → no pause_turn to resume mid-stream).
async function callClaudeStream(key, payload, onText, meter) {
  const r = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ ...payload, stream: true }),
  });
  if (!r.ok) {
    const errText = await r.text();
    const e = new Error("anthropic_" + r.status);
    e.detail = errText.slice(0, 300);
    throw e;
  }
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "", full = "", model = "", inTok = 0, outTok = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const line = chunk.split("\n").find((l) => l.indexOf("data:") === 0);
      if (!line) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      let ev; try { ev = JSON.parse(data); } catch (e) { continue; }
      if (ev.type === "message_start" && ev.message) {
        if (ev.message.model) model = ev.message.model;
        if (ev.message.usage && ev.message.usage.input_tokens) inTok = ev.message.usage.input_tokens;
      }
      if (ev.type === "message_delta" && ev.usage && ev.usage.output_tokens != null) outTok = ev.usage.output_tokens;
      if (ev.type === "content_block_delta" && ev.delta && ev.delta.type === "text_delta") {
        full += ev.delta.text;
        if (onText) onText(ev.delta.text);
      }
    }
  }
  try { console.log("[klyfton] stream " + (model || "?") + " in=" + inTok + " out=" + outTok); } catch (e) {}
  if (meter) meter.usd += costOf(model, { input_tokens: inTok, output_tokens: outTok });
  return { text: full, model };
}

// Marker-safe emitter: stream text to the client but never leak the tail-of-message
// [[MEMORY]] / [[ACTION]] blocks into the live preview. Markers are terminal per the
// prompt, so once we see "[[" everything after is markers — stop the preview there.
function makeEmitter(res) {
  let holding = false, pend = "";
  return function (t) {
    if (holding) return;
    pend += t;
    const mi = pend.indexOf("[[");
    if (mi === -1) {
      const keep = pend.endsWith("[") ? 1 : 0; // a lone trailing "[" might start "[["
      const out = pend.slice(0, pend.length - keep);
      if (out) sseSend(res, { t: out });
      pend = keep ? pend.slice(-1) : "";
    } else {
      const out = pend.slice(0, mi);
      if (out) sseSend(res, { t: out });
      pend = "";
      holding = true;
    }
  };
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  // Key resolution: a Vercel env var ALWAYS wins (the secure path). If none is set,
  // fall back to a key the owner pasted into the app's in-app vault (Admin → API Keys),
  // sent as body.apiKey. Validated to look like an Anthropic key so a stray value can't
  // be forwarded. This lets the owner switch the brain on entirely from the app.
  const bodyKey = (typeof body.apiKey === "string" && /^sk-ant-/.test(body.apiKey.trim())) ? body.apiKey.trim() : "";
  const key = process.env.ANTHROPIC_API_KEY || bodyKey;
  if (!key) {
    res.status(200).json({
      text:
        "⚙️ Ask Klyfton AI isn't switched on yet. Owner: paste your Anthropic API key in " +
        "Admin → API Keys (turns it on right here), or for the most secure setup add " +
        "ANTHROPIC_API_KEY in Vercel → mgsf-fieldos → Settings → Environment Variables and Redeploy. " +
        "Until then the hive can't think — but the estimator, JSA, and time clock still work.",
      configured: false,
    });
    return;
  }

  if (process.env.CREW_CODE && body.code !== process.env.CREW_CODE) {
    res.status(200).json({ text: "🔒 Crew code required to use Klyfton AI.", configured: true });
    return;
  }

  const userText = (body.message || "").toString().trim();

  // Photos / PDFs the crew attached — capped so one message can't blow the payload.
  const attachments = (Array.isArray(body.attachments) ? body.attachments : [])
    .filter((a) => a && a.data && (a.kind === "image" || a.kind === "pdf"))
    .slice(0, 6);

  if (!userText && !attachments.length) {
    res.status(400).json({ error: "Missing message" });
    return;
  }

  const history = Array.isArray(body.history) ? body.history.slice(-20) : [];
  const ctx = contextBlock(body.context, body.memory);

  // The router is text-only; give it a hint when a message is just an attachment.
  const routeText = userText || "[user attached " + attachments.length + " " +
    (attachments.some((a) => a.kind === "pdf") ? "file(s)" : "photo(s)") + " with no caption]";

  // Client opts into token streaming with { stream:true } (or an SSE Accept header).
  const wantStream = body.stream === true || /text\/event-stream/i.test(req.headers.accept || "");

  // The synthesizer prompt is the same whether we stream it or not.
  const buildSynthSys = () => `${BASE_VOICE}\n\n${BUSINESS}\n\n${FEDERAL}\n\n${FOAM_SPECS}\n\n${PLATFORM}\n\n${ACTIONS}${ctx}

You are the SYNTHESIZER and CRITIC of the hive. Below are answers from specialist minds for the
same question. Merge them into ONE answer in the owner's voice. Your job as critic:
- Cut contradictions; if minds disagree on a number, flag it and say what to verify.
- Remove anything that looks fabricated or unsupported. Keep real, sourced, or clearly-ESTIMATED facts.
- Lead with the TL;DR/number, then options+pick if it's a decision, then a tight checklist.
- One screen. Do not mention "minds", "agents", or this process — just answer the owner.
If there are durable facts worth remembering across sessions (a customer preference, a confirmed
price, a job detail), end with: [[MEMORY]] fact ;; fact [[/MEMORY]] — otherwise omit that block.`;

  // Per-request cost meter — every model call adds its dollar cost here.
  const meter = { usd: 0 };

  // Monthly cost cap (opt-in): needs KV attached AND KLYFTON_MONTHLY_BUDGET_USD set.
  // Over budget → refuse new AI work with a friendly note. The estimator, JSA drafts,
  // and time clock never touch this endpoint, so they keep working.
  if (KV_ON && MONTHLY_BUDGET_USD > 0) {
    const spent = await kvSpentThisMonth();
    if (spent >= MONTHLY_BUDGET_USD) {
      const msg = "🧯 Klyfton has reached this month's AI budget ($" + MONTHLY_BUDGET_USD.toFixed(0) +
        "). It resets on the 1st. Owner: raise KLYFTON_MONTHLY_BUDGET_USD in Vercel to lift it. The estimator, JSA drafts, and time clock all still work.";
      if (wantStream) { sseInit(res); sseSend(res, { done: true, configured: true, capped: true, text: msg }); res.end(); }
      else res.status(200).json({ configured: true, capped: true, text: msg });
      return;
    }
  }

  // The finally records this request's spend to KV (even with no budget set — so the
  // running monthly total is always watchable), on both the success and error paths.
  try {
  // ---- Streaming path: SSE, streams the synthesizer's tokens on hive answers ----
  if (wantStream) {
    sseInit(res);
    try {
      const plan = isTrivial(userText, attachments)
        ? { minds: ["general"], complexity: "simple" }
        : await route(key, routeText, history, meter);

      // Simple job → one mind (uses web search, so run non-streamed) → send the finished answer.
      if (plan.complexity === "simple" || plan.minds.length <= 1) {
        const only = await runMind(key, plan.minds[0], userText, history, ctx, attachments, meter);
        const { text, remember } = splitMemory(only.text || "I didn't get a usable answer — try rephrasing.");
        sseSend(res, { done: true, text, remember, configured: true, mode: "single", minds: [only.mind], model: only.model });
        res.end();
        return;
      }

      // Complex job → run the swarm (non-streamed), then stream the synthesizer.
      const workers = await Promise.all(
        plan.minds.map((m) => runMind(key, m, userText, history, ctx, attachments, meter).catch(() => null))
      );
      const answers = workers.filter((w) => w && w.text);
      if (!answers.length) {
        sseSend(res, { done: true, text: "The hive came back empty — try rephrasing.", configured: true });
        res.end();
        return;
      }
      if (answers.length === 1) {
        const { text, remember } = splitMemory(answers[0].text);
        sseSend(res, { done: true, text, remember, configured: true, mode: "single", minds: [answers[0].mind] });
        res.end();
        return;
      }

      const panel = answers.map((a) => `### ${a.mind} mind:\n${a.text}`).join("\n\n");
      const emit = makeEmitter(res);
      const { text: raw, model } = await callClaudeStream(
        key,
        {
          model: CRITIC_MODEL,
          max_tokens: 8000,
          system: buildSynthSys(),
          thinking: { type: "adaptive" },
          messages: [
            { role: "user", content: `Question:\n${userText}\n\nSpecialist answers:\n\n${panel}` },
          ],
        },
        (t) => emit(t),
        meter
      );
      const { text, remember } = splitMemory(raw || answers[0].text);
      sseSend(res, { done: true, text, remember, configured: true, mode: "hive", minds: answers.map((a) => a.mind), model: model || CRITIC_MODEL });
      res.end();
    } catch (e) {
      sseSend(res, {
        done: true,
        configured: true,
        text: "⚠️ Klyfton hit a snag reaching the hive (" + String(e.message || e).slice(0, 60) + "). Try again in a moment.",
        error: String(e.detail || e).slice(0, 200),
      });
      try { res.end(); } catch (_) {}
    }
    return;
  }

  // ---- Non-streaming path (JSON) — used by GROW tools and as the fallback ----
  try {
    // 1) Queen recruits the minds (skipped for trivial greetings/acks).
    const plan = isTrivial(userText, attachments)
      ? { minds: ["general"], complexity: "simple" }
      : await route(key, routeText, history, meter);

    // 2) Simple job → one mind answers directly (fast + cheap).
    if (plan.complexity === "simple" || plan.minds.length <= 1) {
      const only = await runMind(key, plan.minds[0], userText, history, ctx, attachments, meter);
      const { text, remember } = splitMemory(only.text || "I didn't get a usable answer — try rephrasing.");
      res.status(200).json({
        text,
        remember,
        configured: true,
        mode: "single",
        minds: [only.mind],
        model: only.model,
      });
      return;
    }

    // 3) Complex job → recruit the swarm in parallel.
    const workers = await Promise.all(
      plan.minds.map((m) => runMind(key, m, userText, history, ctx, attachments, meter).catch(() => null))
    );
    const answers = workers.filter((w) => w && w.text);
    if (!answers.length) {
      res.status(200).json({ text: "The hive came back empty — try rephrasing.", configured: true });
      return;
    }
    if (answers.length === 1) {
      const { text, remember } = splitMemory(answers[0].text);
      res.status(200).json({ text, remember, configured: true, mode: "single", minds: [answers[0].mind] });
      return;
    }

    // 4) Synthesizer + critic: merge the minds, kill contradictions/fabrication, one answer out.
    const panel = answers.map((a) => `### ${a.mind} mind:\n${a.text}`).join("\n\n");
    const synth = await callClaude(key, {
      model: CRITIC_MODEL,
      max_tokens: 8000,
      system: buildSynthSys(),
      thinking: { type: "adaptive" },
      messages: [
        { role: "user", content: `Question:\n${userText}\n\nSpecialist answers:\n\n${panel}` },
      ],
    }, meter);
    const { text, remember } = splitMemory(textFrom(synth.content) || answers[0].text);
    res.status(200).json({
      text,
      remember,
      configured: true,
      mode: "hive",
      minds: answers.map((a) => a.mind),
      model: synth.model || CRITIC_MODEL,
    });
  } catch (e) {
    res.status(200).json({
      text: "⚠️ Klyfton hit a snag reaching the hive (" + String(e.message || e).slice(0, 60) + "). Owner: check the ANTHROPIC_API_KEY. Try again in a moment.",
      error: String(e.detail || e).slice(0, 300),
      configured: true,
    });
  }
  } finally {
    if (KV_ON && meter.usd > 0) {
      try { await kvAddSpend(meter.usd.toFixed(6)); } catch (e) {}
    }
  }
};
