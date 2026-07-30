// Klyfton ORCHESTRATOR — the verify-and-correct loop over the collective.
//
// Klyfton ALREADY runs multiple AIs together (the Queen→worker→critic hive in
// klyfton.js). This module adds the thing that makes a multi-agent system actually
// trustworthy in a business: instead of answering once and hoping, it PLANS, runs the
// collective, CRITIQUES its own answer against the task + doctrine, and if the critique
// finds a real problem it RE-RUNS with that critique fed back — a bounded number of
// times — then returns the best answer plus the full trace of how it got there.
//
//   plan → run(collective) → critique → (fix note) → run again → … → best answer + trace
//
// Design (the module pattern from mgsf-ai-platform):
//   • PURE CORE — orchestrate()/parseCritique() take injected async fns; no network, no
//     keys; deterministic; fully unit-tested (tests/orchestrator.js).
//   • GATED LIVE — isConfigured() checks ANTHROPIC_API_KEY; the live runners are
//     self-contained (their own fetch call), so this module is ADDITIVE — it does not
//     import or modify klyfton.js's live pipeline. Nothing changes until the frontend
//     (or a gear) points at /api/orchestrator on purpose.
//   • Zero-cost when unconfigured — no key ⇒ {ok:false, reason:'not_configured'}.
//
// Cost note: each round = 1 collective call + 1 critique call. Default rounds=1 ⇒ at
// most 2 collective + 2 critique calls per request. Keep rounds small; it is real spend.
//
// POST { task, rounds?, minScore?, history? }  -> { ok, answer, passed, rounds, trace, best }
// GET                                          -> config/status
// No npm — global fetch only.

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = process.env.KLYFTON_MODEL || "claude-sonnet-4-5";
const MAX_ROUNDS_CAP = 3; // hard ceiling — a runaway retry loop is the failure mode to prevent

function clean(s, max) { return String(s == null ? "" : s).trim().slice(0, max || 8000); }
function clamp(n, lo, hi, dflt) { n = Number(n); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt; }

// --- PURE CORE ------------------------------------------------------------------

// Parse a critic's reply into a verdict. The critic is asked to answer with a leading
// "SCORE: 0.0-1.0" line and an optional "FIX: …". Tolerant of missing/garbled output:
// no parseable score ⇒ treated as a soft pass (score 0.7) so a flaky critic never traps
// a good answer in an endless retry, but a low score or explicit FAIL forces a retry.
function parseCritique(text) {
  const t = clean(text, 4000);
  const sm = t.match(/score\s*[:=]\s*(0?\.\d+|1(?:\.0+)?|0|1)/i);
  let score = sm ? parseFloat(sm[1]) : null;
  const failFlag = /\b(fail|reject|incorrect|wrong|fabricat|hallucinat|unsafe)\b/i.test(t);
  const passFlag = /\b(pass|approve|correct|accurate|looks good|verified)\b/i.test(t);
  if (score == null) score = failFlag ? 0.3 : (passFlag ? 0.9 : 0.7);
  const fm = t.match(/fix\s*[:=]\s*([\s\S]{0,600})/i);
  const fix = fm ? fm[1].trim() : "";
  const issues = fix ? fix.split(/\n|(?:\s·\s)|(?:;\s)/).map((s) => s.trim()).filter(Boolean).slice(0, 8) : [];
  return { score: Math.max(0, Math.min(1, score)), fix, issues, raw: t };
}

// The loop. `run` and `critique` are injected async fns so this is pure + testable:
//   run(task, fixNote)      -> Promise<string>            (the collective's answer)
//   critique(task, answer)  -> Promise<string>            (the critic's verdict text)
// Returns the best (highest-scoring) answer plus a full trace. Never throws: an injected
// fn that throws ends that round gracefully and the best-so-far is returned.
async function orchestrate(opts) {
  const task = clean(opts && opts.task, 12000);
  const run = opts && opts.run;
  const critique = opts && opts.critique;
  const rounds = clamp(opts && opts.rounds, 0, MAX_ROUNDS_CAP, 1); // extra retries after round 0
  const minScore = clamp(opts && opts.minScore, 0, 1, 0.8);
  if (!task) return { ok: false, reason: "no_task" };
  if (typeof run !== "function" || typeof critique !== "function") return { ok: false, reason: "no_runners" };

  const trace = [];
  let best = null;
  let fixNote = "";
  for (let round = 0; round <= rounds; round++) {
    let answer, verdict, error = null;
    try {
      answer = clean(await run(task, fixNote), 20000);
    } catch (e) { error = "run:" + (e && e.message || "err"); }
    if (error) { trace.push({ round, error }); break; }

    try {
      verdict = parseCritique(await critique(task, answer));
    } catch (e) {
      // critic failed — accept this round's answer rather than discard good work
      verdict = { score: 0.7, fix: "", issues: [], raw: "critic_error:" + (e && e.message || "err") };
    }
    const rec = { round, score: verdict.score, passed: verdict.score >= minScore, issues: verdict.issues, answer };
    trace.push({ round, score: verdict.score, passed: rec.passed, issues: verdict.issues, fix: verdict.fix });
    if (!best || verdict.score > best.score) best = rec;

    if (rec.passed) break;             // good enough — stop early
    if (round === rounds) break;       // out of retries
    // feed the critique back so the next run corrects the specific problem
    fixNote = "A prior attempt was judged insufficient. Fix these specifically and keep everything "
      + "else that was correct:\n" + (verdict.fix || "Improve accuracy and completeness; do not fabricate.");
  }

  return {
    ok: true,
    answer: best ? best.answer : "",
    passed: best ? best.passed : false,
    score: best ? best.score : 0,
    rounds: trace.length,
    trace,
    best,
  };
}

