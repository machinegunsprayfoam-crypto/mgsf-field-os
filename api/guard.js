// Klyfton access guard — the ONE standard CREW_CODE gate every sensitive endpoint can share, so
// access control stops being ad-hoc. DORMANT-SAFE by design: when CREW_CODE is unset it allows
// everything (never locks anyone out — same phase-0 policy as auth.js / health.js). Once the owner
// sets CREW_CODE, a request must present it via the `x-crew-code` header, `?code=`, or body.code.
// Pure, no secrets echoed, constant-time compare. Usage in a handler:
//   const guard = require("./guard"); if (!guard.ok(req)) { res.status(401).json(guard.denied()); return; }

function present(req) {
  try {
    const h = req && req.headers ? (req.headers["x-crew-code"] || req.headers["x-crew"] || "") : "";
    const q = req && req.query ? (req.query.code || req.query.crew || "") : "";
    let b = req && req.body;
    if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } }
    const bc = b && (b.code || b.crew) ? (b.code || b.crew) : "";
    return String(h || q || bc || "");
  } catch (e) { return ""; }
}

// Length-checked constant-time-ish compare (avoids leaking the code length via early exit timing).
function safeEqual(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// ok(req) → true if allowed. Dormant (true) until CREW_CODE is set; then requires the code.
function ok(req, env) {
  const code = ((env && env.CREW_CODE) != null ? (env && env.CREW_CODE) : process.env.CREW_CODE) || "";
  if (!code) return true; // no lockout until the owner turns the gate on
  return safeEqual(present(req), code);
}

function denied() {
  return { ok: false, error: "unauthorized", note: "CREW_CODE is set — send it via the x-crew-code header (or ?code=)." };
}

module.exports = { ok, denied, present, safeEqual };
