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

// One-time account seed. Fixed roster only (can't create arbitrary accounts), idempotent
// (skips anyone who already exists → re-running never resets a password), temp passwords the
// owner chose for initial login. These are TEMPORARY and must be changed before auth is enforced;
// this action is removed at the enforce phase. Uses the service key server-side (never exposed).
const SEED_USERS = [
  { email: "clifton@machinegunsprayfoam.info", password: "Clifton", role: "full" },
  { email: "talia.protax@gmail.com", password: "Talia1", role: "admin" },
  { email: "danielford774@gmail.com", password: "Daniel", role: "field" },
];
async function adminCreate(u) {
  try {
    const r = await fetch(SB_URL + "/auth/v1/admin/users", {
      method: "POST",
      headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email: u.email, password: u.password, email_confirm: true, app_metadata: { role: u.role, must_change: true } }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok) return { email: u.email, role: u.role, status: "created" };
    const msg = String((j && (j.msg || j.error_description || j.error || j.message)) || "");
    if (/already|registered|exists|duplicate/i.test(msg)) return { email: u.email, role: u.role, status: "exists" };
    return { email: u.email, status: "error", error: msg.slice(0, 140) };
  } catch (e) { return { email: u.email, status: "error", error: String(e && e.message || e).slice(0, 140) }; }
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    if (!SB_ON) { res.status(200).json({ configured: false }); return; }
    // Seed the fixed roster (idempotent). GET so it can be triggered once from a browser/tool.
    if (req.query && String(req.query.bootstrap) === "1") {
      const results = [];
      for (const u of SEED_USERS) results.push(await adminCreate(u));
      res.status(200).json({ ok: true, seeded: results });
      return;
    }
    // Self-test: confirm the login chain works end-to-end (no token returned).
    if (req.query && String(req.query.selftest) === "1") {
      const t = await tokenGrant("password", { email: SEED_USERS[0].email, password: SEED_USERS[0].password });
      res.status(200).json({ ok: t.ok, loginWorks: t.ok, role: t.ok && t.session.user ? t.session.user.role : null, error: t.error || null });
      return;
    }
    res.status(200).json({ configured: SB_ON });
    return;
  }
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
