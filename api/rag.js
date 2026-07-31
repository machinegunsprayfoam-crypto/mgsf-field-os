// Klyfton RAG — the unified retrieval layer. Klyfton already had THREE retrieval sources that were
// called separately and concatenated: the brain knowledge-graph (GraphRAG over doctrine/topics),
// the wiki (editable SOPs/playbooks), and semantic memory (pgvector facts). This module fans out to
// all three for one query, MERGES + DEDUPES + RANKS them into a single grounded context — with
// source attribution and the truth order stated (brain/doctrine > wiki > memory) so nothing lower
// can override a locked number.
//
// Each source is gated/graceful (wiki + memory no-op when Supabase is absent; the brain graph is
// keyless and always answers). The MERGE/RANK/FORMAT core is pure + deterministic (unit-tested
// offline). Never throws to the caller; never fabricates.
//
// GET ?q=... -> unified retrieval. POST { query } -> same.

let brainGraph = null, wiki = null, memory = null;
try { brainGraph = require("./brain-graph-retrieve.js"); } catch (e) {}
try { wiki = require("./wiki"); } catch (e) {}
try { memory = require("./memory"); } catch (e) {}

// Source priority = truth order. Lower rank sorts first (brain/doctrine wins).
const PRIORITY = { brain: 0, wiki: 1, memory: 2 };

function clean(s, max) { return String(s == null ? "" : s).trim().slice(0, max || 400); }

// ---- PURE normalizers: each source's native shape -> [{source, ref, text}] ----
function normBrain(res) {
  if (!res || !Array.isArray(res.clusters)) return [];
  return res.clusters.filter((c) => c && c.score > 0).map((c) => ({
    source: "brain", ref: clean(c.name, 60),
    text: clean(c.name + (Array.isArray(c.concepts) && c.concepts.length ? ": " + c.concepts.slice(0, 8).join(", ") : ""), 300),
  }));
}
function normWiki(res) {
  if (!res || !Array.isArray(res.results)) return [];
  return res.results.map((r) => ({ source: "wiki", ref: clean(r.title || r.slug, 80), text: clean(r.snippet || r.body, 300) }));
}
function normMemory(res) {
  if (!res || !Array.isArray(res.results)) return [];
  return res.results.map((r) => ({ source: "memory", ref: "", text: clean(r.note || r.text, 300) })).filter((r) => r.text);
}

// ---- PURE merge: concat -> dedupe (by normalized text) -> rank by source priority -> cap k ----
function mergeResults(lists, k) {
  const kk = k || 8;
  const flat = [];
  for (const list of lists || []) for (const r of list || []) { if (r && r.text) flat.push(r); }
  // Sort by source priority FIRST (brain > wiki > memory; ties keep insertion order), THEN dedupe —
  // so when two sources carry the same fact, the higher-priority source's copy is the one kept.
  const sorted = flat.map((r, i) => ({ r, i }))
    .sort((a, b) => (PRIORITY[a.r.source] - PRIORITY[b.r.source]) || (a.i - b.i))
    .map((x) => x.r);
  const seen = new Set();
  const out = [];
  for (const r of sorted) {
    const key = r.text.toLowerCase().replace(/\s+/g, " ").slice(0, 120);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out.slice(0, kk);
}

// ---- PURE format: merged results -> one grounded context block with attribution + truth order ----
function formatContext(merged) {
  if (!merged || !merged.length) return "";
  const lines = merged.map((r) => "• [" + r.source + (r.ref ? ":" + r.ref : "") + "] " + r.text);
  return "GROUNDING (retrieved knowledge — truth order: brain/doctrine > wiki > memory; a lower source never overrides a locked number):\n" + lines.join("\n");
}

// The unified call: fan out to all sources (best-effort), merge, return results + context block.
async function retrieve(query, k, env) {
  const q = clean(query, 500);
  if (!q) return { ok: true, results: [], contextBlock: "", sources: {} };
  const sources = {};
  let bRes = [], wRes = [], mRes = [];
  try { if (brainGraph && brainGraph.retrieve) { const r = brainGraph.retrieve(q, {}); bRes = normBrain(r); sources.brain = true; } } catch (e) { sources.brain = false; }
  try { if (wiki && wiki.retrieve) { const r = await wiki.retrieve(q, k || 3); sources.wiki = !!(r && r.configured); wRes = normWiki(r); } } catch (e) { sources.wiki = false; }
  try { if (memory && memory.recall) { const r = await memory.recall(q, k || 4); sources.memory = !!(r && r.configured); mRes = normMemory(r); } } catch (e) { sources.memory = false; }
  const merged = mergeResults([bRes, wRes, mRes], k || 8);
  return { ok: true, results: merged, contextBlock: formatContext(merged), sources };
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    const q = (req.query && (req.query.q || req.query.query)) || "";
    if (q) { res.status(200).json(await retrieve(q, 8, process.env)); return; }
    res.status(200).json({ service: "klyfton-rag", sources: ["brain (GraphRAG)", "wiki", "memory"],
      note: "GET ?q=... for unified retrieval across all knowledge sources. Truth order: brain/doctrine > wiki > memory." });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  try { res.status(200).json(await retrieve(body.query || body.q, body.k || 8, process.env)); }
  catch (e) { res.status(200).json({ ok: false, error: String(e).slice(0, 140) }); }
};

module.exports.retrieve = retrieve;
module.exports.mergeResults = mergeResults;
module.exports.formatContext = formatContext;
module.exports.normBrain = normBrain;
module.exports.normWiki = normWiki;
module.exports.normMemory = normMemory;
