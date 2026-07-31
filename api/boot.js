// Klyfton BOOT — the real, live self-map. One call = "here is Klyfton right now": every component
// with live/dark status + dependencies (from the CMDB), the tool catalog by category, the knowledge
// clusters (brain graph) with an honest snapshot note, the curriculum size, and the agent roster —
// plus the single biggest unlock. Unlike the old brain-graph snapshot, this is COMPUTED FROM THE
// REAL ENV at call time, so it can't go stale. This is the "boot sector shows a real map" view.
//
// Read-only, no secrets, deterministic on env. GET /api/boot -> the map.

const cmdb = require("./cmdb");
const toolBag = require("./tools");
let brainGraph = null, curriculum = null, agents = null;
try { brainGraph = require("./brain-graph-data"); } catch (e) {}
try { curriculum = require("./curriculum"); } catch (e) {}
try { agents = require("./agents"); } catch (e) {}

function boot(env) {
  env = env || {};
  const cm = cmdb && cmdb.report ? cmdb.report(env) : { counts: {}, components: [], capabilities: [], biggestUnlock: null };
  const cat = toolBag && toolBag.catalog ? toolBag.catalog(env) : { tools: [] };
  const tools = cat.tools || [];
  const byCategory = {};
  tools.forEach((t) => {
    byCategory[t.category] = byCategory[t.category] || { total: 0, live: 0 };
    byCategory[t.category].total++;
    if (t.live) byCategory[t.category].live++;
  });

  // Knowledge graph — surfaced WITH its snapshot provenance so staleness is visible, not hidden.
  let brain = null;
  if (brainGraph && brainGraph.meta) {
    brain = {
      clusters: (brainGraph.clusters || []).map((c) => c.name),
      nodes: brainGraph.meta.nodes, edges: brainGraph.meta.edges,
      source: brainGraph.meta.source,
      note: "GraphRAG knowledge-graph SNAPSHOT (maps the doctrine/expert corpus, not code modules). Regenerate via InfraNodus when the corpus changes; the architecture map below is always live.",
    };
  }

  // Curriculum size (the eval engine).
  let curr = null;
  if (curriculum && Array.isArray(curriculum.BANK)) {
    const mods = {};
    curriculum.BANK.forEach((i) => { mods[i.module] = (mods[i.module] || 0) + 1; });
    curr = { scenarios: curriculum.BANK.length, modules: Object.keys(mods) };
  }

  const roster = agents && agents.AGENTS ? Object.keys(agents.AGENTS).map((id) => ({ id, goal: agents.AGENTS[id].goal })) : [];

  return {
    ok: true,
    service: "klyfton-boot",
    generatedFrom: "live-env",
    summary: {
      components: cm.counts.components || tools.length,
      live: cm.counts.live, dark: cm.counts.dark,
      capabilities: cm.counts.capabilities, capabilitiesUp: cm.counts.capsLive,
      tools: tools.length, agents: roster.length,
      brainClusters: brain ? brain.clusters.length : 0,
      curriculumScenarios: curr ? curr.scenarios : 0,
    },
    biggestUnlock: cm.biggestUnlock || null,     // the one switch that lights the most (decision-ready)
    toolsByCategory: byCategory,
    architecture: { components: cm.components, capabilities: cm.capabilities },
    brain,
    curriculum: curr,
    agents: roster,
  };
}

module.exports = async (req, res) => {
  if (req.method !== "GET" && req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  try { res.status(200).json(boot(process.env)); }
  catch (e) { res.status(200).json({ ok: false, error: String(e).slice(0, 160) }); }
};

module.exports.boot = boot;
