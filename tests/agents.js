#!/usr/bin/env node
// Klyfton agents runtime — roster/planning + the CLOSED LOOP (plan → arms → observe/skip). Run:
// `node tests/agents.js`. Pure/deterministic on nowMs, keyless, no network (arms executor is
// injected as a mock). The critical property: NOTHING dispatches unless approved===true.

const path = require("path");
const A = require(path.join(__dirname, "..", "api", "agents.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

const DAY = 86400000;
const NOW = 1750000000000;
const WEBHOOK = { ALERTS_WEBHOOK_URL: "https://hook/x" }; // makes outward tools "live"

const JOBS = [
  { customer: "Sam", status: "quote sent", stageAt: NOW - 10 * DAY, email: "sam@x.com" }, // bid, overdue
  { customer: "Deb", status: "new lead", phone: "406-555-0100" },                          // lead
  { customer: "Ray", status: "invoiced", stageAt: NOW - 50 * DAY, email: "ray@x.com" },     // invoiced, overdue
  { customer: "Kay", status: "invoiced", stageAt: NOW - 5 * DAY },                          // invoiced, NOT overdue
  { customer: "Lou", status: "paid" },                                                       // terminal
  { customer: "Moe", status: "in progress" },                                                // open
];

// mock arms executor: echoes approval as dispatched/needs_approval (no network)
const mockExec = (action, opts) => Promise.resolve({ ok: true, status: opts && opts.approved ? "dispatched" : "needs_approval", type: action.type });

async function main() {
  console.log("Klyfton agents — roster + closed loop + guards\n");

  // ---- roster + planning (unchanged core) ----
  ok("PM is agent #1", !!A.AGENTS.pm && /project manager|job runner/i.test(A.AGENTS.pm.label));
  ok("roster has collector, bid-chaser, lead-closer", ["collector", "bid-chaser", "lead-closer"].every((k) => A.AGENTS[k]));
  ok("unknown agent ⇒ error + roster", (() => { const p = A.plan("nope", JOBS, NOW, {}); return p.ok === false && Array.isArray(p.agents); })());
  ok("PM plans open jobs only (skips paid)", (() => { const p = A.plan("pm", JOBS, NOW, {}); return p.count === 5 && !p.steps.find((s) => s.who === "Lou"); })());
  ok("Collector selects only the overdue invoice (Ray, not Kay)", (() => { const p = A.plan("collector", JOBS, NOW, {}); return p.count === 1 && p.steps[0].who === "Ray"; })());

  // ---- buildAction: step → concrete arm skeleton (pure), body left empty (brain fills) ----
  ok("lead ⇒ send_sms to the phone", (() => { const a = A.buildAction({ stage: "lead" }, { phone: "406", customer: "D" }); return a.type === "send_sms" && a.to === "406"; })());
  ok("invoiced ⇒ send_email to the email", (() => { const a = A.buildAction({ stage: "invoiced" }, { email: "r@x", customer: "R" }); return a.type === "send_email" && a.to === "r@x"; })());
  ok("done ⇒ create_invoice with customer+amount", (() => { const a = A.buildAction({ stage: "done" }, { customer: "R", value: 5000, service: "foam" }); return a.type === "create_invoice" && a.customer === "R" && a.amount === 5000; })());
  ok("buildAction leaves message body EMPTY (no fabricated copy)", A.buildAction({ stage: "bid" }, { email: "s@x" }).body === "");
  ok("paid/in-app stage ⇒ null (not an arm)", A.buildAction({ stage: "paid" }, {}) === null);

  // ---- shouldSkip: observe → don't repeat within cooldown (pure) ----
  const hist = [{ who: "Ray", stage: "invoiced", at: NOW - 1 * DAY }];
  ok("recent same who+stage ⇒ skip", A.shouldSkip({ who: "Ray", stage: "invoiced" }, hist, NOW, 3) === true);
  ok("beyond cooldown ⇒ don't skip", A.shouldSkip({ who: "Ray", stage: "invoiced" }, [{ who: "Ray", stage: "invoiced", at: NOW - 10 * DAY }], NOW, 3) === false);
  ok("different stage ⇒ don't skip", A.shouldSkip({ who: "Ray", stage: "bid" }, hist, NOW, 3) === false);

  // ---- CLOSED LOOP via injected mock executor ----
  const preview = await A.run("collector", JOBS, NOW, WEBHOOK, { exec: mockExec, approved: false });
  ok("preview: outward step ran through arms as a gated draft", preview.results.some((r) => r.outcome === "needs_approval"));
  ok("preview: nothing dispatched", preview.dispatched === 0);
  ok("preview: note says nothing sent", /nothing sent/i.test(preview.note));

  const approved = await A.run("collector", JOBS, NOW, WEBHOOK, { exec: mockExec, approved: true });
  ok("approved: the live Ray invoice step dispatches", approved.dispatched === 1, JSON.stringify(approved.results.map((r) => r.outcome)));

  // ---- observe: a recently-run step is skipped, not re-dispatched ----
  const withHist = await A.run("collector", JOBS, NOW, WEBHOOK, { exec: mockExec, approved: true, history: hist, cooldownDays: 3 });
  ok("recently-done step is skipped (not re-sent)", withHist.dispatched === 0 && withHist.skipped === 1);

  // ---- dark tool: step blocked, never reaches the executor ----
  let execCalls = 0;
  const countExec = (a, o) => { execCalls++; return Promise.resolve({ ok: true, status: "dispatched" }); };
  const darkRun = await A.run("collector", JOBS, NOW, {}, { exec: countExec, approved: true }); // no webhook ⇒ invoice-remind dark
  ok("dark-tool step is blocked and never hits the executor", darkRun.blocked === 1 && execCalls === 0, "execCalls=" + execCalls);

  // ---- SAFETY with the REAL arms (no injected exec, no webhook): approved but nothing sends ----
  const realApproved = await A.run("collector", JOBS, NOW, WEBHOOK, { approved: true });
  ok("real arms, approved, no dispatch channel wired ⇒ 0 dispatched (never silently sends)", realApproved.dispatched === 0, JSON.stringify(realApproved.results.map((r) => r.outcome)));

  // ---- history/logRun are gated + graceful with no Supabase ----
  ok("history unconfigured ⇒ configured:false, empty", (await A.history("pm")).configured === false);
  ok("logRun unconfigured ⇒ configured:false (no throw)", (await A.logRun("pm", [{ step: { who: "R", stage: "bid" }, outcome: "needs_approval" }], NOW)).configured === false);

  console.log("\n" + (fail ? "✗" : "✓") + " " + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
}
main();
