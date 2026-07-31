#!/usr/bin/env node
// Klyfton projects — job-lifecycle stage engine. Run: `node tests/projects.js`.
// Pure + deterministic (nowMs passed in, never Date.now()), keyless, no network. Covers stage
// order, status→stage normalization, next-action routing, overdue detection, forward-only advance
// (no mutation), and the PM board summary.

const path = require("path");
const P = require(path.join(__dirname, "..", "api", "projects.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

const DAY = 86400000;
const NOW = 1750000000000; // fixed reference instant for deterministic overdue math

console.log("Klyfton projects — lifecycle stage engine\n");

// ---- exports ----
ok("exports the engine", ["STAGES", "nextStage", "normalizeStage", "nextAction", "isOverdue", "advance", "summarize"].every((f) => P[f] !== undefined));

// ---- stage order ----
ok("stages in lifecycle order", P.STAGES.join(">") === "lead>bid>scheduled>in_progress>done>invoiced>paid");
ok("nextStage advances", P.nextStage("bid") === "scheduled");
ok("nextStage at paid ⇒ null (terminal)", P.nextStage("paid") === null);
ok("paid/lost/cancelled are terminal", P.isTerminal("paid") && P.isTerminal("lost") && P.isTerminal("cancelled") && !P.isTerminal("bid"));

// ---- status normalization (known keywords map; unknown kept) ----
ok("'Quote Sent' ⇒ bid", P.normalizeStage("Quote Sent") === "bid");
ok("'In Progress' ⇒ in_progress", P.normalizeStage("In Progress") === "in_progress");
ok("'Closed Won / Paid' ⇒ paid", P.normalizeStage("Closed Won - Paid") === "paid");
ok("'New Lead' ⇒ lead", P.normalizeStage("New Lead") === "lead");
ok("unknown status kept as-is (no fabricated stage)", P.normalizeStage("frobnicated") === "frobnicated");
ok("empty status ⇒ lead default", P.normalizeStage("") === "lead");

// ---- next-action routing ----
ok("done ⇒ invoice it", /invoice/i.test(P.nextAction({ status: "done" }).action));
ok("bid ⇒ send/track the bid", /bid/i.test(P.nextAction({ status: "quote sent" }).action));
ok("paid ⇒ ask for a review", /review/i.test(P.nextAction({ status: "paid" }).action));

// ---- overdue detection (deterministic on NOW) ----
ok("bid unanswered 10d ⇒ overdue", P.isOverdue({ status: "bid", stageAt: NOW - 10 * DAY }, NOW).overdue === true);
ok("bid at 3d ⇒ not overdue", P.isOverdue({ status: "bid", stageAt: NOW - 3 * DAY }, NOW).overdue === false);
ok("invoice aging 45d ⇒ overdue (net-30 default)", P.isOverdue({ status: "invoiced", stageAt: NOW - 45 * DAY }, NOW).overdue === true);
ok("invoice at 20d ⇒ not overdue", P.isOverdue({ status: "invoiced", stageAt: NOW - 20 * DAY }, NOW).overdue === false);
ok("scheduled with a past date ⇒ overdue", P.isOverdue({ status: "scheduled", date: "2020-01-01" }, NOW).overdue === true);
ok("custom cadence tightens the bid window", P.isOverdue({ status: "bid", stageAt: NOW - 4 * DAY }, NOW, { bidStaleDays: 3 }).overdue === true);
ok("no timestamp ⇒ not overdue, no throw", P.isOverdue({ status: "bid" }, NOW).overdue === false);

// ---- advance: forward-only, no mutation ----
const job = { customer: "Sam", stage: "bid" };
const adv = P.advance(job, "scheduled", NOW);
ok("advance bid→scheduled ok", adv.ok && adv.job.stage === "scheduled");
ok("advance does NOT mutate the input", job.stage === "bid");
ok("advance stamps stageAt", adv.job.stageAt === NOW);
ok("backward move rejected", P.advance({ stage: "scheduled" }, "bid", NOW).ok === false);
ok("early-close to lost allowed", P.advance({ stage: "bid" }, "lost", NOW).ok === true);
ok("unknown target stage rejected", P.advance({ stage: "bid" }, "banana", NOW).ok === false);

// ---- the PM board ----
const jobs = [
  { customer: "Sam", status: "quote sent", stageAt: NOW - 9 * DAY },   // bid, overdue
  { customer: "Deb", status: "scheduled", date: "2099-01-01" },         // scheduled, future (ok)
  { customer: "Ray", status: "invoiced", stageAt: NOW - 50 * DAY },     // invoiced, overdue
  { customer: "Kay", status: "paid" },                                   // terminal
  { customer: "Lou", status: "lost" },                                   // terminal
];
const b = P.summarize(jobs, NOW);
ok("board totals", b.total === 5 && b.open === 3);
ok("board counts by stage", b.byStage.bid === 1 && b.byStage.paid === 1 && b.byStage.lost === 1);
ok("board surfaces the 2 overdue, worst first", b.overdue.length === 2 && b.overdue[0].who === "Ray");
ok("board lists next-actions for open jobs only", b.nextActions.length === 3 && b.nextActions.every((a) => a.action));
ok("summarize on [] ⇒ empty board, no throw", (() => { const e = P.summarize([], NOW); return e.total === 0 && e.open === 0 && e.overdue.length === 0; })());

console.log("\n" + (fail ? "✗" : "✓") + " " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
