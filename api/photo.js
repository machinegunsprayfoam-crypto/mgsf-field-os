// Klyfton photo sync — stores job photos in the SAME Vercel KV you attach for data sync,
// so before/during/after photos show on every crew phone. No second storage needed.
//
// DORMANT until KV is attached: with no KV env vars it returns { configured:false } and the
// app keeps photos on-device only. Images are compressed JPEGs (~100-300KB) from the client.

const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.STORAGE_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.STORAGE_REST_API_TOKEN;

const PFX = "mgsf:ph:";     // one key per image
const IDX = "mgsf:ph_index"; // array of {id, job, phase, ts}

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
  if (!KV_URL || !KV_TOKEN) { res.status(200).json({ configured: false }); return; }

  try {
    if (req.method === "GET") {
      const id = (req.query && req.query.id) || null;
      if (id) { res.status(200).json({ configured: true, data: await kvGetRaw(PFX + id) }); return; }
      res.status(200).json({ configured: true, index: await getIndex() });
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
        res.status(200).json({ configured: true, removed: ids.length });
        return;
      }

      // Upload one image + its metadata.
      const id = body.id, data = body.data, meta = body.meta || {};
      if (!id || !data) { res.status(400).json({ error: "missing id or data" }); return; }
      await kvSetRaw(PFX + id, String(data));
      const idx = await getIndex();
      if (!idx.some((m) => String(m.id) === String(id))) {
        idx.push({ id: String(id), job: meta.job || "", phase: meta.phase || "", ts: meta.ts || "" });
        await kvSetRaw(IDX, JSON.stringify(idx.slice(-2000)));
      }
      res.status(200).json({ configured: true, ok: true });
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    res.status(200).json({ configured: true, error: String(e).slice(0, 200) });
  }
};
