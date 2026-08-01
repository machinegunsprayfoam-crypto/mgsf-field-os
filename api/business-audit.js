// Klyfton BUSINESS AUDIT — the business analog of engineer.js (which audits the PLATFORM). Reads the
// app's own records (leads / jobs / estimates / invoices) and produces a prioritized, decision-ready
// findings list: pipeline health, stale bids, cold leads, AR aging, overdue jobs, close rate, customer
// concentration, and (only if a target is supplied) margin. Every finding traces to a real record count
// or a clearly-labeled operational threshold — NOTHING is fabricated, and it never states a price or a
// margin target of its own (doctrine owns dollars; the GM target is caller-supplied or the check is skipped).
//
// PURE CORE (keyless, deterministic — asOfMs injected, no Date.now in core): audit(data, opts).
// GATED LIVE: action:"memo" turns findings into a blunt owner-voice memo (ANTHROPIC_API_KEY) — inert
// without the key, never fabricates. Handler reads Vercel KV like daily-brief; DORMANT without KV.
//
//   GET  /api/business-audit                 -> { configured, ... } (or the audit when KV is on)
//   POST /api/business-audit { action:"audit"|"memo", targetGm? }

function _kvEnv(suffixRe, excludeRe) {
  for (const k of Object.keys(process.env)) { if (excludeRe && excludeRe.test(k)) continue; if (suffixRe.test(k) && process.env[k]) return process.env[k]; }
  return undefined;
}
const KV_URL = _kvEnv(/KV_REST_API_URL$/i) || _kvEnv(/REST_API_URL$/i) || _kvEnv(/UPSTASH_REDIS_REST_URL$/i);
const KV_TOKEN = _kvEnv(/KV_REST_API_TOKEN$/i, /READ_ONLY/i) || _kvEnv(/REST_API_TOKEN$/i, /READ_ONLY/i);
const KV_ON = !!(KV_URL && KV_TOKEN);
const AI_KEY = process.env.ANTHROPIC_API_KEY || "";

// Operational thresholds (cadence heuristics, NOT doctrine pricing — mirror the existing crons:
// follow-up 3/7/30, estimate-followup 2/7/21, invoice-remind 0-7/8-30/>30). Caller can override.
const T = {
  coldLeadDays: 7, deadColdLeadDays: 30,
  staleBidDays: 7, deadBidDays: 21,
  arWatchDays: 1, arRedDays: 30,
  concentrationPct: 0.4,   // one customer > 40% of pipeline OR of AR = concentration risk
  certRedDays: 60, certAmberDays: 120,   // cert/license expiry: renew-now vs plan-ahead windows
};

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const money = (n) => "$" + Math.round(num(n)).toLocaleString("en-US");
const isDeadLead = (s) => /won|lost|unqualif|closed|dead|complete|cancel/i.test(String(s || ""));
const isClosedEst = (s) => /won|accept|approv|lost|dead|declin|complete|paid|schedul|job/i.test(String(s || ""));
const isDoneJob = (s) => /paid|cancel|complete/i.test(String(s || ""));
function daysBetween(dateStr, asOfMs) {
  const t = Date.parse(String(dateStr || "").slice(0, 10));
  return Number.isFinite(t) ? Math.floor((asOfMs - t) / 86400000) : null;
}
const SEV_RANK = { red: 0, amber: 1, green: 2 };

