// Klyfton PROJECTS — the job-lifecycle tracker (the Project Manager's substrate). Answers three
// questions for every job: WHERE is it, what's NEXT, and what's OVERDUE — so nothing falls through
// the cracks between lead and paid. This is the DATA/logic layer; the PM *agent* (hyper-agents
// runtime) will run ON this, drive each stage forward through the arms/bus, and read the wiki for
// how-to. Here we only track + decide next-action; we never send anything.
//
// PURE + deterministic: the stage engine takes a jobs array (the app already has jobRecords) + an
// explicit `nowMs`, and returns the board. No I/O, no Date.now() (so it's unit-testable and can't
// drift). No fabricated business numbers — the only constants are operational FOLLOW-UP cadences
// (clearly DEFAULTS, not pricing/doctrine), overridable per call.
//
// GET  -> the stage contract + default cadences
// POST { jobs:[...], nowMs? } -> the PM board (counts by stage, next actions, overdue list)

// The lifecycle, in order. Terminal stages end the pipeline.
const STAGES = ["lead", "bid", "scheduled", "in_progress", "done", "invoiced", "paid"];
const TERMINAL = new Set(["paid", "lost", "cancelled"]);
const STAGE_SET = new Set(STAGES.concat(["lost", "cancelled"]));

// Operational follow-up cadences (DEFAULTS — not pricing, not doctrine; override via opts).
const DEFAULT_CADENCE = { bidStaleDays: 7, invoiceNetDays: 30 };

function clean(s, max) { return String(s == null ? "" : s).trim().slice(0, max || 200); }
function isTerminal(stage) { return TERMINAL.has(clean(stage)); }
function validateStage(stage) { return STAGE_SET.has(clean(stage)); }

// Next stage in the pipeline (null at a terminal stage or unknown).
function nextStage(stage) {
  const i = STAGES.indexOf(clean(stage));
  if (i < 0 || i >= STAGES.length - 1) return null;
  return STAGES[i + 1];
}

// Map a free-text app/CRM status onto a lifecycle stage. Known keywords only — an unknown status
// is returned as-is (never force-bucketed = never fabricate a stage the data doesn't support).
function normalizeStage(status) {
  const s = clean(status, 60).toLowerCase();
  if (!s) return "lead";
  if (/\bpaid\b|payment received|closed won/.test(s)) return "paid";
  if (/invoic|billed/.test(s)) return "invoiced";
  if (/complete|finished|\bdone\b|job done/.test(s)) return "done";
  if (/in[\s-]?progress|started|working|on site|onsite/.test(s)) return "in_progress";
  if (/schedul|booked|on the calendar|dispatch/.test(s)) return "scheduled";
  if (/quote|bid|estimat|proposal|sent/.test(s)) return "bid";
  if (/lead|new|inquiry|enquiry/.test(s)) return "lead";
  if (/lost|dead|declin|closed lost/.test(s)) return "lost";
  if (/cancel/.test(s)) return "cancelled";
  return s; // unknown — keep the raw status, don't invent one
}

// What to do next at a given stage. Draft-only suggestion + which tool/arm would carry it out.
const NEXT_ACTION = {
  lead:        { action: "Respond fast + qualify (speed-to-lead)", tool: "missed-call / follow-up" },
  bid:         { action: "Send the bid and track it", tool: "proposal-pdf / estimate-followup" },
  scheduled:   { action: "Confirm with customer, stage materials, assign crew", tool: "notify / inventory-reorder" },
  in_progress: { action: "Update status and capture job photos", tool: "photo / sync" },
  done:        { action: "Invoice the completed job", tool: "arm:create_invoice" },
  invoiced:    { action: "Send a payment reminder if it's aging", tool: "invoice-remind" },
  paid:        { action: "Request a review and close it out", tool: "reviews" },
  lost:        { action: "Archive; optional win-back later", tool: "—" },
  cancelled:   { action: "Archive", tool: "—" },
};
function nextAction(job) {
  const stage = normalizeStage(job && (job.stage || job.status));
  return NEXT_ACTION[stage] || { action: "Review — unrecognized stage", tool: "—" };
}

