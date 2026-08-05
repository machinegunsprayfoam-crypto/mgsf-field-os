#!/usr/bin/env node
// Alert Nerve (api/alerts.js) tests — telepathy phase 1, staged dark.
// Covers: gated honesty (no KV); GOV_DEADLINE tier boundary math (10-day / 3-day / day-of,
// America/Denver calendar); dedup (existence = never refire); NEW_LEAD_STALE first-seen
// bootstrap (first evaluation is NOT stale); ESTIMATE_AGING 5→10 crossings; STORE_NUMB
// 24h throttle; batching (>2 pending → exactly ONE Twilio call, "+N more"); the 5 SMS/day
// cap (6th queues, not sends); quiet-hours queue + next-run drain; Sunday policy (only
// GOV day-of sends); not_configured honesty (no send attempt, ring buffer still written);
// header-only cron auth (query-string secret refused; missing → 401 + challenge);
// injection guard (a phone number inside a record NEVER changes the recipient); self-test
// single-shot; maybeRunAlerts never throws. Zero network — KV and Twilio both stubbed via
// global.fetch. Run: `node tests/alerts.js`.

const path = require("path");
const ALERTS_PATH = path.join(__dirname, "..", "api", "alerts.js");
let pass = 0, fail = 0;
function ok(n, c, d) { if (c) pass++; else { fail++; console.log("  ✗ " + n + (d !== undefined ? "  [" + (typeof d === "string" ? d : JSON.stringify(d)) + "]" : "")); } }
function fresh() { delete require.cache[require.resolve(ALERTS_PATH)]; return require(ALERTS_PATH); }
const T = (iso) => Date.parse(iso);
const OWNER = "+14065551111";

console.log("Alert Nerve (api/alerts.js) tests\n");

// ---- stub store: KV + Twilio behind global.fetch (no network, ever) ----
let KV = {}, twilioCalls = [], kvFail = new Set();
const realFetch = global.fetch;
global.fetch = async (url, opts) => {
  url = String(url);
  if (url.includes("api.twilio.com")) {
    twilioCalls.push(Object.fromEntries(new URLSearchParams((opts && opts.body) || "")));
    return { ok: true, json: async () => ({ status: "queued" }) };
  }
  if (url.includes("/get/")) {
    const key = decodeURIComponent(url.split("/get/")[1]);
    if (kvFail.has(key)) return { ok: false, json: async () => ({}) };
    return { ok: true, json: async () => ({ result: KV[key] === undefined ? null : JSON.stringify(KV[key]) }) };
  }
  if (url.includes("/set/")) {
    const key = decodeURIComponent(url.split("/set/")[1]);
    KV[key] = JSON.parse(String((opts && opts.body) || "null"));
    return { ok: true, json: async () => ({ result: "OK" }) };
  }
  throw new Error("unexpected fetch: " + url);
};
function reset(seed) {
  KV = Object.assign({ "alert:selftest": "suppressed-for-test" }, seed || {});
  twilioCalls = []; kvFail = new Set();
}
function mkRes() {
  return { headers: {}, code: 0, body: null, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end() {} };
}

