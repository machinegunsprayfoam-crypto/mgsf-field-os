// Brain GraphRAG-lite — retrieval over the real InfraNodus knowledge graph of Klyfton's brain
// (api/brain-graph-data.js, 150 concepts / 513 links / 11 topical clusters).
//
// WHY: today every knowledge block is stuffed into the prompt as static text. This module lets the
// brain RETRIEVE only the blocks relevant to a question — the way a good assistant reasons: pull the
// pertinent knowledge, not everything. Pure, keyless, deterministic (no embeddings / no external API):
// it matches the query to graph concepts, scores the 11 clusters (with 1-hop edge expansion), and maps
// the top clusters to the brain's knowledge-block names.
//
// Non-fabricating: it only ROUTES to existing blocks; it invents no facts. Safe to adopt incrementally —
// see wireInto() note at the bottom. Not wired into klyfton.js by default (that changes tuned brain
// output + token usage — owner's call to flip on).

const GRAPH = require("./brain-graph-data.js");

// cluster NAME -> brain knowledge-block names it should pull in. Keyed on the cluster names from the
// 2026-08-01 InfraNodus re-scan (api/brain-graph-data.js). Names, not ids, so a re-scan that keeps the
// same names keeps this mapping. NOTE: InfraNodus community detection is somewhat stochastic run-to-run
// (cluster names/count can shift) — after any re-scan, reconcile this map + ALIAS to the new node
// vocabulary and keep tests/brain-graph-retrieve.js green (it asserts routing behavior, not names).
const CLUSTER_BLOCKS = {
  "Foam Verification":  ["FOAM_SPECS", "DOCTRINE", "SERVICE_ARCHITECTURE", "MASTERY", "SAFETY_OSHA", "SALES_OBJECTIONS"],   // foam/spray/doctrine/spec/ahj/verify + isocyanate/MDI/re-occupancy is SPF-specific safety + the DIY/off-gassing/safety objection rebuttals
  "Business Licensing": ["BUSINESS", "FEDERAL", "DOCTRINE", "PROCUREMENT", "CREDENTIAL_MAP", "PROOF_ECONOMICS", "SALES_OBJECTIONS"], // license/insurance/sam/contractor — credentials + gov + credential→service map (gap #1) + gov specs that mandate testing (proof pass) + the "DIY it" objection leans on CREDENTIAL_MAP
  "Cost Efficiency":    ["DOCTRINE", "ACCOUNTING_FINANCE", "ROI_GUIDE", "REVENUE_LAYER", "SALES_OBJECTIONS", "ACTIONS", "PLATFORM", "SEASON_ECONOMICS", "PROOF_ECONOMICS"],// cost/margin/roi/job/lead + deal-closing action flow + the objection-handling playbook + season/weather cost bridge (gap #2) + what proof/testing is worth (proof pass)
  "Performance Metrics":["STEM_FOUNDATIONS", "HVAC_ENGINEERING", "BUSINESS_SYSTEM", "EQUIPMENT", "PROCUREMENT", "SUPPLIERS"], // building/load/service + rig/equipment spec + buy-vs-rent/sourcing
  "Soil Stability":     ["SERVICE_ARCHITECTURE", "STEM_FOUNDATIONS", "GAP_BRIDGES", "CONCRETE_ENGINEERING", "SALES_OBJECTIONS"], // concrete/lifting/void/soil/seawall + the deep geotech diagnostic block + the "just replace the slab" objection rebuttal
  "Safety Compliance":  ["TRADES_EXPERT", "STEM_FOUNDATIONS", "FOAM_SPECS", "SERVICE_ARCHITECTURE", "SAFETY_OSHA"], // code/irc/scope/trade/calculator/safety + the hazard->control->standard OSHA expert block
  "Moisture Control":   ["STEM_FOUNDATIONS", "FOAM_SPECS", "HVAC_ENGINEERING", "SERVICE_ARCHITECTURE", "SALES_OBJECTIONS"], // barrier/air/vapor/moisture/mold + the "foam causes mold" objection rebuttal (correct the myth, never claim elimination)
  "Pressure Testing":   ["FOAM_SPECS", "STEM_FOUNDATIONS", "ROI_GUIDE", "PROOF_ECONOMICS"], // blower door/proof/ACH50 (BPI) + turning proof into money / gov-mandated testing (proof pass)
  "Dew Point":          ["FOAM_SPECS", "SERVICE_ARCHITECTURE", "STEM_FOUNDATIONS", "SEASON_ECONOMICS"], // substrate/dew/wind/temp/lift (spray window) + the cost of the window (gap #2)
};
// Identity + hard rules that must always be present regardless of the question.
const ALWAYS = ["base_voice", "DOCTRINE", "COMPETITIVE_EDGE"];