// Days a job has sat at its current stage. Uses the first present timestamp field; null if none.
function stageAgeDays(job, nowMs) {
  const t = job && (job.stageAt || job.updatedAt || job.updated_at || job.date);
  const ms = typeof t === "number" ? t : Date.parse(t);
  if (!Number.isFinite(ms) || !Number.isFinite(nowMs)) return null;
  return Math.max(0, Math.floor((nowMs - ms) / 86400000));
}

// Is this job overdue for its next step? Returns { overdue, reason, days } — deterministic on nowMs.
function isOverdue(job, nowMs, opts) {
  const cad = { ...DEFAULT_CADENCE, ...(opts || {}) };
  const stage = normalizeStage(job && (job.stage || job.status));
  const days = stageAgeDays(job, nowMs);
  if (stage === "bid" && days != null && days > cad.bidStaleDays) return { overdue: true, reason: "bid unanswered " + days + "d", days };
  if (stage === "invoiced" && days != null && days > cad.invoiceNetDays) return { overdue: true, reason: "invoice aging " + days + "d", days };
  if (stage === "scheduled") {
    const d = job && job.date ? Date.parse(job.date) : NaN;
    if (Number.isFinite(d) && Number.isFinite(nowMs) && d < nowMs) return { overdue: true, reason: "scheduled date passed", days };
  }
  return { overdue: false, days };
}

// Move a job forward (or to lost/cancelled). Pure — returns a NEW job, never mutates. Rejects
// unknown targets and backward moves (except to a terminal lost/cancelled).
function advance(job, toStage, nowMs) {
  const from = normalizeStage(job && (job.stage || job.status));
  const to = clean(toStage);
  if (!validateStage(to)) return { ok: false, error: "unknown_stage", to };
  const fi = STAGES.indexOf(from), ti = STAGES.indexOf(to);
  const forwardOk = ti > fi || to === "lost" || to === "cancelled";
  if (!forwardOk) return { ok: false, error: "not_forward", from, to, note: "use lost/cancelled to close early" };
  const updated = { ...job, stage: to };
  if (Number.isFinite(nowMs)) updated.stageAt = nowMs;
  return { ok: true, job: updated, from, to };
}

// The PM board: pipeline snapshot from a jobs array. Pure/deterministic on nowMs.
function summarize(jobs, nowMs, opts) {
  const list = Array.isArray(jobs) ? jobs : [];
  const byStage = {};
  const overdue = [];
  const nextActions = [];
  let open = 0;
  for (const j of list) {
    const stage = normalizeStage(j && (j.stage || j.status));
    byStage[stage] = (byStage[stage] || 0) + 1;
    const who = clean((j && (j.customer || j.name)) || "unnamed", 60);
    if (!isTerminal(stage)) {
      open++;
      const na = nextAction(j);
      nextActions.push({ who, stage, action: na.action, tool: na.tool });
      const od = isOverdue(j, nowMs, opts);
      if (od.overdue) overdue.push({ who, stage, reason: od.reason, days: od.days });
    }
  }
  overdue.sort((a, b) => (b.days || 0) - (a.days || 0));
  return { total: list.length, open, byStage, overdue, nextActions };
}

module.exports = async (req, res) => {
  const guard = require("./guard"); if (!guard.ok(req)) { res.status(401).json(guard.denied()); return; }

  if (req.method === "GET") {
    res.status(200).json({ service: "klyfton-projects", stages: STAGES, terminal: Array.from(TERMINAL),
      cadenceDefaults: DEFAULT_CADENCE,
      note: "POST { jobs:[...], nowMs } for the PM board. Pure tracker — decides next-action/overdue; never sends (the PM agent + arms do that, approval-gated)." });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  try {
    const nowMs = Number.isFinite(body.nowMs) ? body.nowMs : Date.parse(body.now || "") || null;
    res.status(200).json({ ok: true, board: summarize(body.jobs, nowMs, body.cadence) });
  } catch (e) { res.status(200).json({ ok: false, error: String(e).slice(0, 140) }); }
};

module.exports.STAGES = STAGES;
module.exports.isTerminal = isTerminal;
module.exports.validateStage = validateStage;
module.exports.nextStage = nextStage;
module.exports.normalizeStage = normalizeStage;
module.exports.nextAction = nextAction;
module.exports.stageAgeDays = stageAgeDays;
module.exports.isOverdue = isOverdue;
module.exports.advance = advance;
module.exports.summarize = summarize;
