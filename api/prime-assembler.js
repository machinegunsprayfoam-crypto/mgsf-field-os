// Klyfton PRIME ASSEMBLER — the payoff of the prime-with-subs build. Rolls one job's trades into a
// single PRIME bid: MGSF self-perform scope (priced by doctrine, deferred) + leveled sub bids (the
// subs' own quotes) + each chosen sub's compliance status + a proposal skeleton. It's the general-
// contractor rollup that ties construction + subs + sub-bid + the quantity engines together.
//
// GROUNDED, NEVER FABRICATED (doctrine + hard rules):
//   • MGSF self-perform pricing AND the prime markup on subs are DEFERRED to mgsf-estimator doctrine —
//     never invented here. A prime markup % is applied ONLY if the owner enters it (their number).
//   • The only dollars are the subs' OWN owner-entered quotes (summed) + any owner-entered markup.
//     No grand customer price is fabricated; the total is reported as "known + deferred" portions.
//   • A sub that isn't compliance-CLEARED is flagged NOT includable until resolved (prime carries the risk).
//   • Never auto-awards a sub; leveling picks the lowest FULL-scope bid as a suggestion, owner decides.
//
// Keyless, deterministic, no npm. Reuses construction/subs/sub-bid. POST { job, trades|scope, subBids, subRecords, quantities, markupPct, nowMs }

const construction = require("./construction");
const subBid = require("./sub-bid");
const subs = require("./subs");
const tradeEstimate = require("./trade-estimate");

function num(v, d) { const n = parseFloat(v); return Number.isFinite(n) ? n : d; }
function clean(s, max) { return String(s == null ? "" : s).trim().slice(0, max || 120); }
function round(n, p) { const f = Math.pow(10, p == null ? 2 : p); return Math.round(num(n, 0) * f) / f; }
function money(n) { return "$" + round(n, 2).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }

// Pick the suggested bid from a leveled result: lowest FULL-scope priced bid, else lowest priced.
function chooseBid(leveled) {
  if (!leveled || !leveled.ok || !Array.isArray(leveled.bids)) return null;
  const priced = leveled.bids.filter((b) => b.amount != null).slice().sort((a, b) => a.amount - b.amount);
  if (!priced.length) return null;
  return priced.find((b) => b.complete) || priced[0];
}

