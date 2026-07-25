// ATS — Automatic Transfer Switch (Clifton's idea). Like a generator/solar ATS that flips the load
// from the grid to the battery when the primary source drops, this flips Klyfton from FUEL (fresh
// LLM inference — full hive, best models) to BATTERY (memory recall + a single cheapest mind) when the
// monthly token budget runs LOW — before the hard cap cuts everything off. It's the graceful step
// between "full power" and "tank empty": the machine keeps answering, just on stored charge.
//
//   fuel ok      (< transfer %)   -> run on FUEL: full hive, normal models
//   fuel low     (>= transfer %)  -> transfer to BATTERY: 1 mind + cheapest model + lean on memory
//   fuel empty   (>= 100%)        -> BATTERY only (klyfton's existing hard cap still returns first)
//
// Pure + dependency-free so it's unit-testable and reusable (klyfton hot path + the dashboard).
// Transfer point via ATS_TRANSFER_PCT (default 0.80). Cheapest model via ATS_BATTERY_MODEL.

const TRANSFER_PCT = (function () { const v = parseFloat(process.env.ATS_TRANSFER_PCT); return (isFinite(v) && v > 0 && v < 1) ? v : 0.80; })();
const BATTERY_MODEL = process.env.ATS_BATTERY_MODEL || "claude-haiku-4-5";

// decide({spent, budget, charge?}) -> the switch state. Never throws; safe on missing inputs.
function decide(o) {
  o = o || {};
  const spent = Math.max(0, Number(o.spent) || 0);
  const budget = Number(o.budget) || 0;
  const charge = Math.max(0, Number(o.charge) || 0);
  // No budget configured (or no tracking) => always on fuel, no downshift, zero behavior change.
  if (!budget || budget <= 0) {
    return { tracking: false, source: "fuel", level: "ok", pctUsed: 0, remaining: null, charge: charge,
      transferPct: TRANSFER_PCT, downshift: null, reason: "no monthly budget set — always on fuel" };
  }
  const pct = spent / budget;
  const remaining = Math.max(0, budget - spent);
  const pctStr = Math.round(pct * 100) + "%";
  if (pct >= 1) {
    return { tracking: true, source: "battery", level: "empty", pctUsed: pct, remaining: 0, charge: charge,
      transferPct: TRANSFER_PCT, downshift: { maxMinds: 1, model: BATTERY_MODEL },
      reason: "fuel exhausted (" + pctStr + ") — battery only" };
  }
  if (pct >= TRANSFER_PCT) {
    return { tracking: true, source: "battery", level: "low", pctUsed: pct, remaining: remaining, charge: charge,
      transferPct: TRANSFER_PCT, downshift: { maxMinds: 1, model: BATTERY_MODEL },
      reason: "fuel low (" + pctStr + " used) — transferred to battery: single mind + cheapest model + memory" };
  }
  return { tracking: true, source: "fuel", level: "ok", pctUsed: pct, remaining: remaining, charge: charge,
    transferPct: TRANSFER_PCT, downshift: null, reason: "fuel ok (" + pctStr + " used)" };
}

// Apply the switch to a router plan: on battery, coast on a single mind (drops the hive — the
// biggest fuel saving). Returns a NEW plan; never mutates the input. Model override is separate.
function applyToPlan(plan, state) {
  if (!plan || !state || !state.downshift || !state.downshift.maxMinds) return plan;
  const n = state.downshift.maxMinds;
  const minds = Array.isArray(plan.minds) ? plan.minds : [];
  if (minds.length <= n) return plan;
  return { minds: minds.slice(0, n), complexity: n <= 1 ? "simple" : plan.complexity };
}

module.exports = { decide, applyToPlan, TRANSFER_PCT, BATTERY_MODEL };
