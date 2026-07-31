// Klyfton WIKI — the editable knowledge base. The missing middle layer between LOCKED doctrine
// (mgsf-core, never edited casually) and LOOSE memory (pgvector facts). Holds human-written,
// no-code-editable articles: SOPs, playbooks, product notes, process docs. The brain RETRIEVES
// the most relevant articles for a question and grounds its answer on them — so Clifton or the
// crew grow Klyfton's knowledge by writing an article, not by editing api/klyfton.js.
//
// LAYERS OF TRUTH (highest wins): mgsf-core doctrine  >  wiki articles  >  semantic memory.
// The retrieval block says this explicitly so the brain never lets a wiki article override a
// locked price/margin/code number.
//
// Gated + graceful (doctrine): needs Supabase (SUPABASE_URL + service-role key). With no Supabase
// it no-ops — retrieve() returns { configured:false, results:[] } and never throws, so the app is
// unchanged until the owner attaches storage + runs the WIKI block in db/wiki_schema.sql. Writes
// are OWNER-gated (approved:true) — the brain proposes an article; it isn't saved silently.
// No npm — global fetch + Node crypto only. The RANKING is pure/deterministic (unit-tested offline).
//
// GET  ?q=...            -> top-K relevant articles (retrieve)
// GET                    -> list article titles + config/status
// POST { action:"save", article, approved:true } -> upsert an article (owner-gated)
const crypto = require("crypto");

function _kvEnv(suffixRe, excludeRe) {
  for (const k of Object.keys(process.env)) { if (excludeRe && excludeRe.test(k)) continue; if (suffixRe.test(k) && process.env[k]) return process.env[k]; }
  return undefined;
}
const SB_URL = _kvEnv(/SUPABASE_URL$/i);
const SB_KEY = _kvEnv(/SUPABASE_SERVICE_ROLE_KEY$/i) || _kvEnv(/SERVICE_ROLE_KEY$/i) || _kvEnv(/SUPABASE_SECRET/i);
const SB_ON = !!(SB_URL && SB_KEY);

function clean(s, max) { return String(s == null ? "" : s).trim().slice(0, max || 20000); }
function slugify(title) {
  return clean(title, 120).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "untitled";
}
function articleId(slug) { return crypto.createHash("sha1").update(slug).digest("hex"); }

// ---- PURE retrieval ranking (deterministic, no I/O — the testable core) ----
const STOP = new Set(["the", "a", "an", "and", "or", "of", "to", "for", "in", "on", "is", "it", "do", "we", "you", "my", "how", "what", "with", "at", "by"]);
// Light suffix stemming so "finance"~"financing", "spray"~"spraying", "closed"~"close" all match.
// Only stems words >4 chars and keeps the result if it stays ≥3 chars (avoids nuking short words).
function stem(w) {
  if (w.length <= 4) return w;
  const s = w.replace(/(ing|ed|es|s|e)$/, "");
  return s.length >= 3 ? s : w;
}
function tokens(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w)).map(stem);
}
// Score an article against a query: title hits weigh 3, tags 2, body 1. Deterministic.
function scoreArticle(article, query) {
  if (!article) return 0;
  const q = tokens(query);
  if (!q.length) return 0;
  const title = new Set(tokens(article.title));
  const tags = new Set(tokens(Array.isArray(article.tags) ? article.tags.join(" ") : article.tags));
  const body = new Set(tokens(article.body));
  let s = 0;
  for (const w of new Set(q)) {
    if (title.has(w)) s += 3;
    if (tags.has(w)) s += 2;
    if (body.has(w)) s += 1;
  }
  return s;
}
// Rank a list of articles for a query; return the top-k with score>0 (pure).
function rank(articles, query, k) {
  const kk = k || 3;
  return (Array.isArray(articles) ? articles : [])
    .map((a) => ({ a, s: scoreArticle(a, query) }))
    .filter((x) => x.s > 0)
    .sort((x, y) => y.s - x.s)
    .slice(0, kk)
    .map((x) => x.a);
}
function snippet(body, n) {
  const b = clean(body, 4000).replace(/\s+/g, " ");
  return b.length > (n || 240) ? b.slice(0, n || 240).replace(/\s\S*$/, "") + "…" : b;
}
function validateArticle(a) {
  const errors = [];
  if (!a || typeof a !== "object") return { ok: false, errors: ["not an object"] };
  if (!clean(a.title, 200)) errors.push("title required");
  if (!clean(a.body, 20000)) errors.push("body required");
  return { ok: errors.length === 0, errors };
}