function assemble(body) {
  body = body || {};
  const now = Number.isFinite(body.nowMs) ? body.nowMs : safeNow();
  const job = { name: clean(body.job && body.job.name, 160) || undefined, customer: clean(body.job && body.job.customer, 160) || undefined,
    address: clean(body.job && body.job.address, 200) || undefined };
  // trades: explicit list, or derived from a blueprint-style scope[]
  let trades = Array.isArray(body.trades) ? body.trades.slice() : [];
  if (!trades.length && Array.isArray(body.scope)) trades = body.scope.map((s) => (s && (s.trade || s.item)) || s).filter(Boolean);
  if (!trades.length) return { ok: false, error: "no_trades", note: "POST trades:[...] or scope:[{trade}] (e.g. from the blueprint reader)." };

  const structure = construction.primeSubStructure({ trades });
  const quantities = (body.quantities && typeof body.quantities === "object") ? body.quantities : {};
  const subBids = (body.subBids && typeof body.subBids === "object") ? body.subBids : {};
  const subRecords = Array.isArray(body.subRecords) ? body.subRecords : [];
  const warnings = [];

  // ---- self-perform rows: list + quantities (if provided) + pricing deferred ----
  const selfPerform = structure.selfPerform.map((s) => ({
    trade: s.trade, name: s.name, division: s.division,
    engines: s.engines || construction.engineFor(s.trade),   // wiring: which calc(s) quantify this trade
    quantities: quantities[s.trade] || undefined,
    pricing: { deferred: true, how: "Priced via mgsf-estimator doctrine (locked rates, GM target, mobilization, state multiplier)." },
  }));

  // ---- sub rows: level bids, choose, attach compliance ----
  const subRows = structure.subs.map((s) => {
    const bids = subBids[s.trade];
    const row = { trade: s.trade, name: s.name, division: s.division };
    if (Array.isArray(bids) && bids.length) {
      const leveled = subBid.level(bids, { requiredScope: (body.requiredScope && body.requiredScope[s.trade]) });
      const chosen = chooseBid(leveled);
      row.leveled = leveled.summary || null;
      row.warnings = leveled.warnings;
      if (chosen) {
        row.chosen = { sub: chosen.sub, amount: chosen.amount, complete: chosen.complete, scopeGaps: chosen.scopeGaps };
        // compliance gate on the chosen sub
        const rec = subRecords.find((r) => clean(r && r.name, 120).toLowerCase() === String(chosen.sub).toLowerCase());
        if (rec) { const c = subs.complianceStatus(rec, now); row.compliance = { readiness: c.readiness, blockers: c.blockers, expiring: c.expiring }; row.includable = c.readiness !== "blocked"; if (!row.includable) warnings.push("Sub '" + chosen.sub + "' (" + s.name + ") is NOT compliance-cleared — resolve before award."); }
        else { row.compliance = null; row.includable = null; warnings.push("No compliance record for chosen sub '" + chosen.sub + "' (" + s.name + ") — verify COI/license before award."); }
        if (!chosen.complete) warnings.push("Chosen sub for " + s.name + " is missing scope: " + (chosen.scopeGaps || []).join(", ") + " — level before award.");
      } else { row.note = "Bids present but none priced — can't choose yet."; warnings.push("No priced bid for " + s.name + " yet."); }
    } else { row.note = "No sub bids collected yet."; warnings.push("Need sub bids for " + s.name + "."); }
    return row;
  });

  // ---- money: subs subtotal (owner-entered quotes) + optional owner markup; MGSF price deferred ----
  const chosenAmounts = subRows.filter((r) => r.chosen && r.chosen.amount != null).map((r) => r.chosen.amount);
  const subsSubtotal = chosenAmounts.length ? round(chosenAmounts.reduce((a, b) => a + b, 0)) : 0;
  const markupPct = num(body.markupPct, null);
  const primeMarkup = markupPct != null && markupPct >= 0
    ? { pct: round(markupPct, 2), amount: round(subsSubtotal * markupPct / 100), source: "owner-entered" }
    : { deferred: true, how: "Prime markup / OH&P on subs is set per doctrine — not invented here." };
  // ---- owner-rate trade estimates (electrical/plumbing/HVAC/carpentry, etc.) rolled into the bid ----
  const teIn = (body.tradeEstimates && typeof body.tradeEstimates === "object") ? body.tradeEstimates : {};
  const tradeEstimates = Object.keys(teIn).map((tid) => {
    const spec = teIn[tid] || {};
    const est = tradeEstimate.estimate({ trade: tid, lineItems: spec.lineItems, markupPct: spec.markupPct, taxPct: spec.taxPct });
    if (!est.ok) return { trade: tid, ok: false, error: est.error };
    return { trade: tid, total: est.total, totalLabel: est.totalLabel, subtotal: est.subtotal, unpricedLines: est.unpricedLines, doctrineNote: est.doctrineNote };
  });
  const tradeEstTotal = round(tradeEstimates.filter((t) => t.ok !== false).reduce((s, t) => s + (t.total || 0), 0));

  const knownTotal = round(subsSubtotal + (primeMarkup.amount || 0) + tradeEstTotal);
  const totals = {
    subsSubtotal, subsSubtotalLabel: money(subsSubtotal),
    primeMarkup, selfPerformPricing: "deferred to doctrine",
    tradeEstimatesTotal: tradeEstTotal, tradeEstimatesTotalLabel: money(tradeEstTotal),
    knownSubtotal: knownTotal, knownSubtotalLabel: money(knownTotal),
    grand: { deferred: true, note: "Known so far: " + money(knownTotal) + " (chosen sub quotes" + (primeMarkup.amount != null ? " + owner markup" : "") + (tradeEstTotal ? " + owner-rate trade estimates" : "") + "). STILL DEFERRED: MGSF self-perform pricing (via mgsf-estimator doctrine)" + (primeMarkup.amount == null ? " + prime markup" : "") + ". Not a final customer price." },
  };

  const compliance = {
    cleared: subRows.filter((r) => r.includable === true).map((r) => r.chosen && r.chosen.sub).filter(Boolean),
    blocked: subRows.filter((r) => r.includable === false).map((r) => r.chosen && r.chosen.sub).filter(Boolean),
    unknown: subRows.filter((r) => r.chosen && r.includable == null).map((r) => r.chosen.sub),
  };

  const proposal = { sections: [
    "Scope of work — self-perform (MGSF) + subcontracted trades, by CSI division",
    "Clarifications & exclusions — carried from the accepted sub bids (level scope gaps first)",
    "Compliance — each sub insured (MGSF additional insured), licensed, lien-waiver on file",
    "Price — MGSF self-perform per doctrine + accepted sub bids (+ prime markup)",
    "Terms — schedule, payment, 3-day right of cancellation; no Sunday scheduling",
  ] };

  return {
    ok: true, label: "PRIME BID — DRAFT (owner prices self-perform + markup via doctrine, then approves)",
    job, selfPerform, subs: subRows, tradeEstimates, totals, compliance, proposal, warnings,
    verify: ["Level every sub's scope before comparing/awarding.", "Confirm each awarded sub is compliance-cleared (COI/license) before it works.", "Price MGSF self-perform + prime markup via mgsf-estimator doctrine — nothing here is a customer price."],
    disclaimer: "DRAFT rollup. Sub amounts are the subs' own quotes (owner-entered). MGSF pricing + markup are deferred to doctrine and never fabricated. Never auto-awards a sub.",
  };
}
function safeNow() { try { return Date.now(); } catch (e) { return 0; } }

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({ ok: true, service: "prime-assembler", pure: true, priced: false,
      note: "POST { job, trades:[...] or scope:[{trade}], subBids:{trade:[{sub,amount,scopeIncluded}]}, subRecords:[{name,docs}], quantities:{trade:{...}}, markupPct?, requiredScope? }. Rolls a job into a PRIME bid: self-perform (priced by doctrine, deferred) + leveled sub bids + compliance gate + proposal skeleton. No fabricated MGSF price; never auto-awards a sub." });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  try { res.status(200).json(assemble(body || {})); }
  catch (e) { res.status(200).json({ ok: false, error: String((e && e.message) || e).slice(0, 140) }); }
};

module.exports.chooseBid = chooseBid;
module.exports.assemble = assemble;
