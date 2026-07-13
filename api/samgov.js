// SAM.gov federal opportunity search — pulls live contract opportunities in MGSF's lane
// (insulation / roofing / spray foam / weatherization) so Klyfton can surface real gov work.
//
// Server-to-server proxy to the SAM.gov "Get Opportunities" public API v2. The API key is
// the owner's free personal key. Two ways to supply it (mirrors api/drive.js):
//   A) Vercel env SAM_API_KEY, OR
//   B) paste it in the app (GOV tab) — the client sends it as apiKey per request; stored
//      on-device only. We never log the key.
// No npm deps — global fetch only.

// Baked-in default key so every device can search SAM.gov with no per-device pasting. Server-side
// only (this file runs as a Vercel function, never shipped to the browser). A SAM.gov public API key
// is low-risk — it only authenticates calls to public opportunity data and is regenerable for free at
// sam.gov. Leave "" to require the env var or an in-app key; fill it to bake it in. Env var overrides.
const DEFAULT_KEY = "";
const ENV_KEY = process.env.SAM_API_KEY || process.env.SAMGOV_API_KEY || DEFAULT_KEY;

// Documented endpoint, with the /prod variant as a fallback (both are served).
const SAM_HOSTS = [
  "https://api.sam.gov/opportunities/v2/search",
  "https://api.sam.gov/prod/opportunities/v2/search",
];

// ptype (procurement type) codes SAM accepts. We default to the ones worth bidding.
//   o=Solicitation  k=Combined Synopsis/Solicitation  p=Pre-solicitation  r=Sources Sought  s=Special Notice
const DEFAULT_PTYPES = "o,k,p,r";

function mmddyyyy(d) {
  return String(d.getMonth() + 1).padStart(2, "0") + "/" + String(d.getDate()).padStart(2, "0") + "/" + d.getFullYear();
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && req.body.length) { try { return JSON.parse(req.body); } catch { return {}; } }
  return await new Promise((resolve) => {
    let d = ""; req.on("data", (c) => (d += c));
    req.on("end", () => { try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); } });
    req.on("error", () => resolve({}));
  });
}

// One SAM query (single state), trying the primary host then the /prod fallback on 404.
async function samQuery(params) {
  const qs = new URLSearchParams(params).toString();
  let lastErr = "";
  for (const host of SAM_HOSTS) {
    try {
      const r = await fetch(host + "?" + qs, { headers: { Accept: "application/json" } });
      if (r.status === 404) { lastErr = "404"; continue; }
      const text = await r.text();
      if (!r.ok) {
        // Surface SAM's own message (e.g. bad key, rate limit) without echoing the key.
        let msg = ("HTTP " + r.status);
        try { const j = JSON.parse(text); msg = (j.error && (j.error.message || j.error.code)) || j.message || msg; } catch {}
        return { ok: false, status: r.status, error: String(msg).slice(0, 200) };
      }
      let j; try { j = JSON.parse(text); } catch { return { ok: false, error: "bad_sam_response" }; }
      return { ok: true, data: j };
    } catch (e) { lastErr = String((e && e.message) || e); }
  }
  return { ok: false, error: lastErr || "sam_unreachable" };
}

function normalize(o) {
  const pop = o.placeOfPerformance || {};
  const st = (pop.state && (pop.state.code || pop.state.name)) || "";
  const city = (pop.city && (pop.city.name || pop.city.code)) || "";
  return {
    id: o.noticeId || o.solicitationNumber || "",
    title: o.title || "(untitled)",
    sol: o.solicitationNumber || "",
    agency: o.fullParentPathName || o.organizationType || "",
    type: o.type || o.baseType || "",
    setAside: o.typeOfSetAsideDescription || o.typeOfSetAside || "",
    posted: o.postedDate || "",
    due: o.responseDeadLine || "",
    naics: o.naicsCode || "",
    place: [city, st].filter(Boolean).join(", "),
    state: st,
    link: o.uiLink || "",
  };
}

module.exports = async (req, res) => {
  if (req.method === "GET") { res.status(200).json({ configured: !!ENV_KEY, clientConfigurable: true }); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }

  const body = await readBody(req);
  const key = ENV_KEY || (typeof body.apiKey === "string" ? body.apiKey.trim() : "");
  if (!key) { res.status(200).json({ configured: false }); return; }

  // Inputs (all optional, sane defaults for MGSF's lane).
  const naics = (Array.isArray(body.naics) && body.naics.length ? body.naics : ["238310", "238160"])
    .map((s) => String(s).replace(/[^0-9]/g, "")).filter(Boolean).slice(0, 6);
  const states = (Array.isArray(body.states) && body.states.length ? body.states : ["MT", "ND", "SD", "WY"])
    .map((s) => String(s).trim().toUpperCase().slice(0, 2)).filter(Boolean).slice(0, 8);
  const ptype = (typeof body.ptype === "string" && body.ptype.trim()) ? body.ptype.trim() : DEFAULT_PTYPES;
  const days = Math.min(365, Math.max(1, parseInt(body.days, 10) || 90));
  const title = (typeof body.title === "string" ? body.title.trim() : "").slice(0, 80);
  const setAside = (typeof body.setAside === "string" ? body.setAside.trim() : "").slice(0, 20);
  const perState = Math.min(100, Math.max(1, parseInt(body.limit, 10) || 25));

  const to = new Date();
  const from = new Date(Date.now() - days * 86400000);
  const base = {
    api_key: key,
    postedFrom: mmddyyyy(from),
    postedTo: mmddyyyy(to),
    limit: String(perState),
    offset: "0",
    ptype,
  };
  if (title) base.title = title;
  if (setAside) base.typeOfSetAside = setAside;

  // SAM's `ncode` and `state` filters are single-value in practice — query each
  // NAICS × state combo (single values, guaranteed to filter) and merge. Cap the
  // combo count so a big NAICS list can't fan out into hundreds of calls.
  const COMBO_CAP = 40;
  const combos = [];
  let capped = false;
  for (const nc of naics) {
    for (const st of states) {
      if (combos.length >= COMBO_CAP) { capped = true; break; }
      combos.push({ ncode: nc, state: st });
    }
    if (capped) break;
  }
  if (!combos.length) { // no state given → query by NAICS nationwide
    for (const nc of naics.slice(0, COMBO_CAP)) combos.push({ ncode: nc });
  }

  try {
    const results = await Promise.all(
      combos.map((c) => samQuery(Object.assign({}, base, c)).catch((e) => ({ ok: false, error: String((e && e.message) || e) })))
    );
    const seen = {};
    const merged = [];
    let firstErr = null;
    for (const r of results) {
      if (!r || !r.ok) { if (r && !firstErr) firstErr = r; continue; }
      const rows = (r.data && r.data.opportunitiesData) || [];
      for (const o of rows) {
        const n = normalize(o);
        const k = n.id || (n.title + "|" + n.posted);
        if (!seen[k]) { seen[k] = 1; merged.push(n); }
      }
    }
    if (!merged.length && firstErr) {
      res.status(200).json({ configured: true, ok: false, error: firstErr.error || "sam_error", status: firstErr.status });
      return;
    }
    merged.sort((a, b) => String(b.posted).localeCompare(String(a.posted)));
    res.status(200).json({
      configured: true, ok: true, count: merged.length, capped,
      query: { naics, states, ptype, days, title: title || undefined, setAside: setAside || undefined },
      opportunities: merged.slice(0, 80),
    });
  } catch (e) {
    res.status(200).json({ configured: true, ok: false, error: String((e && e.message) || e).slice(0, 200) });
  }
};
