// Scheduled-trigger guard. Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when
// CRON_SECRET is configured. Keep the guard dormant until then so existing deployments do not
// lose scheduled work before the secret is added.
function presented(req) {
  const headers = (req && req.headers) || {};
  return String(headers.authorization || headers.Authorization || headers["x-cron-secret"] || "");
}

function safeEqual(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function ok(req, env) {
  const secret = String((env || process.env).CRON_SECRET || "");
  if (!secret) return true;
  const got = presented(req);
  return safeEqual(got, "Bearer " + secret) || safeEqual(got, secret);
}

function denied() { return { ok: false, error: "unauthorized" }; }

module.exports = { ok, denied, safeEqual };
