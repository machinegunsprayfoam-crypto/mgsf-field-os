#!/usr/bin/env node
// Estimate → CRM auto-hallway (public/index.html: upsertLeadFromEstimate + createLeadFromEstimate).
// The #1 module-to-module link (v2.0 item 10): saving an estimate creates/updates the matching lead
// and advances its pipeline stage to "Estimate Sent". Guards the invariants that keep it safe:
// idempotent (no duplicate leads), case-insensitive name match, never regresses a further-along/closed
// lead, advances New/Qualified forward, and refuses a blank/placeholder customer name.
// Run: `node tests/estimate-crm-hallway.js`. Deterministic, keyless, no network — it extracts the two
// functions straight out of index.html and exercises them in a vm sandbox with a mocked DOM/appState.

const fs = require("fs");
const vm = require("vm");
const path = require("path");

let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

console.log("Estimate → CRM auto-hallway (public/index.html)\n");

const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
// Grab a top-level `function NAME(...) { ... }` by brace-matching from its opening brace.
function grab(name) {
  const s = html.indexOf("function " + name);
  if (s < 0) return null;
  let depth = 0, i = html.indexOf("{", s);
  for (; i < html.length; i++) {
    if (html[i] === "{") depth++;
    else if (html[i] === "}") { depth--; if (depth === 0) return html.slice(s, i + 1); }
  }
  return null;
}
const up = grab("upsertLeadFromEstimate");
const mk = grab("createLeadFromEstimate");
ok("upsertLeadFromEstimate present in index.html", !!up);
ok("createLeadFromEstimate present in index.html", !!mk);
ok("saveEstimate auto-calls the hallway", /appState\.estimates\.push[\s\S]{0,400}upsertLeadFromEstimate\(/.test(html));

if (up && mk) {
  const fields = { eState: "MT", eMarket: "residential", eNotes: "attic + rim joist" };
  const ctx = {
    appState: { leads: [] }, saved: 0, module: null, notes: [],
    document: { getElementById: (id) => (fields[id] !== undefined ? { value: fields[id] } : null) },
    save: () => { ctx.saved++; }, notify: (m, l) => ctx.notes.push((l || "info") + ": " + m),
    switchModule: (m) => { ctx.module = m; }, window: {}, Date,
  };
  vm.createContext(ctx);
  vm.runInContext(up + "\n" + mk, ctx);
  const A = ctx.appState;

  // create
  let r = ctx.upsertLeadFromEstimate("Dane Oasis", 118500, {});
  ok("creates a lead when none matches", A.leads.length === 1 && r.action === "created");
  ok("new lead is staged Estimate Sent", A.leads[0].status === "Estimate Sent");
  ok("new lead carries value + lastEstimate", A.leads[0].value === 118500 && A.leads[0].lastEstimate === 118500);
  ok("new lead carries state/market/source", A.leads[0].state === "MT" && A.leads[0].market === "residential" && A.leads[0].source === "Estimator");
  ok("save() persisted", ctx.saved >= 1);

  // idempotent update (case-insensitive), no duplicate
  r = ctx.upsertLeadFromEstimate("dane oasis", 125000, {});
  ok("re-save UPDATES (case-insensitive), never duplicates", A.leads.length === 1 && r.action === "updated", "n=" + A.leads.length);
  ok("updated value", A.leads[0].value === 125000);
  ok("appends a second estimate note line", (A.leads[0].notes.match(/Estimate saved/g) || []).length === 2);

  // no regression on a closed/further-along lead
  A.leads[0].status = "Won";
  ctx.upsertLeadFromEstimate("Dane Oasis", 130000, {});
  ok("does NOT regress a Won lead's stage", A.leads[0].status === "Won");
  ok("still updates value on the Won lead", A.leads[0].value === 130000);

  A.leads.push({ id: 2, name: "Follow Up Guy", status: "Follow-Up", value: 10 });
  ctx.upsertLeadFromEstimate("Follow Up Guy", 20000, {});
  ok("does NOT regress a Follow-Up lead", A.leads.find((l) => l.name === "Follow Up Guy").status === "Follow-Up");

  // advances an early-stage lead forward
  A.leads.push({ id: 3, name: "Black Hills", status: "New", value: 0 });
  ctx.upsertLeadFromEstimate("Black Hills", 445000, {});
  ok("advances a New lead to Estimate Sent", A.leads.find((l) => l.name === "Black Hills").status === "Estimate Sent");
  A.leads.push({ id: 4, name: "Qual Lead", status: "Qualified", value: 0 });
  ctx.upsertLeadFromEstimate("Qual Lead", 30000, {});
  ok("advances a Qualified lead to Estimate Sent", A.leads.find((l) => l.name === "Qual Lead").status === "Estimate Sent");

  // guards a blank / placeholder name (never makes a junk lead)
  const before = A.leads.length;
  ok("refuses placeholder 'Customer'", ctx.upsertLeadFromEstimate("Customer", 5000, {}) === null && A.leads.length === before);
  ok("refuses empty name", ctx.upsertLeadFromEstimate("   ", 5000, {}) === null && A.leads.length === before);

  // manual CREATE LEAD reuses the upsert (idempotent + routes to CRM)
  ctx.createLeadFromEstimate("Dane Oasis", 131000);
  ok("manual CREATE LEAD reuses upsert (no dup) + switches to CRM", A.leads.length === before && ctx.module === "crm");
}

// ---- saveEstimate attaches the captured BID BREAKDOWN (pipeline rail — makes a won job measurable) ----
const se = grab("saveEstimate");
ok("saveEstimate present in index.html", !!se);
ok("estimator stashes window._lastEstimateBid at render (BF/sets/hours/material/labor/cost/sell)", /_lastEstimateBid\s*=\s*\{[\s\S]*boardFeet[\s\S]*sets[\s\S]*laborHours[\s\S]*material[\s\S]*labor[\s\S]*cost[\s\S]*sell/.test(html));
if (se && up) {
  const fields2 = { eState: "MT", eMarket: "residential", eNotes: "" };
  const ctx2 = {
    appState: { estimates: [], leads: [] }, saved: 0,
    document: { getElementById: (id) => (fields2[id] !== undefined ? { value: fields2[id] } : null) },
    save: () => { ctx2.saved++; }, notify: () => {}, playSound: () => {},
    window: { _lastEstimateBid: { boardFeet: 12000, sets: 3, laborHours: 16, material: 11784, labor: 2048, cost: 13832, sell: 30000, cell: "closed" } },
    Date,
  };
  vm.createContext(ctx2);
  vm.runInContext(up + "\n" + se, ctx2);
  ctx2.saveEstimate(30000, "TK Barn", 0.539);
  const est = ctx2.appState.estimates[0];
  ok("saved estimate carries the bid breakdown", est && est.bid && est.bid.boardFeet === 12000 && est.bid.cost === 13832 && est.bid.sell === 30000);
  ok("estimate still records value + gm (backward-compatible)", est.value === 30000 && est.gm === 0.539);
  // no stash ⇒ no bid attached, and saving still works (never blocks the save)
  const ctx3 = {
    appState: { estimates: [], leads: [] }, saved: 0,
    document: { getElementById: (id) => (fields2[id] !== undefined ? { value: fields2[id] } : null) },
    save: () => {}, notify: () => {}, playSound: () => {}, window: {}, Date,
  };
  vm.createContext(ctx3); vm.runInContext(up + "\n" + se, ctx3);
  ctx3.saveEstimate(5000, "No Bid Cust", 0.5);
  ok("no stashed bid ⇒ estimate saves fine with no bid field (never blocks)", ctx3.appState.estimates[0] && ctx3.appState.estimates[0].bid === undefined);
}

// ---- Won → JOB conversion (pipeline rail): a won lead spins up a bid-carrying job, idempotently ----
const jf = grab("_jobFromWonLead");
ok("_jobFromWonLead present in index.html", !!jf);
ok("updateLeadStatus converts on the Won transition", /l\.status===['"]Won['"][\s\S]{0,220}_jobFromWonLead\(/.test(html));
if (jf) {
  const ctx4 = {
    appState: {
      leads: [{ id: 1, name: "TK Barn", status: "Won", value: 30000 }],
      estimates: [{ id: 9, customer: "TK Barn", service: "closed-cell", state: "MT", value: 30000, bid: { boardFeet: 12000, sets: 3, laborHours: 16, material: 11784, labor: 2048, cost: 13832, sell: 30000, cell: "closed" } }],
      jobs: [],
    },
    save: () => {}, window: {}, Date,
  };
  vm.createContext(ctx4); vm.runInContext(jf, ctx4);
  const job = ctx4._jobFromWonLead(ctx4.appState.leads[0]);
  ok("Won lead ⇒ a Scheduled job is created", job && job.status === "Scheduled" && ctx4.appState.jobs.length === 1);
  ok("the job CARRIES the estimate's bid (loop closes) + links back", job.bid && job.bid.cost === 13832 && job.estimateId === 9 && job.value === 30000);
  ok("idempotent — converting the same won lead again makes no duplicate", ctx4._jobFromWonLead(ctx4.appState.leads[0]) === null && ctx4.appState.jobs.length === 1);
  // no matching estimate ⇒ no job, never fabricated
  const ctx5 = { appState: { leads: [{ id: 2, name: "No Est", status: "Won" }], estimates: [], jobs: [] }, save: () => {}, window: {}, Date };
  vm.createContext(ctx5); vm.runInContext(jf, ctx5);
  ok("no matching estimate ⇒ no job (never fabricated)", ctx5._jobFromWonLead(ctx5.appState.leads[0]) === null && ctx5.appState.jobs.length === 0);
}

console.log("\n" + (fail ? "✗ " : "✓ ") + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
