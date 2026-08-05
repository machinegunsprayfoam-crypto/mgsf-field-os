// Klyfton CODING LESSONS — cross-session memory for the build/coding agents (roadmap item "B":
// keep it in YOUR Supabase, no third-party "hivemind"). A session CAPTUREs a problem→fix lesson;
// a later session SUGGESTs the relevant prior lesson BY MEANING (pgvector) before re-solving it.
// This is the automatable version of what NIGHT_LOG.md / PROJECT_MEMORY.md do by hand.
//
// Module pattern (doctrine): pure core (keyless, deterministic, no Date.now in the core) + a gated
// live layer that is INERT without Supabase + an embedding key, never fabricates, never throws to
// the caller. Reuses /api/memory's embedding path so the vector dimension can't drift. No npm.
// Run the CODING LESSONS block in db/lessons_schema.sql once first.
//
// POST { action:"capture", problem, fix, area?, tags? }   -> embed + upsert a lesson
// POST { action:"suggest", problem, k=5 }                 -> top-K prior lessons by meaning
// POST { action:"count" }                                 -> how many lessons are stored
// GET                                                      -> config/status
const crypto = require("crypto");
const memory = require("./memory"); // reuse embed() so the 1536-dim model stays in lock-step

// ---- env detection (regex over keys — no new literal env-var reads to document) ----
function _kvEnv(suffixRe, excludeRe) {
  for (const k of Object.keys(process.env)) { if (excludeRe && excludeRe.test(k)) continue; if (suffixRe.test(k) && process.env[k]) return process.env[k]; }
  return undefined;
}
const SB_URL = _kvEnv(/SUPABASE_URL$/i);
const SB_KEY = _kvEnv(/SUPABASE_SERVICE_ROLE_KEY$/i) || _kvEnv(/SERVICE_ROLE_KEY$/i) || _kvEnv(/SUPABASE_SECRET/i);
const SB_ON = !!(SB_URL && SB_KEY);

// ============================ PURE CORE (keyless, deterministic) ============================
function clean(s, max) { return String(s == null ? "" : s).trim().slice(0, max || 4000); }

// Normalize a problem string for the stable id: lowercase + collapse whitespace, so
// "Crew code  401" and "crew code 401" are the SAME lesson (update, not a duplicate).
function normProblem(problem) { return clean(problem, 2000).toLowerCase().replace(/\s+/g, " "); }
function lessonKey(problem) { return crypto.createHash("sha1").update(normProblem(problem)).digest("hex"); }

// Tags → clean, de-duped, lowercase array (≤10, ≤40 chars each). Accepts array or comma string.
function normTags(tags) {
  let arr = Array.isArray(tags) ? tags : (typeof tags === "string" ? tags.split(",") : []);
  const out = [];
  for (const t of arr) {
    const c = clean(t, 40).toLowerCase();
    if (c && out.indexOf(c) < 0) out.push(c);
    if (out.length >= 10) break;
  }
  return out;
}

// Validate + shape a lesson from raw input. Returns {ok:true, lesson} or {ok:false, error}.
// problem + fix are REQUIRED (a lesson with no fix is noise); everything else optional.
function normalizeLesson(input) {
  input = input || {};
  const problem = clean(input.problem, 2000);
  const fix = clean(input.fix, 4000);
  if (!problem) return { ok: false, error: "missing_problem" };
  if (!fix) return { ok: false, error: "missing_fix" };
  return {
    ok: true,
    lesson: {
      id: lessonKey(problem),
      problem,
      fix,
      area: clean(input.area, 120) || null,
      tags: normTags(input.tags),
    },
  };
}

// The canonical text that gets embedded + shown as recall context. Deterministic.
function lessonText(lesson) {
  lesson = lesson || {};
  const parts = ["PROBLEM: " + clean(lesson.problem, 2000), "FIX: " + clean(lesson.fix, 4000)];
  if (lesson.area) parts.push("AREA: " + clean(lesson.area, 120));
  const tags = normTags(lesson.tags);
  if (tags.length) parts.push("TAGS: " + tags.join(", "));
  return parts.join("\n");
}

