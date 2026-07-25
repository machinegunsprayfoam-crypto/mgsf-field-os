// Operations Command Center — read API for the dashboard UI (Phase 2). Serves the REAL numbers:
// the 7-day KPI tiles (tasks, active agents, success %, avg latency) and the top-agents leaderboard,
// both from the agent_runs views in Supabase, plus the static agent roster so the grid renders even
// before any runs exist. Read-only, gated on Supabase; degrades to an honest empty state (configured
// false, zeroed KPIs) so the UI never shows fabricated numbers. Plain fetch, no npm.
//
// GET  /api/command-center  -> { configured, kpis, leaderboard, roster, generatedAt }

function _kvEnv(suffixRe, excludeRe) {
  for (const k of Object.keys(process.env)) { if (excludeRe && excludeRe.test(k)) continue; if (suffixRe.test(k) && process.env[k]) return process.env[k]; }
  return undefined;
}
const SB_URL = _kvEnv(/SUPABASE_URL$/i);
const SB_KEY = _kvEnv(/SUPABASE_SERVICE_ROLE_KEY$/i) || _kvEnv(/SERVICE_ROLE_KEY$/i) || _kvEnv(/SUPABASE_SECRET/i);
const SB_ON = !!(SB_URL && SB_KEY);
const memory = require("./memory"); // battery state-of-charge
// The battery is a VERY LARGE capacity pack — pgvector scales far past this; it's the gauge's
// full-scale reference (how many long-term facts the machine can hold). Override with BATTERY_CAPACITY.
const BATTERY_CAPACITY = parseInt(process.env.BATTERY_CAPACITY || "100000", 10) || 100000;

// The real minds the Queen recruits (from klyfton.js SPECIALISTS) — so the grid shows what actually
// exists. Live per-agent stats get merged in from the leaderboard view. No invented agents.
const ROSTER = [
  { key: "Estimator", label: "Estimator", does: "Bids, board-feet, margin checks" },
  { key: "Spray-Conditions", label: "Spray Conditions", does: "Dew point / substrate go-no-go" },
  { key: "Materials", label: "Materials", does: "Foam systems, yields, sets" },
  { key: "Safety/JSA", label: "Safety / JSA", does: "PPE, hazards, job safety" },
  { key: "Ops", label: "Ops", does: "Scheduling, crew, logistics" },
  { key: "Marketing", label: "Marketing", does: "Content, SEO, lead-gen" },
  { key: "Lead-Hunter", label: "Lead Hunter", does: "GovCon / SAM / pipeline" },
  { key: "Klyfton", label: "Klyfton (General)", does: "Synthesis + anything else" },
];

async function sbGet(pathAndQuery) {
  const r = await fetch(SB_URL.replace(/\/$/, "") + "/rest/v1/" + pathAndQuery, {
    headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY, Accept: "application/json" },
  });
  if (!r.ok) throw new Error("sb_" + r.status);
  return r.json();
}

const EMPTY_KPIS = { tasks_7d: 0, active_agents_7d: 0, success_pct_7d: null, avg_ms_7d: null };

module.exports = async (req, res) => {
  if (req.method !== "GET") { res.status(405).json({ error: "method_not_allowed" }); return; }
  const stamp = new Date().toISOString();
  if (!SB_ON) {
    res.status(200).json({ ok: true, configured: false, kpis: EMPTY_KPIS, leaderboard: [], roster: ROSTER, drivetrain: [],
      odometer: { forward_miles: 0, reverse_miles: 0, net_miles: 0, fuel_usd: 0 }, battery: { charge: 0, capacity: BATTERY_CAPACITY },
      note: "Command Center is read-only and needs Supabase (run db/schema.sql + set SUPABASE_URL + service-role key). Showing roster only until then.", generatedAt: stamp });
    return;
  }
  try {
    const [kpiRows, board, drivetrain, odoRows, batt] = await Promise.all([
      sbGet("v_agent_kpis_7d?select=*").catch(() => []),
      sbGet("v_agent_leaderboard?select=*").catch(() => []),
      sbGet("v_gearbox_recent?select=*&limit=12").catch(() => []), // recent gear-turns (drivetrain)
      sbGet("v_odometer?select=*").catch(() => []),               // the odometer (miles + fuel)
      memory.charge().catch(() => ({ count: 0 })),                // battery state-of-charge (memory)
    ]);
    const kpis = (Array.isArray(kpiRows) && kpiRows[0]) ? kpiRows[0] : EMPTY_KPIS;
    const leaderboard = Array.isArray(board) ? board : [];
    const odometer = (Array.isArray(odoRows) && odoRows[0]) ? odoRows[0] : { forward_miles: 0, reverse_miles: 0, net_miles: 0, fuel_usd: 0 };
    const battery = { charge: (batt && typeof batt.count === "number") ? batt.count : 0, capacity: BATTERY_CAPACITY };
    // Merge live stats onto the roster so every agent card shows its run count + success %.
    const byAgent = {};
    for (const row of leaderboard) if (row && row.agent) byAgent[String(row.agent)] = row;
    const roster = ROSTER.map((a) => {
      const s = byAgent[a.key] || byAgent[a.label];
      return { ...a, runs: s ? s.runs : 0, successPct: s ? s.success_pct : null };
    });
    res.status(200).json({ ok: true, configured: true, kpis, leaderboard, roster, drivetrain: Array.isArray(drivetrain) ? drivetrain : [], odometer, battery, generatedAt: stamp });
  } catch (e) {
    res.status(200).json({ ok: false, configured: true, error: String(e.message || e).slice(0, 140),
      kpis: EMPTY_KPIS, leaderboard: [], roster: ROSTER, generatedAt: stamp });
  }
};

module.exports.ROSTER = ROSTER;
