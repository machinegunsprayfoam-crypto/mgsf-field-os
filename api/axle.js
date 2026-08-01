// Axle — the SECOND prime mover. The engine turns the gearbox on real-world events; the AXLE turns
// it on TIME. A scheduled tick engages a saved "transmission program" (a named set of gears) through
// the gearbox, so the clock drives the same drivetrain an event would — logged to the `events` table
// (visible in the Command Center's drivetrain strip) and honoring the DUAL-DRIVE: AI gears run
// autonomously, owner/outward gears draft + block for Clifton. Never auto-sends; never fabricates.
//
// This does NOT replace the 7 dedicated Vercel crons (daily-brief, follow-up, invoice-remind, etc.) —
// those still own their outward sweeps. The axle is the COORDINATION layer that couples time to the
// gearbox: it turns the internal/heartbeat gears so the drivetrain shows the clock turning, and it's
// the one place a cadence "program" is defined. Plain fetch + built-in crypto, no npm.
//
// GET  /api/axle                         -> list programs + cadences
// GET  /api/axle?cadence=daily           -> run the daily program (cron target)
// POST /api/axle { action:"tick", cadence, at? }  -> run a program (at = ISO override for testing)
const gearbox = require("./gearbox");

function clean(s, max) { return String(s == null ? "" : s).trim().slice(0, max || 40); }

// Optional endpoint guard: if AXLE_SECRET (or CRON_SECRET) is set, a caller must present it
// (?secret= or x-axle-secret header). Unset => open (the turns are internal/gated anyway).
function _secret() { return process.env.AXLE_SECRET || process.env.CRON_SECRET || ""; }
function _authed(req) {
  const want = _secret();
  if (!want) return true;
  const got = (req.headers && (req.headers["x-axle-secret"] || req.headers["authorization"])) || "";
  const q = (req.query && req.query.secret) || "";
  return got === want || got === "Bearer " + want || q === want;
}

// A transmission PROGRAM = a cadence + the gears time engages. Each gear is a gearbox event.
// Keep these to internal/heartbeat turns; outward per-item work stays with the dedicated crons.
// (drive is decided by the gear itself in gearbox HANDLERS — owner gears here would draft + block.)
//
// NAMED PRESETS (graduated from the 3D gear-model presets):
//   daily / weekly  — scheduled cadence crons (see vercel.json).
//   workers         — field-ops heartbeat: certs + roof-maintenance readiness (run on demand).
//   money           — revenue heartbeat: pipeline sweep + follow-up reheat drafts (owner gear
//                     → goes blocked/draft until Clifton approves; never auto-sends).
//   all             — full sweep: everything daily + weekly in one shot (run on demand).
const PROGRAMS = {
  daily: { cadence: "0 12 * * 1-6", label: "Daily heartbeat",
    turns: [
      { name: "axle.daily", note: "daily coordination tick" },
      { name: "pipeline.sweep", note: "re-check open estimates/deals (internal)" },
      { name: "certs.watch", note: "cert/doc expiry check (internal)" },
    ] },
  weekly: { cadence: "0 12 * * 1", label: "Weekly heartbeat",
    turns: [
      { name: "axle.weekly", note: "weekly coordination tick" },
      { name: "roofmaint.sweep", note: "roof-maintenance cycle check (internal)" },
    ] },
  workers: { cadence: "manual", label: "Workers (field-ops focus)",
    turns: [
      { name: "certs.watch", note: "cert/doc expiry check — are the crew's tickets current?" },
      { name: "roofmaint.sweep", note: "roof-maintenance cycle heartbeat — which roofs need a follow-up?" },
    ] },
  money: { cadence: "manual", label: "Money (revenue focus)",
    turns: [
      { name: "pipeline.sweep", note: "re-check open estimates/deals — what's stale?" },
      { name: "followup.scheduled", note: "reheat stale leads/estimates (owner gear — drafts + blocks for Clifton's approval; never auto-sends)" },
    ] },
  all: { cadence: "manual", label: "All gears (full sweep)",
    turns: [
      { name: "axle.daily", note: "daily coordination tick" },
      { name: "pipeline.sweep", note: "re-check open estimates/deals" },
      { name: "certs.watch", note: "cert/doc expiry check" },
      { name: "axle.weekly", note: "weekly coordination tick" },
      { name: "roofmaint.sweep", note: "roof-maintenance cycle heartbeat" },
    ] },
};

// Sunday guard (hard rule): the axle never turns the drivetrain on a Sunday.
function isSunday(atISO) {
  try { const d = atISO ? new Date(atISO) : new Date(); return d.getUTCDay() === 0; } catch (x) { return false; }
}

async function tick(cadence, atISO) {
  const key = clean(cadence, 20) || "daily";
  const prog = PROGRAMS[key];
  if (!prog) return { ok: false, error: "unknown_program", programs: Object.keys(PROGRAMS) };
  if (isSunday(atISO)) return { ok: true, cadence: key, skipped: "sunday", note: "No work on Sundays — axle idle." };
  const stamp = (atISO ? new Date(atISO) : new Date()).toISOString().slice(0, 10); // idempotency by day
  const runs = [];
  for (const t of prog.turns) {
    // key = gear+date so a re-fire on the same day is a no-op (gearbox is idempotent on key).
    const r = await gearbox.turn(t.name, key + "|" + stamp, { scheduled: true, cadence: key, note: t.note }, "axle:" + key);
    runs.push({ gear: t.name, blocked: !!(r && r.blocked), ok: !!(r && r.ok) });
  }
  const blocked = runs.some((r) => r.blocked);
  return { ok: true, cadence: key, day: stamp, drove: runs.length, blocked: blocked, runs: runs };
}

module.exports = async (req, res) => {
  if (!_authed(req)) { res.status(401).json({ ok: false, error: "unauthorized" }); return; }
  const q = (req.query && req.query.cadence) ? clean(req.query.cadence, 20) : "";
  if (req.method === "GET" && !q) {
    res.status(200).json({ ok: true, note: "The axle turns the gearbox on TIME. GET ?cadence=daily|weekly to run a program (cron target), or POST {action:'tick',cadence}. Sunday-guarded; outward gears draft+block (dual-drive).",
      programs: Object.keys(PROGRAMS).map((k) => ({ cadence: k, label: PROGRAMS[k].label, schedule: PROGRAMS[k].cadence, turns: PROGRAMS[k].turns.map((t) => t.name) })),
      secured: !!_secret() });
    return;
  }
  try {
    if (req.method === "GET" && q) { res.status(200).json(await tick(q)); return; }
    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
    body = body || {};
    if (clean(body.action, 20) === "tick") { res.status(200).json(await tick(body.cadence, body.at)); return; }
    res.status(200).json({ ok: false, error: "unknown_action", supported: ["tick"], hint: "GET ?cadence=daily" });
  } catch (x) { res.status(200).json({ ok: false, error: String(x).slice(0, 140) }); }
};

module.exports.tick = tick;
module.exports.PROGRAMS = PROGRAMS;
module.exports.isSunday = isSunday;
