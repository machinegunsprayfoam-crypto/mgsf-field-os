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

// cluster NAME -> brain knowledge-block names it should pull in (stable across re-scans; names not ids).
const CLUSTER_BLOCKS = {
  "Cost Doctrine":         ["DOCTRINE", "ACCOUNTING_FINANCE", "ROI_GUIDE"],
  "Engineering Seer":      ["STEM_FOUNDATIONS", "HVAC_ENGINEERING", "FOAM_SPECS", "TRADES_EXPERT"],
  "Spray System":          ["FOAM_SPECS", "SERVICE_ARCHITECTURE", "EQUIPMENT"],
  "Knowledge Stance":      ["MASTERY", "COMPETITIVE_EDGE"],
  "Action Approval":       ["ACTIONS", "PLATFORM", "COMPETITIVE_EDGE"],
  "Revenue Connection":    ["REVENUE_LAYER", "BUSINESS_SYSTEM", "KNOWLEDGE_BRIDGES", "GAP_BRIDGES"],
  "Guarantee Saving":      ["DOCTRINE", "COMPETITIVE_EDGE"],
  "Procurement Equipment": ["PROCUREMENT", "EQUIPMENT", "SUPPLIERS", "FEDERAL"],
  "Estimate Capability":   ["FOAM_SPECS", "ROI_GUIDE", "PLATFORM", "TRADES_EXPERT"],
  "Credential Binding":    ["DOCTRINE", "BUSINESS"],
  "Safety Condition":      ["SERVICE_ARCHITECTURE", "STEM_FOUNDATIONS", "TRADES_EXPERT"],
};
// Identity + hard rules that must always be present regardless of the question.
const ALWAYS = ["base_voice", "DOCTRINE", "COMPETITIVE_EDGE"];

const STOP = new Set(("the a an and or of to in on for with is are be do i we you my our your it this that "
  + "how what why when where can does will should would could may might need want get got make made "
  + "at by from as if then than so no not yes klyfton mgsf machine").split(/\s+/));

// Alias common MGSF query vocabulary onto the graph's (more abstract) concept tokens, so real
// questions match even when the caller's words differ from the graph's. Each key expands to concepts.
const ALIAS = {
  sdvosb: ["federal", "govcon"], samgov: ["federal", "govcon"], sam: ["federal", "govcon"],
  bid: ["federal", "govcon"], contract: ["federal", "govcon"], grant: ["federal", "govcon"], veteran: ["federal"],
  prevailing: ["federal", "govcon"], davis: ["federal", "govcon"], apprentice: ["federal", "govcon"], apprenticeship: ["federal", "govcon"],
  workforce: ["federal", "govcon"], wotc: ["federal", "govcon"], payroll: ["federal"], emacs: ["federal", "govcon"], procurement: ["federal", "govcon"],
  margin: ["cost"], profit: ["cost", "money"], markup: ["cost"], gm: ["cost"], price: ["cost"], pricing: ["cost"], quote: ["cost", "estimate"],
  substrate: ["condition", "spray"], dewpoint: ["condition"], condensation: ["condition", "spray"], humidity: ["condition"],
  temperature: ["condition"], weather: ["condition"], cold: ["condition"], hot: ["condition"], window: ["condition"],
  proposal: ["action", "outward"], invoice: ["action", "outward", "money"], email: ["action", "outward"], sms: ["action", "outward"],
  schedule: ["action"], followup: ["action", "lead"], reminder: ["action"], review: ["action", "outward"],
  crawlspace: ["service", "foam"], attic: ["service", "foam"], wall: ["service", "foam"], roof: ["coating", "service"],
  barn: ["service", "foam"], shop: ["service", "foam"], building: ["service", "system"], metal: ["foam", "system"],
  concrete: ["lifting", "service"], slab: ["lifting"], seawall: ["lifting"], soil: ["lifting"],
  payback: ["roi"], savings: ["roi"], bill: ["roi"], crew: ["safety", "jsa"], osha: ["safety", "jsa"], ppe: ["safety"],
  hubspot: ["assistant", "connection"], crm: ["assistant", "connection"], lead: ["lead"], customer: ["assistant"],
  // Trades — route deep trade questions to TRADES_EXPERT (via the Estimate/Engineering/Safety clusters).
  trade: ["estimate", "service"], trades: ["estimate", "service"], subcontractor: ["estimate"], contractor: ["estimate"],
  electrical: ["estimate", "condition"], electric: ["estimate"], wiring: ["estimate"], panel: ["estimate"], breaker: ["estimate"], circuit: ["estimate"], nec: ["estimate"], voltage: ["estimate", "condition"], amp: ["estimate"], amperage: ["estimate"],
  plumbing: ["estimate", "service"], plumb: ["estimate"], drain: ["estimate"], sewer: ["estimate"], pipe: ["estimate"], fixture: ["estimate"], ipc: ["estimate"], vent: ["estimate", "condition"],
  hvac: ["estimate", "condition"], furnace: ["condition", "estimate"], ductwork: ["estimate", "condition"], mechanical: ["estimate", "condition"],
  framing: ["estimate", "service"], framer: ["estimate"], carpentry: ["estimate"], carpenter: ["estimate"], stud: ["estimate"], joist: ["estimate"], rafter: ["estimate"], truss: ["estimate"], header: ["estimate"], beam: ["estimate"], lumber: ["estimate"], span: ["estimate"],
  masonry: ["estimate", "service"], block: ["estimate"], brick: ["estimate"], cmu: ["estimate"], mortar: ["estimate"], grout: ["estimate"],
  drywall: ["estimate", "service"], sheetrock: ["estimate"], gypsum: ["estimate"], finish: ["estimate"],
  shingle: ["estimate", "service"], excavation: ["estimate", "safety"], trench: ["estimate", "safety"], earthwork: ["estimate"], grading: ["estimate"],
  steel: ["estimate", "system"], purlin: ["estimate"], flatwork: ["estimate", "service"], footing: ["estimate"], foundation: ["estimate"], rebar: ["estimate"],
  sprinkler: ["estimate", "safety"], suppression: ["estimate", "safety"], sitework: ["estimate"], paving: ["estimate"], asphalt: ["estimate"],
  permit: ["estimate", "condition"], code: ["estimate", "condition"], inspection: ["estimate"], ahj: ["estimate", "condition"], licensed: ["estimate"], license: ["estimate"],
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
