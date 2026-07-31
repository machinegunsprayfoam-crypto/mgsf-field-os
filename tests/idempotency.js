#!/usr/bin/env node
// Klyfton idempotency — deterministic key + the check/commit contract + the act.js integration
// (no double-send). Run: `node tests/idempotency.js`. Keyless, no network (store is injected/gated).

const path = require("path");
const I = require(path.join(__dirname, "..", "api", "idempotency.js"));
const A = require(path.join(__dirname, "..", "api", "act.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

async function main() {
  console.log("Klyfton idempotency — key + no-double-send\n");

  // ---- deterministic key ----
  const a = { type: "send_email", to: "x@y.com", subject: "Hi", body: "hello" };
  ok("key is deterministic for the same action+day", I.key(a, "2026-08-01") === I.key(a, "2026-08-01"));
  ok("key differs by day (tomorrow is a new send)", I.key(a, "2026-08-01") !== I.key(a, "2026-08-02"));
  ok("key differs by content", I.key(a, "2026-08-01") !== I.key({ ...a, body: "different" }, "2026-08-01"));
  ok("key differs by recipient", I.key(a, "2026-08-01") !== I.key({ ...a, to: "z@y.com" }, "2026-08-01"));
  // universal-bus (zap) actions must be distinguished by app/op/params, not collapse to one key
  const z1 = { type: "zap", app: "Google Sheets", op: "add row", params: { row: [1] } };
  const z2 = { type: "zap", app: "Google Sheets", op: "add row", params: { row: [2] } };
  const z3 = { type: "zap", app: "Slack", op: "post message" };
  ok("two zaps differing by params get different keys (no false-duplicate)", I.key(z1, "D") !== I.key(z2, "D"));
  ok("two zaps differing by app/op get different keys", I.key(z1, "D") !== I.key(z3, "D"));
  ok("identical zaps still share a key (real duplicate)", I.key(z1, "D") === I.key({ type: "zap", app: "Google Sheets", op: "add row", params: { row: [1] } }, "D"));

  // ---- gated store: no Supabase ⇒ check false (not a dup), commit no-op, no throw ----
  ok("check unconfigured ⇒ false (best-effort, honest)", (await I.check("somekey")) === false);
  ok("commit unconfigured ⇒ configured:false", (await I.commit("somekey", {})).configured === false);

  // ---- act.js integration with an INJECTED store: 2nd identical approved action is skipped ----
  const store = new Set();
  const idem = {
    key: (act, day) => I.key(act, day || "D"),
    check: (k) => Promise.resolve(store.has(k)),
    commit: (k) => { store.add(k); return Promise.resolve({ ok: true }); },
  };
  const action = { type: "send_email", to: "sam@x.com", subject: "Quote", body: "your quote" };

  // No webhook in sandbox ⇒ dispatch is "blocked", so commit does NOT happen (failed send isn't recorded)
  const first = await A.execute(action, { approved: true, idem });
  ok("failed dispatch (no webhook) is NOT recorded ⇒ retry still allowed", store.size === 0, "store=" + store.size);
  const retryAfterFail = await A.execute(action, { approved: true, idem });
  ok("after a failed send, the same action is NOT treated as duplicate", retryAfterFail.status !== "duplicate_skipped", retryAfterFail.status);

  // Now simulate a SUCCESSFUL prior send by pre-seeding the store, then the same action is skipped
  store.add(idem.key(action, new Date().toISOString().slice(0, 10)));
  const dup = await A.execute(action, { approved: true, idem });
  ok("an already-dispatched action ⇒ duplicate_skipped (no re-send)", dup.status === "duplicate_skipped", dup.status);
  ok("duplicate result is marked, not dispatched", dup.audit && dup.audit.duplicate === true && dup.audit.dispatched === false);

  // ---- unapproved still gates first (idempotency never bypasses approval) ----
  const preview = await A.execute(action, { approved: false, idem });
  ok("unapproved ⇒ needs_approval (approval gate wins over idempotency)", preview.status === "needs_approval");

  console.log("\n" + (fail ? "✗" : "✓") + " " + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
}
main();
