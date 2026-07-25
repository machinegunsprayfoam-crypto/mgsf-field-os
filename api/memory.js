// Klyfton semantic memory (pgvector) — the app's long-term recall. Stores each remembered fact
// with a vector embedding so RECALL returns the RELEVANT note for a question (top-K by cosine
// similarity) instead of dumping the last 20. Backward compatible with the note-only memory table.
//
// Gated + graceful (doctrine): needs Supabase (SUPABASE_URL + service-role key) AND an embedding
// key (OPENAI_API_KEY → text-embedding-3-small, 1536-dim). With no embedding key it still STORES
// notes (no vector) so nothing is lost; RECALL just reports semantic:false and the caller falls
// back to plain note recall. Never throws to the caller; never fabricates. No npm — global fetch
// + Node's built-in crypto only. Run the SEMANTIC MEMORY block in db/schema.sql once first.
//
// POST { action:"remember", note }            -> embed + upsert
// POST { action:"recall", query, k=6 }        -> top-K relevant notes
// GET                                          -> config/status
const crypto = require("crypto");

function _kvEnv(suffixRe, excludeRe) {
  for (const k of Object.keys(process.env)) { if (excludeRe && excludeRe.test(k)) continue; if (suffixRe.test(k) && process.env[k]) return process.env[k]; }
  return undefined;
}
const SB_URL = _kvEnv(/SUPABASE_URL$/i);
const SB_KEY = _kvEnv(/SUPABASE_SERVICE_ROLE_KEY$/i) || _kvEnv(/SERVICE_ROLE_KEY$/i) || _kvEnv(/SUPABASE_SECRET/i);
const SB_ON = !!(SB_URL && SB_KEY);
const OPENAI_KEY = process.env.OPENAI_API_KEY || "";
const EMBED_MODEL = process.env.EMBED_MODEL || "text-embedding-3-small"; // 1536-dim — must match schema
const EMBED_ON = !!OPENAI_KEY;

function clean(s, max) { return String(s == null ? "" : s).trim().slice(0, max || 4000); }
function noteId(note) { return crypto.createHash("sha1").update(clean(note)).digest("hex"); }
function vecLiteral(arr) { return "[" + arr.map((x) => (Number.isFinite(x) ? x : 0)).join(",") + "]"; }

// One embedding via OpenAI (global fetch). Returns a number[] or null on any failure.
async function embed(text) {
  if (!EMBED_ON) return null;
  try {
    const r = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + OPENAI_KEY },
      body: JSON.stringify({ model: EMBED_MODEL, input: clean(text, 8000) }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const v = j && j.data && j.data[0] && j.data[0].embedding;
    return Array.isArray(v) ? v : null;
  } catch (e) { return null; }
}

async function sbFetch(path, opts) {
  return fetch(SB_URL.replace(/\/$/, "") + path, {
    ...opts,
    headers: { apikey: SB_KEY, authorization: "Bearer " + SB_KEY, "content-type": "application/json", ...(opts && opts.headers) },
  });
}

// Store (or update) a remembered fact. Always stores the note; adds the embedding when available.
async function remember(note) {
  const text = clean(note);
  if (!text) return { ok: false, error: "empty_note" };
  if (!SB_ON) return { ok: false, configured: false, reason: "supabase_not_configured" };
  try {
    const vec = await embed(text);
    const row = { id: noteId(text), note: text, updated_at: new Date().toISOString() };
    if (vec) row.embedding = vecLiteral(vec);
    const r = await sbFetch("/rest/v1/memory?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(row),
    });
    return { ok: r.ok, stored: r.ok, embedded: !!vec, semantic: !!vec, id: row.id };
  } catch (e) { return { ok: false, error: String(e).slice(0, 140) }; }
}

// Battery state-of-charge: how many facts the battery holds. Cheap HEAD count via PostgREST.
async function charge() {
  if (!SB_ON) return { ok: true, configured: false, count: 0 };
  try {
    const r = await sbFetch("/rest/v1/memory?select=id", { method: "HEAD", headers: { Prefer: "count=exact", Range: "0-0" } });
    const cr = r.headers.get("content-range") || "";      // "0-0/123" or "*/123"
    const total = parseInt((cr.split("/")[1] || "0"), 10) || 0;
    return { ok: true, configured: true, count: total };
  } catch (e) { return { ok: false, configured: true, count: 0, error: String(e).slice(0, 120) }; }
}

// Retrieve the top-K notes most relevant to a query.
async function recall(query, k) {
  const q = clean(query);
  const count = Math.min(20, Math.max(1, parseInt(k, 10) || 6));
  if (!SB_ON) return { ok: false, configured: false, semantic: false, results: [] };
  if (!EMBED_ON) return { ok: true, semantic: false, results: [], note: "no embedding key — caller should fall back to plain note recall" };
  try {
    const vec = await embed(q);
    if (!vec) return { ok: true, semantic: false, results: [] };
    const r = await sbFetch("/rest/v1/rpc/match_memory", {
      method: "POST",
      body: JSON.stringify({ query_embedding: vecLiteral(vec), match_count: count }),
    });
    if (!r.ok) return { ok: false, semantic: true, results: [], error: "rpc_" + r.status };
    const rows = await r.json();
    return { ok: true, semantic: true, results: Array.isArray(rows) ? rows : [] };
  } catch (e) { return { ok: false, error: String(e).slice(0, 140), results: [] }; }
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({ ok: true, configured: SB_ON, semantic: SB_ON && EMBED_ON, embedModel: EMBED_ON ? EMBED_MODEL : null,
      note: "POST {action:'remember',note} or {action:'recall',query,k}. Gated on Supabase + OPENAI_API_KEY; run the SEMANTIC MEMORY block in db/schema.sql once." });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  try {
    const action = clean(body.action, 20);
    if (action === "remember") { res.status(200).json(await remember(body.note)); return; }
    if (action === "recall") { res.status(200).json(await recall(body.query, body.k)); return; }
    res.status(200).json({ ok: false, error: "unknown_action", supported: ["remember", "recall"] });
  } catch (e) { res.status(200).json({ ok: false, error: String(e).slice(0, 140) }); }
};

module.exports.remember = remember;
module.exports.recall = recall;
module.exports.charge = charge;
module.exports.embed = embed;
module.exports._vecLiteral = vecLiteral;
