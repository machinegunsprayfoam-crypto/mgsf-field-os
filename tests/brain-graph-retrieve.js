#!/usr/bin/env node
// Brain graph retrieve — pure GraphRAG-lite core of api/brain-graph-retrieve.js. Run:
// `node tests/brain-graph-retrieve.js`. Deterministic, keyless (no embeddings/no API). Covers
// tokenize (stopword drop, MGSF alias expansion), score (query → ranked clusters, non-negative),
// and retrieve (identity ALWAYS blocks present, query routes to sensible blocks, a no-match query
// still returns a safe non-empty default). It only ROUTES to existing blocks — invents no facts.

const path = require("path");
const A = require(path.join(__dirname, "..", "api", "brain-graph-retrieve.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

console.log("Brain graph retrieve (GraphRAG-lite routing)\n");

// ---- tokenize: stopwords dropped, aliases expanded ----
const t1 = A.tokenize("How much margin should I price?");
ok("tokenize drops stopwords (how/should/i)", !t1.includes("how") && !t1.includes("should") && !t1.includes("i"));
ok("tokenize expands 'margin' alias → cost", t1.includes("margin") && t1.includes("cost"));
ok("tokenize expands 'price' alias → cost", A.tokenize("price").includes("cost"));
ok("tokenize short/empty ⇒ []", A.tokenize("").length === 0 && A.tokenize("a i we").length === 0);

// ---- score: ranked, non-negative, sorted desc ----
const s = A.score("dew point condensation substrate");
ok("score returns a ranked array", Array.isArray(s) && s.length > 0);
ok("scores are non-negative", s.every((c) => c.score >= 0));
ok("scores sorted descending", s.every((c, i) => i === 0 || s[i - 1].score >= c.score));
ok("score entries carry name + concepts", typeof s[0].name === "string" && Array.isArray(s[0].concepts));

// ---- retrieve: identity ALWAYS blocks always present ----
const r = A.retrieve("what should I charge to hit my margin");
ok("retrieve carries the ALWAYS identity blocks", A.ALWAYS.every((b) => r.blocks.includes(b)));
ok("retrieve routes a cost/margin query to DOCTRINE", r.blocks.includes("DOCTRINE"));
ok("retrieve returns matched clusters + a why", Array.isArray(r.matchedClusters) && r.matchedClusters.length > 0 && typeof r.why === "string");

// ---- a federal/SDVOSB query lights the procurement/federal side ----
const fed = A.retrieve("SDVOSB SAM.gov bid prevailing wage");
ok("federal query pulls a FEDERAL/PROCUREMENT block", fed.blocks.includes("FEDERAL") || fed.blocks.includes("PROCUREMENT"));

// ---- trade queries route to the TRADES_EXPERT knowledge block ----
ok("electrical query ⇒ TRADES_EXPERT", A.retrieve("size an electrical service panel and GFCI").blocks.includes("TRADES_EXPERT"));
ok("plumbing query ⇒ TRADES_EXPERT", A.retrieve("vent and drain sizing for a bathroom").blocks.includes("TRADES_EXPERT"));
ok("framing query ⇒ TRADES_EXPERT", A.retrieve("floor joist span and header sizing").blocks.includes("TRADES_EXPERT"));
ok("masonry query ⇒ TRADES_EXPERT", A.retrieve("brick veneer flashing and weep holes").blocks.includes("TRADES_EXPERT"));
ok("excavation query ⇒ TRADES_EXPERT (safety cluster)", A.retrieve("trench shoring safety for a sewer dig").blocks.includes("TRADES_EXPERT"));

// ---- gap #1: credential/cert queries pull the CREDENTIAL_MAP (credential → service bridge) ----
ok("credential query ⇒ CREDENTIAL_MAP", A.retrieve("what license and certification do I need to bid this job").blocks.includes("CREDENTIAL_MAP"));
ok("insurance/bond query ⇒ CREDENTIAL_MAP", A.retrieve("do I need pollution insurance and a surety bond").blocks.includes("CREDENTIAL_MAP"));

// ---- gap #2: season/weather-cost queries pull SEASON_ECONOMICS (spray-window → money bridge) ----
ok("weather/season query ⇒ SEASON_ECONOMICS", A.retrieve("how does the weather and spray window affect my roof price this season").blocks.includes("SEASON_ECONOMICS"));
ok("coating-window query ⇒ SEASON_ECONOMICS", A.retrieve("can I foam this roof if I cannot coat it until spring").blocks.includes("SEASON_ECONOMICS"));

// ---- concrete engineering: diagnostic/geotech queries pull CONCRETE_ENGINEERING (Soil Stability cluster) ----
ok("settled-slab query ⇒ CONCRETE_ENGINEERING", A.retrieve("why is my slab settled and what's the frost heave cause").blocks.includes("CONCRETE_ENGINEERING"));
ok("polyjacking-vs-mudjack query ⇒ CONCRETE_ENGINEERING", A.retrieve("polyjacking vs mudjack for a sunken slab").blocks.includes("CONCRETE_ENGINEERING"));
ok("pier/replace query ⇒ CONCRETE_ENGINEERING", A.retrieve("expansive soil bearing capacity, do we pier or lift").blocks.includes("CONCRETE_ENGINEERING"));
ok("trip-hazard flatwork query ⇒ CONCRETE_ENGINEERING", A.retrieve("uneven slab trip hazard washout under the flatwork").blocks.includes("CONCRETE_ENGINEERING"));

// ---- proof pass: turning measurement into money (audit worth / gov-mandated testing / cost of a bad install) ----
ok("audit-pricing query ⇒ PROOF_ECONOMICS", A.retrieve("what is a blower door audit worth and how do I price it").blocks.includes("PROOF_ECONOMICS"));
ok("gov-testing-spec query ⇒ PROOF_ECONOMICS", A.retrieve("does this federal spec require air barrier leakage testing or commissioning").blocks.includes("PROOF_ECONOMICS"));
ok("callback-cost query ⇒ PROOF_ECONOMICS", A.retrieve("what does a callback or rework cost me on a bad install").blocks.includes("PROOF_ECONOMICS"));

// ---- SAFETY_OSHA: isocyanate/PPE/roofing-fall/silica/confined-space/SDS queries all route to it ----
ok("isocyanate/respirator query ⇒ SAFETY_OSHA", A.retrieve("what respirator and PPE do we need for isocyanate spraying").blocks.includes("SAFETY_OSHA"));
ok("re-occupancy query ⇒ SAFETY_OSHA", A.retrieve("when is it safe for re-occupancy after we spray foam").blocks.includes("SAFETY_OSHA"));
ok("fall-protection/harness query ⇒ SAFETY_OSHA", A.retrieve("fall protection harness requirements for the roofing crew").blocks.includes("SAFETY_OSHA"));
ok("silica query ⇒ SAFETY_OSHA", A.retrieve("silica dust controls when cutting concrete for injection ports").blocks.includes("SAFETY_OSHA"));
ok("confined-space query ⇒ SAFETY_OSHA", A.retrieve("confined space rules for crawl space encapsulation").blocks.includes("SAFETY_OSHA"));
ok("SDS query ⇒ SAFETY_OSHA", A.retrieve("where is the SDS for our A-side isocyanate").blocks.includes("SAFETY_OSHA"));

// ---- SALES_OBJECTIONS: objection/rebuttal queries across price, DIY, safety, mold, and replace-the-slab ----
ok("too-expensive/fiberglass query ⇒ SALES_OBJECTIONS", A.retrieve("customer says spray foam is too expensive and fiberglass is way cheaper").blocks.includes("SALES_OBJECTIONS"));
ok("DIY/cheaper-guy query ⇒ SALES_OBJECTIONS", A.retrieve("customer wants to DIY it themselves or hire a cheaper guy").blocks.includes("SALES_OBJECTIONS"));
ok("off-gassing/safety query ⇒ SALES_OBJECTIONS", A.retrieve("is spray foam safe, worried about off-gassing and the smell").blocks.includes("SALES_OBJECTIONS"));
ok("mold objection query ⇒ SALES_OBJECTIONS", A.retrieve("does spray foam cause mold or trap moisture").blocks.includes("SALES_OBJECTIONS"));
ok("replace-the-slab objection query ⇒ SALES_OBJECTIONS", A.retrieve("customer wants to just replace the slab instead of lifting it").blocks.includes("SALES_OBJECTIONS"));
ok("price-shopping/other-quotes query ⇒ SALES_OBJECTIONS", A.retrieve("customer is going to get other quotes and shop around before deciding").blocks.includes("SALES_OBJECTIONS"));
ok("wait-until-next-year query ⇒ SALES_OBJECTIONS", A.retrieve("customer asks if the job can wait until next year").blocks.includes("SALES_OBJECTIONS"));

// ---- WARRANTY_CALLBACK: post-job "it's doing X again" complaints route to the triage playbook ----
ok("foam gap/again query ⇒ WARRANTY_CALLBACK", A.retrieve("customer called back saying there is a gap in the foam again").blocks.includes("WARRANTY_CALLBACK"));
ok("slab settled/covered query ⇒ WARRANTY_CALLBACK", A.retrieve("the slab is settling again, is this covered under our warranty").blocks.includes("WARRANTY_CALLBACK"));
ok("leak/callback/honor query ⇒ WARRANTY_CALLBACK", A.retrieve("customer complaint about a leak after the job, is it a callback we honor for free").blocks.includes("WARRANTY_CALLBACK"));
ok("crack/cover query ⇒ WARRANTY_CALLBACK", A.retrieve("crack in the concrete again, do we cover it").blocks.includes("WARRANTY_CALLBACK"));

// ---- no concept match ⇒ safe non-empty default (never empty, never fabricated) ----
const none = A.retrieve("zzzz qqqq wwww");
ok("no-match query still returns identity blocks (non-empty)", none.blocks.length > 0 && A.ALWAYS.every((b) => none.blocks.includes(b)));
ok("no-match why explains the default", /No concept match/.test(none.why));

// ---- CLUSTER_BLOCKS only names real block strings (routing, not invention) ----
ok("every cluster maps to a non-empty block list", Object.values(A.CLUSTER_BLOCKS).every((v) => Array.isArray(v) && v.length > 0));

// ---- WIRING INTEGRITY: every block the retriever can emit must exist in Klyfton's brain ----
// (a typo in CLUSTER_BLOCKS / ALWAYS, or a renamed brain block, would otherwise SILENTLY drop
//  knowledge from the assembled prompt — no error, just missing context. This guards that.)
const klyfton = require(path.join(__dirname, "..", "api", "klyfton.js"));
const brainOrder = (klyfton._BRAIN_ORDER || []).map((k) => String(k).toUpperCase());
const brainSet = new Set(brainOrder);
const emittable = new Set([...A.ALWAYS, ...Object.values(A.CLUSTER_BLOCKS).flat()].map((b) => String(b).toUpperCase()));
const dangling = [...emittable].filter((b) => !brainSet.has(b));
ok("every retriever-emittable block exists in BRAIN_ORDER (no silent knowledge drop)", dangling.length === 0, dangling.join(","));
ok("BRAIN_ORDER has no duplicate blocks", brainOrder.length === brainSet.size);
ok("BRAIN_ORDER is non-trivial (brain wired)", brainOrder.length >= 20);

console.log("\n" + (fail ? "✗ " : "✓ ") + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
