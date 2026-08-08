#!/usr/bin/env node
// Pipeline rail — the lead→estimate→job→actuals spine (api/pipeline.js). Run: `node tests/pipeline.js`.
// Keyless, deterministic, no network. Proves the rail CARRIES the bid from estimate to job so the
// actual-side engines can measure quoted-vs-actual margin (the funnel-middle fix), never regresses a
// lead, never fabricates a figure the caller didn't supply, and reports where a customer sits + the next
// action. Includes the round-trip proof: a converted job's bid feeds yield-variance.variance({bid,actual}).

const path = require("path");
const P = require(path.join(__dirname, "..", "api", "pipeline.js"));
const YV = require(path.join(__dirname, "..", "api", "yield-variance.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

console.log("Pipeline rail — lead→estimate→job→actuals\n");

// ---- bidFrom: accepts estimator key variants, derives cost only from real inputs, nulls otherwise ----
(() => {
  const b = P.bidFrom({ bf: 12000, sets: 3, hours: 16, material: 11784, labor: 2048, price: 30000 });
  ok("bidFrom maps bf/hours/price aliases", b.boardFeet === 12000 && b.laborHours === 16 && b.sell === 30000);
  ok("bidFrom derives cost = material + labor when cost absent", b.cost === 13832, b.cost);
  const empty = P.bidFrom({});
  ok("bidFrom never fabricates — all null on empty", empty.boardFeet === null && empty.cost === null && empty.sell === null);
  ok("bidFrom does NOT derive cost from only one side", P.bidFrom({ material: 100 }).cost === null);
})();

// ---- estimateRecord: carries the bid + lead key, stamps stage, no fabrication ----
(() => {
  const e = P.estimateRecord({ customer: "TK Barn", service: "closed-cell", cell: "closed", state: "MT",
    boardFeet: 12000, sets: 3, laborHours: 16, material: 11784, labor: 2048, sell: 30000, gm: 0.539 }, { id: 111, date: "2026-08-07" });
  ok("estimate carries the bid breakdown", e.bid.boardFeet === 12000 && e.bid.cost === 13832 && e.bid.sell === 30000);
  ok("estimate derives a leadKey from the customer", e.leadKey === "tk barn");
  ok("estimate total defaults to the sell price", e.total === 30000);
  ok("estimate stamps stage 'Estimate Sent' + keeps the cell for later yield compare", e.stage === "Estimate Sent" && e.cell === "closed");
  ok("estimate rounds gm to 3 places", e.gm === 0.539);
  const bare = P.estimateRecord({ name: "No Bid Lead" }, { id: 2, date: "2026-08-07" });
  ok("no-bid estimate ⇒ null bid fields (never invented)", bare.bid.cost === null && bare.total === null && bare.leadKey === "no bid lead");
})();

// ---- advanceLead: advances forward, never regresses, allows Won/Lost, idempotent ----
(() => {
  ok("New → Estimate Sent advances", P.advanceLead({ status: "New" }, "Estimate Sent").lead.status === "Estimate Sent");
  const held = P.advanceLead({ status: "Follow-Up" }, "Estimate Sent");
  ok("Follow-Up is NOT pulled back to Estimate Sent (no regression)", held.lead.status === "Follow-Up" && held.action === "held");
  ok("Follow-Up → Won is allowed (forward)", P.advanceLead({ status: "Follow-Up" }, "Won").lead.status === "Won");
  ok("any stage → Lost is allowed", P.advanceLead({ status: "Estimate Sent" }, "Lost").lead.status === "Lost");
  ok("blank status takes the target", P.advanceLead({}, "Qualified").lead.status === "Qualified");
})();

// ---- jobFromEstimate: carries the bid forward + links back to the estimate ----
(() => {
  const est = P.estimateRecord({ customer: "TK Barn", service: "closed-cell", cell: "closed",
    boardFeet: 12000, sets: 3, laborHours: 16, material: 11784, labor: 2048, sell: 30000 }, { id: 111, date: "2026-08-07" });
  const job = P.jobFromEstimate(est, { id: 222, date: "2026-08-10", jobNum: "MGSF-2026-007" });
  ok("job links back to the estimate id", job.estimateId === 111);
  ok("job carries a name (never renders as 'undefined')", job.name === "closed-cell — TK Barn");
  ok("job takes the caller-assigned jobNum", job.jobNum === "MGSF-2026-007");
  ok("job status starts Scheduled", job.status === "Scheduled");
  ok("job value = the bid sell price", job.value === 30000);
  ok("job CARRIES the bid (the whole point — makes margin measurable)", job.bid.boardFeet === 12000 && job.bid.cost === 13832 && job.bid.sell === 30000);
  ok("job keeps the leadKey + cell for the yield compare", job.leadKey === "tk barn" && job.cell === "closed");
})();

// ---- ROUND-TRIP PROOF: the carried bid actually feeds yield-variance (the loop closes) ----
(() => {
  const est = P.estimateRecord({ customer: "TK Barn", cell: "closed", boardFeet: 12000, sets: 3, laborHours: 16, material: 11784, labor: 2048, sell: 30000 }, { id: 1, date: "2026-08-07" });
  const job = P.jobFromEstimate(est, { id: 2, date: "2026-08-10" });
  // crew logs actuals; feed the job's carried bid straight into the variance engine
  const v = YV.variance({ cell: job.cell, bid: job.bid, actual: { boardFeet: 13200, sets: 4, laborHours: 20, material: 13096, labor: 2560 } });
  ok("carried bid drives a real variance (foam overrun detected)", v.variances.boardFeet.delta === 1200 && v.variances.boardFeet.pct === 10);
  ok("carried bid drives the margin compare at the same sell", v.margin.bidPct === 53.9 && v.margin.actualPct === 47.8);
  ok("quoted-vs-actual is now MEASURABLE end to end", v.margin.deltaPts === -6.1);
})();

// ---- railFor: where a customer sits + the ONE next action ----
(() => {
  const data = {
    leads: [{ name: "Lead Only", status: "New" }, { name: "Has Est", status: "Estimate Sent" }, { name: "Working", status: "Won" }],
    estimates: [{ customer: "Has Est", bid: { cost: 5000 } }, { customer: "Working", id: 9, bid: { cost: 8000 } }],
    jobs: [{ customer: "Working", estimateId: 9, bid: { cost: 8000 }, status: "Scheduled" }],
    jobcosts: [],
  };
  ok("no record ⇒ stage none, capture-lead next", P.railFor("Nobody", data).stage === "none");
  ok("lead, no estimate ⇒ stage lead, build-estimate next", (() => { const r = P.railFor("Lead Only", data); return r.stage === "lead" && /Build \+ send/.test(r.nextAction); })());
  ok("estimate, no job ⇒ stage estimate, convert-to-job next", (() => { const r = P.railFor("Has Est", data); return r.stage === "estimate" && /convert the estimate to a job/.test(r.nextAction); })());
  ok("job, no actuals ⇒ stage job, log-actuals next", (() => { const r = P.railFor("Working", data); return r.stage === "job" && /Log job actuals/.test(r.nextAction); })());
  const dead = P.railFor("X", { leads: [{ name: "X", status: "Lost" }] });
  ok("lost lead ⇒ stage closed, no action", dead.stage === "closed");
})();

// ---- funnelHealth: quantifies "the funnel has no middle" on real numbers ----
(() => {
  const noMiddle = P.funnelHealth({ leads: [{ name: "A" }, { name: "B" }], estimates: [{ customer: "A", bid: { cost: 1 } }], jobs: [] });
  ok("estimates exist but 0 jobs ⇒ funnel-middle gap flagged", /funnel-middle/.test(noMiddle.gap || ""), noMiddle.gap);
  const noBid = P.funnelHealth({ leads: [{ name: "A" }], estimates: [{ customer: "A", id: 1 }], jobs: [{ customer: "A", estimateId: 1, status: "Scheduled" }] });
  ok("converted jobs exist but none carry a bid ⇒ not-measurable gap flagged", /not measurable/.test(noBid.gap || ""), noBid.gap);
  const healthy = P.funnelHealth({ leads: [{ name: "A" }], estimates: [{ customer: "A", id: 1, bid: { cost: 1 } }], jobs: [{ customer: "A", estimateId: 1, bid: { cost: 1 } }], jobcosts: [{ customer: "A" }] });
  ok("estimate→job(with bid)→cost ⇒ no gap, counts add up", healthy.gap === null && healthy.jobsFromEstimate === 1 && healthy.jobsCarryingBid === 1 && healthy.measurableJobs === 1);
})();

// ---- defensive: empty/garbage never throws ----
(() => {
  let threw = false; try { P.estimateRecord(); P.jobFromEstimate(); P.railFor(); P.funnelHealth(); P.bidFrom(); P.advanceLead(); } catch { threw = true; }
  ok("all pure fns tolerate empty/undefined input without throwing", threw === false);
})();

console.log("\n" + (fail ? "✗" : "✓") + " " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
