// Klyfton live pricing — pulls the owner's current pricing sheet so the estimator, ROI, and
// the AI always use the NEWEST prices without anyone re-typing them.
//
// The deployed static app can't authenticate to Google Drive, so the owner publishes the
// pricing Google Sheet to the web as CSV (File → Share → Publish to web → the pricing tab →
// CSV) and pastes that URL in Admin → Live Pricing. This endpoint fetches it server-side
// (avoids browser CORS), parses it, and returns clean rows.
//
// URL source: the request body/query `url`, or the PRICING_CSV_URL env var as a default.
// SSRF guard: only Google-published-doc hosts are allowed. Dormant (configured:false) with no URL.

const ENV_URL = process.env.PRICING_CSV_URL || "";

function hostOK(u) {
  try {
    const h = new URL(u).hostname.toLowerCase();
    return h === "docs.google.com" || h.endsWith(".googleusercontent.com") || h.endsWith(".google.com");
  } catch { return false; }
}

// Minimal CSV parser with quoted-field support (handles commas/quotes inside "...").
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c === "\r") { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim() !== ""));
}

module.exports = async (req, res) => {
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  const url = (body.url || (req.query && req.query.url) || ENV_URL || "").trim();
  if (!url) { res.status(200).json({ configured: false }); return; }
  if (!hostOK(url)) { res.status(400).json({ configured: true, error: "url_not_allowed", hint: "Use a Google 'Publish to web' CSV link." }); return; }

  try {
    const r = await fetch(url, { redirect: "follow" });
    if (!r.ok) { res.status(200).json({ configured: true, ok: false, status: r.status }); return; }
    const text = await r.text();
    const grid = parseCSV(text);
    if (!grid.length) { res.status(200).json({ configured: true, ok: false, error: "empty" }); return; }
    const header = grid[0].map(h => String(h).trim());
    const rows = grid.slice(1, 400).map(cols => {
      const o = {};
      header.forEach((h, i) => { o[h] = (cols[i] != null ? String(cols[i]).trim() : ""); });
      return o;
    });
    res.status(200).json({ configured: true, ok: true, count: rows.length, header, rows, at: new Date().toISOString() });
  } catch (e) {
    res.status(200).json({ configured: true, ok: false, error: String(e).slice(0, 140) });
  }
};