// data: { leads[], jobs[], estimates[], invoices[] }  opts: { asOfMs, targetGm, thresholds }
function audit(data, opts) {
  opts = opts || {};
  const asOf = Number.isFinite(opts.asOfMs) ? opts.asOfMs : 0;   // caller MUST inject for determinism
  const th = Object.assign({}, T, opts.thresholds || {});
  const leads = Array.isArray(data && data.leads) ? data.leads : [];
  const jobs = Array.isArray(data && data.jobs) ? data.jobs : [];
  const estimates = Array.isArray(data && data.estimates) ? data.estimates : [];
  const invoices = Array.isArray(data && data.invoices) ? data.invoices : [];
  const F = [];
  const add = (area, severity, title, detail, metric, action) => F.push({ id: area.toLowerCase().replace(/[^a-z0-9]+/g, "-"), area, severity, title, detail, metric, action });

  // ---- PIPELINE ----
  const openLeads = leads.filter((l) => l && !isDeadLead(l.status));
  const openJobs = jobs.filter((j) => j && !isDoneJob(j.status));
  const pipe = openLeads.reduce((s, l) => s + num(l.value), 0) + openJobs.reduce((s, j) => s + num(j.value), 0);
  if (pipe > 0) add("Pipeline", "green", `Pipeline ${money(pipe)} across ${openLeads.length} leads + ${openJobs.length} jobs`, "Total open opportunity value.", { pipeline: pipe, leads: openLeads.length, jobs: openJobs.length }, "Keep feeding the top — track close rate below.");
  else add("Pipeline", "amber", "Pipeline is empty", "No open leads or jobs on the books.", { pipeline: 0 }, "Add leads (CRM) or run marketing — nothing to close means no revenue ahead.");

  // ---- STALE BIDS (open estimates going quiet) ----
  const openEst = estimates.filter((e) => e && !isClosedEst(e.status));
  const bidAge = (e) => daysBetween(e.lastContact || e.date, asOf);
  const deadBids = openEst.filter((e) => { const d = bidAge(e); return d != null && d >= th.deadBidDays; });
  const staleBids = openEst.filter((e) => { const d = bidAge(e); return d != null && d >= th.staleBidDays && d < th.deadBidDays; });
  const bidVal = (arr) => arr.reduce((s, e) => s + num(e.total || e.value), 0);
  if (deadBids.length) add("Sales", "red", `${deadBids.length} bid(s) cold ${th.deadBidDays}d+`, `Open estimates with no contact in ${th.deadBidDays}+ days — likely dying on the vine.`, { count: deadBids.length, value: bidVal(deadBids) }, "Last-call each (estimate-followup cron drafts it) or mark lost to clean the pipeline.");
  else if (staleBids.length) add("Sales", "amber", `${staleBids.length} bid(s) quiet ${th.staleBidDays}-${th.deadBidDays}d`, "Open estimates cooling off.", { count: staleBids.length, value: bidVal(staleBids) }, "Send the reheat nudge before they go cold.");
  else add("Sales", "green", "No stale bids", "Open estimates are being worked.", { open: openEst.length }, "Keep the follow-up cadence.");

  // ---- CLOSE RATE (from records: won vs lost across leads + estimates) ----
  const pool = leads.concat(estimates);
  const won = pool.filter((x) => /won|accept|approv|schedul|paid|complete/i.test(String(x.status || ""))).length;
  const lost = pool.filter((x) => /lost|dead|declin|unqualif|cancel/i.test(String(x.status || ""))).length;
  const decided = won + lost;
  if (decided >= 5) {
    const rate = won / decided;
    const pct = Math.round(rate * 1000) / 10;
    const sev = rate >= 0.5 ? "green" : rate >= 0.3 ? "amber" : "red";
    add("Close rate", sev, `Close rate ${pct}% (${won} won / ${decided} decided)`, "Won vs lost across leads + estimates.", { won, lost, decided, ratePct: pct }, sev === "green" ? "Healthy — protect what's working." : "Below a healthy clip — tighten qualification + follow-up speed.");
  } else {
    add("Close rate", "amber", "Not enough decided deals to score close rate", `Only ${decided} won/lost on record (need ~5).`, { decided }, "Keep logging outcomes so this becomes measurable.");
  }

  // ---- COLD LEADS ----
  const coldAge = (l) => daysBetween(l.lastContact || l.date, asOf);
  const deadCold = openLeads.filter((l) => { const d = coldAge(l); return d == null || d >= th.deadColdLeadDays; });
  const cold = openLeads.filter((l) => { const d = coldAge(l); return d != null && d >= th.coldLeadDays && d < th.deadColdLeadDays; });
  const leadVal = (arr) => arr.reduce((s, l) => s + num(l.value), 0);
  if (deadCold.length) add("Leads", "red", `${deadCold.length} lead(s) cold ${th.deadColdLeadDays}d+`, "Open leads with no contact in a month or more.", { count: deadCold.length, value: leadVal(deadCold) }, "Chase or archive — a lead you never call is lost revenue you're still counting.");
  else if (cold.length) add("Leads", "amber", `${cold.length} lead(s) quiet ${th.coldLeadDays}d+`, "Open leads cooling.", { count: cold.length, value: leadVal(cold) }, "Follow up this week (follow-up cron drafts it).");
  else if (openLeads.length) add("Leads", "green", "Leads are warm", "No open lead has gone quiet.", { open: openLeads.length }, "Keep the cadence.");

  // ---- AR AGING (money owed to you) ----
  const openInv = invoices.filter((v) => v && v.paid !== true && (num(v.amt) - num(v.dep)) > 0.5);
  const bal = (v) => num(v.amt) - num(v.dep);
  const arTotal = openInv.reduce((s, v) => s + bal(v), 0);
  const invAge = (v) => daysBetween(v.due || v.date, asOf);
  const arRed = openInv.filter((v) => { const d = invAge(v); return d != null && d > th.arRedDays; });
  const arWatch = openInv.filter((v) => { const d = invAge(v); return d != null && d >= th.arWatchDays && d <= th.arRedDays; });
  const oldest = openInv.reduce((m, v) => { const d = invAge(v); return d != null && d > m ? d : m; }, 0);
  if (arRed.length) add("Cash / AR", "red", `${arRed.length} invoice(s) ${th.arRedDays}d+ overdue — ${money(arRed.reduce((s, v) => s + bal(v), 0))}`, `${money(arTotal)} total owed; oldest ${oldest}d.`, { overdue: arRed.length, overdueValue: arRed.reduce((s, v) => s + bal(v), 0), arTotal, oldestDays: oldest }, "Collect now (invoice-remind cron drafts the firm/final notice) — this is your cash, already earned.");
  else if (arWatch.length) add("Cash / AR", "amber", `${arWatch.length} invoice(s) overdue — ${money(arTotal)} out`, "Recently past due; nudge before it ages.", { overdue: arWatch.length, arTotal, oldestDays: oldest }, "Send the gentle reminder now.");
  else if (openInv.length) add("Cash / AR", "green", `${money(arTotal)} owed, none overdue`, "AR is current.", { arTotal, invoices: openInv.length }, "Keep terms tight.");

  // ---- OVERDUE SCHEDULED JOBS ----
  const overdueJobs = openJobs.filter((j) => { const d = daysBetween(j.date, asOf); return d != null && d > 0 && /schedul|progress|book/i.test(String(j.status || "")); });
  if (overdueJobs.length) add("Ops", "red", `${overdueJobs.length} scheduled job(s) past their date`, "Jobs whose scheduled date has passed and aren't marked complete.", { count: overdueJobs.length }, "Update status or reschedule — a stale schedule hides real work and delays invoicing.");

  // ---- CUSTOMER CONCENTRATION (risk) ----
  const byCust = {};
  openLeads.concat(openJobs).forEach((x) => { const c = String(x.customer || x.name || "").trim() || "?"; byCust[c] = (byCust[c] || 0) + num(x.value); });
  const custEntries = Object.entries(byCust).filter(([c]) => c !== "?");
  if (pipe > 0 && custEntries.length >= 2) {
    const top = custEntries.sort((a, b) => b[1] - a[1])[0];
    if (top[1] / pipe > th.concentrationPct) add("Risk", "amber", `Concentration: "${top[0]}" is ${Math.round(top[1] / pipe * 100)}% of pipeline`, "One customer dominating the pipeline is a revenue-risk if it slips.", { customer: top[0], pct: Math.round(top[1] / pipe * 100) }, "Diversify the top of funnel so no single job makes or breaks the month.");
  }

  // ---- MARGIN (only if a target is supplied — never fabricate a GM target) ----
  if (opts.targetGm != null && Number.isFinite(opts.targetGm)) {
    const priced = jobs.filter((j) => Number.isFinite(parseFloat(j.revenue)) && Number.isFinite(parseFloat(j.cost)) && num(j.revenue) > 0);
    if (priced.length) {
      const rev = priced.reduce((s, j) => s + num(j.revenue), 0);
      const cost = priced.reduce((s, j) => s + num(j.cost), 0);
      const gm = (rev - cost) / rev;
      const sev = gm >= opts.targetGm ? "green" : gm >= opts.targetGm * 0.85 ? "amber" : "red";
      add("Margin", sev, `Blended GM ${Math.round(gm * 1000) / 10}% vs ${Math.round(opts.targetGm * 1000) / 10}% target`, "Actual gross margin on jobs that carry cost + revenue.", { gmPct: Math.round(gm * 1000) / 10, targetPct: Math.round(opts.targetGm * 1000) / 10, jobs: priced.length }, sev === "green" ? "On target." : "Under target — check material yield + labor hours vs bid (job-costing).");
    } else {
      add("Margin", "amber", "Margin not auditable yet", "No jobs carry both cost and revenue.", { priced: 0 }, "Log actual cost + revenue per job (job-cost) to unlock the margin audit.");
    }
  } else {
    add("Margin", "green", "Margin audit off (no target supplied)", "Supply your doctrine GM target to grade margin — this tool never invents one.", null, "Pass targetGm (from mgsf-core doctrine) to enable.");
  }

  // ---- COMPLIANCE: cert / license expiry (data-driven from the CERTS tracker — never fabricated) ----
  const certs = Array.isArray(data && data.certs) ? data.certs : [];
  if (certs.length) {
    // daysBetween = days SINCE a date; for expiry we want days UNTIL → negate (positive = days left, negative = expired)
    const daysUntil = (d) => { const n = daysBetween(d, asOf); return n == null ? null : -n; };
    const cx = certs.map((c) => ({ name: (String(c.name || c.type || "cert").trim().slice(0, 60)) || "cert", exp: c.expires || "", days: daysUntil(c.expires) }));
    const lbl = (arr) => arr.map((c) => c.name + (c.exp ? " (" + c.exp + ")" : "")).join("; ");
    const expired = cx.filter((c) => c.days != null && c.days < 0);
    const soon = cx.filter((c) => c.days != null && c.days >= 0 && c.days <= th.certRedDays);
    const watch = cx.filter((c) => c.days != null && c.days > th.certRedDays && c.days <= th.certAmberDays);
    const noExp = cx.filter((c) => c.days == null);
    if (expired.length) add("Compliance", "red", `${expired.length} cert/license EXPIRED`, lbl(expired), { expired: expired.length }, "Renew immediately — an expired safety cert can disqualify a bid and undercut your insurance posture.");
    else if (soon.length) add("Compliance", "red", `${soon.length} cert(s) expire within ${th.certRedDays} days`, cx.filter((c) => soon.includes(c)).map((c) => c.name + " — " + c.days + "d").join("; "), { soon: soon.length }, "Book the renewal now — don't let a safety cert lapse mid-season.");
    else if (watch.length) add("Compliance", "amber", `${watch.length} cert(s) expire within ${th.certAmberDays} days`, cx.filter((c) => watch.includes(c)).map((c) => c.name + " — " + c.days + "d").join("; "), { watch: watch.length }, "Schedule the renewal so it never becomes urgent.");
    else add("Compliance", "green", `Certs current (${certs.length} tracked)`, `None expiring within ${th.certAmberDays} days.`, { tracked: certs.length }, "Good — keep the tracker fed.");
    if (noExp.length) add("Compliance", "amber", `${noExp.length} cert(s) missing an expiry date`, lbl(noExp), { noExpiry: noExp.length }, "Add the expiry date so renewals get tracked automatically.");
  }

  // ---- rank + summarize ----
  F.sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity]);
  const summary = { red: F.filter((f) => f.severity === "red").length, amber: F.filter((f) => f.severity === "amber").length, green: F.filter((f) => f.severity === "green").length };
  const top = F.filter((f) => f.severity === "red").slice(0, 3).map((f) => f.title);
  return {
    ok: true, label: "GUIDANCE — findings trace to your records + operational thresholds; no fabricated numbers, no pricing.",
    asOf, summary, headline: summary.red ? `${summary.red} thing(s) need action now` : summary.amber ? `${summary.amber} thing(s) to watch — nothing on fire` : "Clean bill of health", topActions: top, findings: F,
  };
}

