// Klyfton PIPELINE RAIL — the lead → estimate → job → actuals spine.
//
// WHY THIS EXISTS: the weekly self-audit (MGSF_Brain_Audit_2026-08-07) found "the funnel has no
// middle" — estimates, jobs, and costs were never RECORDED or LINKED, so quoted-vs-actual margin (the
// whole point of the locked pricing doctrine) was structurally unmeasurable. This module is the missing
// backbone: pure, deterministic functions that
//   (1) normalize an estimate into a record that CARRIES the bid breakdown (BF/sets/hours/material/labor),
//   (2) advance a lead through the pipeline without ever REGRESSING it, and
//   (3) convert a won estimate into a JOB that carries the bid forward in the exact shape
//       api/yield-variance.js (variance({bid,actual})) + api/job-cost.js consume —
// so the moment the crew logs actuals, the loop closes and real margin becomes measurable.
//
// GROUNDED / NEVER FABRICATES: it only carries figures the caller supplied; a missing bid field stays
// null (never a guess). No prices invented here — dollars come from the estimator / DOCTRINE. The pure
// core takes NO Date.now (ids/dates are caller-supplied or passed via opts) so it is deterministic and
// unit-testable; only the HTTP handler reaches for the clock. Nothing here sends or persists — the
// frontend/sync layer persists the records this returns (same pattern as api/job-cost.js).
//
//   GET  /api/pipeline                          -> stages + shape
//   POST /api/pipeline {action:"estimate", ...} -> normalized estimate record (carries the bid)
//   POST /api/pipeline {action:"convert", estimate:{...}} -> a job record carrying that bid
//   POST /api/pipeline {action:"rail", customer, leads, estimates, jobs, jobcosts} -> where they sit + next action

// The lead pipeline (sales) then the job pipeline (delivery). Order matters — index = progress.
const LEAD_STAGES = ["New", "Qualified", "Estimate Sent", "Follow-Up", "Won", "Lost"];
const JOB_STAGES = ["Scheduled", "In Progress", "Completed"];
// Stages at/after "Estimate Sent" that a save must never pull a lead BACKWARD out of.
const AHEAD = new Set(["Estimate Sent", "Follow-Up", "Won", "Lost"]);

function num(v) { const n = parseFloat(v); return Number.isFinite(n) ? n : null; }
function txt(v, max) { return v == null ? null : String(v).trim().slice(0, max || 200) || null; }
function key(name) { return String(name == null ? "" : name).trim().toLowerCase(); }
function round(n) { return n == null ? null : Math.round(n); }

// Pull the bid breakdown out of an estimator payload, accepting the estimator's varied key names.
// Every field is null unless the caller supplied it (or it's cleanly derivable). This is the object
// that must survive all the way to the job so yield-variance/job-cost can compare actual vs bid.
function bidFrom(input) {
  input = input || {};
  const b = input.bid || input;
  const boardFeet = num(b.boardFeet != null ? b.boardFeet : (b.bf != null ? b.bf : b.BF));
  const sets = num(b.sets != null ? b.sets : b.setsUsed);
  const laborHours = num(b.laborHours != null ? b.laborHours : b.hours);
  const material = num(b.material != null ? b.material : b.materialCost);
  const labor = num(b.labor != null ? b.labor : b.laborCost);
  let cost = num(b.cost != null ? b.cost : b.directCost);
  if (cost == null && material != null && labor != null) cost = material + labor;   // derive only from real inputs
  const sell = num(b.sell != null ? b.sell : (b.total != null ? b.total : (b.value != null ? b.value : b.price)));
  return {
    boardFeet, sets, laborHours,
    material: round(material), labor: round(labor), cost: round(cost),
    sell: round(sell),
  };
}

