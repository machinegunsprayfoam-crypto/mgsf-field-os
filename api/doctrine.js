// SINGLE SOURCE OF TRUTH for MGSF locked doctrine numbers — mirrors mgsf-core / PRICING_RULES v2
// (2026-08-05, which supersedes v1). Doctrine wins over any conflicting number in code; the
// newest-dated locked rate wins. Every estimator module that needs an R-value, a yield, or a
// per-BF cost reads it FROM HERE so the numbers can never drift apart again (the old bug: spf-takeoff
// had closed-cell R 6.5 while rvalue-calc had 7.1 and the 8/5 rules said 7.0). When mgsf-core changes,
// update THIS file and tests/doctrine.js keeps every consumer aligned.
//
// Keyless, deterministic, no npm. Not a live/gated module — just constants + provenance.

// R-value per inch — MANUFACTURER PUBLISHED, no derate (a plan reviewer checks the TDS).
const R_PER_INCH = {
  open: 3.8,      // ProFill (DORMANT — no MGSF jobs yet)
  closed: 7.0,    // UPC 2.0 HFO TDS (changed 6.5→7.0 on 2026-08-05)
  roofing: 6.3,   // NCFI 10-011 HFC — UNCONFIRMED (10-016 HFO would be 6.7 + walkable); see ROOFING_R_CONFIRMED
};
const ROOFING_R_CONFIRMED = false; // owner must pick NCFI 10-011 (R6.3, 25psi) vs 10-016 (R6.7, 58psi walkable)

// Measured FIELD yield (board-feet per set). Bid yield = field × WASTE_FACTOR (applied in the engine).
const YIELD_BF = {
  closed: 4200,   // closed cell 2.0 pcf
  roofing: 3750,  // MEASURED: 10,000 sf × 1.5" = 15,000 BF ÷ 4 sets consumed (strongest datapoint on file)
};
const WASTE_FACTOR = 0.90; // field yield × 0.90 at bid time — LIVES IN THE ENGINE OR IN YOUR HEAD, NOT BOTH

// Per-BF material cost (field rate). Bid rate = field ÷ WASTE_FACTOR (× 1.1111).
const COST_PER_BF = { open: 0.122, closed: 0.982, roofing: 0.680 };

// Labor + margin (mgsf-core). Sell price = MAX(job minimum, cost-plus, market check).
const LABOR = { installer: 80, helper: 48 };       // $/hr
const GM_TARGET = { residential: 0.55, commercial: 0.50, industrial: 0.48, government: 0.45 };
const JOB_MIN = 1200;

module.exports = {
  R_PER_INCH, ROOFING_R_CONFIRMED, YIELD_BF, WASTE_FACTOR, COST_PER_BF, LABOR, GM_TARGET, JOB_MIN,
  source: "mgsf-core / PRICING_RULES v2",
  lockedDate: "2026-08-05",
};
