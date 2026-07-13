// Google Drive backup — pushes leads/jobs/estimates (as CSV) and job photos into a
// folder in the OWNER'S Google Drive. Server-to-server proxy to a Google Apps Script
// Web App that runs as the owner (no service-account key to juggle, no browser CORS).
//
// (Replaces an earlier version that required the `googleapis` npm package — this app
// installs no npm deps, so that version could never run. This one uses global fetch only.)
//
// Two ways to configure the Apps Script /exec URL:
//   A) Vercel env GDRIVE_WEBAPP_URL (+ optional GDRIVE_TOKEN), OR
//   B) paste the /exec URL right in the app (Photos -> Drive card). The client then sends
//      it as `webappUrl` on each request — no Vercel env var needed.
// Only Apps Script exec URLs are accepted (so this proxy can't be used as an open relay).

// Owner's Apps Script /exec endpoint, baked in so every device is connected to Drive out of the
// box (no pasting on a new phone). Server-side only — this file runs as a Vercel function and is
// NOT shipped to the browser, so the URL isn't exposed in the public page source. An env var still
// overrides it, and the script itself is write-only (no data read-back). Rotate by redeploying the
// Apps Script and updating this default (or set GDRIVE_WEBAPP_URL in Vercel).
const DEFAULT_URL = "https://script.google.com/macros/s/AKfycbwhgGsim51nqa5qDVsUrmfiJjLMJlTDwrwlqlOgzoObl07CtJ-NX1GJFPBM-FeK6BgBAA/exec";
const ENV_URL = process.env.GDRIVE_WEBAPP_URL || process.env.GOOGLE_APPS_SCRIPT_URL || DEFAULT_URL;
const ENV_TOKEN = process.env.GDRIVE_TOKEN || ""; // optional shared secret checked by the script

// Accept only Google Apps Script web-app exec endpoints.
function validScriptUrl(u) {
  return typeof u === "string" && /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec(\?|#|$)/.test(u);
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

module.exports = async (req, res) => {
  // configured=true only when a server-side URL exists; clientConfigurable tells the app it
  // may instead supply its own (validated) webappUrl per request.
  if (req.method === "GET") { res.status(200).json({ configured: !!ENV_URL, clientConfigurable: true }); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }

  const body = await readBody(req);
  const url = ENV_URL || (validScriptUrl(body.webappUrl) ? body.webappUrl : "");
  if (!url) { res.status(200).json({ configured: false, error: body.webappUrl ? "invalid_webapp_url" : undefined }); return; }

  // Build the payload the script expects; never forward our routing field.
  const payload = Object.assign({}, body);
  delete payload.webappUrl;
  const token = ENV_TOKEN || (typeof body.token === "string" ? body.token : "");
  if (token) payload.token = token; else delete payload.token;

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      redirect: "follow", // Apps Script /exec 302-redirects to googleusercontent — follow it
    });
    const text = await r.text();
    let json; try { json = JSON.parse(text); } catch { json = { ok: false, error: "bad_script_response", raw: text.slice(0, 300) }; }
    res.status(200).json(Object.assign({ configured: true }, json));
  } catch (e) {
    res.status(200).json({ configured: true, ok: false, error: String((e && e.message) || e).slice(0, 300) });
  }
};
