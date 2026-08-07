#!/usr/bin/env node
// Klyfton ARMS (outward executor) — classification + the safety gate + the universal Zapier bus.
// Run: `node tests/act.js`. Deterministic, keyless, NO network: with no ALERTS_WEBHOOK_URL set
// (the sandbox), dispatch short-circuits to "no_dispatch_channel" before any fetch, so we can
// assert the gate/blocked behavior offline. The critical property under test: nothing outward
// EVER dispatches without approved===true.

const path = require("path");
const A = require(path.join(__dirname, "..", "api", "act.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

async function main() {
  console.log("Klyfton arms — classify + safety gate + universal bus\n");

  // ---- the arms exist, incl. the new universal bus ----
  ok("exports classify/execute/ARMS", typeof A.classify === "function" && typeof A.execute === "function" && A.ARMS);
  ok("original arms present", ["send_email", "send_sms", "book_appointment", "crm_update", "create_invoice", "place_material_order"].every((k) => A.ARMS[k]));
  ok("universal bus arm 'zap' is registered", !!A.ARMS.zap && A.ARMS.zap.event === "arm_zap");

  // ---- classify ----
  ok("unknown arm ⇒ error + supported list", (() => { const c = A.classify({ type: "nope" }); return c.ok === false && c.error === "unknown_arm" && Array.isArray(c.supported); })());
  ok("send_email missing fields ⇒ flagged", (() => { const c = A.classify({ type: "send_email", to: "a@b.com" }); return c.ok && c.missing.includes("subject") && c.missing.includes("body"); })());
  const zc = A.classify({ type: "zap", app: "Google Sheets", op: "add row", params: { row: [1, 2] } });
  ok("zap classifies with app+op ⇒ event arm_zap, no missing", zc.ok && zc.event === "arm_zap" && zc.missing.length === 0, JSON.stringify(zc));
  ok("zap preview names the app + op", /Zapier → Google Sheets: add row/.test(zc.preview), zc.preview);
  ok("zap missing app/op ⇒ flagged incomplete", (() => { const c = A.classify({ type: "zap", app: "Slack" }); return c.ok && c.missing.includes("op"); })());

  // ---- the SAFETY GATE: nothing dispatches without approval ----
  const g1 = await A.execute({ type: "send_email", to: "a@b.com", subject: "Hi", body: "x" }, { approved: false });
  ok("outward arm without approval ⇒ needs_approval, NOT dispatched", g1.ok && g1.status === "needs_approval");
  const g2 = await A.execute({ type: "zap", app: "Slack", op: "post message", params: { text: "hi" } }, {});
  ok("universal-bus zap without approval ⇒ needs_approval (default deny)", g2.ok && g2.status === "needs_approval", JSON.stringify(g2));

  // ---- approved but no webhook wired (sandbox) ⇒ blocked with a helpful reason, still no send ----
  const b1 = await A.execute({ type: "zap", app: "Google Calendar", op: "create event", params: { title: "Job" } }, { approved: true, actor: "clifton" });
  ok("approved zap with no webhook ⇒ blocked (inert until wired)", b1.ok === false && b1.status === "blocked");
  ok("blocked reason points to ALERTS_WEBHOOK_URL", /ALERTS_WEBHOOK_URL/.test(b1.reason || ""), b1.reason);
  ok("blocked path still returns an audit record", b1.audit && b1.audit.type === "zap" && b1.audit.dispatched === false);

  // ---- incomplete zap never reaches dispatch even if 'approved' ----
  const inc = await A.execute({ type: "zap", app: "Slack" }, { approved: true });
  ok("approved but incomplete zap ⇒ incomplete, not dispatched", inc.ok === false && inc.status === "incomplete" && inc.missing.includes("op"));

  // ---- division-facing arms (proposal / review / payment / collections / social) ----
  ok("new division arms registered", ["send_proposal", "request_review", "send_payment_link", "collections_notice", "post_social"].every((k) => A.ARMS[k]));
  ok("send_proposal preview names customer + amount", /Send proposal to Acme .* \$4200/.test(A.classify({ type: "send_proposal", customer: "Acme Farms", to: "a@b.com", amount: 4200 }).preview));
  ok("send_payment_link requires an amount", (() => { const c = A.classify({ type: "send_payment_link", customer: "Acme", to: "a@b.com" }); return c.ok && c.missing.includes("amount"); })());
  ok("collections_notice preview labels the stage", /Collections final → /.test(A.classify({ type: "collections_notice", customer: "Acme", to: "a@b.com", amount: 900, stage: "final" }).preview));
  ok("request_review needs approval (outward, default deny)", (await A.execute({ type: "request_review", customer: "Acme", to: "a@b.com" }, {})).status === "needs_approval");
  ok("post_social approved but no webhook ⇒ blocked (inert until wired)", (await A.execute({ type: "post_social", platform: "Facebook", body: "New foam job done!" }, { approved: true })).status === "blocked");

  console.log("\n" + (fail ? "✗" : "✓") + " " + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
}
main();
