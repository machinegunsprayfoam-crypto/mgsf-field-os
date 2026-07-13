// Google Drive backup — pushes leads/jobs/estimates (as CSV) and job photos into a
// folder in the OWNER'S Google Drive. Server-to-server proxy to a Google Apps Script
// Web App that runs as the owner (no service-account key to juggle, no browser CORS).
//
// (Replaces an earlier version that required the `googleapis` npm package — this app
// installs no npm deps, so that version could never run. This one uses global fetch only.)
//
// DORMANT until GDRIVE_WEBAPP_URL is set (the app just shows "not connected"). To switch on:
//   1. script.google.com -> New project -> paste the Klyfton Drive Backup Code.gs.
//   2. Deploy -> New deployment -> Web app -> Execute as: Me -> Who has access: Anyone.
//   3. Copy the /exec URL -> Vercel env GDRIVE_WEBAPP_URL (optionally GDRIVE_TOKEN to match
//      the token in the script) -> redeploy.

const WEBAPP_URL = process.env.GDRIVE_WEBAPP_URL || process.env.GOOGLE_APPS_SCRIPT_URL || "";
const TOKEN = process.env.GDRIVE_TOKEN || ""; // optional shared secret checked by the script
const CONFIGURED = !!WEBAPP_URL;

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
  if (req.method === "GET") { res.status(200).json({ configured: CONFIGURED }); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  if (!CONFIGURED) { res.status(200).json({ configured: false }); return; }

  const body = await readBody(req);
  if (TOKEN) body.token = TOKEN; // pass the shared secret through to the script

  try {
    const r = await fetch(WEBAPP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      redirect: "follow", // Apps Script /exec 302-redirects to googleusercontent — follow it
    });
    const text = await r.text();
    let json; try { json = JSON.parse(text); } catch { json = { ok: false, error: "bad_script_response", raw: text.slice(0, 300) }; }
    res.status(200).json(Object.assign({ configured: true }, json));
  } catch (e) {
    res.status(200).json({ configured: true, ok: false, error: String((e && e.message) || e).slice(0, 300) });
  }
};
