// Klyfton multi-device sync — the shared backbone so every crew phone sees the same
// jobs, leads, estimates, JSAs, punches, material logs, and sign-offs.
//
// Runs as a Vercel serverless function. No npm deps (uses global fetch + the Vercel KV
// REST API). DORMANT until KV storage is attached: with no KV_REST_API_URL it returns
// { configured:false } and the app silently stays on-device — zero behavior change.
//
// To switch on: Vercel → mgsf-fieldos → Storage → add KV (Upstash) → connect to project.
// Vercel injects KV_REST_API_URL + KV_REST_API_TOKEN automatically. Then redeploy.

// Accept whichever names Vercel injects — classic Vercel KV or the Upstash marketplace
// integration — so the owner just clicks "connect" and it works, no key juggling.
const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.STORAGE_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.STORAGE_REST_API_TOKEN;

// Collections we sync. Photos are intentionally excluded (base64 images are too heavy for
// this store — they stay on-device until we add blob storage).
const COLLECTIONS = ["jobs", "leads", "estimates", "jsas", "tc_punches", "matlogs", "signoffs", "proposals", "forms", "changeorders", "invoices"];
const TOMB = "_tomb"; // tombstones: [{c, id}] — so deletes propagate across devices
const MEM = "memory";  // Klyfton's durable facts — plain strings, set-union across devices
const PREFIX = "mgsf:";

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
  // Dormant when no storage attached — the app keeps working on-device.
  if (!KV_URL || !KV_TOKEN) {
    res.status(200).json({ configured: false });
    return;
  }

  try {
    if (req.method === "GET") {
      const tomb = await kvGet(TOMB);
      const tset = new Set((tomb || []).map((t) => t.c + "|" + String(t.id)));
      const data = {};
      await Promise.all(COLLECTIONS.map(async (c) => {
        const rows = await kvGet(c);
        data[c] = rows.filter((r) => r && r.id != null && !tset.has(c + "|" + String(r.id)));
      }));
      const memory = await kvGet(MEM);
      res.status(200).json({ configured: true, data, tomb, memory });
      return;
    }

    if (req.method === "POST") {
      let body = req.body;
      if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
      body = body || {};
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
      const incoming = Array.isArray(body.records) ? body.records : [];
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
