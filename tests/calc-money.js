#!/usr/bin/env node
// Money-math invariants — commission / payment-schedule / unit-convert. Run: `node tests/calc-money.js`
//
// Same spirit as calc-invariants.js: assert each calculator's internal math IDENTITIES and
// monotonicity — never doctrine prices (those live in mgsf-core, never fabricated). If someone
// breaks the math, an identity fails and this exits non-zero. Keyless, no npm, deterministic
// (payment-schedule takes an explicit todayISO so no Date.now dependency).

const path = require("path");
const A = f => require(path.join(__dirname, "..", "api", f));
let pass = 0, fail = 0;
const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 0.005 : tol);
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }
function noBadNums(name, o) {
  let bad = null;
  (function walk(v) { if (bad !== null) return; if (typeof v === "number") { if (!Number.isFinite(v)) bad = v; }
    else if (v && typeof v === "object") Object.values(v).forEach(walk); })(o);
  ok(name + ": no NaN/Infinity", bad === null, bad === null ? undefined : "found " + bad);
}

console.log("Money-math invariants — commission / payment-schedule / unit-convert\n");

// ---- commission.calc ----
(() => {
  const C = A("commission.js").calc;
  const m = C({ basis: "margin", revenue: 10000, cost: 6000, rate: 10 });
  ok("commission: ok", m.ok === true);
  ok("commission: grossMargin = revenue − cost", m.grossMargin === 4000, m.grossMargin);
  ok("commission: margin base × rate", near(m.commission, 4000 * 0.10), m.commission);
  ok("commission: marginPct = gm/rev", m.marginPct === 40, m.marginPct);
  ok("commission: netPayable = commission − draw (no draw)", m.netPayable === m.commission);

  const r = C({ basis: "revenue", revenue: 10000, cost: 6000, rate: 10 });
  ok("commission: revenue basis uses revenue", near(r.commission, 1000), r.commission);
  ok("commission: revenue base ≥ margin base commission", r.commission > m.commission);

  const d = C({ basis: "margin", revenue: 10000, cost: 6000, rate: 10, draw: 150 });
  ok("commission: draw subtracts", near(d.netPayable, d.commission - 150), d.netPayable);

  // tiers: 5% on first 5000, 10% on remainder of a 10000 base (revenue basis, cost 0)
  const t = C({ basis: "revenue", revenue: 10000, cost: 0, tiers: [{ upTo: 5000, rate: 5 }, { upTo: null, rate: 10 }] });
  ok("commission: tiered = Σ bands", near(t.commission, 5000 * 0.05 + 5000 * 0.10), t.commission); // 250+500=750
  ok("commission: tier breakdown sums to commission", near(t.breakdown.reduce((s, b) => s + b.amount, 0), t.commission));

  // monotonic in rate
  const lo = C({ basis: "margin", revenue: 10000, cost: 6000, rate: 5 });
  ok("commission: higher rate ⇒ higher payout", m.commission > lo.commission);
  // clamps: negative revenue floored to 0
  const z = C({ basis: "margin", revenue: -100, cost: 50, rate: 10 });
  ok("commission: negative revenue floored", z.grossMargin === 0 && z.commission === 0, z.commission);
  noBadNums("commission", m); noBadNums("commission-tier", t);
})();

// ---- payment-schedule.calc(body, todayISO) ----
(() => {
  const P = A("payment-schedule.js").calc;
  const TODAY = "2026-03-02";
  const s = P({ total: 10000, depositPct: 50, milestones: 1, startDate: "2026-03-02", intervalDays: 14 }, TODAY);
  ok("schedule: ok", s.ok === true);
  ok("schedule: balances exactly (checkSum = total)", s.balances === true && s.checkSum === 10000, s.checkSum);
  ok("schedule: deposit 50% = 5000", s.schedule[0].amount === 5000, s.schedule[0].amount);
  ok("schedule: deposit + 1 balance = 2 rows", s.schedule.length === 2, s.schedule.length);

  // rounding case: last milestone absorbs remainder so sum is EXACT
  const r = P({ total: 100, depositPct: 50, milestones: 3, startDate: "2026-03-02", intervalDays: 10 }, TODAY);
  const sum = r.schedule.reduce((a, x) => a + x.amount, 0);
  ok("schedule: rounding sum is exact", near(sum, 100, 0.001) && r.balances === true, sum);
  ok("schedule: due dates strictly increase", r.schedule.every((x, i, arr) => i === 0 || x.due > arr[i - 1].due));

  // interval arithmetic: first milestone due = start + intervalDays
  ok("schedule: milestone due = start + interval", s.schedule[1].due === "2026-03-16", s.schedule[1].due);
  // guards
  ok("schedule: zero total ⇒ need_total", P({ total: 0 }, TODAY).ok === false);
  ok("schedule: milestones clamp ≤ 12", P({ total: 1000, milestones: 99, startDate: TODAY }, TODAY).schedule.length <= 13);
  noBadNums("schedule", s); noBadNums("schedule-round", r);
})();

// ---- unit-convert.convert ----
(() => {
  const U = A("unit-convert.js").convert;
  ok("convert: bf_from_area = area×thickness", U({ kind: "bf_from_area", area: 1000, thickness: 2 }).boardFeet === 2000);
  ok("convert: area_from_bf = bf/thickness", U({ kind: "area_from_bf", boardFeet: 2000, thickness: 2 }).areaSqft === 1000);
  const sets = U({ kind: "sets_from_bf", boardFeet: 8200, yieldPerSet: 4000 });
  ok("convert: setsToOrder = ceil(exact)", sets.setsToOrder === 3 && near(sets.setsExact, 2.05, 0.01), JSON.stringify(sets));
  ok("convert: c_to_f(0) = 32", U({ kind: "c_to_f", value: 0 }).f === 32);
  ok("convert: c_to_f(100) = 212", U({ kind: "c_to_f", value: 100 }).f === 212);
  ok("convert: f_to_c(32) = 0", U({ kind: "f_to_c", value: 32 }).c === 0);
  ok("convert: inwc_to_pa(1) = 248.84", near(U({ kind: "inwc_to_pa", value: 1 }).pa, 248.84, 0.01));
  ok("convert: pa_to_inwc round-trips", near(U({ kind: "pa_to_inwc", value: 248.84 }).inwc, 1, 0.001));
  ok("convert: r_to_u(20) = 0.05", near(U({ kind: "r_to_u", value: 20 }).u, 0.05, 0.0001));
  ok("convert: u_to_r(0.05) = 20", near(U({ kind: "u_to_r", value: 0.05 }).r, 20, 0.01));
  ok("convert: in_to_mil(1) = 1000", U({ kind: "in_to_mil", value: 1 }).mils === 1000);
  ok("convert: mil_to_in(1000) = 1", U({ kind: "mil_to_in", value: 1000 }).inches === 1);
  const gal = U({ kind: "gal_from_area", area: 1604, mils: 1, solidsPct: 100 });
  ok("convert: gal_from_area @1604ft²/1mil/100% ≈ 1 gal", near(gal.gallons, 1, 0.05), JSON.stringify(gal));
  ok("convert: unknown kind ⇒ error", U({ kind: "nope" }).error === "unknown_kind");
  ok("convert: null value ⇒ null (no NaN)", U({ kind: "c_to_f" }).f === null);
})();

console.log("\n" + (fail ? "✗" : "✓") + " " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
