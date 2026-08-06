// Klyfton PREDICTIVE COST — harvested from the parked MOGS PredictiveCosting (F025c) and rebuilt for
// field-os. Predicts a probable job COST from the crew's OWN historical logged actuals via least-squares
// regression (size → cost), with an honest confidence read (R²) and sample count. It NEVER fabricates:
// the prediction is grounded only in real completed jobs that carry both a size dimension and a logged
// cost; with too little history it says so and predicts nothing. It sets NO doctrine price — it's an
// advisory read of what similar past jobs actually cost, for the owner to review before bidding.
//
// PURE CORE (keyless, deterministic — no Date.now, no network): linearPredict / costBreakdown /
// extractHistory / predictFromJobs / formatPrediction.
// GATED LIVE: the handler reads completed jobs from Vercel KV (like business-audit/daily-brief) —
// DORMANT (configured:false) without KV. Reads only; writes nothing.
//
//   GET  /api/predictive-cost                          -> { configured, ... }
//   POST /api/predictive-cost { service?, size?, sizeField? }  -> prediction from real history (KV on)

function _kvEnv(suffixRe, excludeRe) {
  for (const k of Object.keys(process.env)) { if (excludeRe && excludeRe.test(k)) continue; if (suffixRe.test(k) && process.env[k]) return process.env[k]; }
  return undefined;
}
const KV_URL = _kvEnv(/KV_REST_API_URL$/i) || _kvEnv(/REST_API_URL$/i) || _kvEnv(/UPSTASH_REDIS_REST_URL$/i);
const KV_TOKEN = _kvEnv(/KV_REST_API_TOKEN$/i, /READ_ONLY/i) || _kvEnv(/REST_API_TOKEN$/i, /READ_ONLY/i);
const KV_ON = !!(KV_URL && KV_TOKEN);

const MIN_SAMPLES = 3;          // below this, prediction is untrustworthy — say so, don't pretend
const num = (v) => { const n = typeof v === "number" ? v : parseFloat(v); return Number.isFinite(n) ? n : 0; };

// ---- PURE: least-squares cost prediction with R² confidence -----------------------------------------
// history: array of {x, y} OR {area, cost} pairs. Predicts y (cost) for newX. Guards the two degenerate
// cases the original MOGS version divided-by-zero on: n<2, and all-x-identical (zero variance in x) —
// both fall back to the mean cost at LOW confidence instead of returning NaN.
function linearPredict(history, newX) {
  const pts = (history || [])
    .map((h) => ({ x: num(h.x != null ? h.x : h.area), y: num(h.y != null ? h.y : h.cost) }))
    .filter((p) => p.x > 0 && p.y > 0);
  const n = pts.length;
  if (n === 0) return { predicted: 0, confidence: "none", r_squared: 0, samples: 0, method: "none" };

  const mean = (arr) => arr.reduce((s, v) => s + v, 0) / arr.length;
  const yMean = mean(pts.map((p) => p.y));

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (const p of pts) { sumX += p.x; sumY += p.y; sumXY += p.x * p.y; sumX2 += p.x * p.x; }
  const denom = n * sumX2 - sumX * sumX;   // ∝ variance of x; zero when n<2 or all x equal

  if (n < 2 || denom === 0) {
    // not enough spread to fit a line — best honest guess is the average past cost
    return { predicted: Math.max(0, Math.round(yMean)), slope: 0, intercept: yMean,
      confidence: "low", r_squared: 0, samples: n, method: "mean" };
  }

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  const predicted = Math.max(0, slope * num(newX) + intercept);

  // R² = 1 − SS_res/SS_tot
  let ssRes = 0, ssTot = 0;
  for (const p of pts) { const yhat = slope * p.x + intercept; ssRes += (p.y - yhat) ** 2; ssTot += (p.y - yMean) ** 2; }
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  const r_squared = Math.round(Math.max(0, r2) * 100) / 100;
  const confidence = r_squared > 0.7 ? "high" : r_squared > 0.4 ? "medium" : "low";

  return { predicted: Math.round(predicted), slope, intercept, confidence, r_squared, samples: n, method: "regression" };
}

// ---- PURE: split a job's cost into labor / material / misc with percents ------------------------------
function costBreakdown(job) {
  job = job || {};
  const labor = num(job.laborHours) * num(job.laborRate) || num(job.labor);
  const material = num(job.material != null ? job.material : job.materialCost);
  const total0 = labor + material;
  const misc = num(job.overhead != null ? job.overhead : job.equipment) + num(job.other) || 0;
  const total = labor + material + misc;
  const pct = (part) => (total > 0 ? Math.round((part / total) * 100) : 0);
  return { labor, material, misc, total, breakdown: { laborPercent: pct(labor), materialPercent: pct(material), miscPercent: pct(misc) } };
}

