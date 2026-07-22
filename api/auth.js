// Klyfton auth — server-side login/verify against Supabase Auth (the brain project already wired
// via SUPABASE_URL + service key in Vercel). The browser never sees the service key; it POSTs here.
//
// PHASE 0 (shadow): this endpoint EXISTS and works, but nothing enforces it yet — deploying it
// changes no app behavior and cannot lock anyone out. The client login gate + /api/sync enforcement
// come in later phases, coordinated so every user is onboarded before enforce flips on.
//
// No npm; global fetch only. Never returns the service key. Actions:
//   POST {action:"login",   email, password}      → { ok, session:{access_token,refresh_token,user} }
//   POST {action:"refresh", refresh_token}        → { ok, session:{...} }
//   POST {action:"verify",  access_token}         → { ok, user:{id,email,role} }
//   GET                                            → { configured }

function _env(suffixRe, excludeRe) {
  for (const k of Object.keys(process.env)) { if (excludeRe && excludeRe.test(k)) continue; if (suffixRe.test(k) && process.env[k]) return process.env[k]; }
  return undefined;
}
const SB_URL = (_env(/SUPABASE_URL$/i) || "").replace(/\/$/, "");
// Service role works as the apikey for the auth REST endpoints and stays server-side only.
const SB_KEY = _env(/SUPABASE_SERVICE_ROLE_KEY$/i) || _env(/SERVICE_ROLE_KEY$/i) || _env(/SUPABASE_SECRET/i);
const SB_ON = !!(SB_URL && SB_KEY);

function roleOf(user) {
  try {
    const r = (user && (user.app_metadata && user.app_metadata.role)) || (user && user.user_metadata && user.user_metadata.role);
    return r || "field"; // default least-privilege until a role is set on the account
  } catch { return "field"; }
}
function trimUser(u) { return u ? { id: u.id, email: u.email, role: roleOf(u) } : null; }

async function tokenGrant(kind, body) {
  const r = await fetch(SB_URL + "/auth/v1/token?grant_type=" + kind, {
    method: "POST",
    headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, status: r.status, error: (j && (j.error_description || j.msg || j.error)) || "auth_failed" };
  return { ok: true, session: { access_token: j.access_token, refresh_token: j.refresh_token, expires_in: j.expires_in, user: trimUser(j.user) } };
}

module.exports = async (req, res) => {
  if (req.method === "GET") { res.status(200).json({ configured: SB_ON }); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  if (!SB_ON) { res.status(200).json({ ok: false, configured: false, error: "auth_not_configured" }); return; }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  try {
    if (body.action === "login") {
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      if (!email || !password) { res.status(200).json({ ok: false, error: "email_and_password_required" }); return; }
      res.status(200).json(await tokenGrant("password", { email, password }));
      return;
    }
    if (body.action === "refresh") {
      if (!body.refresh_token) { res.status(200).json({ ok: false, error: "refresh_token_required" }); return; }
      res.status(200).json(await tokenGrant("refresh_token", { refresh_token: String(body.refresh_token) }));
      return;
    }
    if (body.action === "verify") {
      const tok = String(body.access_token || body.token || "");
      if (!tok) { res.status(200).json({ ok: false, error: "token_required" }); return; }
      const r = await fetch(SB_URL + "/auth/v1/user", { headers: { apikey: SB_KEY, Authorization: "Bearer " + tok } });
      if (!r.ok) { res.status(200).json({ ok: false, error: "invalid_token" }); return; }
      const u = await r.json().catch(() => null);
      res.status(200).json({ ok: true, user: trimUser(u) });
      return;
    }
    res.status(200).json({ ok: false, error: "unknown_action" });
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e && e.message || e).slice(0, 160) });
  }
};
