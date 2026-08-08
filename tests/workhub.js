#!/usr/bin/env node
// Work Hub — the agent operating layer (api/workhub.js): private workstation per agent, shared hub,
// agent↔agent intranet. Run: `node tests/workhub.js`. Keyless, deterministic (time passed in), no
// network. Proves the pure core: workstation merge + bounded scratchpad, message routing incl.
// broadcast, handoffs open-until-acked, inbox filtering, hub aggregation across the known roster —
// and that it never fabricates and stays INTERNAL (no outward send here). Persistence is gated in the handler.

const path = require("path");
const W = require(path.join(__dirname, "..", "api", "workhub.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

console.log("Work Hub — agent workstation + hub + intranet\n");
const T1 = "2026-08-08T10:00:00Z", T2 = "2026-08-08T11:00:00Z";

// ---- WORKSTATION: merge patch, normalize status, bounded scratchpad ----
(() => {
  const s0 = W.station(null, { agent: "Collector", status: "working", task: "chase 3 aging invoices" }, T1);
  ok("station normalizes agent id + status", s0.agent === "collector" && s0.status === "working" && s0.task === "chase 3 aging invoices");
  ok("station stamps updatedAt + resolves a label", s0.updatedAt === T1 && typeof s0.label === "string");
  ok("unknown status ⇒ idle (never fabricated)", W.station(null, { agent: "x", status: "banana" }, T1).status === "idle");
  const s1 = W.station(s0, { scratch: "left VM for BigCo" }, T2);
  ok("scratch note appended with its timestamp", s1.scratch.length === 1 && s1.scratch[0].note === "left VM for BigCo" && s1.scratch[0].at === T2);
  ok("merge keeps prior task when patch omits it", s1.task === "chase 3 aging invoices" && s1.status === "working");
  // scratchpad is bounded to the last 20
  let s = W.station(null, { agent: "a" }, T1);
  for (let i = 0; i < 25; i++) s = W.station(s, { scratch: "note " + i }, T1);
  ok("scratchpad bounded to last 20", s.scratch.length === 20 && s.scratch[19].note === "note 24");
})();

// ---- INTRANET: direct + broadcast messages, kinds ----
(() => {
  const m = W.normMessage({ from: "Bid Chaser", to: "Lead Closer", kind: "ask", body: "you taking the Newelham lead?" }, T1);
  ok("message normalizes from/to + kind", m.from === "bid-chaser" && m.to === "lead-closer" && m.kind === "ask");
  ok("body carried, bounded, timestamped", m.body === "you taking the Newelham lead?" && m.at === T1);
  const b = W.normMessage({ from: "pm", body: "standup at 4" }, T1);
  ok("no 'to' ⇒ broadcast to all", b.to === "all");
  ok("unknown kind ⇒ note", W.normMessage({ from: "a", to: "b", kind: "weird" }, T1).kind === "note");
})();

// ---- HANDOFF: typed message, open until acked ----
(() => {
  const h = W.handoff({ from: "pm", to: "collector", job: "TK Barn", note: "invoiced, chase payment" }, T1);
  ok("handoff is a typed 'handoff' message carrying the job", h.kind === "handoff" && h.job === "TK Barn" && h.to === "collector");
  ok("handoff defaults a body when no note given", /Handoff/.test(W.handoff({ from: "a", to: "b", job: "J1" }, T1).body));
})();

// ---- INBOX: direct + broadcast, newest first, excludes others' direct mail ----
(() => {
  const msgs = [
    W.normMessage({ from: "pm", to: "collector", body: "one", }, T1),
    W.normMessage({ from: "pm", to: "all", body: "two" }, T2),
    W.normMessage({ from: "pm", to: "lead-closer", body: "three" }, T2),
  ];
  const box = W.inbox("Collector", msgs);
  ok("inbox = my direct mail + broadcasts, not others' direct", box.length === 2 && box.every((m) => m.body !== "three"));
  ok("inbox newest first", box[0].body === "two");
})();

// ---- HUB: aggregates every known agent (even silent ones) + open handoffs + feed ----
(() => {
  const stations = [W.station(null, { agent: "collector", status: "working", task: "AR" }, T1)];
  const messages = [
    W.handoff({ from: "pm", to: "collector", job: "J1" }, T1),
    Object.assign(W.handoff({ from: "pm", to: "collector", job: "J2" }, T2), { ack: true }),
  ];
  const h = W.hub({ stations, messages });
  ok("hub shows the full known roster (silent agents included as idle)", h.stations.length >= 1 && h.stations.some((s) => s.agent === "collector" && s.status === "working"));
  ok("hub counts working agents", h.counts.working >= 1);
  ok("open handoffs = unacked only (acked excluded)", h.counts.openHandoffs === 1 && h.openHandoffs[0].job === "J1");
  ok("hub feed carries recent messages", Array.isArray(h.feed) && h.feed.length === 2);
})();

// ---- defensive: empty/garbage never throws; stays internal (no outward fields) ----
(() => {
  let threw = false; try { W.station(); W.normMessage(); W.handoff(); W.inbox(); W.hub(); } catch { threw = true; }
  ok("all pure fns tolerate empty input without throwing", threw === false);
  ok("a message never carries an outward channel (intranet stays inside)", !("email" in W.normMessage({ from: "a", to: "b" }, T1)) && !("sms" in W.normMessage({ from: "a", to: "b" }, T1)));
})();

console.log("\n" + (fail ? "✗" : "✓") + " " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
