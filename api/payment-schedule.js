// Payment schedule — turns a job total + terms into a dated deposit/progress/balance plan the
// office can hand the customer. Pure math + date arithmetic, no keys, no npm. Never charges or
// sends — it just lays out the schedule for review. Amounts are the caller's; nothing invented.
//
// POST { total, depositPct, milestones, intervalDays, startDate }
//   depositPct   - % due up front to schedule the job (default 50, MGSF standard)
//   milestones   - how many payments AFTER the deposit (default 1 = balance on completion)
//   intervalDays - days between milestones (default 14)
//   startDate    - ISO date the deposit is due (default: today)
// GET -> shape.

function num(v, d) { const n = parseFloat(v); return Number.isFinite(n) ? n : d; }
function money(n) { return Math.round(n * 100) / 100; }

function addDays(iso, days) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function calc(body, todayISO) {
  const total = Math.max(0, num(body.total, 0));
  if (!total) return { ok: false, error: "need_total" };
  const depositPct = Math.min(100, Math.max(0, num(body.depositPct, 50)));
  const milestones = Math.min(12, Math.max(1, Math.round(num(body.milestones, 1))));
  const intervalDays = Math.min(180, Math.max(1, Math.round(num(body.intervalDays, 14))));
  const start = (typeof body.startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.startDate)) ? body.startDate : todayISO;

  const deposit = money(total * (depositPct / 100));
  const remainder = money(total - deposit);
  const per = money(remainder / milestones);

  const rows = [];
  if (depositPct > 0) rows.push({ label: "Deposit (to schedule)", pct: depositPct, amount: deposit, due: start });
  let allocated = 0;
  for (let i = 0; i < milestones; i++) {
    const last = i === milestones - 1;
    // Last milestone absorbs any rounding remainder so the sum is exact.
    const amt = last ? money(remainder - allocated) : per;
    allocated = money(allocated + amt);
    rows.push({
      label: milestones === 1 ? "Balance on completion" : `Progress ${i + 1} of ${milestones}`,
      pct: Math.round((amt / total) * 1000) / 10,
      amount: amt,
      due: addDays(start, intervalDays * (i + 1)),
    });
  }
  const sum = money(rows.reduce((s, r) => s + r.amount, 0));
  return {
    ok: true, total, currency: "USD",
    schedule: rows,
    checkSum: sum, balances: sum === money(total),
    note: "Draft schedule for review — MGSF never auto-charges. Standard terms: 50% deposit to schedule, balance on completion.",
  };
}

module.exports = async (req, res) => {
  const todayISO = new Date().toISOString().slice(0, 10);
  if (req.method === "GET") {
    res.status(200).json({ ok: true, configured: true, shape: { total: 0, depositPct: 50, milestones: 1, intervalDays: 14, startDate: todayISO } });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  try { res.status(200).json(calc(body, todayISO)); }
  catch (e) { res.status(200).json({ ok: false, error: String(e).slice(0, 140) }); }
};

module.exports.calc = calc;
