// SAM.gov federal opportunity search — pulls live contract opportunities in MGSF's lane
// (insulation / roofing / spray foam / weatherization) so Klyfton can surface real gov work.
//
// Server-to-server proxy to the SAM.gov "Get Opportunities" public API v2. The API key is
// the owner's free personal key. Two ways to supply it (mirrors api/drive.js):
//   A) Vercel env SAM_API_KEY, OR
//   B) paste it in the app (GOV tab) — the client sends it as apiKey per request; stored
//      on-device only. We never log the key.
// No npm deps — global fetch only.

// Key comes ONLY from the environment (Vercel SAM_API_KEY) or a per-request in-app key — never
// hardcoded here. A hardcoded key would land in the repo (now public); SAM_API_KEY is set in Vercel.
const ENV_KEY = process.env.SAM_API_KEY || process.env.SAMGOV_API_KEY || "";

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
  // Point of contact — SAM returns an array (primary/secondary). Prefer the primary.
  const pocs = Array.isArray(o.pointOfContact) ? o.pointOfContact : [];
  const poc = pocs.find((p) => p && /primary/i.test(p.type || "")) || pocs[0] || {};
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
    // Contact so "Add as lead" pulls a real person/phone/email, not a blank card.
    contactName: poc.fullName || "",
    contactEmail: poc.email || "",
    contactPhone: (poc.phone || "").toString().trim(),
    contactTitle: poc.title || "",
  };
}

// Reusable search: fan out over NAICS×state combos (SAM's ncode/state filters are single-value),
// merge unique opportunities, newest first. Used by both the manual POST search and the daily scan.
async function runSearch(body, key) {
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
  const base = { api_key: key, postedFrom: mmddyyyy(from), postedTo: mmddyyyy(to), limit: String(perState), offset: "0", ptype };
  if (title) base.title = title;
  if (setAside) base.typeOfSetAside = setAside;

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
  if (!combos.length) { for (const nc of naics.slice(0, COMBO_CAP)) combos.push({ ncode: nc }); }

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
  merged.sort((a, b) => String(b.posted).localeCompare(String(a.posted)));
  return { merged, capped, firstErr, query: { naics, states, ptype, days, title: title || undefined, setAside: setAside || undefined } };
}

// ---- KV access (same store as api/sync.js) so the daily scan can write new opps straight to leads.
function _kvEnv(suffixRe, excludeRe) {
  for (const k of Object.keys(process.env)) { if (excludeRe && excludeRe.test(k)) continue; if (suffixRe.test(k) && process.env[k]) return process.env[k]; }
  return undefined;
}
const KV_URL = _kvEnv(/KV_REST_API_URL$/i) || _kvEnv(/REST_API_URL$/i) || _kvEnv(/UPSTASH_REDIS_REST_URL$/i);
const KV_TOKEN = _kvEnv(/KV_REST_API_TOKEN$/i, /READ_ONLY/i) || _kvEnv(/REST_API_TOKEN$/i, /READ_ONLY/i);
const KV_ON = !!(KV_URL && KV_TOKEN);
async function kvGet(col) {
  try {
    const r = await fetch(KV_URL + "/get/" + encodeURIComponent("mgsf:" + col), { headers: { Authorization: "Bearer " + KV_TOKEN } });
    if (!r.ok) return [];
    const j = await r.json(); if (!j || j.result == null) return [];
    const p = JSON.parse(j.result); return Array.isArray(p) ? p : [];
  } catch { return []; }
}
async function kvSet(col, arr) {
  await fetch(KV_URL + "/set/" + encodeURIComponent("mgsf:" + col), { method: "POST", headers: { Authorization: "Bearer " + KV_TOKEN }, body: JSON.stringify(arr) });
}

// Map a SAM opportunity to a Klyfton lead — deterministic id off the SAM notice id so re-scans
// never double-add. Mirrors the fields the GOV tab's manual "Add as lead" writes.
function oppToLead(o) {
  const bits = [o.type, o.setAside, o.place, o.due ? "Due " + String(o.due).slice(0, 10) : "", o.link].filter(Boolean);
  return {
    id: "gov_" + (o.id || o.sol || (o.title || "").slice(0, 24)),
    name: o.title, company: o.agency, phone: o.contactPhone || "", email: o.contactEmail || "",
    service: "Government", state: o.state || "", value: 0,
    source: "SAM.gov #" + (o.sol || o.id), status: "New",
    date: String(o.posted || "").slice(0, 10) || new Date().toISOString().slice(0, 10),
    notes: bits.join(" · "),
  };
}

// The daily scan: search MGSF's core federal lane and add only genuinely-new opportunities to leads.
async function runScan() {
  if (!ENV_KEY) return { ok: false, error: "no_sam_key" };
  if (!KV_ON) return { ok: false, error: "kv_not_attached" };
  const { merged } = await runSearch(
    { naics: ["238310", "238160", "238190", "238390", "238990"], states: ["MT", "ND", "SD", "WY"], days: 8, ptype: DEFAULT_PTYPES, limit: 40 },
    ENV_KEY
  );
  const leads = await kvGet("leads");
  const haveIds = new Set(leads.map((l) => String(l && l.id)));
  const haveSols = new Set(leads.map((l) => String((l && l.source) || "")).filter(Boolean));
  const added = [];
  for (const o of merged) {
    const lead = oppToLead(o);
    if (haveIds.has(lead.id) || haveSols.has(lead.source)) continue;   // dedup vs existing leads
    leads.push(lead); added.push(lead); haveIds.add(lead.id); haveSols.add(lead.source);
  }
  if (added.length) await kvSet("leads", leads.slice(-2000));
  return { ok: true, scanned: merged.length, added: added.length, opportunities: added.slice(0, 25) };
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    // Daily auto-scan trigger (Vercel Cron hits /api/samgov?scan=1). Idempotent — dedups vs leads.
    if (req.query && String(req.query.scan) === "1") {
      try { const r = await runScan(); res.status(200).json(Object.assign({ configured: !!ENV_KEY }, r)); }
      catch (e) { res.status(200).json({ configured: !!ENV_KEY, ok: false, error: String((e && e.message) || e).slice(0, 200) }); }
      return;
    }
    res.status(200).json({ configured: !!ENV_KEY, clientConfigurable: true, autoScan: KV_ON });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }

  const body = await readBody(req);
  const key = ENV_KEY || (typeof body.apiKey === "string" ? body.apiKey.trim() : "");
  if (!key) { res.status(200).json({ configured: false }); return; }

  try {
    const { merged, capped, firstErr, query } = await runSearch(body, key);
    if (!merged.length && firstErr) {
      res.status(200).json({ configured: true, ok: false, error: firstErr.error || "sam_error", status: firstErr.status });
      return;
    }
    res.status(200).json({ configured: true, ok: true, count: merged.length, capped, query, opportunities: merged.slice(0, 80) });
  } catch (e) {
    res.status(200).json({ configured: true, ok: false, error: String((e && e.message) || e).slice(0, 200) });
  }
};
