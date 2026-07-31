// Klyfton IDEMPOTENCY — stop the arms from double-firing the same outward action on a retry.
// Serverless functions can be retried (client resend, platform retry), and an email/text/invoice
// sent twice is a real problem. Each action gets a deterministic KEY (type + target + content +
// day); act.js CHECKS the key before dispatch and COMMITS it only AFTER a successful send — so a
// FAILED dispatch is NOT recorded (retry still works) but a SUCCESSFUL one can't be repeated.
//
// Gated/graceful: needs Supabase to persist keys across invocations. With no store it degrades to a
// best-effort no-op (check ⇒ not-duplicate) — honestly, serverless has no shared memory, so true
// idempotency requires the store; we never pretend otherwise. Pure key(); gated check()/commit().
const crypto = require("crypto");

function _env(re) { for (const k of Object.keys(process.env)) { if (re.test(k) && process.env[k]) return process.env[k]; } return undefined; }
const SB_URL = (_env(/SUPABASE_URL$/i) || "").replace(/\/$/, "");
const SB_KEY = _env(/SERVICE_ROLE_KEY$/i) || _env(/SUPABASE_SECRET/i);
const SB_ON = !!(SB_URL && SB_KEY);

function clean(s, max) { return String(s == null ? "" : s).trim().slice(0, max || 200); }
// Deterministic idempotency key. Same action + same UTC day ⇒ same key (so a resend is caught, but
// the same action tomorrow is legitimately new). dayFn injectable so it's testable without a clock.
function key(action, dayStr) {
  const a = action || {};
  const day = dayStr || ""; // caller passes the day; empty = date-agnostic key
  // Include arm-specific fields so distinct actions get distinct keys — esp. the universal bus
  // (type:"zap"), which has no to/subject/body but IS distinguished by app/op/params. Without these,
  // every zap in a day would collapse to one key and get skipped as a duplicate.
  const parts = [
    clean(a.type, 40),
    clean(a.to || a.customer || a.app, 120),
    clean(a.subject || a.op, 120),
    clean(a.body || a.items || a.amount, 300),
    a.params && typeof a.params === "object" ? JSON.stringify(a.params).slice(0, 400) : "",
    day,
  ];
  return crypto.createHash("sha1").update(parts.join("|")).digest("hex");
}

async function sbFetch(pathStr, opts) {
  return fetch(SB_URL + pathStr, { ...opts, headers: { apikey: SB_KEY, authorization: "Bearer " + SB_KEY, "content-type": "application/json", ...(opts && opts.headers) } });
}
// Has this key already been committed (a successful dispatch)? Gated: no store ⇒ false (not a dup).
async function check(k) {
  if (!SB_ON) return false;
  try {
    const r = await sbFetch("/rest/v1/dispatched_actions?select=k&k=eq." + encodeURIComponent(k) + "&limit=1");
    if (!r.ok) return false; // fail-open on a store error — better to risk a rare double than block all sends
    const rows = await r.json();
    return Array.isArray(rows) && rows.length > 0;
  } catch (e) { return false; }
}
// Record a successful dispatch so it can't repeat. Gated: no store ⇒ no-op.
async function commit(k, meta) {
  if (!SB_ON) return { configured: false };
  try {
    const r = await sbFetch("/rest/v1/dispatched_actions", { method: "POST", headers: { prefer: "return=minimal" },
      body: JSON.stringify({ k, kind: clean(meta && meta.type, 40), at: (meta && meta.at) || null }) });
    return { configured: true, ok: r.ok || r.status === 409 };
  } catch (e) { return { configured: true, ok: false }; }
}

module.exports = { key, check, commit };
module.exports._configured = () => SB_ON;