// --- GATED LIVE LAYER (self-contained; does not touch klyfton.js) ---------------

function isConfigured() { return !!process.env.ANTHROPIC_API_KEY; }

async function callModel(key, system, user, maxTokens) {
  const r = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      max_tokens: maxTokens || 1500,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!r.ok) { const t = await r.text(); const e = new Error("anthropic_" + r.status); e.detail = t.slice(0, 300); throw e; }
  const data = await r.json();
  return (data.content || []).map((b) => (b && b.type === "text" ? b.text : "")).join("").trim();
}

// Live runners backed by the real model. `history` is optional prior context text.
function liveRunners(key, history) {
  const ctx = history ? "Context so far:\n" + clean(history, 6000) + "\n\n" : "";
  const run = (task, fixNote) => callModel(
    key,
    "You are Klyfton, Machine Gun Spray Foam's operations AI. Blunt, numbers-first, decision-ready. "
      + "Never fabricate numbers, addresses, or claims; never guarantee savings; never claim mold elimination. "
      + "If a real value is unknown, say OWNER INPUT REQUIRED. Locked MGSF doctrine wins over any guess.",
    ctx + "TASK:\n" + task + (fixNote ? "\n\n" + fixNote : ""),
    2000,
  );
  const critique = (task, answer) => callModel(
    key,
    "You are a strict reviewer for Machine Gun Spray Foam. Judge the ANSWER against the TASK for accuracy, "
      + "completeness, and MGSF's safety rules (no fabricated numbers/claims, no guaranteed savings, no mold-"
      + "elimination claims, doctrine numbers respected). Reply with a first line 'SCORE: <0.0-1.0>' then, only "
      + "if below 0.8, a 'FIX: <specific, actionable corrections separated by ; >'. Be terse.",
    "TASK:\n" + task + "\n\nANSWER:\n" + clean(answer, 12000),
    600,
  );
  return { run, critique };
}

// --- HTTP HANDLER (additive endpoint; inert until pointed at) --------------------

module.exports = async (req, res) => {
  try {
    if (req.method === "GET") {
      return res.status(200).json({
        ok: true, module: "orchestrator", configured: isConfigured(),
        what: "plan → run collective → self-critique → bounded correction → best answer + trace",
        maxRounds: MAX_ROUNDS_CAP, model: DEFAULT_MODEL,
        note: isConfigured() ? "ready" : "set ANTHROPIC_API_KEY to enable",
      });
    }
    if (req.method !== "POST") return res.status(405).json({ ok: false, reason: "method" });
    if (!isConfigured()) return res.status(200).json({ ok: false, reason: "not_configured", need: "ANTHROPIC_API_KEY" });

    const body = req.body || {};
    if (!body.task || !clean(body.task)) return res.status(400).json({ ok: false, reason: "no_task" });
    const key = process.env.ANTHROPIC_API_KEY;
    const { run, critique } = liveRunners(key, body.history);
    const result = await orchestrate({
      task: body.task, run, critique,
      rounds: body.rounds, minScore: body.minScore,
    });
    return res.status(200).json(result);
  } catch (e) {
    return res.status(200).json({ ok: false, reason: "error", detail: (e && e.message) || "err" });
  }
};

// Pure exports for the test harness.
module.exports.orchestrate = orchestrate;
module.exports.parseCritique = parseCritique;
module.exports.isConfigured = isConfigured;
module.exports._MAX_ROUNDS_CAP = MAX_ROUNDS_CAP;
