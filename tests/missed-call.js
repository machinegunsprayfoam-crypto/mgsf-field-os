#!/usr/bin/env node
// Regression suite for the speed-to-lead / missed-call recovery arm (api/missed-call.js) — the #1
// contractor revenue leak (60–80% of calls missed, 5-min callback ≈ 21× conversion). Locks the
// invariants that keep it SAFE and correct: draft-only (never auto-sends), business-hours/Sunday
// tone, SMS present & bounded, owner alert + callback task, name/phone passthrough. Keyless, no npm.
// Run: `node tests/missed-call.js`

const path = require("path");
const mc = require(path.join(__dirname, "..", "api", "missed-call.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail ? "  [" + detail + "]" : "")); } }

// Fixed timestamps (America/Denver ≈ UTC-6 in the module). 2026-07-27 = Monday, 2026-07-26 = Sunday.
const OPEN_MON   = Date.parse("2026-07-27T18:00:00Z"); // Mon 12:00 MT -> open
const AFTER_MON  = Date.parse("2026-07-27T04:00:00Z"); // Mon 22:00 MT (prev eve) -> after hours
const SUNDAY     = Date.parse("2026-07-26T18:00:00Z"); // Sun 12:00 MT -> closed Sunday

console.log("Speed-to-lead / missed-call invariants\n");

// ---- core safety: always a draft, never a send ----
(() => {
  const o = mc.build({ caller: "Jane Doe", phone: "4065551234", service: "spray foam", at: "2026-07-27T18:00:00Z" }, OPEN_MON);
  ok("ok:true", o.ok === true);
  ok("draftOnly:true (never auto-sends)", o.draftOnly === true);
  ok("sms text present", !!(o.channels && o.channels.sms && o.channels.sms.text));
  ok("sms bounded (<=400 chars)", o.channels.sms.text.length > 0 && o.channels.sms.text.length <= 400, String(o.channels.sms.text.length));
  ok("sms carries the callback number", /406-?939-?8301/.test(o.channels.sms.text));
  ok("ownerAlert present", typeof o.ownerAlert === "string" && o.ownerAlert.length > 0);
  ok("ownerAlert includes caller phone", o.ownerAlert.includes("4065551234"));
  ok("callbackTask.phone passthrough", o.callbackTask && o.callbackTask.phone === "4065551234");
  ok("phone passthrough on result", o.phone === "4065551234");
  ok("uses caller first name", o.channels.sms.text.includes("Jane"));
})();

// ---- open-hours tone: "call you right back" + not flagged afterHours ----
(() => {
  const o = mc.build({ caller: "Sam", phone: "4065550000", at: "2026-07-27T18:00:00Z" }, OPEN_MON);
  ok("open: afterHours=false", o.afterHours === false);
  ok("open: promises a call right back", /right back/i.test(o.channels.sms.text));
  ok("open: callback due within 5 minutes", /5 min/i.test(o.callbackTask.due));
})();

// ---- after-hours weekday tone: sets next-morning expectation, no false 'right back now' ----
(() => {
  const o = mc.build({ caller: "Pat", phone: "4065550001", at: "2026-07-27T04:00:00Z" }, AFTER_MON);
  ok("after-hours: afterHours=true", o.afterHours === true);
  ok("after-hours: sets morning expectation", /after hours|morning/i.test(o.channels.sms.text));
})();

// ---- Sunday: doctrine = no Sunday work; tone must defer to next day, never commit Sunday ----
(() => {
  const o = mc.build({ caller: "Chris", phone: "4065550002", at: "2026-07-26T18:00:00Z" }, SUNDAY);
  ok("sunday: afterHours=true (closed)", o.afterHours === true);
  ok("sunday: message names Sunday closure", /sunday/i.test(o.channels.sms.text));
  ok("sunday: defers to tomorrow/Monday, no same-day promise", /tomorrow|monday/i.test(o.channels.sms.text));
})();

// ---- graceful degrade: empty body must not throw, still a safe draft ----
(() => {
  let threw = false, o = null;
  try { o = mc.build({}, OPEN_MON); } catch { threw = true; }
  ok("empty body: no throw", threw === false);
  ok("empty body: still draftOnly", o && o.draftOnly === true);
  ok("empty body: falls back to 'there'", o && o.channels.sms.text.includes("there"));
  ok("empty body: phone null (nothing invented)", o && o.phone === null);
})();

// ---- field tolerance: any vendor's field names (Hearth AI / Twilio / Zapier / Make) work ----
(() => {
  // Hearth-AI-ish payload: from_name / from_number / reason / called_at (none of the "canonical" keys)
  const o = mc.build({ from_name: "Dana Reed", from_number: "4065557777", reason: "attic foam quote", called_at: "2026-07-27T18:00:00Z" }, OPEN_MON);
  ok("alt fields: caller from from_name", o.caller === "Dana Reed" && o.channels.sms.text.includes("Dana"));
  ok("alt fields: phone from from_number", o.phone === "4065557777");
  ok("alt fields: service from reason", o.service === "attic foam quote" && o.channels.sms.text.includes("attic foam quote"));

  // Twilio-ish: From / Caller / CallStatus (capitalized keys) — case-insensitive match
  const t = mc.build({ From: "4065558888", Caller: "Lee Vasquez" }, OPEN_MON);
  ok("alt fields: case-insensitive keys (Twilio From/Caller)", t.phone === "4065558888" && t.caller === "Lee Vasquez");

  // generic: number / name / topic / time
  const g = mc.build({ name: "Kim", number: "4065556666", topic: "concrete lifting", time: "2026-07-27T18:00:00Z" }, OPEN_MON);
  ok("alt fields: generic number/name/topic", g.caller === "Kim" && g.phone === "4065556666" && g.service === "concrete lifting");

  // canonical still works (no regression), and canonical wins when both present
  const c = mc.build({ caller: "Primary", name: "Fallback", phone: "4065551111", from: "4065559999" }, OPEN_MON);
  ok("canonical fields still win over aliases", c.caller === "Primary" && c.phone === "4065551111");

  // null-ish / whitespace values are skipped, not treated as present
  const n = mc.build({ caller: "  ", name: "Real Name", phone: "", from: "4065552222" }, OPEN_MON);
  ok("empty/whitespace alias skipped for next alias", n.caller === "Real Name" && n.phone === "4065552222");
})();

// ---- brand safety: no barred claims in any generated copy ----
(() => {
  const variants = [OPEN_MON, AFTER_MON, SUNDAY].map(t =>
    mc.build({ caller: "Test", phone: "4065559999", service: "roof", at: new Date(t).toISOString() }, t).channels.sms.text).join(" ");
  ok("no mold-elimination claim", !/mold/i.test(variants));
  ok("no savings/guarantee claim", !/guarantee|save \$|\d+% off/i.test(variants));
})();

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
