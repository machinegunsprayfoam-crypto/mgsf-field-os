// Brain live-data grounding (Roadmap #2) — turns the app's REAL synced pipeline into a compact
// "situation" the brain can reason over, instead of answering only from doctrine. Reads the same
// Vercel KV the app already syncs to (mgsf:leads / mgsf:jobs / mgsf:estimates) and, if a HubSpot token
// is set, a small recent-contacts read.
//
// Module pattern: pure summarize() core (no deps, unit-testable) + gated gather() live layer. GATED &
// NON-FABRICATING: with no KV and no HubSpot it returns {configured:false, context:""} and the brain
// adds nothing. It only ever reports counts/fields that are actually present — never invents a number.

// ---- KV env detection (mirrors sync.js so it reads the same store) ----
function _kvEnv(suffixRe, excludeRe) {
  for (const k of Object.keys(process.env)) {
    if (excludeRe && excludeRe.test(k)) continue;
    if (suffixRe.test(k) && process.env[k]) return process.env[k];
  }
  return null;
}
const KV_URL = _kvEnv(/KV_REST_API_URL$/i) || _kvEnv(/REST_API_URL$/i) || _kvEnv(/UPSTASH_REDIS_REST_URL$/i);
const KV_TOKEN = _kvEnv(/KV_REST_API_TOKEN$/i, /READ_ONLY/i) || _kvEnv(/REST_API_TOKEN$/i, /READ_ONLY/i) || _kvEnv(/UPSTASH_REDIS_REST_TOKEN$/i);
const KV_ON = !!(KV_URL && KV_TOKEN);
const HS_TOKEN = (process.env.HUBSPOT_TOKEN && String(process.env.HUBSPOT_TOKEN).trim()) || "";
const PREFIX = "mgsf:";

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const day = (v) => String(v || "").slice(0, 10);
const OPEN_LEAD = (s) => !/won|lost|dead|closed|junk/i.test(String(s || ""));
const ACTIVE_JOB = (s) => /schedul|progress|active|open|booked/i.test(String(s || ""));
const UNSOLD = (s) => !/won|accept|sold|closed|lost|dead/i.test(String(s || ""));
const money = (n) => "$" + Math.round(n).toLocaleString();

async function kvGet(col) {
  const r = await fetch(KV_URL.replace(/\/$/, "") + "/get/" + encodeURIComponent(PREFIX + col),
    { headers: { Authorization: "Bearer " + KV_TOKEN }, signal: AbortSignal.timeout(2500) });
  if (!r.ok) return [];
  const j = await r.json();
  if (!j || j.result == null) return [];
  try { const v = typeof j.result === "string" ? JSON.parse(j.result) : j.result; return Array.isArray(v) ? v : []; }
  catch { return []; }
}

// Pure, deterministic. `now` is injectable for tests. Returns a short text block + a structured summary.
// Reports ONLY what the data contains — no fabrication, no guessed values.
function summarize(data, now) {
  data = data || {};
  const t = Number.isFinite(now) ? now : Date.now();
  const DAY = 86400000;
  const leads = Array.isArray(data.leads) ? data.leads : [];
  const jobs = Array.isArray(data.jobs) ? data.jobs : [];
  const ests = Array.isArray(data.estimates) ? data.estimates : [];

  const open = leads.filter((l) => OPEN_LEAD(l.status));
  const cold = open.filter((l) => { const d = day(l.date); const ms = d ? Date.parse(d + "T00:00:00Z") : NaN; return Number.isFinite(ms) && (t - ms) > 7 * DAY; });
  const active = jobs.filter((j) => ACTIVE_JOB(j.status));
  const activeVal = active.reduce((s, j) => s + num(j.value), 0);
  const unsold = ests.filter((e) => UNSOLD(e.status));
  const unsoldVal = unsold.reduce((s, e) => s + num(e.total), 0);

  const lines = [];
  if (leads.length) lines.push(open.length + " open lead" + (open.length === 1 ? "" : "s") + (cold.length ? " (" + cold.length + " cold >7d — follow up)" : ""));
  if (active.length) lines.push(active.length + " active job" + (active.length === 1 ? "" : "s") + (activeVal ? " ~" + money(activeVal) : ""));
  if (unsold.length) lines.push(unsold.length + " unsold estimate" + (unsold.length === 1 ? "" : "s") + (unsoldVal ? " " + money(unsoldVal) + " on the table" : ""));

  const summary = { openLeads: open.length, coldLeads: cold.length, activeJobs: active.length, activeJobsValue: Math.round(activeVal), unsoldEstimates: unsold.length, unsoldValue: Math.round(unsoldVal) };
  const context = lines.length ? ("SITUATION (live pipeline, real app data): " + lines.join(" · ") + ". Ground answers in these actual numbers; if the crew asks about leads/jobs/money, use this, not generic advice.") : "";
  return { summary, context, hasData: lines.length > 0 };
}

// Gated live layer. Never throws; degrades to not-configured / empty on any failure.
async function gather(opts) {
  if (!KV_ON && !HS_TOKEN) return { ok: true, configured: false, source: "none", context: "", summary: null };
  const out = { leads: [], jobs: [], estimates: [] };
  const sources = [];
  if (KV_ON) {
    try {
      const [leads, jobs, estimates] = await Promise.all([kvGet("leads"), kvGet("jobs"), kvGet("estimates")]);
      out.leads = leads; out.jobs = jobs; out.estimates = estimates; sources.push("kv");
    } catch (e) { /* ignore — degrade to whatever we have */ }
  }
  // HubSpot recent contacts as leads if KV had none and a token is set (best-effort, capped).
  if (HS_TOKEN && !out.leads.length) {
    try {
      const r = await fetch("https://api.hubapi.com/crm/v3/objects/contacts?limit=20&properties=firstname,lastname,company,lifecyclestage,hs_lead_status",
        { headers: { authorization: "Bearer " + HS_TOKEN, "content-type": "application/json" }, signal: AbortSignal.timeout(2500) });
      if (r.ok) { const j = await r.json(); const res = (j && j.results) || [];
        out.leads = res.map((c) => { const p = c.properties || {}; return { name: [p.firstname, p.lastname].filter(Boolean).join(" "), company: p.company, status: p.hs_lead_status || p.lifecyclestage, date: "" }; });
        sources.push("hubspot"); }
    } catch (e) { /* ignore */ }
  }
  const s = summarize(out, (opts && opts.now));
  return { ok: true, configured: true, source: sources.join("+") || "none", context: s.context, summary: s.summary };
}

module.exports = async (req, res) => {
  const guard = require("./guard"); if (!guard.ok(req)) { res.status(401).json(guard.denied()); return; }

  try { const g = await gather({}); res.status(200).json(g); }
  catch (e) { res.status(200).json({ ok: false, configured: KV_ON || !!HS_TOKEN, error: String(e).slice(0, 160), context: "" }); }
};
module.exports.summarize = summarize;
module.exports.gather = gather;
module.exports.status = () => ({ kv: KV_ON, hubspot: !!HS_TOKEN });