// ---- PURE: pull (size → cost) history from real completed jobs for a given service --------------------
// Only jobs that are completed/done/paid/invoiced AND carry both a size dimension and a real logged
// cost count. sizeField lets the caller pick which numeric field is the size (area/sqft/bf/boardFeet);
// default tries them in order. Cost = logged total (material+labor+equipment+other) else `cost` else
// `value` (last resort). Returns [{x,y}] — NEVER invents a data point.
const DONE = new Set(["completed", "done", "paid", "invoiced", "complete"]);
const SIZE_FIELDS = ["area", "sqft", "sq_ft", "squareFeet", "bf", "boardFeet", "board_feet"];
function jobCost(j) {
  const parts = num(j.material) + num(j.labor) + num(j.equipment) + num(j.other);
  if (parts > 0) return parts;
  if (num(j.cost) > 0) return num(j.cost);
  return num(j.actualCost);          // never fall back to sell `value` — that's not a cost
}
function extractHistory(jobs, spec) {
  spec = spec || {};
  const wantSvc = spec.service ? String(spec.service).toLowerCase() : null;
  const sizeFields = spec.sizeField ? [spec.sizeField] : SIZE_FIELDS;
  const out = [];
  for (const j of jobs || []) {
    const status = String(j.status || j.stage || "").toLowerCase();
    if (status && !DONE.has(status)) continue;                     // only settled jobs
    if (wantSvc) { const svc = String(j.service || j.type || "").toLowerCase(); if (!svc.includes(wantSvc) && !wantSvc.includes(svc)) continue; }
    let x = 0; for (const f of sizeFields) { if (num(j[f]) > 0) { x = num(j[f]); break; } }
    const y = jobCost(j);
    if (x > 0 && y > 0) out.push({ x, y });
  }
  return out;
}

// ---- PURE: end-to-end predict from a job list -------------------------------------------------------
function predictFromJobs(jobs, spec) {
  spec = spec || {};
  const history = extractHistory(jobs, spec);
  if (history.length < MIN_SAMPLES) {
    return { ok: false, reason: "insufficient_history", samples: history.length, needed: MIN_SAMPLES,
      note: "Not enough completed jobs with both a size and a logged cost to predict yet — log job costs (log_cost) to build history." };
  }
  const prediction = linearPredict(history, num(spec.size));
  return { ok: true, prediction, formatted: formatPrediction(prediction, spec) };
}

// ---- PURE: owner-facing markdown (advisory, never a committed price) ---------------------------------
function formatPrediction(p, ctx) {
  ctx = ctx || {};
  const badge = { high: "✅ HIGH (tight historical fit)", medium: "⚠️ MEDIUM (some variation)", low: "❌ LOW (weak fit — treat as a rough guide)", none: "— (no data)" }[p.confidence] || "?";
  return [
    "**Predicted cost:** $" + Math.round(p.predicted).toLocaleString(),
    "**Confidence:** " + badge,
    "**Based on:** " + p.samples + " completed job" + (p.samples === 1 ? "" : "s") + (ctx.service ? " (" + ctx.service + ")" : ""),
    p.method === "regression" ? "**Model fit (R²):** " + p.r_squared : "**Method:** average of past jobs (too little size spread to fit a trend)",
    ctx.size ? "**Size:** " + ctx.size : "",
    "",
    "⚠️ ADVISORY — a read of what similar past jobs actually cost, not a quote. Review before bidding; doctrine still sets price.",
  ].filter((l) => l !== "").join("\n");
}

// ---- GATED LIVE handler -----------------------------------------------------------------------------
async function kvGet(col) {
  try {
    const r = await fetch(`${KV_URL}/get/mgsf:${col}`, { headers: { Authorization: `Bearer ${KV_TOKEN}` } });
    if (!r.ok) return [];
    const j = await r.json();
    let v = j && j.result; if (typeof v === "string") { try { v = JSON.parse(v); } catch { v = []; } }
    return Array.isArray(v) ? v : [];
  } catch (e) { return []; }
}

module.exports = async (req, res) => {
  const guard = require("./guard"); if (!guard.ok(req)) { res.status(401).json(guard.denied()); return; }

  if (req.method !== "GET" && req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  if (!KV_ON) { res.status(200).json({ configured: false, reason: "not_configured", note: "Set KV_REST_API_URL + KV_REST_API_TOKEN in Vercel to enable predictive costing over your logged job history." }); return; }
  let body = req.body; if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  const spec = { service: body.service || (req.query && req.query.service), size: body.size || (req.query && req.query.size), sizeField: body.sizeField };
  try {
    const jobs = await kvGet("jobs");
    res.status(200).json({ configured: true, ...predictFromJobs(jobs, spec) });
  } catch (e) { res.status(200).json({ configured: true, ok: false, error: String(e).slice(0, 160) }); }
};

module.exports.linearPredict = linearPredict;
module.exports.costBreakdown = costBreakdown;
module.exports.extractHistory = extractHistory;
module.exports.predictFromJobs = predictFromJobs;
module.exports.formatPrediction = formatPrediction;
module.exports.MIN_SAMPLES = MIN_SAMPLES;