// ============================ GATED LIVE LAYER (inert without keys) ============================
function sbFetch(path, opts) {
  return fetch(SB_URL.replace(/\/$/, "") + path, {
    ...opts,
    headers: { apikey: SB_KEY, authorization: "Bearer " + SB_KEY, "content-type": "application/json", ...(opts && opts.headers) },
  });
}

// Capture (or update) one problem→fix lesson. Always needs Supabase; adds the embedding when an
// embedding key is present (without it, stores the lesson with no vector so nothing is lost, but
// suggest() can't find it semantically until backfilled). Never throws; never fabricates.
async function capture(input) {
  const n = normalizeLesson(input);
  if (!n.ok) return { ok: false, error: n.error };
  if (!SB_ON) return { ok: false, configured: false, reason: "supabase_not_configured" };
  try {
    const vec = await memory.embed(lessonText(n.lesson));
    const row = {
      id: n.lesson.id, problem: n.lesson.problem, fix: n.lesson.fix,
      area: n.lesson.area, tags: n.lesson.tags, updated_at: new Date().toISOString(),
    };
    if (vec) row.embedding = memory._vecLiteral(vec);
    const r = await sbFetch("/rest/v1/lessons?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(row),
    });
    return { ok: r.ok, stored: r.ok, embedded: !!vec, semantic: !!vec, id: row.id };
  } catch (e) { return { ok: false, error: String(e).slice(0, 140) }; }
}

// Suggest the top-K prior lessons most relevant (by meaning) to a new problem.
async function suggest(problem, k) {
  const q = clean(problem, 2000);
  const count = Math.min(15, Math.max(1, parseInt(k, 10) || 5));
  if (!q) return { ok: false, error: "missing_problem", results: [] };
  if (!SB_ON) return { ok: false, configured: false, semantic: false, results: [] };
  try {
    const vec = await memory.embed(q);
    if (!vec) return { ok: true, semantic: false, results: [], note: "no embedding key — cross-session lesson recall is off" };
    const r = await sbFetch("/rest/v1/rpc/match_lessons", {
      method: "POST",
      body: JSON.stringify({ query_embedding: memory._vecLiteral(vec), match_count: count }),
    });
    if (!r.ok) return { ok: false, semantic: true, results: [], error: "rpc_" + r.status };
    const rows = await r.json();
    return { ok: true, semantic: true, results: Array.isArray(rows) ? rows : [] };
  } catch (e) { return { ok: false, error: String(e).slice(0, 140), results: [] }; }
}

// How many lessons are stored (cheap HEAD count via PostgREST).
async function count() {
  if (!SB_ON) return { ok: true, configured: false, count: 0 };
  try {
    const r = await sbFetch("/rest/v1/lessons?select=id", { method: "HEAD", headers: { Prefer: "count=exact", Range: "0-0" } });
    const cr = r.headers.get("content-range") || "";
    return { ok: true, configured: true, count: parseInt((cr.split("/")[1] || "0"), 10) || 0 };
  } catch (e) { return { ok: false, configured: true, count: 0, error: String(e).slice(0, 120) }; }
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({
      ok: true, configured: SB_ON,
      note: "Cross-session coding-lesson memory (roadmap B). POST {action:'capture',problem,fix,area?,tags?}, {action:'suggest',problem,k}, or {action:'count'}. Gated on Supabase + OPENAI_API_KEY; run db/lessons_schema.sql once.",
    });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  try {
    const action = clean(body.action, 20);
    if (action === "capture") { res.status(200).json(await capture(body)); return; }
    if (action === "suggest") { res.status(200).json(await suggest(body.problem, body.k)); return; }
    if (action === "count") { res.status(200).json(await count()); return; }
    res.status(200).json({ ok: false, error: "unknown_action", supported: ["capture", "suggest", "count"] });
  } catch (e) { res.status(200).json({ ok: false, error: String(e).slice(0, 140) }); }
};

// pure core (for tests + reuse)
module.exports.normalizeLesson = normalizeLesson;
module.exports.lessonKey = lessonKey;
module.exports.normProblem = normProblem;
module.exports.normTags = normTags;
module.exports.lessonText = lessonText;
// gated live
module.exports.capture = capture;
module.exports.suggest = suggest;
module.exports.count = count;
