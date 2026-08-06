// Job actuals — the rig-side spray-session log and the data spine of Yield Intelligence. The crew
// logs what ACTUALLY happened (sets used + drum lots, substrate/ambient conditions, A/B temps + mix,
// pressure/tip/hose/gun-hours, spray-start/stop vs on-site time, photos, sign-off); everything
// downstream feeds off it — bid→actual variance, crew/rig scorecards, mix/temp yield correlation,
// equipment-health, and the chain-of-custody / warranty-defense package. Fast to capture, honest to
// store: never invents a value the crew didn't log.
//
// PURE core (normalize / sprayEfficiency / chainOfCustody / varianceInput) is keyless + deterministic
// and unit-tested. Gated live layer persists to Supabase (inert + honest without it; owner-approved
// writes). Nothing here sends or fabricates.
//
// POST { action:"normalize"|"save"|"list", log|jobId, approved } -> normalized session / save result / rows
// GET  -> shape.

function _kvEnv(re) { for (const k of Object.keys(process.env)) { if (re.test(k) && process.env[k]) return process.env[k]; } return undefined; }
const SB_URL = _kvEnv(/SUPABASE_URL$/i);
const SB_KEY = _kvEnv(/SUPABASE_SERVICE_ROLE_KEY$/i) || _kvEnv(/SERVICE_ROLE_KEY$/i) || _kvEnv(/SUPABASE_SECRET/i);
const SB_ON = !!(SB_URL && SB_KEY);

function num(v, d) { const n = parseFloat(v); return Number.isFinite(n) ? n : (d === undefined ? null : d); }
function clean(s, max) { return String(s == null ? "" : s).trim().slice(0, max || 200); }
function r1(n) { return Math.round((Number(n) || 0) * 10) / 10; }
function ms(t) { const x = Date.parse(clean(t, 40)); return Number.isFinite(x) ? x : null; }

// Nominal set yields (ESTIMATE — same lab figures foam-calc uses; real yield is what this log reveals).
const YIELD_BF_PER_SET = { closed: 4000, open: 16000 };

// Spray time vs on-site time — the productivity truth ("how much of the day was actual gun time").
function sprayEfficiency(log) {
  log = log || {};
  const sS = ms(log.sprayStart), sE = ms(log.sprayStop), oS = ms(log.onsiteStart), oE = ms(log.onsiteStop);
  const sprayMin = (sS != null && sE != null && sE >= sS) ? Math.round((sE - sS) / 60000) : null;
  const onsiteMin = (oS != null && oE != null && oE >= oS) ? Math.round((oE - oS) / 60000) : null;
  const productivePct = (sprayMin != null && onsiteMin && onsiteMin > 0) ? r1((sprayMin / onsiteMin) * 100) : null;
  return { sprayMin, onsiteMin, productivePct };
}

// Normalize a raw session log into a clean, typed record. jobId required; everything else optional and
// only carried if present (never invented). Derives actual BF from sets×nominal-yield when BF wasn't
// logged (marked derived), and the spray-efficiency numbers.
function normalize(log) {
  log = log || {};
  const jobId = clean(log.jobId != null ? log.jobId : log.job_id, 80);
  const errors = [];
  if (!jobId) errors.push("jobId is required");

  const setsIn = Array.isArray(log.setsUsed || log.sets) ? (log.setsUsed || log.sets) : [];
  const sets = setsIn.map((s) => ({ cell: /open/i.test(String(s.cell || s.type || "")) ? "open" : /roof/i.test(String(s.cell || s.type || "")) ? "roofing" : "closed",
    sets: Math.max(0, num(s.sets, 0)), lot: clean(s.lot || s.lotNo, 60) || null }));
  const lotsFromSets = sets.map((s) => s.lot).filter(Boolean);
  const drumLots = Array.from(new Set((Array.isArray(log.drumLots) ? log.drumLots.map((x) => clean(x, 60)) : []).concat(lotsFromSets).filter(Boolean)));

  let boardFeet = num(log.boardFeet != null ? log.boardFeet : log.bf, null);
  let bfDerived = false;
  if (boardFeet == null && sets.length) {
    let bf = 0, ok = true;
    for (const s of sets) { const y = YIELD_BF_PER_SET[s.cell]; if (y && s.sets) bf += s.sets * y; else if (s.cell === "roofing") { ok = false; } }
    if (bf > 0) { boardFeet = Math.round(bf); bfDerived = true; }
    if (!ok) errors.push("roofing set-yield not locked — log board_feet directly for roofing");
  }

  const eff = sprayEfficiency(log);
  const rec = {
    jobId, crew: clean(log.crew, 80) || null, rig: clean(log.rig, 60) || null, date: clean(log.date, 20) || null,
    setsUsed: sets, boardFeet, boardFeetDerived: bfDerived, drumLots,
    substrateType: clean(log.substrateType, 60) || null,
    substrateTemp: num(log.substrateTemp), substrateRh: num(log.substrateRh),
    ambientTemp: num(log.ambientTemp), ambientRh: num(log.ambientRh), windMph: num(log.windMph),
    aTemp: num(log.aTemp), bTemp: num(log.bTemp), mixNotes: clean(log.mixNotes, 300) || null,
    pressurePsi: num(log.pressurePsi), tipChanges: num(log.tipChanges) != null ? Math.round(num(log.tipChanges)) : null,
    hoseLenFt: num(log.hoseLenFt), gunHours: num(log.gunHours), laborHours: num(log.laborHours),
    sprayMin: eff.sprayMin, onsiteMin: eff.onsiteMin, productivePct: eff.productivePct,
    photos: Array.isArray(log.photos) ? log.photos.slice(0, 40).map((p) => ({ url: clean(p.url, 400), tag: /before|during|after|issue/i.test(String(p.tag || "")) ? String(p.tag).toLowerCase() : "photo", at: clean(p.at, 40) || null })) : [],
    notes: clean(log.notes, 1000) || null, signoff: clean(log.signoff, 120) || null,
  };
  return { ok: errors.length === 0, errors, record: rec };
}

