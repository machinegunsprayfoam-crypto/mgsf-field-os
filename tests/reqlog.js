#!/usr/bin/env node
// Request log + per-key usage (api/reqlog.js). Run: `node tests/reqlog.js`.
// Guards the two things that make a log trustworthy: it must not leak, and it must not invent.

const path = require("path");
const R = require(path.join(__dirname, "..", "api", "reqlog.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) pass++; else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + JSON.stringify(detail) + "]" : "")); } }

console.log("Request log — normalization, rollup, key attribution, leak-safety\n");

// --- route normalization must never echo the caller's query string (it carries ?code=)
ok("plain route", R.normalizeRoute("/api/foam-calc") === "/api/foam-calc");
ok("strips query", R.normalizeRoute("/api/tools?code=hunter2") === "/api/tools", R.normalizeRoute("/api/tools?code=hunter2"));
ok("strips hash", R.normalizeRoute("/api/tools#x") === "/api/tools");
ok("strips trailing slash", R.normalizeRoute("/api/tools/") === "/api/tools");
ok("unknown for non-api", R.normalizeRoute("/admin") === "/unknown", R.normalizeRoute("/admin"));
ok("unknown for traversal", R.normalizeRoute("/api/../../etc/passwd") === "/unknown", R.normalizeRoute("/api/../../etc/passwd"));
ok("unknown for empty", R.normalizeRoute("") === "/unknown");
ok("secret never survives normalization", R.normalizeRoute("/api/x?code=SEKRET").indexOf("SEKRET") === -1);

// --- error scrubbing runs through the redaction guardrail
const scrubbed = R.scrubError("failed with Bearer abcdefghijklmnopqrstuvwxyz123456");
ok("bearer token scrubbed", scrubbed.indexOf("abcdefghijklmnopqrstuvwxyz123456") === -1, scrubbed);
ok("api key scrubbed", R.scrubError("key sk-ant-SUPERSECRETVALUE99").indexOf("SUPERSECRETVALUE99") === -1);
ok("scrub caps length", R.scrubError("x".repeat(500)).length <= 200);
ok("scrub handles null", R.scrubError(null) === "");

// --- record() normalizes and classifies
const rec = R.record({ route: "/api/geo?code=x", method: "post", status: 200, ms: 12.6, cap: "maps", at: "2026-08-03T10:00:00Z" });
ok("record normalizes route", rec.route === "/api/geo", rec.route);
ok("record uppercases method", rec.method === "POST");
ok("record rounds ms", rec.ms === 13, rec.ms);
ok("record marks ok", rec.ok === true);
ok("record carries cap", rec.cap === "maps");
const denied = R.record({ route: "/api/tools", status: 401 });
ok("401 is not ok", denied.ok === false);
ok("401 is denied", denied.denied === true);
const err5 = R.record({ route: "/api/x", status: 500 });
ok("500 is not ok", err5.ok === false);
ok("500 is not denied", err5.denied === false);

// --- percentile is nearest-rank and deterministic
ok("p50 of 1..10", R.percentile([1,2,3,4,5,6,7,8,9,10], 50) === 5, R.percentile([1,2,3,4,5,6,7,8,9,10], 50));
ok("p95 of 1..100", R.percentile(Array.from({length:100},(_,i)=>i+1), 95) === 95);
ok("p100 is max", R.percentile([3,1,2], 100) === 3);
ok("empty is 0", R.percentile([], 95) === 0);
ok("ignores non-numeric", R.percentile([1, NaN, 3], 100) === 3);

// --- rollup
const rows = [
  R.record({ route: "/api/foam-calc", status: 200, ms: 10, at: "2026-08-03T10:00:00Z", cap: null }),
  R.record({ route: "/api/foam-calc", status: 200, ms: 30, at: "2026-08-03T11:00:00Z" }),
  R.record({ route: "/api/foam-calc", status: 500, ms: 90, at: "2026-08-03T12:00:00Z", error: "boom" }),
  R.record({ route: "/api/hubspot",   status: 200, ms: 200, at: "2026-08-02T10:00:00Z", cap: "hubspot" }),
  R.record({ route: "/api/hubspot",   status: 401, ms: 2,   at: "2026-08-02T10:05:00Z", cap: "hubspot" }),
];
const roll = R.rollup(rows);
ok("total counted", roll.total === 5, roll.total);
ok("errors counted (500 + 401)", roll.errors === 2, roll.errors);
ok("denied counted (401 only)", roll.denied === 1, roll.denied);
ok("per-route calls", roll.routes["/api/foam-calc"].calls === 3);
ok("per-route errorRate", roll.routes["/api/foam-calc"].errorRate === 0.333, roll.routes["/api/foam-calc"].errorRate);
ok("byDay splits", roll.byDay["2026-08-03"] === 3 && roll.byDay["2026-08-02"] === 2, roll.byDay);
ok("byStatus splits", roll.byStatus[200] === 3 && roll.byStatus[500] === 1 && roll.byStatus[401] === 1, roll.byStatus);
ok("slowest ranks by p95", roll.slowest[0].route === "/api/hubspot", roll.slowest[0]);
ok("noisiest lists error routes", roll.noisiest.length === 2, roll.noisiest.length);
ok("raw ms arrays not leaked", roll.routes["/api/foam-calc"].ms === undefined);
ok("rollup of empty is safe", R.rollup([]).total === 0 && R.rollup(null).total === 0);

// --- per-key usage: attribution + the armed-but-idle insight
const CAPS = {
  hubspot: { label: "HubSpot CRM", on: (e) => !!e.HUBSPOT_TOKEN },
  twilio:  { label: "Twilio", on: (e) => !!e.TWILIO_AUTH_TOKEN },
  maps:    { label: "Maps", on: (e) => !!e.GOOGLE_MAPS_API_KEY },
};
const usage = R.keyUsage(rows, { HUBSPOT_TOKEN: "x", TWILIO_AUTH_TOKEN: "y" }, CAPS);
ok("attributes calls to the key", usage.keys.hubspot.calls === 2, usage.keys);
ok("attributes errors to the key", usage.keys.hubspot.errors === 1);
ok("untagged rows not attributed", Object.keys(usage.keys).length === 1, Object.keys(usage.keys));
ok("armed-but-idle finds twilio", usage.armedButIdle.some((k) => k.cap === "twilio"), usage.armedButIdle);
ok("armed-but-idle excludes used hubspot", !usage.armedButIdle.some((k) => k.cap === "hubspot"));
ok("armed-but-idle excludes dark maps", !usage.armedButIdle.some((k) => k.cap === "maps"), usage.armedButIdle);

// --- THE honesty rule: never invent spend
ok("cost null when none supplied", usage.cost.total === null, usage.cost);
ok("cost note says it does not estimate", /does not estimate/.test(usage.cost.note));
ok("rowsWithCost is 0", usage.cost.rowsWithCost === 0);
const withCost = R.keyUsage([{ ...rows[3], cost: 0.0123 }, { ...rows[4], cost: 0.0077 }], {}, CAPS);
ok("cost sums caller-supplied only", withCost.cost.total === 0.02, withCost.cost.total);
ok("cost note changes when supplied", /caller-supplied/.test(withCost.cost.note));

// --- wrap(): transparent, and cannot break the endpoint
R._reset();
(async () => {
  const okHandler = async (req, res) => { res.status(200); return "RESULT"; };
  const mk = () => ({ statusCode: 0, status(c) { this.statusCode = c; return this; }, json() { return this; } });
  const wrapped = R.wrap(okHandler, { cap: "hubspot" });
  const out = await wrapped({ url: "/api/hubspot?code=SEKRET", method: "GET" }, mk());
  ok("wrap returns handler result unchanged", out === "RESULT", out);
  const logged = R.recent();
  ok("wrap recorded one row", logged.length === 1, logged.length);
  ok("wrap normalized the route", logged[0] && logged[0].route === "/api/hubspot", logged[0] && logged[0].route);
  ok("wrap did not log the secret", JSON.stringify(logged).indexOf("SEKRET") === -1);
  ok("wrap tagged the capability", logged[0] && logged[0].cap === "hubspot");
  ok("wrap captured status", logged[0] && logged[0].status === 200, logged[0] && logged[0].status);

  // a throwing handler must still be re-thrown (transparent) AND still logged as 500
  R._reset();
  const boomHandler = async () => { throw new Error("kaboom sk-ant-LEAKED"); };
  let threw = false;
  try { await R.wrap(boomHandler, { cap: "twilio" })({ url: "/api/x", method: "POST" }, mk()); }
  catch (e) { threw = /kaboom/.test(e.message); }
  ok("wrap re-throws handler errors", threw === true);
  const errRows = R.recent();
  ok("wrap logged the failure as 500", errRows[0] && errRows[0].status === 500, errRows[0] && errRows[0].status);
  ok("wrap scrubbed the key out of the error", JSON.stringify(errRows).indexOf("LEAKED") === -1, errRows[0] && errRows[0].error);

  // report() is graceful with no Supabase attached and says so
  R._reset();
  const rep = await R.report({});
  ok("report graceful without storage", rep.configured === false && rep.source === "memory", { c: rep.configured, s: rep.source });
  ok("report admits the buffer is per-instance", /per-instance/.test(rep.note));
  ok("report still returns a rollup", rep.rollup && rep.rollup.total === 0);
  ok("report still returns keyUsage", !!rep.keyUsage);

  console.log((fail ? "\n" : "") + "✓ " + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
