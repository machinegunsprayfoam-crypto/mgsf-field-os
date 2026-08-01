// Klyfton ENGINEER — the pit crew agent. Assesses the platform's health, capability gaps,
// and knowledge coverage, then produces a prioritized improvement plan for Clifton's review.
//
// WHY THIS EXISTS: the Mechanic (health.js) reports ON/OFF status — the ENGINEER reads that
// report and asks "so what do we do next?" It layers on the CMDB (dependency graph → biggest
// unlock), the curriculum bank (knowledge-gap coverage), and its own domain knowledge to rank
// what to build or set. All outputs are DRAFTS — the Engineer never auto-applies anything.
// Pure core (keyless, fully unit-testable offline) + live layer (AI plan, gated on
// ANTHROPIC_API_KEY). See VEHICLE_ARCHITECTURE.md — "a Mechanic (health/repair) and an
// Engineer (build/improve) — the car has suspension + an ECU, but nobody in the pit."
//
// GET  /api/engineer                           -> roster: what the Engineer can assess
// POST /api/engineer { action:"assess" }       -> keyless: health + cmdb + curriculum gap report
// POST /api/engineer { action:"suggest", id }  -> one-item suggestion for a finding id
// POST /api/engineer { action:"plan", approved? } -> AI improvement plan (ANTHROPIC_API_KEY req'd)
//
// Keyless core exports: assess(env), suggest(findingId, findings), bankCoverage(bank)
// No npm, plain fetch for live layer.

const health = require("./health");
const cmdb = require("./cmdb");

let _curriculum = null;
function getCurriculum() {
  if (!_curriculum) { try { _curriculum = require("./curriculum"); } catch (e) { _curriculum = { BANK: [] }; } }
  return _curriculum;
}

function clean(s, max) { return String(s == null ? "" : s).trim().slice(0, max || 80); }
function _kvEnv(re) { for (const k of Object.keys(process.env)) { if (re.test(k) && process.env[k]) return process.env[k]; } return undefined; }

// Coverage analysis of the curriculum bank — how many questions per module. Keyless.
function bankCoverage(bank) {
  const b = Array.isArray(bank) ? bank : (getCurriculum().BANK || []);
  const counts = {};
  for (const item of b) {
    if (item && item.module) counts[item.module] = (counts[item.module] || 0) + 1;
  }
  return counts;
}

// Classify a finding type label for humans.
function _typeLabel(type) {
  switch (type) {
    case "core_down":      return "Core subsystem offline";
    case "biggest_unlock": return "Biggest unlock";
    case "warning":        return "Env-var warning";
    case "partial":        return "Subsystem partially configured";
    case "dark":           return "Subsystem inert (key not set)";
    default:               return type;
  }
}

// Build an ordered findings list from health + cmdb reports. Returns [{type,id,label,priority,action,...}].
// Priority: 1=core_down, 2=biggest_unlock/warning, 3=partial, 4=dark. Pure/deterministic.
function buildFindings(report, cmdbReport) {
  const findings = [];

  // 1. Core subsystems offline — the machine won't run right
  for (const s of (report.subsystems || [])) {
    if (s.core && s.status !== "on") {
      findings.push({ type: "core_down", id: s.id, label: s.label, priority: 1, action: s.detail });
    }
  }

  // 2a. Biggest unlock — set one thing and the most tools light up
  const bu = cmdbReport && cmdbReport.biggestUnlock;
  if (bu && bu.unlocks > 1) {
    findings.push({ type: "biggest_unlock", id: bu.cap || bu.capability, label: bu.label,
      priority: 2, action: bu.arm, unlocks: bu.unlocks, tools: bu.tools });
  }

  // 2b. Env-var warnings (likely misnamed keys)
  for (const w of (report.warnings || [])) {
    findings.push({ type: "warning", id: w.expected, label: w.expected,
      priority: 2, action: w.hint });
  }

  // 3. Partial subsystems (some keys set, not all)
  for (const s of (report.subsystems || [])) {
    if (s.status === "partial") {
      findings.push({ type: "partial", id: s.id, label: s.label, priority: 3, action: s.detail });
    }
  }

  // 4. Dark subsystems (off, non-core) — skip the one already listed as biggest_unlock
  const buId = bu ? (bu.cap || bu.capability) : null;
  // Map from subsystem id to capability id is not always 1:1, but best-effort dedup on the label.
  const alreadyLabeled = new Set(findings.map(f => f.id));
  for (const s of (report.subsystems || [])) {
    if (s.status === "off" && !s.core && !alreadyLabeled.has(s.id)) {
      findings.push({ type: "dark", id: s.id, label: s.label, priority: 4, action: s.detail });
    }
  }

  return findings.sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
}

// Return a one-item actionable suggestion for a finding id. Pure.
function suggest(findingId, findings) {
  const id = clean(findingId, 60);
  const f = (Array.isArray(findings) ? findings : []).find(x => x && x.id === id);
  if (!f) return { ok: false, error: "finding_not_found", id };
  const note = f.type === "core_down"
    ? "Core offline — this blocks basic operation. Set it first."
    : f.type === "biggest_unlock"
    ? "One switch, maximum impact — lights up " + (f.unlocks || "multiple") + " dark tools."
    : f.type === "warning"
    ? "Likely misnamed env var — the code will silently miss this key."
    : f.type === "partial"
    ? "Partially configured — finish the remaining keys to go fully live."
    : "Optional capability — set when ready to expand.";
  return { ok: true, id: f.id, type: f.type, typeLabel: _typeLabel(f.type),
    label: f.label, action: f.action, priority: f.priority, note,
    ...(f.unlocks ? { unlocks: f.unlocks, tools: f.tools } : {}) };
}

