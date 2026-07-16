// Klyfton structured brain — mirrors the app's KV collections into Supabase (Postgres) so
// Klyfton can do real reporting / forecasting / pipeline analytics with SQL.
//
// Dormant until BOTH are set in Vercel env: a Supabase URL and a SERVICE ROLE key. Writes go
// through this function with the service role (bypasses RLS), so the browser never touches the
// DB and the publishable key exposes nothing. Run db/schema.sql once in the Supabase SQL editor.
//
// GET            -> { configured }
// POST {mirror}  -> pulls every collection from KV, upserts into the matching table, returns counts.

// ---- Supabase env (accept common names) ----
function _env(re, excl) { for (const k of Object.keys(process.env)) { if (excl && excl.test(k)) continue; if (re.test(k) && process.env[k]) return process.env[k]; } }
const SB_URL = _env(/SUPABASE_URL$/i) || _env(/^SUPABASE_URL$/i);
// Service role only (secret). Never the anon/publishable key — that can't bypass RLS.
const SB_KEY = _env(/SUPABASE_SERVICE_ROLE_KEY$/i) || _env(/SERVICE_ROLE_KEY$/i) || _env(/SUPABASE_SECRET/i);
const SB_ON = !!(SB_URL && SB_KEY);

// ---- KV (same resolver the sync module uses) ----
function _kvEnv(re, excl) { for (const k of Object.keys(process.env)) { if (excl && excl.test(k)) continue; if (re.test(k) && process.env[k]) return process.env[k]; } }
const KV_URL = _kvEnv(/KV_REST_API_URL$/i) || _kvEnv(/REST_API_URL$/i) || _kvEnv(/UPSTASH_REDIS_REST_URL$/i);
const KV_TOKEN = _kvEnv(/KV_REST_API_TOKEN$/i, /READ_ONLY/i) || _kvEnv(/REST_API_TOKEN$/i, /READ_ONLY/i);
const KV_ON = !!(KV_URL && KV_TOKEN);
const PREFIX = "mgsf:";

async function kvGet(col) {
  try {
    const r = await fetch(KV_URL + "/get/" + encodeURIComponent(PREFIX + col), { headers: { Authorization: "Bearer " + KV_TOKEN } });
    if (!r.ok) return [];
    const j = await r.json();
    let v = j && j.result;
    if (typeof v === "string") { try { v = JSON.parse(v); } catch { v = []; } }
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

const num = (v) => { const n = parseFloat(v); return isFinite(n) ? n : null; };
const day = (v) => { const s = String(v || "").slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null; };
const txt = (v) => (v == null ? null : String(v));
// tiny stable hash for memory-note ids
function hash(s) { let h = 5381; s = String(s); for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return "m" + (h >>> 0).toString(36); }

// collection -> { table, row(record) } ; row returns the typed columns (raw is added automatically)
const MAP = {
  leads: { table: "leads", row: (r) => ({ id: txt(r.id), name: txt(r.name), company: txt(r.company), phone: txt(r.phone), email: txt(r.email), service: txt(r.service), state: txt(r.state), value: num(r.value), source: txt(r.source), status: txt(r.status), date: day(r.date), notes: txt(r.notes) }) },
  jobs: { table: "jobs", row: (r) => ({ id: txt(r.id), customer: txt(r.customer || r.name), service: txt(r.service), state: txt(r.state), status: txt(r.status), value: num(r.value), date: day(r.date), crew: txt(r.crew) }) },
  estimates: { table: "estimates", row: (r) => ({ id: txt(r.id), customer: txt(r.customer || r.name), service: txt(r.service), state: txt(r.state), status: txt(r.status), total: num(r.total != null ? r.total : r.value != null ? r.value : r.sell), date: day(r.date || r.at) }) },
  matlogs: { table: "materials_log", row: (r) => ({ id: txt(r.id), job: txt(r.job), product: txt(r.prod || r.product), unit: txt(r.unit), est: num(r.est), act: num(r.act), cost: num(r.cost), ts: r.ts || null }) },
  invoices: { table: "invoices", row: (r) => ({ id: txt(r.id), customer: txt(r.customer || r.cust), amount: num(r.amount != null ? r.amount : r.amt), deposit: num(r.deposit || r.dep), due: txt(r.due), date: day(r.date) }) },
  crew: { table: "crew", row: (r) => ({ id: txt(r.id), name: txt(r.name), role: txt(r.role), phone: txt(r.phone), email: txt(r.email) }), strip: ["pin"] },
};

async function upsert(table, rows) {
  if (!rows.length) return 0;
  const r = await fetch(SB_URL.replace(/\/$/, "") + "/rest/v1/" + table + "?on_conflict=id", {
    method: "POST",
    headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(table + ": " + r.status + " " + (await r.text()).slice(0, 160));
  return rows.length;
}

module.exports = async (req, res) => {
  if (req.method === "GET") { res.status(200).json({ configured: SB_ON, kv: KV_ON }); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }
  if (!SB_ON) { res.status(200).json({ configured: false, hint: "Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in Vercel, and run db/schema.sql once." }); return; }
  if (!KV_ON) { res.status(200).json({ configured: true, error: "KV not attached — nothing to mirror from." }); return; }

  try {
    const counts = {};
    for (const col of Object.keys(MAP)) {
      const cfg = MAP[col];
      const recs = await kvGet(col);
      const rows = recs.filter((r) => r && r.id != null).map((r) => {
        const base = cfg.row(r);
        const raw = { ...r };
        (cfg.strip || []).forEach((k) => { delete raw[k]; });   // never sync PINs/secrets
        return { ...base, raw, synced_at: new Date().toISOString() };
      });
      counts[cfg.table] = await upsert(cfg.table, rows);
    }
    // memory: array of strings -> memory table (id = hash of the note)
    const mem = await kvGet("memory");
    const memRows = mem.filter((s) => typeof s === "string" && s.trim()).map((s) => ({ id: hash(s), note: s, synced_at: new Date().toISOString() }));
    counts.memory = await upsert("memory", memRows);

    res.status(200).json({ configured: true, ok: true, mirrored: counts });
  } catch (e) {
    res.status(200).json({ configured: true, ok: false, error: String(e.message || e).slice(0, 240) });
  }
};