(async () => {
  // ---- 1) gated: no KV, no Twilio → honest, never fabricates ----
  for (const k of ["KV_REST_API_URL", "KV_REST_API_TOKEN", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "TWILIO_FROM", "OWNER_SMS", "ALERT_SMS_TO", "CRON_SECRET"]) delete process.env[k];
  const gated = fresh();
  let r = await gated.runSweep(T("2026-08-04T13:00:00Z"));
  ok("no KV -> configured:false, no invented data", r.ok === false && r.configured === false, r);
  ok("no Twilio -> sms:'not_configured' (never 'sent')", r.sms === "not_configured", r);

  // ---- live env (existing documented names only) ----
  process.env.KV_REST_API_URL = "http://kv.test";
  process.env.KV_REST_API_TOKEN = "tok";
  process.env.TWILIO_ACCOUNT_SID = "ACtest";
  process.env.TWILIO_AUTH_TOKEN = "twtok";
  process.env.TWILIO_PHONE_NUMBER = "+14065550000";
  process.env.OWNER_SMS = OWNER;
  process.env.CRON_SECRET = "cron-secret-test";
  const A = fresh();

  // ---- 2) Denver calendar helpers ----
  ok("13:00 UTC in August = 07:00 Denver (MDT)", A.denver(T("2026-08-04T13:00:00Z")).hour === 7);
  ok("04:30 UTC = 22:30 Denver previous evening (quiet)", A.denver(T("2026-08-05T04:30:00Z")).hour === 22);
  ok("2026-08-09 is a Sunday in Denver", A.denver(T("2026-08-09T13:00:00Z")).weekday === "Sun");

  // ---- 3) GOV_DEADLINE tier boundary math (pure, fixture-driven) ----
  const gov = { id: "G1", name: "HICS Gates (SDVOSB)", service: "Government", status: "New", notes: "Set-aside. Due 2026-08-12", link: "https://sam.gov/opp/123" };
  const snapG = { leads: [gov], estimates: [], storeError: false };
  const staleQuiet = { "log:NEW_LEAD_STALE:G1:24h": "x", "log:NEW_LEAD_STALE:G1:72h": "x" }; // isolate GOV rule
  const st = (log) => ({ log: Object.assign({}, staleQuiet, log), seen: { G1: "2026-06-01T00:00:00Z" } });

  let ev = A.evaluate(snapG, st({}), T("2026-08-01T13:00:00Z"));
  ok("due 8/12: 8/1 (11 days out) does NOT fire", ev.alerts.length === 0, ev.alerts);
  ev = A.evaluate(snapG, st({}), T("2026-08-02T13:00:00Z"));
  ok("8/2 (10 days out) fires the 10-day tier", ev.alerts.length === 1 && ev.alerts[0].tier === "t10", ev.alerts);
  ok("copy: plainspoken, dated, statused, linked", /closes in 10 days — Wed 8\/12\. Status New\. https:\/\/sam\.gov/.test(ev.alerts[0].message), ev.alerts[0].message);
  ok("copy ≤300 chars, no emoji", ev.alerts[0].message.length <= 300 && !/[\u{1F300}-\u{1FAFF}]/u.test(ev.alerts[0].message));
  ev = A.evaluate(snapG, st({ "log:GOV_DEADLINE:G1:t10": "x" }), T("2026-08-09T13:00:00Z"));
  ok("8/9 (3 days out, t10 logged) fires the 3-day tier", ev.alerts.length === 1 && ev.alerts[0].tier === "t3", ev.alerts);
  ev = A.evaluate(snapG, st({ "log:GOV_DEADLINE:G1:t10": "x", "log:GOV_DEADLINE:G1:t3": "x" }), T("2026-08-12T13:00:00Z"));
  ok("8/12 morning fires day-of", ev.alerts.length === 1 && ev.alerts[0].tier === "dayof" && /closes TODAY/.test(ev.alerts[0].message), ev.alerts);
  // late first look: only the MOST urgent tier fires, lower tiers logged with it
  ev = A.evaluate(snapG, st({}), T("2026-08-09T13:00:00Z"));
  ok("late first evaluation at 3-days-out fires ONE alert (t3), not the ladder", ev.alerts.length === 1 && ev.alerts[0].tier === "t3", ev.alerts);
  ok("…and logs t10 alongside so it can never backfire", ev.logWrites.some((w) => w.key === "log:GOV_DEADLINE:G1:t10"), ev.logWrites);

  // ---- 4) dedup: existence = never refire ----
  const state1 = st({});
  ev = A.evaluate(snapG, state1, T("2026-08-02T13:00:00Z"));
  for (const w of ev.logWrites) state1.log[w.key] = w.ts;
  const ev2 = A.evaluate(snapG, state1, T("2026-08-02T13:00:00Z"));
  ok("same snapshot twice → second run silent", ev.alerts.length === 1 && ev2.alerts.length === 0, ev2.alerts);

  // ---- 5) NEW_LEAD_STALE first-seen bootstrap ----
  const lead = { id: "L1", name: "Alpha", status: "New" };
  const snapL = { leads: [lead], estimates: [], storeError: false };
  ev = A.evaluate(snapL, { log: {}, seen: {} }, T("2026-08-04T13:00:00Z"));
  ok("first evaluation writes first-seen, does NOT count as 24h old", ev.alerts.length === 0 && ev.seenWrites.includes("L1"), ev);
  ev = A.evaluate(snapL, { log: {}, seen: { L1: "2026-08-03T12:00:00Z" } }, T("2026-08-04T13:00:00Z"));
  ok("25h after first-seen → 24h tier fires", ev.alerts.length === 1 && ev.alerts[0].tier === "24h", ev.alerts);
  ev = A.evaluate(snapL, { log: { "log:NEW_LEAD_STALE:L1:24h": "x" }, seen: { L1: "2026-08-01T00:00:00Z" } }, T("2026-08-04T13:00:00Z"));
  ok("72h+ → 72h tier fires (24h already logged)", ev.alerts.length === 1 && ev.alerts[0].tier === "72h", ev.alerts);
  ev = A.evaluate({ leads: [{ id: "L2", name: "Won", status: "Won" }], estimates: [], storeError: false }, { log: {}, seen: {} }, T("2026-08-04T13:00:00Z"));
  ok("non-New lead: no seen write, no alert", ev.alerts.length === 0 && ev.seenWrites.length === 0, ev);

  // ---- 6) ESTIMATE_AGING crossings ----
  const snapE = (date, status) => ({ leads: [], estimates: [{ id: "E1", customer: "Delta", status: status || "open", date }], storeError: false });
  ev = A.evaluate(snapE("2026-08-01"), { log: {}, seen: {} }, T("2026-08-04T13:00:00Z"));
  ok("open 3 days: silent", ev.alerts.length === 0, ev.alerts);
  ev = A.evaluate(snapE("2026-07-29"), { log: {}, seen: {} }, T("2026-08-04T13:00:00Z"));
  ok("crosses 5 days → d5 fires", ev.alerts.length === 1 && ev.alerts[0].tier === "d5", ev.alerts);
  ev = A.evaluate(snapE("2026-07-20"), { log: { "log:ESTIMATE_AGING:E1:d5": "x" } , seen: {} }, T("2026-08-04T13:00:00Z"));
  ok("crosses 10 days → d10 fires", ev.alerts.length === 1 && ev.alerts[0].tier === "d10", ev.alerts);
  ev = A.evaluate(snapE("2026-07-20", "accepted"), { log: {}, seen: {} }, T("2026-08-04T13:00:00Z"));
  ok("non-open estimate never ages into an alert", ev.alerts.length === 0, ev.alerts);

  // ---- 7) STORE_NUMB 24h throttle (integration: a real failed read) ----
  reset();
  kvFail.add("mgsf:leads");
  r = await A.runSweep(T("2026-08-04T13:00:00Z"));
  ok("store read failure → STORE_NUMB fires + SMS", r.storeError === true && r.fired === 1 && twilioCalls.length === 1, r);
  const call0 = twilioCalls.length;
  r = await A.runSweep(T("2026-08-04T15:00:00Z"));
  ok("still failing 2h later → throttled (max once per 24h)", r.fired === 0 && twilioCalls.length === call0, r);
  r = await A.runSweep(T("2026-08-05T15:00:00Z"));
  ok("26h later → fires again", r.fired === 1, r);

  // ---- 8) batching: >2 pending → exactly ONE combined Twilio call ----
  reset({
    "mgsf:estimates": [
      { id: "E1", customer: "Alpha", status: "open", date: "2026-07-28" },
      { id: "E2", customer: "Bravo", status: "open", date: "2026-07-28" },
      { id: "E3", customer: "Charlie", status: "open", date: "2026-07-28" },
      { id: "E4", customer: "Delta", status: "open", date: "2026-07-28" },
    ],
  });
  r = await A.runSweep(T("2026-08-04T13:00:00Z"));
  ok("4 alerts fired, ONE Twilio call", r.fired === 4 && twilioCalls.length === 1, { fired: r.fired, calls: twilioCalls.length });
  ok("combined SMS: most urgent first + '+N more', ≤300", /^MGSF ALERT:/.test(twilioCalls[0].Body) && /\+3 more$/.test(twilioCalls[0].Body) && twilioCalls[0].Body.length <= 300, twilioCalls[0].Body);
  ok("day counter = 1 SMS (batched)", KV["alert:sent:20260804"] === 1, KV["alert:sent:20260804"]);

  // ---- 9) cap: 5 SMS/day — the 6th alert queues, not sends ----
  reset({ "alert:sent:20260804": 5, "mgsf:estimates": [{ id: "E9", customer: "Echo", status: "open", date: "2026-07-28" }] });
  r = await A.runSweep(T("2026-08-04T13:00:00Z"));
  ok("cap hit → no send, alert queued", twilioCalls.length === 0 && r.sent === 0 && r.queued === 1 && (KV["alert:queue"] || []).length === 1, r);
  // pure check of the boundary: 4 already sent → 5th sends
  let plan = A.planDelivery([{ rule: "X", tier: "t", id: "1", urgency: 5, message: "m" }], { sentToday: 4 }, T("2026-08-04T13:00:00Z"));
  ok("4 sent today → 5th sends", plan.send.length === 1 && plan.queue.length === 0, plan);
  plan = A.planDelivery([{ rule: "X", tier: "t", id: "1", urgency: 5, message: "m" }], { sentToday: 5 }, T("2026-08-04T13:00:00Z"));
  ok("5 sent today → 6th queues", plan.send.length === 0 && plan.queue.length === 1, plan);

  // ---- 10) quiet hours (21:00–06:00 MT): queue now, drain next run ----
  reset({ "mgsf:estimates": [{ id: "EQ", customer: "Night", status: "open", date: "2026-07-29" }] });
  r = await A.runSweep(T("2026-08-05T04:30:00Z")); // Tue 22:30 Denver
  ok("quiet hours → fires but queues, zero send attempts", r.fired === 1 && r.sent === 0 && twilioCalls.length === 0 && (KV["alert:queue"] || []).length === 1, r);
  r = await A.runSweep(T("2026-08-05T13:00:00Z")); // Wed 07:00 Denver
  ok("next-run drain → queued alert sends, queue empties", r.sent === 1 && twilioCalls.length === 1 && (KV["alert:queue"] || []).length === 0, r);
  ok("drained SMS is the queued estimate alert", /Estimate Night open 5\+/.test(twilioCalls[0].Body), twilioCalls[0].Body);

  // ---- 11) Sunday policy: only GOV_DEADLINE day-of may send ----
  const sun = T("2026-08-09T13:00:00Z");
  const dayof = { rule: "GOV_DEADLINE", tier: "dayof", id: "G", urgency: 0, message: "MGSF ALERT: closes TODAY" };
  const d5 = { rule: "ESTIMATE_AGING", tier: "d5", id: "E", urgency: 7, message: "MGSF ALERT: estimate aging" };
  plan = A.planDelivery([dayof, d5], { sentToday: 0 }, sun);
  ok("Sunday: day-of sends, everything else queues", plan.send.length === 1 && plan.send[0].covers[0].tier === "dayof" && plan.queue.length === 1 && plan.queue[0].tier === "d5", plan);
  plan = A.planDelivery([d5], { sentToday: 0 }, sun);
  ok("Sunday with no day-of: nothing sends", plan.send.length === 0 && plan.queue.length === 1, plan);

  // ---- 12) not_configured honesty: evaluate + buffer, NO send attempt, never 'sent' ----
  for (const k of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "OWNER_SMS"]) delete process.env[k];
  const dark = fresh();
  reset({ "mgsf:estimates": [{ id: "ED", customer: "Dark", status: "open", date: "2026-07-29" }] });
  delete KV["alert:selftest"]; // even unset, dark mode must not attempt a self-test send
  r = await dark.runSweep(T("2026-08-04T13:00:00Z"));
  ok("Twilio unset → still evaluates", r.fired === 1, r);
  ok("status answers sms:'not_configured', sent stays 0", r.sms === "not_configured" && r.sent === 0, r);
  ok("zero Twilio attempts", twilioCalls.length === 0);
  ok("ring buffer still written, honestly marked", (KV["alert:recent"] || []).length === 1 && KV["alert:recent"][0].delivered === "not_configured", KV["alert:recent"]);
  ok("dedup log still written dark (no replay flood at go-live)", !!KV["alert:log:ESTIMATE_AGING:ED:d5"]);
  // restore live env
  process.env.TWILIO_ACCOUNT_SID = "ACtest";
  process.env.TWILIO_AUTH_TOKEN = "twtok";
  process.env.TWILIO_PHONE_NUMBER = "+14065550000";
  process.env.OWNER_SMS = OWNER;
  const B = fresh();

  // ---- 13) auth: header passes; query-string secret is READ BY NOTHING; 401 challenge ----
  reset();
  let res = mkRes();
  await B({ method: "POST", headers: { "x-cron-secret": "cron-secret-test" } }, res);
  ok("POST with correct x-cron-secret header → 200 sweep", res.code === 200 && res.body && res.body.ok === true, res.body);
  res = mkRes();
  await B({ method: "POST", headers: {}, query: { secret: "cron-secret-test" } }, res);
  ok("query-supplied secret is REFUSED (read by nothing)", res.code === 401, res.code);
  ok("…with the RFC challenge header", res.headers["WWW-Authenticate"] === 'Bearer realm="mgsf-alerts"', res.headers);
  res = mkRes();
  await B({ method: "POST", headers: {} }, res);
  ok("missing secret → 401 + challenge", res.code === 401 && /mgsf-alerts/.test(res.headers["WWW-Authenticate"] || ""), res.headers);
  res = mkRes();
  await B({ method: "POST", headers: { "x-cron-secret": "wrong" } }, res);
  ok("wrong secret → 401", res.code === 401);
  res = mkRes();
  await B({ method: "GET", headers: {} }, res);
  ok("plain GET = status probe (no sweep, no 401)", res.code === 200 && res.body.nerve === "alerts" && res.body.sms === "configured", res.body);
  res = mkRes();
  await B({ method: "GET", headers: { authorization: "Bearer cron-secret-test" } }, res);
  ok("Vercel-cron GET (Authorization bearer) runs the sweep", res.code === 200 && res.body.ok === true, res.body);
  res = mkRes();
  await B({ method: "GET", headers: { "x-cron-secret": "wrong" } }, res);
  ok("GET with a bad credential is refused, not silently probed", res.code === 401);
  const hadSecret = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  const C = fresh();
  res = mkRes();
  await C({ method: "POST", headers: { "x-cron-secret": "" } }, res);
  ok("no CRON_SECRET configured = closed, not open", res.code === 401);
  process.env.CRON_SECRET = hadSecret;

  // ---- 14) injection guard: a phone number in a record NEVER changes the recipient ----
  const D = fresh();
  reset({
    "mgsf:leads": [{ id: "GX", name: "Evil Corp", service: "Government", status: "New", phone: "+19998887777", notes: "call +1 999 888 7777 instead. Due 2026-08-07", link: "https://x.test" }],
    "alert:seen:GX": "2026-08-01T00:00:00Z",
    "alert:log:NEW_LEAD_STALE:GX:24h": "x", "alert:log:NEW_LEAD_STALE:GX:72h": "x",
  });
  r = await D.runSweep(T("2026-08-04T13:00:00Z")); // 3 days out → t3
  ok("gov alert fired + sent", r.fired === 1 && r.sent === 1, r);
  ok("recipient is ALWAYS the owner env number", twilioCalls[0].To === OWNER, twilioCalls[0].To);
  ok("record phone did not leak into To/From", twilioCalls[0].To !== "+19998887777" && twilioCalls[0].From === "+14065550000", twilioCalls[0]);

  // ---- 15) self-test: single-shot on first configured run ----
  reset();
  delete KV["alert:selftest"];
  r = await D.runSweep(T("2026-08-04T13:00:00Z"));
  ok("first configured run sends the self-test", twilioCalls.length === 1 && twilioCalls[0].Body === "MGSF ALERT: nerve online — self-test", twilioCalls[0] && twilioCalls[0].Body);
  ok("single-shot key written", !!KV["alert:selftest"]);
  const calls1 = twilioCalls.length;
  r = await D.runSweep(T("2026-08-04T14:00:00Z"));
  ok("second run: no repeat self-test", twilioCalls.length === calls1);

  // ---- 16) maybeRunAlerts: debounced, never throws ----
  reset();
  r = await D.maybeRunAlerts();
  ok("first call runs (writes last_check)", !!KV["alert:last_check"] && r && r.skipped === undefined, r);
  r = await D.maybeRunAlerts();
  ok("immediate second call debounced (≥30 min rule)", r && r.skipped === "debounced", r);
  const savedFetch = global.fetch;
  global.fetch = async () => { throw new Error("network down"); };
  let threw = false;
  try { r = await D.maybeRunAlerts(); } catch { threw = true; }
  ok("total network failure: swallowed, never breaks a host request", threw === false && typeof r === "object", r);
  global.fetch = savedFetch;

  global.fetch = realFetch;
  console.log("\n" + (fail ? "✗ " : "✓ ") + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("suite crashed:", e); process.exit(1); });