// Normalize an estimator save into a durable ESTIMATE record. Carries the bid + the lead key so the
// rest of the rail can link it. id/date come from opts (handler supplies the clock) — pure core.
function estimateRecord(input, opts) {
  input = input || {}; opts = opts || {};
  const customer = txt(input.customer != null ? input.customer : input.name, 120);
  const bid = bidFrom(input);
  const total = bid.sell != null ? bid.sell : round(num(input.total != null ? input.total : input.value));
  const gm = num(input.gm);
  return {
    id: input.id != null ? input.id : (opts.id != null ? opts.id : null),
    kind: "estimate",
    leadKey: customer ? key(customer) : null,
    customer,
    service: txt(input.service, 120),
    cell: txt(input.cell || input.product, 60),      // closed/open/roofing — which yield to compare later
    state: txt(input.state, 8),
    market: txt(input.market, 40),
    date: txt(input.date || opts.date, 10),
    total,
    gm: gm != null ? Math.round(gm * 1000) / 1000 : null,
    bid,
    stage: "Estimate Sent",
    estimateId: input.id != null ? input.id : (opts.id != null ? opts.id : null),
  };
}

// Advance a lead to a target stage without ever regressing one already further along (idempotent).
// Returns { lead, action:"advanced"|"held" } — mirrors the frontend auto-hallway rule, reusable + pure.
function advanceLead(lead, toStage) {
  lead = Object.assign({}, lead || {});
  const cur = lead.status || "";
  const to = LEAD_STAGES.includes(toStage) ? toStage : cur;
  // never pull a lead backward out of an at/after-"Estimate Sent" stage, unless moving to Won/Lost
  const regressBlocked = AHEAD.has(cur) && LEAD_STAGES.indexOf(to) < LEAD_STAGES.indexOf(cur) && to !== "Won" && to !== "Lost";
  if (!cur || (!regressBlocked && to !== cur)) { lead.status = to; return { lead, action: "advanced" }; }
  return { lead, action: "held" };
}

// Convert a WON estimate into a JOB that carries the bid forward. The job's bid is what the actual-side
// engines (yield-variance, job-cost) compare against — this is the link that makes margin measurable.
function jobFromEstimate(est, opts) {
  est = est || {}; opts = opts || {};
  const bid = est.bid ? bidFrom(est.bid) : bidFrom(est);
  const customer = txt(est.customer != null ? est.customer : est.name, 120);
  const value = bid.sell != null ? bid.sell : round(num(est.total != null ? est.total : est.value));
  const service = txt(est.service, 120);
  return {
    id: opts.id != null ? opts.id : null,
    jobNum: opts.jobNum != null ? String(opts.jobNum) : null,   // caller (frontend) assigns the running number
    name: (service ? service + " — " : "") + (customer || "Job"), // so the job never renders as "undefined"
    kind: "job",
    estimateId: est.id != null ? est.id : (est.estimateId != null ? est.estimateId : null),
    leadKey: customer ? key(customer) : (est.leadKey || null),
    customer,
    service,
    cell: txt(est.cell || est.product, 60),
    state: txt(est.state, 8),
    status: "Scheduled",
    value,
    date: txt(opts.date || est.date, 10),
    bid,                         // <- carried forward; yield-variance.variance({bid, actual}) consumes this
  };
}

// Where does a customer sit in the rail right now, and what's the ONE next action? This is the
// funnel-middle visibility the audit asked for — computed from the real collections, never invented.
function railFor(customer, data) {
  data = data || {};
  const k = key(customer);
  const isDead = (s) => /lost|dead|unqualif|cancel/i.test(String(s || ""));
  const match = (r) => r && (key(r.customer != null ? r.customer : r.name) === k || key(r.leadKey) === k);
  const lead = (data.leads || []).find(match) || null;
  const ests = (data.estimates || []).filter(match);
  const jobs = (data.jobs || []).filter(match);
  const costs = (data.jobcosts || []).filter(match);
  const hasEstimate = ests.length > 0;
  const hasJob = jobs.length > 0;
  const hasActuals = costs.length > 0 || jobs.some((j) => j && (j.actual || /complete|paid/i.test(j.status || "")));

  let stage, nextAction;
  if (!lead && !hasEstimate) { stage = "none"; nextAction = "No record — capture the lead first."; }
  else if (lead && isDead(lead.status)) { stage = "closed"; nextAction = "Closed/lost — no action."; }
  else if (!hasEstimate) { stage = "lead"; nextAction = "Build + send an estimate (logs the bid)."; }
  else if (!hasJob) { stage = "estimate"; nextAction = "Follow up → on Won, convert the estimate to a job (carries the bid)."; }
  else if (!hasActuals) { stage = "job"; nextAction = "Log job actuals at completion to close the loop."; }
  else { stage = "measured"; nextAction = "Actuals logged — review quoted-vs-actual margin (yield-variance)."; }

  return {
    customer: txt(customer, 120), stage, nextAction,
    hasLead: !!lead, hasEstimate, hasJob, hasActuals,
    counts: { estimates: ests.length, jobs: jobs.length, jobcosts: costs.length },
  };
}

