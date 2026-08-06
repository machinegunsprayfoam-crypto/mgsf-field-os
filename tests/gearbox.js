#!/usr/bin/env node
// Gearbox — internal drivetrain of api/gearbox.js. Run: `node tests/gearbox.js`. Deterministic-
// enough (Supabase is unconfigured in the test env ⇒ persistence is a no-op; act.js/memory are
// gated/inert ⇒ owner gears come back as drafts, never sent). Covers the event shape (_evt), the
// AI-gear cascade (estimate.closed → lead.won → invoice.created), the OWNER-gear approval gate
// (un-approved ⇒ blocked + reverse mile, no cascade; approved ⇒ forward mile), the roof/spf branch,
// and the depth/cycle guard. This asserts the DRIVETRAIN + ODOMETER logic, not any outward send.

const path = require("path");
const A = require(path.join(__dirname, "..", "api", "gearbox.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }
const names = (trace) => trace.map((n) => n.event);

(async () => {
  console.log("Gearbox (internal drivetrain)\n");

  // ---- _evt: clean, bounded event shape ----
  const e = A._evt("test.event", "job-1", { a: 1 }, "unit");
  ok("_evt builds {name,key,payload,source,at}", e.name === "test.event" && e.key === "job-1" && e.payload.a === 1 && e.source === "unit" && typeof e.at === "string");
  ok("_evt non-object payload ⇒ {}", A._evt("n", "k", "notobj").payload && typeof A._evt("n", "k", 5).payload === "object");

  // ---- AI cascade: estimate.closed → lead.won → invoice.created ----
  const closed = await A.turn("estimate.closed", "job-1", { customer: "Jane", amount: 5000 }, "unit", false);
  ok("turn ok + reports the turned event", closed.ok === true && closed.turned === "estimate.closed");
  ok("AI gears cascade to lead.won + invoice.created", names(closed.trace).includes("lead.won") && names(closed.trace).includes("invoice.created"));

  // ---- OWNER gate: invoice.created un-approved ⇒ blocked, reverse mile, no send ----
  ok("un-approved owner gear ⇒ blocked", closed.blocked === true);
  ok("blocked owner gear racks a REVERSE mile", closed.miles.reverse >= 1 && closed.miles.net < 0);
  const invNode = closed.trace.find((n) => n.event === "invoice.created");
  // The outward invoice never sends: it blocks awaiting approval, and the arm is inert (draft
  // status "incomplete"/"needs_approval" without the webhook env — never "sent").
  ok("invoice blocks for approval and is NOT sent", invNode && invNode.results.some((r) => r.blocked && /approval to send/i.test(String(r.note)) && String(r.draft) !== "sent"));

  // ---- OWNER gate: approved ⇒ forward mile, not blocked ----
  const inv = await A.turn("invoice.created", "job-2", { customer: "Bob", total: 3000 }, "unit", true);
  ok("approved owner gear ⇒ FORWARD mile", inv.miles.forward >= 1 && inv.miles.net > 0);
  ok("approved owner gear ⇒ drive tagged 'owner'", inv.drive === "owner");

  // ---- job.completed branch: review + roof-maint only for roof/spf service ----
  const roof = await A.turn("job.completed", "job-3", { service: "SPF roof", phone: "406-555-0000" }, "unit", false);
  ok("roof/spf job enrolls roof-maintenance", names(roof.trace).includes("roofmaint.enroll"));
  const wall = await A.turn("job.completed", "job-4", { service: "wall foam" }, "unit", false);
  ok("non-roof job does NOT enroll roof-maintenance", !names(wall.trace).includes("roofmaint.enroll") && names(wall.trace).includes("review.requested"));

  // ---- estimate.ready: the technical→action hallway (gated proposal draft) ----
  const erBlocked = await A.turn("estimate.ready", "job-5", { customer: "Dave", email: "dave@x.com", service: "SPF roof", total: 9000 }, "unit", false);
  ok("estimate.ready un-approved ⇒ blocked (proposal drafted, not sent)", erBlocked.ok === true && erBlocked.blocked === true);
  ok("estimate.ready blocked ⇒ reverse mile (machine asked for approval)", erBlocked.miles.reverse >= 1 && erBlocked.miles.net < 0);
  ok("estimate.ready is a leaf owner gear — no cascade when blocked", names(erBlocked.trace).length === 1 && names(erBlocked.trace)[0] === "estimate.ready");
  const erOk = await A.turn("estimate.ready", "job-5", { customer: "Dave", email: "dave@x.com", service: "SPF roof", total: 9000 }, "unit", true);
  ok("estimate.ready approved ⇒ not blocked + forward mile", erOk.blocked === false && erOk.miles.forward >= 1);

  // ---- proposalEmail: pure proposal builder + Hearth financing CTA (only when a price exists) ----
  const propPriced = A.proposalEmail({ email: "dave@x.com", service: "SPF roof", total: 9000 });
  ok("proposalEmail sets to + branded subject", propPriced.to === "dave@x.com" && /Machine Gun/.test(propPriced.subject));
  ok("proposalEmail includes the service and price", propPriced.body.includes("SPF roof") && propPriced.body.includes("$9000"));
  ok("proposalEmail with a price shows the Hearth financing CTA", propPriced.body.includes(A.FINANCING_URL) && /financing partner Hearth/i.test(propPriced.body));
  const propNoPrice = A.proposalEmail({ email: "dave@x.com", service: "SPF roof" });
  ok("proposalEmail WITHOUT a price omits financing (nothing to spread out)", !propNoPrice.body.includes(A.FINANCING_URL));
  ok("proposalEmail never guarantees savings / quotes a rate", !/save \$|\d+% off|guarantee/i.test(propPriced.body));
  ok("FINANCING_URL is a Hearth link", /gethearth\.com/.test(A.FINANCING_URL));

  // ---- unknown event: turns, no consumer, no crash ----
  const unknown = await A.turn("nope.nothere", "k", {}, "unit", false);
  ok("unknown event ⇒ ok, empty/handled-0, not blocked", unknown.ok === true && unknown.blocked === false);

  // ---- empty name rejected ----
  ok("empty event name ⇒ error", (await A.turn("", "k", {}, "unit")).ok === false);

  // ---- persistence off in the test env (no Supabase) ----
  ok("configured=false without Supabase (persist no-op)", closed.configured === false && closed.persisted === false);

  console.log("\n" + (fail ? "✗ " : "✓ ") + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
