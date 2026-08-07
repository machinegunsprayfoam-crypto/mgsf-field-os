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
const ats = require("./ats");        // automatic transfer switch (fuel <-> battery)
const MONTHLY_BUDGET_USD = (function () { var v = process.env.KLYFTON_MONTHLY_BUDGET_USD; return (v != null && v !== "") ? (parseFloat(v) || 0) : 50; })();
function _firstOfMonthISO() { var d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString(); }
// The battery is a VERY LARGE capacity pack — pgvector scales far past this; it's the gauge's
// full-scale reference (how many long-term facts the machine can hold). Override with BATTERY_CAPACITY.
const BATTERY_CAPACITY = parseInt(process.env.BATTERY_CAPACITY || "100000", 10) || 100000;

// The real minds the Queen recruits (from klyfton.js SPECIALISTS) — so the grid shows what actually
// exists. Live per-agent stats get merged in from the leaderboard view. No invented agents.
// The 12-face council (the "dodecahedron") + the Klyfton core. Keys MUST match the SPECIALISTS
// `name` fields in api/klyfton.js so live per-agent leaderboard stats merge onto the right card.
const ROSTER = [
  { key: "Estimator", label: "Estimator", does: "Bids, board-feet, margin checks" },
  { key: "Building-Science", label: "Building Science", does: "Spray window, envelope, foam TDS" },
  { key: "Concrete-Lifting", label: "Concrete Lifting", does: "Polyjacking, void fill, slabs" },
  { key: "Roofing-Coatings", label: "Roofing & Coatings", does: "SPF roofs, elastomeric coatings" },
  { key: "Safety-OSHA", label: "Safety / OSHA", does: "PPE, SDS, JSA, hazards" },
  { key: "Code-Permits", label: "Code & Permits", does: "IECC, R-value, permits, barriers" },
  { key: "Finance-JobCost", label: "Finance / Job-Cost", does: "Margins, AR, cash flow, actuals" },
  { key: "Scheduling-Dispatch", label: "Scheduling / Dispatch", does: "Crew, rig, timeline, drive time" },
  { key: "GovCon", label: "GovCon", does: "SAM.gov, SDVOSB, federal bids" },
  { key: "Sales-Comms", label: "Sales & Comms", does: "Marketing, leads, proposals, follow-up" },
  { key: "Insurance-Bonding", label: "Insurance & Bonding", does: "GL, CPL, COI, surety bonds" },
  { key: "Project-Manager", label: "Project Manager", does: "Job end-to-end, change orders, closeout" },
  { key: "Klyfton", label: "Klyfton (Core)", does: "Synthesis + anything else" },
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
  const guard = require("./guard"); if (!guard.ok(req)) { res.status(401).json(guard.denied()); return; }

  if (req.method !== "GET") { res.status(405).json({ error: "method_not_allowed" }); return; }
  const stamp = new Date().toISOString();
  if (!SB_ON) {
    res.status(200).json({ ok: true, configured: false, kpis: EMPTY_KPIS, leaderboard: [], roster: ROSTER, drivetrain: [],
      odometer: { forward_miles: 0, reverse_miles: 0, net_miles: 0, fuel_usd: 0 }, battery: { charge: 0, capacity: BATTERY_CAPACITY },
      power: { source: "fuel", level: "ok", pctUsed: 0, spent: 0, budget: MONTHLY_BUDGET_USD, remaining: MONTHLY_BUDGET_USD, transferPct: ats.TRANSFER_PCT, reason: "telemetry not configured" },
      note: "Command Center is read-only and needs Supabase (run db/schema.sql + set SUPABASE_URL + service-role key). Showing roster only until then.", generatedAt: stamp });
    return;
  }
  try {
    const [kpiRows, board, drivetrain, odoRows, batt, monthRows] = await Promise.all([
      sbGet("v_agent_kpis_7d?select=*").catch(() => []),
      sbGet("v_agent_leaderboard?select=*").catch(() => []),
      sbGet("v_gearbox_recent?select=*&limit=12").catch(() => []), // recent gear-turns (drivetrain)
      sbGet("v_odometer?select=*").catch(() => []),               // the odometer (miles + fuel)
      memory.charge().catch(() => ({ count: 0 })),                // battery state-of-charge (memory)
      sbGet("agent_runs?select=cost_usd&ts=gte." + encodeURIComponent(_firstOfMonthISO())).catch(() => []), // month-to-date fuel
    ]);
    const kpis = (Array.isArray(kpiRows) && kpiRows[0]) ? kpiRows[0] : EMPTY_KPIS;
    const leaderboard = Array.isArray(board) ? board : [];
    const odometer = (Array.isArray(odoRows) && odoRows[0]) ? odoRows[0] : { forward_miles: 0, reverse_miles: 0, net_miles: 0, fuel_usd: 0 };
    const charge = (batt && typeof batt.count === "number") ? batt.count : 0;
    const battery = { charge: charge, capacity: BATTERY_CAPACITY };
    const monthSpent = Array.isArray(monthRows) ? monthRows.reduce(function (s, r) { return s + (Number(r && r.cost_usd) || 0); }, 0) : 0;
    const transfer = ats.decide({ spent: monthSpent, budget: MONTHLY_BUDGET_USD, charge: charge });
    const power = { source: transfer.source, level: transfer.level, pctUsed: Math.round(transfer.pctUsed * 100) / 100, spent: Math.round(monthSpent * 100) / 100, budget: MONTHLY_BUDGET_USD, remaining: transfer.remaining, transferPct: transfer.transferPct, reason: transfer.reason };
    // Merge live stats onto the roster so every agent card shows its run count + success %.
    const byAgent = {};
    for (const row of leaderboard) if (row && row.agent) byAgent[String(row.agent)] = row;
    const roster = ROSTER.map((a) => {
      const s = byAgent[a.key] || byAgent[a.label];
      return { ...a, runs: s ? s.runs : 0, successPct: s ? s.success_pct : null };
    });
    res.status(200).json({ ok: true, configured: true, kpis, leaderboard, roster, drivetrain: Array.isArray(drivetrain) ? drivetrain : [], odometer, battery, power, generatedAt: stamp });
  } catch (e) {
    res.status(200).json({ ok: false, configured: true, error: String(e.message || e).slice(0, 140),
      kpis: EMPTY_KPIS, leaderboard: [], roster: ROSTER, generatedAt: stamp });
  }
};

module.exports.ROSTER = ROSTER;
