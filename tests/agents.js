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

  // ---- Agent #5: Sub-Compliance Chaser (operates on the subs roster) ----
  ok("roster includes sub-compliance", !!A.AGENTS["sub-compliance"] && A.AGENTS["sub-compliance"].source === "subs");
  const CNOW = Date.parse("2026-08-01T00:00:00Z");
  const fullDocs = [{ type: "subcontract", onFile: true }, { type: "w9", onFile: true }, { type: "coi", onFile: true, expires: "2027-06-01" }, { type: "license", onFile: true, expires: "2027-06-01" }, { type: "lien-waivers", onFile: true }, { type: "safety", onFile: true }];
  const roster = [
    { name: "Ready Co", trade: "electrical", email: "ready@x.com", docs: fullDocs },                                  // ready → no chase
    { name: "Expiring Co", trade: "plumbing", email: "exp@x.com", docs: fullDocs.map((d) => d.type === "coi" ? { ...d, expires: "2026-08-15" } : d) }, // expiring → chase
    { name: "Blocked Co", trade: "hvac", phone: "4065551212", docs: fullDocs.filter((d) => d.type !== "coi") },        // missing COI → chase
    { name: "NoContact Co", trade: "framing", docs: fullDocs.filter((d) => d.type !== "license") },                     // blocked + no contact
  ];
  const sp = A.planSubCompliance(roster, CNOW, WEBHOOK);
  ok("chaser skips ready subs, plans only expiring/blocked", sp.count === 3 && !sp.steps.some((s) => s.who === "Ready Co"));
  ok("every chase step is approval-gated + routed to arms", sp.steps.every((s) => s.approval === true && s.tool === "arms"));
  ok("expiring sub's issue names the doc + days", sp.steps.find((s) => s.who === "Expiring Co").issue.match(/coi/i) && /expiring/i.test(sp.steps.find((s) => s.who === "Expiring Co").issue));
  ok("blocked sub's issue flags missing/expired", /missing\/expired/i.test(sp.steps.find((s) => s.who === "Blocked Co").issue));
  ok("buildSubAction uses email when present, empty body (owner drafts)", (() => { const a = A.buildSubAction({ who: "Expiring Co" }, roster[1]); return a.type === "send_email" && a.to === "exp@x.com" && a.body === ""; })());
  ok("buildSubAction falls back to SMS when only phone", A.buildSubAction({ who: "Blocked Co" }, roster[2]).type === "send_sms");
  ok("no contact on file ⇒ null action (manual)", A.buildSubAction({ who: "NoContact Co" }, roster[3]) === null);
  // closed loop: NOTHING sends unless approved
  const scSeen = [];
  const scExec = async (action, o) => { scSeen.push({ action, approved: o.approved }); return { status: o.approved ? "dispatched" : "needs_approval" }; };
  const scPreview = await A.runSubCompliance(roster, CNOW, WEBHOOK, { exec: scExec });
  ok("chaser preview dispatches nothing (all gated drafts)", scPreview.dispatched === 0 && scPreview.drafts >= 1 && scSeen.every((s) => s.approved === false));
  ok("no-contact sub handled in-app, not sent", scPreview.results.some((r) => r.outcome === "in_app"));
  const scApproved = await A.runSubCompliance(roster, CNOW, WEBHOOK, { exec: scExec, approved: true });
  ok("approved run dispatches the contactable chases", scApproved.dispatched >= 1);

  // ---- stationFrom: derive Work Hub workstation state from a plan (pure) ----
  ok("busy plan ⇒ working + a ready/total task line", (() => { const s = A.stationFrom("collector", { count: 3, ready: 2, goal: "chase AR" }, "2026-08-08T10:00:00Z"); return s.agent === "collector" && s.status === "working" && /2 ready \/ 3 steps/.test(s.task) && /1 blocked/.test(s.task); })());
  ok("all-blocked plan ⇒ blocked status", A.stationFrom("pm", { count: 2, ready: 0 }, "T").status === "blocked");
  ok("empty plan ⇒ idle + goal shown", (() => { const s = A.stationFrom("pm", { count: 0, ready: 0, goal: "drive jobs" }, "T"); return s.status === "idle" && /Idle/.test(s.task); })());
  ok("a real plan() feeds stationFrom cleanly (non-idle when it has steps)", (() => { const p = A.plan("collector", JOBS, NOW, {}); const s = A.stationFrom(p.agent, p, "T"); return s.status !== "idle" && s.agent === "collector"; })());

  console.log("\n" + (fail ? "✗" : "✓") + " " + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
}
main();
