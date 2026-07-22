// Klyfton multi-device sync — the shared backbone so every crew phone sees the same
// jobs, leads, estimates, JSAs, punches, material logs, and sign-offs.
//
// Runs as a Vercel serverless function. No npm deps (uses global fetch + the Vercel KV
// REST API). DORMANT until KV storage is attached: with no KV_REST_API_URL it returns
// { configured:false } and the app silently stays on-device — zero behavior change.
//
// To switch on: Vercel → mgsf-fieldos → Storage → add KV (Upstash) → connect to project.
// Vercel injects KV_REST_API_URL + KV_REST_API_TOKEN automatically. Then redeploy.

// Accept whichever names the storage integration injects — classic Vercel KV,
// Upstash direct, or a prefixed marketplace store (e.g. Storage_KV_REST_API_URL).
// Scan env case-insensitively by suffix so the owner just clicks "connect" and it
// works, no matter the prefix or casing — no key juggling.
function _kvEnv(suffixRe, excludeRe) {
  for (const k of Object.keys(process.env)) {
    if (excludeRe && excludeRe.test(k)) continue;
    if (suffixRe.test(k) && process.env[k]) return process.env[k];
  }
  return undefined;
}
const KV_URL = _kvEnv(/KV_REST_API_URL$/i) || _kvEnv(/REST_API_URL$/i) || _kvEnv(/UPSTASH_REDIS_REST_URL$/i);
const KV_TOKEN = _kvEnv(/KV_REST_API_TOKEN$/i, /READ_ONLY/i) || _kvEnv(/REST_API_TOKEN$/i, /READ_ONLY/i);

// Collections we sync. Photos are intentionally excluded (base64 images are too heavy for
// this store — they stay on-device until we add blob storage).
const COLLECTIONS = ["jobs", "leads", "estimates", "jsas", "tc_punches", "matlogs", "signoffs", "proposals", "forms", "changeorders", "invoices", "jobcosts", "contacts", "reviews", "inventory", "training", "warranties", "equipment", "incidents", "complaints", "suppliers", "subs", "setuse", "crew", "insurance"];
const TOMB = "_tomb"; // tombstones: [{c, id}] — so deletes propagate across devices
const MEM = "memory";  // Klyfton's durable facts — plain strings, set-union across devices
const PREFIX = "mgsf:";