const STOP = new Set(("the a an and or of to in on for with is are be do i we you my our your it this that "
  + "how what why when where can does will should would could may might need want get got make made "
  + "at by from as if then than so no not yes klyfton mgsf machine").split(/\s+/));

// Alias common MGSF query vocabulary onto the graph's (more abstract) concept tokens, so real
// questions match even when the caller's words differ from the graph's. Each key expands to concepts.
// Aliases retargeted to the 2026-08-01 graph's node vocabulary. Each key expands to REAL node keys so
// a caller's word routes to the right cluster: federal/sam/license/insurance/business (Business
// Licensing), cost/roi/estimate (Cost Efficiency), trade/code/scope/safety (Safety Compliance),
// barrier/air/vapor/moisture (Moisture Control), substrate/dew/wind (Dew Point), concrete/soil/roof
// (Soil Stability), blower/door/proof (Pressure Testing), foam/spray/doctrine (Foam Verification).
const ALIAS = {
  // Federal / GovCon → Business Licensing (BUSINESS + FEDERAL + PROCUREMENT)
  sdvosb: ["federal", "license", "sam"], vosb: ["federal", "license"], samgov: ["federal", "sam"], sam: ["federal", "sam"],
  bid: ["federal", "business"], contract: ["federal", "business"], grant: ["federal", "business"], veteran: ["federal", "business"],
  prevailing: ["federal", "license"], davis: ["federal", "license"], apprentice: ["federal", "license"], apprenticeship: ["federal", "license"],
  public: ["federal", "license"], municipal: ["federal", "license"], dot: ["federal", "license"], trigger: ["license", "federal"],
  workforce: ["federal", "business"], wotc: ["federal", "business"], payroll: ["federal", "business"], emacs: ["federal", "license"], procurement: ["federal", "business"],
  cage: ["federal", "sam"], uei: ["federal", "sam"], naics: ["federal", "license"], setaside: ["federal", "business"],
  // Insurance / bonding / credentials → Business Licensing (BUSINESS holds GL/WC/pollution/umbrella/auto + bonding)
  insurance: ["insurance", "license", "federal"], coi: ["insurance", "license"], bond: ["insurance", "federal"], bonding: ["insurance", "federal"],
  surety: ["insurance", "federal"], pollution: ["insurance", "license"], umbrella: ["insurance", "license"], liability: ["insurance", "business"],
  workers: ["insurance", "business"], comp: ["insurance", "business"], license: ["license", "business"], licensed: ["license", "trade"],
  // Certifications / credentials → Business Licensing (carries CREDENTIAL_MAP — which credential unlocks which service, gap #1)
  cert: ["license", "business"], certified: ["license", "business"], certification: ["license", "business"], credential: ["license", "business"],
  registration: ["license", "business"], register: ["license", "business"], warranty: ["license", "business"], applicator: ["license", "business"], training: ["license", "business"],
  // Cost / margin → Cost Efficiency (DOCTRINE + ACCOUNTING_FINANCE + ROI_GUIDE)
  margin: ["cost", "roi"], profit: ["cost", "roi"], markup: ["cost"], gm: ["cost"], price: ["cost", "estimate"], pricing: ["cost"], quote: ["cost", "estimate"],
  payback: ["roi", "cost"], savings: ["roi", "cost"], bill: ["roi", "cost"],
  // Sales objections/rebuttals → Cost Efficiency (carries SALES_OBJECTIONS + ROI_GUIDE + REVENUE_LAYER);
  // "quote" already aliases to cost/estimate above, "mold" and "moisture" already alias to Moisture
  // Control below (SALES_OBJECTIONS is wired to both clusters — the mold objection needs both).
  objection: ["cost", "sale"], expensive: ["cost", "price"], cheaper: ["cost", "price"], afford: ["cost", "price"],
  quotes: ["cost", "estimate"], worth: ["cost", "roi"], competitor: ["cost", "sale"], shopping: ["cost", "sale"],
  wait: ["cost", "roi"], guarantee: ["cost", "saving"],
  // DIY / "cheaper guy" objection → Business Licensing (CREDENTIAL_MAP) + Foam Verification (spec risk)
  diy: ["license", "foam"], myself: ["license", "foam"],
  // Safety/off-gassing objection → Foam Verification (SALES_OBJECTIONS) + Safety Compliance (SAFETY_OSHA);
  // "off-gas"/"off-gassing" tokenizes to "off"+"gas" (hyphen stripped), so alias "gas" not just "offgas".
  offgas: ["safety", "foam"], gas: ["safety", "foam"], smell: ["safety", "foam"], safe: ["safety", "foam"],
  // "replace the slab" objection → Soil Stability (CONCRETE_ENGINEERING's lift-vs-replace-vs-pier call)
  replace: ["concrete", "structural"],
  // Spray window / weather → Dew Point (+ Foam Verification)
  substrate: ["substrate", "spray"], dewpoint: ["dew", "substrate"], condensation: ["dew", "moisture"], humidity: ["dew", "moisture"],
  temperature: ["temp", "substrate"], weather: ["substrate", "wind"], cold: ["substrate", "temp"], hot: ["substrate", "temp"], window: ["substrate"],
  // Season / weather economics → Dew Point + Cost Efficiency (both carry SEASON_ECONOMICS — the cost of the spray/coat window, gap #2)
  season: ["substrate", "cost"], seasonal: ["substrate", "cost"], reschedule: ["substrate", "cost"], mobilization: ["substrate", "cost"],
  coating: ["substrate", "cost"], coat: ["substrate", "cost"],
  // Outward actions → Cost Efficiency (carries ACTIONS + PLATFORM): proposal/invoice/draft/approval flow
  proposal: ["cost", "estimate"], invoice: ["cost", "estimate"], draft: ["cost", "lead"], approval: ["cost"], action: ["cost"],
  email: ["lead", "cost"], sms: ["lead", "cost"], schedule: ["lead"], followup: ["lead"], reminder: ["lead"], review: ["lead"],
  // Equipment / rig / procurement → Performance Metrics (carries EQUIPMENT + PROCUREMENT + SUPPLIERS)
  equipment: ["service", "building"], rig: ["service", "building"], proportioner: ["service", "building"], reactor: ["service", "building"],
  compressor: ["service", "building"], generator: ["service", "building"], scissor: ["service", "building"], telehandler: ["service", "building"],
  boom: ["service", "building"], buy: ["service", "cost"], rent: ["service", "cost"], supplier: ["service", "business"], vendor: ["service", "business"],
  // Foam services → Foam Verification / Soil Stability / Moisture Control
  crawlspace: ["foam", "moisture"], attic: ["attic", "foam"], wall: ["foam", "spray"], roof: ["roof", "foam"],
  barn: ["foam", "spray"], shop: ["foam", "spray"], building: ["building", "load"], metal: ["foam", "building"],
  concrete: ["concrete", "soil"], slab: ["concrete", "soil"], seawall: ["concrete", "soil"], soil: ["soil", "concrete"],
  // Concrete/geotech diagnostics → Soil Stability (carries CONCRETE_ENGINEERING — root-cause diagnosis + poly-lifting physics)
  settlement: ["soil", "structural"], settle: ["soil", "structural"], heave: ["soil", "structural"], frost: ["soil", "structural"],
  polyjacking: ["lifting", "concrete"], polyjack: ["lifting", "concrete"], mudjack: ["lifting", "concrete"], mudjacking: ["lifting", "concrete"],
  pier: ["foundation", "structural"], piling: ["foundation", "structural"], bearing: ["soil", "structural"], capacity: ["soil", "structural"],
  expansive: ["soil", "structural"], washout: ["soil", "void"], uneven: ["concrete", "structural"], trip: ["concrete", "structural"],
  hazard: ["concrete", "structural"],
  // Moisture / envelope → Moisture Control
  moisture: ["moisture", "barrier"], vapor: ["vapor", "barrier"], mold: ["mold", "moisture"], air: ["air", "barrier"], sealing: ["air", "barrier"],
  // BPI / blower door → Pressure Testing
  blower: ["blower", "door"], ach50: ["blower", "proof"], bpi: ["blower", "proof"], leakage: ["blower", "air"],
  // Proof economics → Pressure Testing + Cost + Business Licensing (all carry PROOF_ECONOMICS): what a test is worth, gov-mandated testing, cost of a bad install (proof pass)
  audit: ["blower", "cost"], commissioning: ["blower", "federal"], verification: ["blower", "proof"], proof: ["blower", "proof"],
  testing: ["blower", "proof"], callback: ["cost", "blower"], rework: ["cost", "blower"], abaa: ["blower", "federal"],
  // HVAC → Cost Efficiency (hvac node) + Performance Metrics (load)
  hvac: ["hvac", "load"], furnace: ["hvac", "load"], ductwork: ["hvac", "load"], mechanical: ["hvac", "load"], manualj: ["hvac", "load"],
  // CRM / assistant
  hubspot: ["lead", "business"], crm: ["lead", "business"], lead: ["lead"], customer: ["lead", "business"],
  // Trades → Safety Compliance (TRADES_EXPERT): trade/code/scope/safety are all in that cluster
  trade: ["trade", "code", "scope"], trades: ["trade", "code", "scope"], subcontractor: ["trade", "scope"], contractor: ["trade", "business"],
  electrical: ["trade", "code"], electric: ["trade", "code"], wiring: ["trade", "code"], panel: ["trade", "code"], breaker: ["trade", "code"], circuit: ["trade", "code"], nec: ["trade", "code"], voltage: ["trade", "code"], amp: ["trade", "code"], amperage: ["trade", "code"],
  plumbing: ["trade", "code"], plumb: ["trade", "code"], drain: ["trade", "code"], sewer: ["trade", "code"], pipe: ["trade", "code"], fixture: ["trade", "code"], ipc: ["trade", "code"], vent: ["trade", "code"],
  framing: ["trade", "code"], framer: ["trade", "code"], carpentry: ["trade", "code"], carpenter: ["trade", "code"], stud: ["trade", "code"], joist: ["trade", "code"], rafter: ["trade", "code"], truss: ["trade", "code"], header: ["trade", "code"], beam: ["trade", "code"], lumber: ["trade", "code"], span: ["trade", "code"],
  masonry: ["trade", "code"], block: ["trade", "code"], brick: ["trade", "code"], cmu: ["trade", "code"], mortar: ["trade", "code"], grout: ["trade", "code"],
  drywall: ["trade", "code"], sheetrock: ["trade", "code"], gypsum: ["trade", "code"], finish: ["trade", "code"],
  shingle: ["trade", "code", "roof"], excavation: ["trade", "safety"], trench: ["trade", "safety"], earthwork: ["trade", "code"], grading: ["trade", "code"],
  steel: ["trade", "code", "building"], purlin: ["trade", "code"], flatwork: ["trade", "concrete"], footing: ["trade", "concrete"], foundation: ["trade", "concrete"], rebar: ["trade", "concrete"],
  sprinkler: ["trade", "safety"], suppression: ["trade", "safety"], sitework: ["trade", "code"], paving: ["trade", "code"], asphalt: ["trade", "code"],
  permit: ["code", "trade"], inspection: ["inspection", "code"], ahj: ["code", "trade"],
  crew: ["safety", "trade"], osha: ["safety", "trade"], ppe: ["safety"],
  // SAFETY_OSHA (job-site safety & OSHA compliance — hazard->control->standard): isocyanate/MDI +
  // respirator/ventilation/re-occupancy (SPF-specific → also foam), fall/harness (roofing), silica
  // (concrete), confined space (crawl), hazcom/SDS/hazmat, exposure/sensitization.
  respirator: ["safety", "foam"], isocyanate: ["safety", "foam"], mdi: ["safety", "foam"],
  ventilation: ["safety", "foam"], occupancy: ["safety", "foam"], reoccupancy: ["safety", "foam"],
  reentry: ["safety", "foam"], entry: ["safety", "foam"], thermal: ["safety", "foam"], ignition: ["safety", "foam"],
  exposure: ["safety", "foam"], sensitization: ["safety", "foam"],
  silica: ["safety", "trade"], fall: ["safety", "trade"], harness: ["safety", "trade"], confined: ["safety", "trade"],
  sds: ["safety", "trade"], hazmat: ["safety", "trade"],
};