// ---- gated AI memo (blunt owner-voice) — inert without ANTHROPIC_API_KEY, never fabricates ----
async function memo(report, opts) {
  if (!AI_KEY) return { configured: false, reason: "not_configured", note: "Set ANTHROPIC_API_KEY to get the owner-voice memo. The findings above are complete on their own." };
  const sys = "You are Klyfton, MGSF's operator. Turn this business-audit JSON into a blunt, numbers-first, one-screen memo for Clifton (USMC vet, decision-ready). Lead with the TL;DR + red items. Use ONLY the numbers in the JSON — invent nothing, promise no savings, quote no prices. End with a go-do list ranked by severity.";
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": AI_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: (opts && opts.model) || "claude-sonnet-4-5", max_tokens: 900, system: sys, messages: [{ role: "user", content: JSON.stringify(report) }] }),
    });
    const j = await r.json();
    const text = j && j.content && j.content[0] && j.content[0].text;
    if (!r.ok || !text) return { configured: true, ok: false, error: "api_error" };
    return { configured: true, ok: true, memo: text };
  } catch (e) { return { configured: true, ok: false, error: String((e && e.message) || e).slice(0, 140) }; }
}

async function kvGet(col) {
  try {
    const r = await fetch(KV_URL + "/get/" + encodeURIComponent("mgsf:" + col), { headers: { Authorization: "Bearer " + KV_TOKEN } });
    if (!r.ok) return [];
    const j = await r.json(); if (!j || j.result == null) return [];
    const p = JSON.parse(j.result); return Array.isArray(p) ? p : [];
  } catch { return []; }
}

module.exports = async (req, res) => {
  if (!KV_ON) { res.status(200).json({ configured: false, service: "business-audit", note: "Attach Vercel KV to run the business audit (reads leads/jobs/estimates/invoices)." }); return; }
  let body = req.body; if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } } body = body || {};
  const action = String((body.action || (req.query && req.query.action) || "audit")).toLowerCase();
  try {
    const [leads, jobs, estimates, invoices, certs] = await Promise.all([kvGet("leads"), kvGet("jobs"), kvGet("estimates"), kvGet("invoices"), kvGet("certs")]);
    const targetGm = body.targetGm != null ? parseFloat(body.targetGm) : null;
    const report = audit({ leads, jobs, estimates, invoices, certs }, { asOfMs: Date.now(), targetGm });
    if (action === "memo") { const m = await memo(report, body); res.status(200).json(Object.assign({ report }, { memo: m })); return; }
    res.status(200).json(report);
  } catch (e) { res.status(200).json({ ok: false, error: String((e && e.message) || e).slice(0, 200) }); }
};

module.exports.audit = audit;
module.exports.memo = memo;
module.exports.THRESHOLDS = T;
