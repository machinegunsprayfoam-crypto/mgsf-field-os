// Consensus mode — "several AIs, one read." Fans ONE question out to every configured AI provider
// (via the vendor-neutral hub in api/provider.js), collects their answers, and computes a light
// agreement analysis: how much they agree, which answer best represents the pack (the medoid), and
// which are outliers. Like 8legs, but on YOUR keys and with a hard safety rule: the question is run
// through the secret/PII redactor FIRST, so nothing sensitive is ever broadcast to outside vendors.
//
// PURE core (analyze/tokenize/jaccard) is keyless + deterministic + unit-tested. Live layer queries
// providers in parallel; inert + honest when fewer than 2 are configured. Never fabricates — an
// agreement number only appears when there are ≥2 real answers to compare.
//
// POST { question, providers?, system? } -> { answers[], analysis }
// GET  -> shape + which providers are available.
const provider = require("./provider");
let redact = null; try { redact = require("./redact"); } catch (e) { redact = null; }

function clean(s, max) { return String(s == null ? "" : s).trim().slice(0, max || 4000); }
function r0(n) { return Math.round(Number(n) || 0); }

const STOP = new Set(("the a an and or but if then of to in on for with without is are was were be been being it its this that these those as at by from into over under out up down about your you i we they he she them his her their our my me do does did can could should would will shall may might must not no yes so than too very just also more most some any each which what who whom whose how why when where".split(" ")));
function tokenize(s) {
  const set = new Set();
  String(s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).forEach((w) => { if (w && w.length > 2 && !STOP.has(w)) set.add(w); });
  return set;
}
function jaccard(a, b) {
  if (!a.size && !b.size) return 1;
  if (!a.size || !b.size) return 0;
  let inter = 0; a.forEach((x) => { if (b.has(x)) inter++; });
  return inter / (a.size + b.size - inter);
}

// Pure: agreement analysis over [{provider,text}]. medoid = the answer most similar to the others.
function analyze(answers) {
  const valid = (Array.isArray(answers) ? answers : []).filter((a) => a && a.text && String(a.text).trim());
  const n = valid.length;
  if (n === 0) return { count: 0, agreementPct: null, verdict: "no answers", majority: null, outliers: [], providers: [] };
  const tok = valid.map((a) => tokenize(a.text));
  // each answer's average similarity to the others
  const avgSim = valid.map((_, i) => {
    if (n === 1) return 1;
    let s = 0; for (let j = 0; j < n; j++) if (j !== i) s += jaccard(tok[i], tok[j]);
    return s / (n - 1);
  });
  const agreementPct = r0((avgSim.reduce((s, x) => s + x, 0) / n) * 100);
  let medoid = 0; for (let i = 1; i < n; i++) if (avgSim[i] > avgSim[medoid]) medoid = i;
  const majority = { provider: valid[medoid].provider, text: valid[medoid].text, alignmentPct: r0(avgSim[medoid] * 100) };
  const outlierCut = Math.max(0.08, 0.4 * avgSim[medoid]);
  const outliers = n >= 3 ? valid.filter((_, i) => avgSim[i] < outlierCut).map((a) => a.provider) : [];
  const verdict = n < 2 ? "single answer (no consensus to measure)"
    : agreementPct >= 65 ? "strong consensus"
      : agreementPct >= 40 ? "partial agreement — check the differences"
        : "they disagree — read each answer";
  return { count: n, agreementPct, verdict, majority, outliers, providers: valid.map((a) => a.provider) };
}

const CONSENSUS_SYSTEM = "Answer the user's question directly and concisely in 3-6 sentences. No preamble.";

// Gated live: query every (or a chosen subset of) configured provider in parallel, then analyze.
async function run(input, deps) {
  input = input || {};
  const prov = (deps && deps.provider) || provider;
  const red = (deps && deps.redact) || redact;
  const question = clean(input.question != null ? input.question : input.q, 4000);
  if (!question) return { ok: false, reason: "no_question" };

  // SAFETY: strip secrets/PII before anything leaves to third-party vendors.
  let q = question, masked = false;
  if (red && typeof red.sanitizeForModel === "function") { const s = red.sanitizeForModel(question); if (s && s !== question) { q = s; masked = true; } }

  const all = prov.listProviders().filter((p) => p.configured);
  const wanted = Array.isArray(input.providers) && input.providers.length ? input.providers : null;
  const chosen = wanted ? all.filter((p) => wanted.includes(p.id)) : all;
  if (chosen.length < 2) {
    return { configured: false, reason: "need_2_providers", available: all.map((p) => p.id),
      note: "Consensus needs ≥2 configured AI providers. Set 2+ keys (e.g. GROQ_API_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY, CEREBRAS_API_KEY, TOGETHER_API_KEY — all free to start)." };
  }
  const results = await Promise.all(chosen.map((p) =>
    Promise.resolve(prov.chat({ provider: p.id, message: q, system: input.system || CONSENSUS_SYSTEM }))
      .then((r) => ({ provider: p.id, ok: !!(r && r.ok), text: r && r.ok ? r.text : null, reason: r && r.reason }))
      .catch(() => ({ provider: p.id, ok: false, reason: "error" }))
  ));
  const good = results.filter((r) => r.ok && r.text).map((r) => ({ provider: r.provider, text: r.text }));
  const analysis = analyze(good);
  return { ok: true, question: q, maskedSensitive: masked, providersQueried: chosen.map((p) => p.id), answers: results, analysis };
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    let providers = [];
    try { providers = provider.listProviders().map((p) => ({ id: p.id, label: p.label, configured: p.configured })); } catch (e) { providers = []; }
    const ready = providers.filter((p) => p.configured).length;
    res.status(200).json({ ok: true, configured: ready >= 2, providersConfigured: ready, providers,
      note: "POST { question } — asks every configured AI provider in parallel and returns each answer + an agreement read (agreementPct, majority/medoid, outliers). Needs ≥2 provider keys. Sensitive content is redacted before broadcast — never send customer PII expecting privacy across outside vendors." });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  try { res.status(200).json(await run(body)); }
  catch (e) { res.status(200).json({ ok: false, error: String(e).slice(0, 140) }); }
};

module.exports.analyze = analyze;
module.exports.tokenize = tokenize;
module.exports.jaccard = jaccard;
module.exports.run = run;