// Main assessment — combines health + cmdb + curriculum into a ranked findings report. Pure.
function assess(env) {
  env = env || {};
  const report = health.buildReport(env);
  const cmdbReport = cmdb.report(env);
  const cur = getCurriculum();
  const coverage = bankCoverage(cur.BANK);
  const findings = buildFindings(report, cmdbReport);

  // Module-level coverage summary: items per module, sorted by coverage desc
  const coverageList = Object.entries(coverage)
    .map(([module, count]) => ({ module, count }))
    .sort((a, b) => b.count - a.count);

  // Build a quick priority summary for humans
  const countByType = {};
  for (const f of findings) countByType[f.type] = (countByType[f.type] || 0) + 1;

  return {
    ok: true,
    assessed: {
      health: report.health,
      subsystems: report.summary,
      providers: report.providers.configured,
    },
    curriculum: {
      modules: coverageList.length,
      totalItems: (cur.BANK || []).length,
      coverage: coverageList,
    },
    cmdb: {
      live: cmdbReport.counts.live,
      dark: cmdbReport.counts.dark,
      total: cmdbReport.counts.components,
    },
    findings,
    summary: countByType,
    topPriority: findings[0] || null,
    note: "Draft assessment. All improvement actions require Clifton's review and approval before anything changes.",
  };
}

// Live: AI-generated improvement plan using the assessment findings.
// Returns a gated draft — never auto-applies. Requires ANTHROPIC_API_KEY.
async function plan(env, opts) {
  env = env || {};
  const apiKey = _kvEnv(/ANTHROPIC_API_KEY$/i);
  if (!apiKey) return { ok: false, error: "hive_dark", detail: "ANTHROPIC_API_KEY not set — cannot generate an AI plan" };

  const assessment = assess(env);
  const topFindings = assessment.findings.slice(0, 6).map(f =>
    "  [" + f.type + "] " + f.label + ": " + f.action);
  const biggestUnlock = assessment.topPriority && assessment.topPriority.type === "biggest_unlock"
    ? "Biggest unlock: " + assessment.topPriority.action + " → lights up " + assessment.topPriority.unlocks + " tools."
    : "";

  const prompt = [
    "You are Klyfton's Engineer agent. Your role: produce a concise, actionable improvement plan",
    "for the MGSF field-OS platform based on the health assessment below.",
    "Rules: (1) never fabricate prices, specs, or vendor claims; (2) label everything PROPOSED —",
    "nothing takes effect without Clifton's approval; (3) flag anything that requires owner action",
    "clearly (⏳); (4) keep it short — a numbered priority list, not an essay.",
    "",
    "Assessment:",
    "  Health: " + assessment.assessed.health,
    "  Subsystems: " + assessment.assessed.subsystems.on + " on, " + assessment.assessed.subsystems.partial + " partial, " + assessment.assessed.subsystems.off + " off",
    "  Curriculum: " + assessment.curriculum.totalItems + " scenarios across " + assessment.curriculum.modules + " modules",
    "  CMDB: " + assessment.cmdb.live + "/" + assessment.cmdb.total + " components live",
    biggestUnlock,
    "",
    "Top findings:",
    ...topFindings,
    "",
    "Produce a 5–8 item ranked improvement plan. Each item: priority number, what to do, why it",
    "matters, and whether it needs Clifton (⏳) or can be done autonomously (✅ draft).",
  ].filter(Boolean).join("\n");

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.ENGINEER_MODEL || "claude-haiku-4-5",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!r.ok) { const t = await r.text(); return { ok: false, error: "api_error", status: r.status, detail: t.slice(0, 200) }; }
    const data = await r.json();
    const text = (data.content && data.content[0] && data.content[0].text) || "";
    return {
      ok: true,
      plan: text,
      assessment,
      approved: !!(opts && opts.approved),
      note: opts && opts.approved
        ? "Plan acknowledged. Outward actions still require per-step approval through the arms."
        : "PROPOSED — review and set approved:true to acknowledge (each action still needs per-step sign-off).",
    };
  } catch (e) { return { ok: false, error: String(e).slice(0, 140) }; }
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({
      service: "klyfton-engineer",
      goal: "Keep the platform healthy, current, and improving — assess gaps and draft a prioritized improvement plan.",
      actions: ["assess (keyless)", "suggest <id> (keyless)", "plan (needs ANTHROPIC_API_KEY)"],
      note: "All outputs are drafts. Nothing changes without Clifton's approval.",
    });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  const guard = require("./guard"); if (!guard.ok(req)) { res.status(401).json(guard.denied()); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  const action = clean(body.action || body.cmd || "", 30);
  try {
    if (action === "assess") { res.status(200).json(assess(process.env)); return; }
    if (action === "suggest") {
      const a = assess(process.env);
      res.status(200).json(suggest(body.id || body.finding, a.findings));
      return;
    }
    if (action === "plan") {
      res.status(200).json(await plan(process.env, { approved: body.approved === true }));
      return;
    }
    res.status(200).json({ ok: false, error: "unknown_action", supported: ["assess", "suggest", "plan"] });
  } catch (e) { res.status(200).json({ ok: false, error: String(e).slice(0, 140) }); }
};

module.exports.assess = assess;
module.exports.suggest = suggest;
module.exports.plan = plan;
module.exports.buildFindings = buildFindings;
module.exports.bankCoverage = bankCoverage;