// Chain-of-custody / warranty-defense package: assemble the defensible record and flag what's missing.
function chainOfCustody(rec) {
  rec = rec || {};
  const has = { lots: (rec.drumLots || []).length > 0, conditions: rec.substrateTemp != null || rec.ambientTemp != null,
    photos: (rec.photos || []).length > 0, signoff: !!rec.signoff, product: (rec.setsUsed || []).length > 0 };
  const missing = Object.keys(has).filter((k) => !has[k]);
  return { jobId: rec.jobId || null, lots: rec.drumLots || [],
    conditions: { substrateType: rec.substrateType, substrateTemp: rec.substrateTemp, substrateRh: rec.substrateRh, ambientTemp: rec.ambientTemp, ambientRh: rec.ambientRh, wind: rec.windMph, aTemp: rec.aTemp, bTemp: rec.bTemp, mix: rec.mixNotes },
    photos: rec.photos || [], signoff: rec.signoff || null,
    complete: missing.length === 0, missing,
    note: missing.length ? ("For a fully defensible package, add: " + missing.join(", ") + ".") : "Complete — lots, conditions, photos, and sign-off on record." };
}

// Shape actuals for the bid→actual variance engine (api/yield-variance.js).
function varianceInput(rec) {
  rec = rec || {};
  const sets = (rec.setsUsed || []).reduce((s, x) => s + (x.sets || 0), 0);
  return { boardFeet: rec.boardFeet, sets: sets || null, laborHours: rec.laborHours,
    conditions: [rec.substrateType, rec.substrateTemp != null ? rec.substrateTemp + "°F substrate" : null, rec.mixNotes].filter(Boolean).join(", ") || null };
}

// ---- gated live layer (Supabase; graceful — never throws/fabricates) ----
async function sbFetch(path, opts) {
  return fetch(SB_URL.replace(/\/$/, "") + path, { ...opts, headers: { apikey: SB_KEY, authorization: "Bearer " + SB_KEY, "content-type": "application/json", ...(opts && opts.headers) } });
}
async function save(log, opts) {
  if (!SB_ON) return { configured: false, ok: false, reason: "not_configured" };
  const n = normalize(log); if (!n.ok) return { configured: true, ok: false, errors: n.errors };
  if (!(opts && opts.approved)) return { configured: true, ok: false, reason: "needs_approval", note: "Actuals writes are owner-approved — resend with approved:true." };
  try {
    const rec = n.record;
    const row = { job_id: rec.jobId, crew: rec.crew, rig: rec.rig, logged_date: rec.date,
      sets_used: rec.setsUsed, board_feet: rec.boardFeet, drum_lots: rec.drumLots,
      substrate_type: rec.substrateType, substrate_temp: rec.substrateTemp, substrate_rh: rec.substrateRh,
      ambient_temp: rec.ambientTemp, ambient_rh: rec.ambientRh, wind_mph: rec.windMph,
      a_temp: rec.aTemp, b_temp: rec.bTemp, mix_notes: rec.mixNotes,
      pressure_psi: rec.pressurePsi, tip_changes: rec.tipChanges, hose_len_ft: rec.hoseLenFt, gun_hours: rec.gunHours,
      labor_hours: rec.laborHours, photos: rec.photos, notes: rec.notes, signoff: rec.signoff };
    const r = await sbFetch("/rest/v1/job_actuals", { method: "POST", headers: { prefer: "return=representation" }, body: JSON.stringify(row) });
    if (!r.ok) return { configured: true, ok: false, status: r.status, detail: (await r.text()).slice(0, 160) };
    const saved = await r.json();
    return { configured: true, ok: true, saved: Array.isArray(saved) ? saved[0] : saved };
  } catch (e) { return { configured: true, ok: false, error: String(e).slice(0, 120) }; }
}
async function list(jobId) {
  if (!SB_ON) return { configured: false, results: [] };
  try {
    const q = jobId ? ("&job_id=eq." + encodeURIComponent(clean(jobId, 80))) : "";
    const r = await sbFetch("/rest/v1/job_actuals?select=*&order=created_at.desc&limit=500" + q);
    if (!r.ok) return { configured: true, ok: false, results: [], status: r.status };
    const rows = await r.json();
    return { configured: true, ok: true, results: Array.isArray(rows) ? rows : [] };
  } catch (e) { return { configured: true, ok: false, results: [], error: String(e).slice(0, 120) }; }
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({ ok: true, configured: SB_ON, draftOnly: true,
      note: "Rig-side spray-session log. POST {action:'normalize',log} for a clean record + spray-efficiency + chain-of-custody (keyless); {action:'save',log,approved:true} persists (Supabase, owner-approved); {action:'list',jobId} reads. Feeds yield-variance + scorecards. Never invents an unlogged value." });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  const action = clean(body.action, 20) || "normalize";
  try {
    if (action === "save") { res.status(200).json(await save(body.log || body, { approved: body.approved === true })); return; }
    if (action === "list") { res.status(200).json(await list(body.jobId)); return; }
    const n = normalize(body.log || body);
    if (n.ok) { n.chainOfCustody = chainOfCustody(n.record); n.varianceInput = varianceInput(n.record); }
    res.status(200).json(n);
  } catch (e) { res.status(200).json({ ok: false, error: String(e).slice(0, 140) }); }
};

module.exports.normalize = normalize;
module.exports.sprayEfficiency = sprayEfficiency;
module.exports.chainOfCustody = chainOfCustody;
module.exports.varianceInput = varianceInput;
