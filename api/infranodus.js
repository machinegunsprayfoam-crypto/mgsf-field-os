// InfraNodus content-gap / topical-analysis bridge for Klyfton.
//
// InfraNodus builds a knowledge graph from text (or a URL) and returns the main topical
// clusters, key concepts, and — most useful for us — the CONTENT GAPS: the topics that
// SHOULD connect but don't. For MGSF that means "what should we blog about / post about /
// add to a service page to rank for the searches competitors are leaving open."
//
// Gated + safe, same as every other integration here:
//   - Global fetch only, no npm deps (this app installs none).
//   - INACTIVE until INFRANODUS_API_KEY is set in Vercel. Returns {configured:false} and
//     NEVER fabricates topics/gaps when the key is absent.
//   - On-demand only. InfraNodus rate-limits hard (a small quota per ~15 min on most plans),
//     so this is an owner-triggered "run me a content-gap report" tool, NOT something to call
//     on every Klyfton chat. Keep it out of hot paths.
//
// POST { text }            -> analyze raw text
// POST { url }             -> fetch the page server-side, strip to text, analyze
// optional: { name, queries }  (name = graph name in the InfraNodus account)
// GET  -> { configured, ... usage note }
//
// Response (when configured): { configured:true, ok:true, topics:[], concepts:[], gaps:[],
//   summary, raw? } — gaps/topics are [] (never invented) if InfraNodus returns none.

const API = "https://infranodus.com/api/v1/graphAndStatements";
const KEY = process.env.INFRANODUS_API_KEY || "";
const MAX_TEXT = 40000; // keep payloads sane
const TIMEOUT_MS = 25000;

function isConfigured() { return !!KEY; }

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && req.body.length) { try { return JSON.parse(req.body); } catch { return {}; } }
  return await new Promise((resolve) => {
    let d = ""; req.on("data", (c) => (d += c));
    req.on("end", () => { try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); } });
    req.on("error", () => resolve({}));
  });
}

// Very small HTML->text reducer for the url path (no npm parser available).
function htmlToText(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TEXT);
}

async function fetchWithTimeout(url, opts) {
  const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const t = ctl ? setTimeout(() => ctl.abort(), TIMEOUT_MS) : null;
  try { return await fetch(url, Object.assign({}, opts, ctl ? { signal: ctl.signal } : {})); }
  finally { if (t) clearTimeout(t); }
}

// Normalize InfraNodus' response into a small, stable shape. Defensive about field names so
// a minor API change doesn't crash Klyfton — unknown pieces just come back empty, never faked.
function normalize(j) {
  if (!j || typeof j !== "object") return { topics: [], concepts: [], gaps: [], summary: "" };
  const arr = (v) => (Array.isArray(v) ? v : []);
  const gaps =
    arr(j.contentGaps).length ? j.contentGaps :
    arr(j.gaps).length ? j.gaps :
    arr(j.gapAdvice);
  const topics =
    arr(j.mainTopicalClusters).length ? j.mainTopicalClusters :
    arr(j.topicalClusters).length ? j.topicalClusters :
    arr(j.topics);
  const concepts =
    arr(j.mainConcepts).length ? j.mainConcepts :
    arr(j.concepts).length ? j.concepts :
    arr(j.keywords);
  const summary = j.graphSummary || j.summary || (j.statistics && j.statistics.summary) || "";
  return { topics, concepts, gaps, summary };
}

async function analyze(body) {
  if (!isConfigured()) return { configured: false, ok: false, reason: "not_configured" };

  let text = typeof body.text === "string" ? body.text.slice(0, MAX_TEXT) : "";
  if (!text && typeof body.url === "string" && /^https?:\/\//i.test(body.url)) {
    try {
      const r = await fetchWithTimeout(body.url, { headers: { "User-Agent": "Klyfton/InfraNodus" } });
      text = htmlToText(await r.text());
    } catch (e) {
      return { configured: true, ok: false, error: "url_fetch_failed:" + String((e && e.message) || e).slice(0, 100) };
    }
  }
  if (!text) return { configured: true, ok: false, error: "no_text_or_url" };

  const payload = {
    name: (typeof body.name === "string" && body.name.slice(0, 60)) || "mgsf-scan",
    text,
    addStats: true,
    includeStatements: false,
    includeGraphSummary: true,
    modifyAnalyzedText: "none",
  };

  try {
    const r = await fetchWithTimeout(API, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + KEY },
      body: JSON.stringify(payload),
    });
    const txt = await r.text();
    let j; try { j = JSON.parse(txt); } catch { j = null; }
    if (!r.ok) {
      return { configured: true, ok: false, status: r.status,
        error: r.status === 429 ? "rate_limited" : "api_error", detail: txt.slice(0, 200) };
    }
    const norm = normalize(j);
    return Object.assign({ configured: true, ok: true }, norm);
  } catch (e) {
    return { configured: true, ok: false, error: String((e && e.message) || e).slice(0, 140) };
  }
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({
      configured: isConfigured(),
      ok: true,
      note: isConfigured()
        ? "POST { text } or { url } to get topical clusters + content gaps. On-demand only (InfraNodus rate-limits)."
        : "INACTIVE — set INFRANODUS_API_KEY in Vercel (get it at infranodus.com/api-access) to enable content-gap analysis.",
    });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  const body = await readBody(req);
  const out = await analyze(body || {});
  res.status(200).json(out);
};

module.exports.isConfigured = isConfigured;
module.exports.normalize = normalize;
module.exports.htmlToText = htmlToText;
