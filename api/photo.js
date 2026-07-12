// Klyfton photo sync — stores job photos in the SAME Vercel KV you attach for data sync,
// so before/during/after photos show on every crew phone. No second storage needed.
//
// DORMANT until KV is attached: with no KV env vars it returns { configured:false } and the
// app keeps photos on-device only. Images are compressed JPEGs (~100-300KB) from the client.

const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.STORAGE_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.STORAGE_REST_API_TOKEN;

const PFX = "mgsf:ph:";     // one key per image
const IDX = "mgsf:ph_index"; // array of {id, job, phase, ts}

function allowOrigin(origin) {
  if (!origin) return null;
  let host;
  try { host = new URL(origin).hostname; } catch (e) { return null; }
  if (host === 'machinegunsprayfoam.info' || host.endsWith('.machinegunsprayfoam.info')) return origin;
  if (host.endsWith('.vercel.app')) return origin;
  if (host === 'localhost' || host === '127.0.0.1') return origin;
  return null;
}

function setCors(req, res) {
  const reflected = allowOrigin(req.headers.origin);
  if (reflected) res.setHeader('Access-Control-Allow-Origin', reflected);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function authHeaders() { return { Authorization: "Bearer " + KV_TOKEN }; }

async function kvGetRaw(key) {
  try {
    const r = await fetch(KV_URL + "/get/" + encodeURIComponent(key), { headers: authHeaders() });
    if (!r.ok) return null;
    const j = await r.json();
    return j && j.result != null ? j.result : null;
  } catch { return null; }
}
async function kvSetRaw(key, value) {
  await fetch(KV_URL + "/set/" + encodeURIComponent(key), { method: "POST", headers: authHeaders(), body: value });
}
async function kvDel(key) {
  try { await fetch(KV_URL + "/del/" + encodeURIComponent(key), { method: "POST", headers: authHeaders() }); } catch {}
}
async function getIndex() {
  const raw = await kvGetRaw(IDX);
  if (!raw) return [];
  try { const a = JSON.parse(raw); return Array.isArray(a) ? a : []; } catch { return []; }
}

module.exports = async (req, res) => {
  setCors(req, res);

  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
  if (!KV_URL || !KV_TOKEN) { res.statusCode = 200; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ configured: false })); return; }

  try {
    if (req.method === "GET") {
      const id = (req.query && req.query.id) || null;
      if (id) { res.statusCode = 200; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ configured: true, data: await kvGetRaw(PFX + id) })); return; }
      res.statusCode = 200; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ configured: true, index: await getIndex() }));
      return;
    }

    if (req.method === "POST") {
      let body = req.body;
      if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
      body = body || {};

      // Delete photos (propagate removals).
      if (Array.isArray(body.remove) && body.remove.length) {
        const ids = body.remove.map(String);
        await Promise.all(ids.map((id) => kvDel(PFX + id)));
        const idx = (await getIndex()).filter((m) => !ids.includes(String(m.id)));
        await kvSetRaw(IDX, JSON.stringify(idx));
        res.statusCode = 200; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ configured: true, removed: ids.length }));
        return;
      }

      // Upload one image + its metadata.
      const id = body.id, data = body.data, meta = body.meta || {};
      if (!id || !data) { res.statusCode = 400; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: "missing id or data" })); return; }
      await kvSetRaw(PFX + id, String(data));
      const idx = await getIndex();
      if (!idx.some((m) => String(m.id) === String(id))) {
        idx.push({ id: String(id), job: meta.job || "", phase: meta.phase || "", ts: meta.ts || "" });
        await kvSetRaw(IDX, JSON.stringify(idx.slice(-2000)));
      }
      res.statusCode = 200; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ configured: true, ok: true }));
      return;
    }

    res.statusCode = 405; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: "Method not allowed" }));
  } catch (e) {
    res.statusCode = 200; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ configured: true, error: String(e).slice(0, 200) }));
  }
};