function tokenize(q) {
  const raw = String(q || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
    .filter(t => t.length >= 3 && !STOP.has(t));
  const out = [];
  raw.forEach(t => { out.push(t); if (ALIAS[t]) ALIAS[t].forEach(a => out.push(a)); });
  return out;
}

// build adjacency + degree + node->clusterName once (module load)
function buildIndex(graph) {
  const clusterName = {};
  (graph.clusters || []).forEach(c => { clusterName[c.id] = c.name; });
  const nodes = graph.nodes.map((n, i) => ({ i, k: n.k, c: n.c, cn: clusterName[n.c] || String(n.c) }));
  const byKey = {}; nodes.forEach(n => { byKey[n.k] = n; });
  const deg = new Array(nodes.length).fill(0);
  const adj = nodes.map(() => []);
  (graph.edges || []).forEach(e => {
    const s = e[0], t = e[1], w = e[2] || 1;
    if (s < nodes.length && t < nodes.length) { deg[s] += w; deg[t] += w; adj[s].push([t, w]); adj[t].push([s, w]); }
  });
  return { nodes, byKey, deg, adj, clusterName };
}
const IDX = buildIndex(GRAPH);

// score the 11 clusters for a query. Returns [{id,name,score,concepts:[...]}] ranked desc.
function score(query, graph, index) {
  graph = graph || GRAPH; index = index || (graph === GRAPH ? IDX : buildIndex(graph));
  const toks = tokenize(query);
  const clScore = {}; const clConcepts = {};
  function bump(nodeI, amt) {
    const n = index.nodes[nodeI]; if (!n) return;
    clScore[n.cn] = (clScore[n.cn] || 0) + amt;
    (clConcepts[n.cn] = clConcepts[n.cn] || new Set()).add(n.k);
  }
  toks.forEach(tok => {
    index.nodes.forEach(n => {
      // match: exact, or shared 4+ char prefix (estimate~estimating~estimator, foam~foams)
      const k = n.k;
      const hit = k === tok || (tok.length >= 4 && k.length >= 4 && (k.startsWith(tok.slice(0, 4)) && tok.startsWith(k.slice(0, 4))));
      if (!hit) return;
      const base = 1 + Math.sqrt(index.deg[n.i]) * 0.15;   // hubs weigh a bit more
      bump(n.i, base);
      // 1-hop edge expansion — a matched concept lights up its neighbours' clusters (weighted, damped)
      index.adj[n.i].forEach(([j, w]) => bump(j, base * 0.18 * Math.min(3, w) / 3));
    });
  });
  const ranked = Object.keys(clScore).map(name => ({
    name, score: +clScore[name].toFixed(3), concepts: Array.from(clConcepts[name] || []).slice(0, 8)
  })).sort((a, b) => b.score - a.score);
  return ranked;
}

// main entry: query -> {clusters, blocks, concepts, matched, why}
function retrieve(query, opts) {
  opts = opts || {};
  const topK = opts.topClusters || 4;
  const ranked = score(query, GRAPH, IDX);
  const hits = ranked.filter(r => r.score > 0).slice(0, topK);
  const blocks = new Set(ALWAYS);
  const usedClusters = [];
  hits.forEach(h => { usedClusters.push(h.name); (CLUSTER_BLOCKS[h.name] || []).forEach(b => blocks.add(b)); });
  // no concept matched -> safe general default (still deterministic, never empty)
  if (!hits.length) {
    ["Knowledge Stance", "Estimate Capability"].forEach(n => { usedClusters.push(n); (CLUSTER_BLOCKS[n] || []).forEach(b => blocks.add(b)); });
  }
  const concepts = []; hits.forEach(h => h.concepts.forEach(c => { if (concepts.indexOf(c) < 0) concepts.push(c); }));
  return {
    ok: true,
    query: String(query || ""),
    clusters: hits,
    matchedClusters: usedClusters,
    blocks: Array.from(blocks),
    concepts: concepts.slice(0, 12),
    always: ALWAYS,
    why: hits.length
      ? "Matched " + concepts.slice(0, 6).join(", ") + " -> clusters: " + usedClusters.join(", ")
      : "No concept match; returned identity + estimate defaults.",
  };
}

module.exports = async (req, res) => {
  const q = (req.method === "GET")
    ? (req.query && (req.query.q || req.query.query)) || ""
    : (function () { let b = req.body; if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } } return (b && (b.query || b.q)) || ""; })();
  if (req.method !== "GET" && req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  try { res.status(200).json(retrieve(q, {})); }
  catch (e) { res.status(200).json({ ok: false, error: String(e).slice(0, 160) }); }
};

// exported for reuse (e.g. klyfton.js prompt assembly) and unit reasoning
module.exports.retrieve = retrieve;
module.exports.score = score;
module.exports.tokenize = tokenize;
module.exports.CLUSTER_BLOCKS = CLUSTER_BLOCKS;
module.exports.ALWAYS = ALWAYS;