// Portfolio funnel health across ALL leads — surfaces "the funnel has no middle" on real numbers:
// how many leads reached an estimate, how many estimates became jobs, how many jobs got actuals.
function funnelHealth(data) {
  data = data || {};
  const leads = (data.leads || []).filter((l) => l);
  const estimates = (data.estimates || []).filter((e) => e);
  const jobs = (data.jobs || []).filter((j) => j);
  const costs = (data.jobcosts || []).filter((c) => c);
  const estKeys = new Set(estimates.map((e) => key(e.customer != null ? e.customer : (e.name || e.leadKey))).filter(Boolean));
  const jobFromEst = jobs.filter((j) => j.estimateId != null).length;
  const jobsWithBid = jobs.filter((j) => j && j.bid && (j.bid.cost != null || j.bid.boardFeet != null)).length;
  return {
    leads: leads.length,
    estimates: estimates.length,
    jobs: jobs.length,
    jobcosts: costs.length,
    leadsWithEstimate: estKeys.size,
    jobsFromEstimate: jobFromEst,
    jobsCarryingBid: jobsWithBid,
    // the disconnect, quantified: estimates that never became a measurable job
    measurableJobs: jobs.filter((j) => j && j.bid && j.bid.cost != null).length,
    gap: estimates.length > 0 && jobFromEst === 0 ? "funnel-middle: estimates exist but none converted to a job record" :
         (jobs.length > 0 && jobsWithBid === 0 ? "jobs exist but none carry a bid — quoted-vs-actual not measurable" : null),
  };
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({
      ok: true, configured: true, leadStages: LEAD_STAGES, jobStages: JOB_STAGES,
      note: "POST {action:'estimate'|'convert'|'rail'|'funnel', ...}. Pure rail logic — normalizes an estimate (carries the bid), converts a won estimate into a job (bid forward), and reports where a customer sits + the next action. Never fabricates; persistence is the app's (sync).",
    });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body; if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  const now = new Date();
  const stamp = now.toISOString().slice(0, 10);
  try {
    if (body.action === "convert") {
      res.status(200).json({ ok: true, job: jobFromEstimate(body.estimate || body, { id: Date.now(), date: body.date || stamp }) });
    } else if (body.action === "rail") {
      res.status(200).json({ ok: true, rail: railFor(body.customer || body.name, body) });
    } else if (body.action === "funnel") {
      res.status(200).json({ ok: true, funnel: funnelHealth(body) });
    } else {
      // default: normalize an estimate record
      res.status(200).json({ ok: true, estimate: estimateRecord(body, { id: Date.now(), date: body.date || stamp }) });
    }
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e && e.message || e).slice(0, 200) });
  }
};

module.exports.LEAD_STAGES = LEAD_STAGES;
module.exports.JOB_STAGES = JOB_STAGES;
module.exports.bidFrom = bidFrom;
module.exports.estimateRecord = estimateRecord;
module.exports.advanceLead = advanceLead;
module.exports.jobFromEstimate = jobFromEstimate;
module.exports.railFor = railFor;
module.exports.funnelHealth = funnelHealth;