// ---- Supabase mirror (optional) — a structured, queryable copy of the KV data for reporting.
// Writes use the SERVICE ROLE key server-side (bypasses RLS); the browser never touches the DB.
// Dormant unless SUPABASE_URL + SUPABASE_SECRET_KEY (or *SERVICE_ROLE_KEY) are set. Run
// db/schema.sql once first. Triggered by POST {action:"mirror"}; status via GET ?db=1.
const SB_URL = _kvEnv(/SUPABASE_URL$/i);
const SB_KEY = _kvEnv(/SUPABASE_SERVICE_ROLE_KEY$/i) || _kvEnv(/SERVICE_ROLE_KEY$/i) || _kvEnv(/SUPABASE_SECRET/i);
const SB_ON = !!(SB_URL && SB_KEY);
const _num = (v) => { const n = parseFloat(v); return isFinite(n) ? n : null; };
const _day = (v) => { const s = String(v || "").slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null; };
const _txt = (v) => (v == null ? null : String(v));
function _hash(s) { let h = 5381; s = String(s); for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return "m" + (h >>> 0).toString(36); }
// Security: a raw API key/token must never sit in a client-readable payload or the reporting DB,
// even if one got saved into Klyfton's "memory" as a fact. Redact those notes on the way out.
const _SECRET_RE = /sk-ant-[A-Za-z0-9_-]{8,}|\bSAM-[0-9a-f]{6,}(?:-[0-9a-f]{4,})+|\bAC[0-9a-f]{30,}\b|\b(?:api[_\s-]?key|secret[_\s-]?key|auth[_\s-]?token|access[_\s-]?token|bearer|password)\b\s*[:=]\s*\S{6,}/i;
function _isSecret(s) { return typeof s === "string" && _SECRET_RE.test(s); }
const SB_MAP = {
  leads: { table: "leads", row: (r) => ({ id: _txt(r.id), name: _txt(r.name), company: _txt(r.company), phone: _txt(r.phone), email: _txt(r.email), service: _txt(r.service), state: _txt(r.state), value: _num(r.value), source: _txt(r.source), status: _txt(r.status), date: _day(r.date), notes: _txt(r.notes) }) },
  jobs: { table: "jobs", row: (r) => ({ id: _txt(r.id), customer: _txt(r.customer || r.name), service: _txt(r.service), state: _txt(r.state), status: _txt(r.status), value: _num(r.value), date: _day(r.date), crew: _txt(r.crew) }) },
  estimates: { table: "estimates", row: (r) => ({ id: _txt(r.id), customer: _txt(r.customer || r.name), service: _txt(r.service), state: _txt(r.state), status: _txt(r.status), total: _num(r.total != null ? r.total : (r.value != null ? r.value : r.sell)), date: _day(r.date || r.at) }) },
  matlogs: { table: "materials_log", row: (r) => ({ id: _txt(r.id), job: _txt(r.job), product: _txt(r.prod || r.product), unit: _txt(r.unit), est: _num(r.est), act: _num(r.act), cost: _num(r.cost), ts: r.ts || null }) },
  invoices: { table: "invoices", row: (r) => ({ id: _txt(r.id), customer: _txt(r.customer || r.cust), amount: _num(r.amount != null ? r.amount : r.amt), deposit: _num(r.deposit || r.dep), due: _txt(r.due), date: _day(r.date) }) },
  crew: { table: "crew", row: (r) => ({ id: _txt(r.id), name: _txt(r.name), role: _txt(r.role), phone: _txt(r.phone), email: _txt(r.email) }), strip: ["pin", "pinHash"] },
};
async function sbUpsert(table, rows) {
  if (!rows.length) return 0;
  const r = await fetch(SB_URL.replace(/\/$/, "") + "/rest/v1/" + table + "?on_conflict=id", {
    method: "POST",
    headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(table + ": " + r.status + " " + (await r.text()).slice(0, 140));
  return rows.length;
}
async function sbMirror() {
  const counts = {};
  for (const col of Object.keys(SB_MAP)) {
    const cfg = SB_MAP[col];
    const rows = (await kvGet(col)).filter((r) => r && r.id != null).map((r) => {
      const base = cfg.row(r); const raw = { ...r };
      (cfg.strip || []).forEach((k) => { delete raw[k]; });   // never sync PINs/secrets
      return { ...base, raw, synced_at: new Date().toISOString() };
    });
    counts[cfg.table] = await sbUpsert(cfg.table, rows);
  }
  const mem = await kvGet(MEM);
  const memRows = mem.filter((s) => typeof s === "string" && s.trim() && !_isSecret(s)).map((s) => ({ id: _hash(s), note: s, synced_at: new Date().toISOString() }));
  counts.memory = await sbUpsert("memory", memRows);
  return counts;
}

function authHeaders() {
  return { Authorization: "Bearer " + KV_TOKEN };
}

async function kvGet(col) {
  try {
    const r = await fetch(KV_URL + "/get/" + encodeURIComponent(PREFIX + col), { headers: authHeaders() });
    if (!r.ok) return [];
    const j = await r.json();
    if (!j || j.result == null) return [];
    const parsed = JSON.parse(j.result);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function kvSet(col, arr) {
  await fetch(KV_URL + "/set/" + encodeURIComponent(PREFIX + col), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(arr),
  });
}

// Union by id. Incoming (the saving device's copy) wins on a shared id, so edits propagate.
// Note: deletes are NOT propagated in v1 (a union keeps every id ever seen).
function mergeById(existing, incoming) {
  const map = new Map();
  (existing || []).forEach((r) => { if (r && r.id != null) map.set(String(r.id), r); });
  (incoming || []).forEach((r) => { if (r && r.id != null) map.set(String(r.id), r); });
  return Array.from(map.values());
}

module.exports = async (req, res) => {
  // Supabase-mirror status probe (independent of KV).
  if (req.method === "GET" && req.query && String(req.query.db) === "1") {
    res.status(200).json({ supabase: SB_ON });
    return;
  }
  // Dormant when no storage attached — the app keeps working on-device.
  if (!KV_URL || !KV_TOKEN) {
    res.status(200).json({ configured: false });
    return;
  }

  try {
    if (req.method === "GET") {
      // Owner/diagnostic trigger: GET ?mirror=1 runs the Supabase mirror on demand (identical to
      // POST {action:"mirror"}). Idempotent upserts, gated on SB_ON — safe to hit from a browser
      // bookmark or an uptime ping to keep the reporting DB fresh.
      if (req.query && String(req.query.mirror) === "1") {
        if (!SB_ON) { res.status(200).json({ configured: true, supabase: false, hint: "Set SUPABASE_URL + SUPABASE_SECRET_KEY in Vercel and run db/schema.sql." }); return; }
        try { const counts = await sbMirror(); res.status(200).json({ configured: true, supabase: true, ok: true, mirrored: counts }); }
        catch (e) { res.status(200).json({ configured: true, supabase: true, ok: false, error: String(e.message || e).slice(0, 240) }); }
        return;
      }
      // One-time cleanup: GET ?scrub=1 removes any secret-looking notes (raw API keys/tokens) from
      // Klyfton's memory in storage, so an exposed key doesn't linger in KV. Idempotent.
      if (req.query && String(req.query.scrub) === "1") {
        const mem = await kvGet(MEM);
        const clean = mem.filter((s) => !_isSecret(s));
        const removed = mem.length - clean.length;
        if (removed) await kvSet(MEM, clean);
        res.status(200).json({ configured: true, scrubbed: removed });
        return;
      }
      const tomb = await kvGet(TOMB);
      const tset = new Set((tomb || []).map((t) => t.c + "|" + String(t.id)));
      const data = {};
      await Promise.all(COLLECTIONS.map(async (c) => {
        const rows = await kvGet(c);
        data[c] = rows.filter((r) => r && r.id != null && !tset.has(c + "|" + String(r.id)));
      }));
      // SECURITY: never expose crew credentials through this public endpoint. Strip the plaintext
      // PIN (and any hash) from crew records before returning them to an unauthenticated caller.
      if (Array.isArray(data.crew)) data.crew = data.crew.map((r) => { const o = Object.assign({}, r); delete o.pin; delete o.pinHash; return o; });
      // Redact any secret that was saved into memory before returning it to the (public) client.
      const memory = (await kvGet(MEM)).filter((s) => !_isSecret(s));
      res.status(200).json({ configured: true, data, tomb, memory });
      return;
    }

    if (req.method === "POST") {
      let body = req.body;
      if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
      body = body || {};

      // Supabase reporting mirror: copy all KV collections into Postgres for querying.
      if (body.action === "mirror") {
        if (!SB_ON) { res.status(200).json({ configured: true, supabase: false, hint: "Set SUPABASE_URL + SUPABASE_SECRET_KEY in Vercel and run db/schema.sql." }); return; }
        try { const counts = await sbMirror(); res.status(200).json({ configured: true, supabase: true, ok: true, mirrored: counts }); }
        catch (e) { res.status(200).json({ configured: true, supabase: true, ok: false, error: String(e.message || e).slice(0, 240) }); }
        return;
      }

      const col = body.collection;

      // Memory is a flat set of unique strings — merge/delete without the id-based logic.
      if (col === "memory") {
        const existing = await kvGet(MEM);
        if (Array.isArray(body.remove) && body.remove.length) {
          const rm = new Set(body.remove.map(String));
          await kvSet(MEM, existing.filter((s) => !rm.has(String(s))));
          res.status(200).json({ configured: true, collection: "memory", removed: body.remove.length });
          return;
        }
        const incoming = Array.isArray(body.records) ? body.records : [];
        const merged = [];
        const seen = new Set();
        existing.concat(incoming).forEach((s) => {
          const t = String(s == null ? "" : s).trim();
          if (t && !seen.has(t)) { seen.add(t); merged.push(t); }
        });
        await kvSet(MEM, merged.slice(-500));
        res.status(200).json({ configured: true, collection: "memory", count: merged.length });
        return;
      }

      if (!COLLECTIONS.includes(col)) {
        res.status(400).json({ error: "unknown collection" });
        return;
      }

      // Delete: drop the ids and tombstone them so other devices remove them too.
      if (Array.isArray(body.remove) && body.remove.length) {
        const ids = body.remove.map(String);
        const kept = (await kvGet(col)).filter((r) => r && !ids.includes(String(r.id)));
        await kvSet(col, kept);
        const tomb = await kvGet(TOMB);
        const have = new Set(tomb.map((t) => t.c + "|" + String(t.id)));
        ids.forEach((id) => { if (!have.has(col + "|" + id)) tomb.push({ c: col, id }); });
        await kvSet(TOMB, tomb.slice(-3000));
        res.status(200).json({ configured: true, collection: col, removed: ids.length });
        return;
      }

      // Add / update: union by id, but never resurrect a tombstoned record.
      let incoming = Array.isArray(body.records) ? body.records : [];
      // SECURITY: never persist a plaintext crew PIN to storage. Keep the client-computed pinHash;
      // drop any legacy plaintext `pin` (the client migrates its own local copy to a hash on login).
      if (col === "crew") incoming = incoming.map((r) => { if (r && r.pin != null) { const o = Object.assign({}, r); delete o.pin; return o; } return r; });
      const tomb = await kvGet(TOMB);
      const tset = new Set(tomb.map((t) => t.c + "|" + String(t.id)));
      const merged = mergeById(await kvGet(col), incoming).filter((r) => !tset.has(col + "|" + String(r.id)));
      await kvSet(col, merged);
      res.status(200).json({ configured: true, collection: col, count: merged.length });
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    // Never hard-fail the client — it just keeps its local copy.
    res.status(200).json({ configured: true, error: String(e).slice(0, 200) });
  }
};