async function sbFetch(path, opts) {
  return fetch(SB_URL.replace(/\/$/, "") + path, {
    ...opts,
    headers: { apikey: SB_KEY, authorization: "Bearer " + SB_KEY, "content-type": "application/json", ...(opts && opts.headers) },
  });
}

// ---- gated live layer (graceful — never throws, never fabricates) ----
async function list(limit) {
  if (!SB_ON) return { configured: false, results: [] };
  try {
    const r = await sbFetch("/rest/v1/wiki_articles?select=slug,title,category,tags&status=eq.published&order=updated_at.desc&limit=" + (limit || 100));
    if (!r.ok) return { configured: true, ok: false, results: [], status: r.status };
    const rows = await r.json();
    return { configured: true, ok: true, results: Array.isArray(rows) ? rows : [] };
  } catch (e) { return { configured: true, ok: false, results: [], error: String(e).slice(0, 120) }; }
}

// The brain-facing call: pull the most relevant published articles for a question.
async function retrieve(query, k) {
  if (!SB_ON) return { configured: false, results: [] };
  if (!clean(query, 500)) return { configured: true, results: [] };
  try {
    const r = await sbFetch("/rest/v1/wiki_articles?select=slug,title,category,tags,body&status=eq.published&limit=500");
    if (!r.ok) return { configured: true, ok: false, results: [], status: r.status };
    const rows = await r.json();
    const top = rank(rows, query, k || 3);
    return { configured: true, ok: true, results: top.map((a) => ({ slug: a.slug, title: a.title, snippet: snippet(a.body) })) };
  } catch (e) { return { configured: true, ok: false, results: [], error: String(e).slice(0, 120) }; }
}

// Owner-gated write: the brain PROPOSES; nothing saves without approved:true.
async function save(article, opts) {
  const o = opts || {};
  const v = validateArticle(article);
  if (!v.ok) return { ok: false, error: "invalid_article", errors: v.errors };
  if (o.approved !== true) {
    return { ok: true, status: "needs_approval", preview: "Save wiki article: " + clean(article.title, 100),
      note: "Knowledge edit — will only save when re-sent with approved:true." };
  }
  if (!SB_ON) return { ok: false, configured: false, error: "not_configured", note: "attach Supabase + run db/wiki_schema.sql" };
  try {
    const slug = clean(article.slug, 80) || slugify(article.title);
    const row = {
      id: articleId(slug), slug, title: clean(article.title, 200),
      category: clean(article.category, 60) || "general",
      tags: Array.isArray(article.tags) ? article.tags.map((t) => clean(t, 40)).slice(0, 20) : [],
      body: clean(article.body, 20000), status: clean(article.status, 20) || "published",
      source: clean(o.actor, 60) || "owner", updated_at: new Date().toISOString(),
    };
    const r = await sbFetch("/rest/v1/wiki_articles?on_conflict=id", {
      method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(row),
    });
    return { ok: r.ok || r.status === 409, status: r.status, slug };
  } catch (e) { return { ok: false, error: String(e).slice(0, 140) }; }
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    const q = (req.query && (req.query.q || req.query.query)) || "";
    if (q) { res.status(200).json(await retrieve(q, 5)); return; }
    const l = await list();
    res.status(200).json({ service: "klyfton-wiki", configured: SB_ON, articles: l.results,
      note: SB_ON ? "GET ?q=... to retrieve; POST {action:'save',article,approved:true} to add" : "attach Supabase + run db/wiki_schema.sql to enable" });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  try {
    if (body.action === "save") { res.status(200).json(await save(body.article, { approved: body.approved === true, actor: body.actor })); return; }
    if (body.query || body.q) { res.status(200).json(await retrieve(body.query || body.q, body.k || 5)); return; }
    res.status(400).json({ error: "unknown_action", supported: ["save", "retrieve(query)"] });
  } catch (e) { res.status(200).json({ ok: false, error: String(e).slice(0, 140) }); }
};

// exports for the brain + tests
module.exports.retrieve = retrieve;
module.exports.list = list;
module.exports.save = save;
module.exports.rank = rank;
module.exports.scoreArticle = scoreArticle;
module.exports.validateArticle = validateArticle;
module.exports.slugify = slugify;
module.exports._tokens = tokens;
