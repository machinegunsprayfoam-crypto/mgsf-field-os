#!/usr/bin/env node
// Regression suite for the Hearth lead receiver (api/hearth-lead.js). Fixture = a REAL Hearth
// "New call from …" email (captured 2026-08-06). Locks: server-side parse of the actual layout
// (name/phone/city/classification/urgency/appointment/duration/summary/job/address/next-move),
// Legitimate→actionable vs Solicitation/Spam→filtered, pre-parsed fields win over the raw parse,
// never invents a field, draft-only (never writes CRM / never messages). Keyless. Run: node tests/hearth-lead.js

const path = require("path");
const h = require(path.join(__dirname, "..", "api", "hearth-lead.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail ? "  [" + detail + "]" : "")); } }
const NOW = Date.parse("2026-08-06T18:00:00Z");

// The real email, as plaintext (what a parser/Gmail forwards).
const SUBJECT = "New call from Clifton Behner";
const BODY = [
  "NEW CALL FROM CLIFTON BEHNER · LEGITIMATE",
  "A LEAD JUST CALLED.",
  "We think this is a real customer.",
  "THE LEAD",
  "CLIFTON BEHNER",
  "(406) 941-2428 · Glendive",
  "Low urgency   Appointment requested",
  "CALL DETAILS",
  "Duration",
  "2m45s",
  "Summary",
  "Clifton Behner called to request a bid for residential concrete lifting on approximately 400 feet of four-foot-wide sidewalk at 418 Cook Street. The receptionist submitted the request for a team member to reach out and arrange an on-site estimate.",
  "THE JOB",
  "CONCRETE LEVELING",
  "Concrete lifting for residential sidewalk, approximately 4 feet wide by 400 feet long.",
  "QUALIFYING QUESTIONS",
  "Name: Clifton Behner, Address: 418 Cook Street, Glendive",
  "Concrete lifting, residential, sidewalk about 4 feet wide by about 400 feet (two sides)",
  "Glendive, timeline doesn't really matter, requested free on-site estimate",
  "SUGGESTED NEXT MOVE",
  "SCHEDULE SITE VISIT",
  "High",
  "Schedule an on-site estimate for concrete lifting at 418 Cook Street, Glendive",
  "View Activity",
  "Machine Gun Spray Foam and Concrete Lifting, LLC",
  "Notifications from Hearth · Unsubscribe",
].join("\n");

console.log("Hearth lead receiver invariants\n");

// ---- parse the real email ----
(() => {
  const o = h.build({ subject: SUBJECT, body: BODY }, NOW);
  ok("ok + draftOnly (never writes CRM / never messages)", o.ok === true && o.draftOnly === true);
  ok("source hearth, emailType call_lead", o.source === "hearth" && o.emailType === "call_lead");
  ok("name parsed", o.name === "Clifton Behner");
  ok("phone parsed", o.phone === "(406) 941-2428");
  ok("city parsed", o.city === "Glendive");
  ok("classification legitimate", o.classification === "legitimate");
  ok("legitimate => actionable", o.actionable === true);
  ok("urgency parsed", o.urgency === "low");
  ok("appointment requested flag", o.appointmentRequested === true);
  ok("duration parsed", /2\s*m/.test(o.duration || ""));
  ok("summary parsed (has the address)", (o.summary || "").includes("418 Cook Street"));
  ok("job type parsed", /CONCRETE LEVELING/i.test(o.service || ""));
  ok("job description parsed", (o.jobDescription || "").toLowerCase().includes("sidewalk"));
  ok("service address parsed", (o.address || "").includes("418 Cook Street"));
  ok("next move parsed", /SCHEDULE SITE VISIT/i.test(o.nextMove || ""));
  ok("next move priority parsed", o.nextMovePriority === "high");
})();

// ---- owner alert + CRM suggestion (not a write) ----
(() => {
  const o = h.build({ subject: SUBJECT, body: BODY }, NOW);
  ok("owner alert names the lead + service", /Clifton Behner/.test(o.ownerAlert) && /CONCRETE LEVELING/i.test(o.ownerAlert));
  ok("owner alert flags appointment", /APPOINTMENT REQUESTED/i.test(o.ownerAlert));
  ok("crmUpdate is a SUGGESTION", o.crmUpdate && o.crmUpdate.action === "suggest");
  ok("crmUpdate high priority (appointment requested)", o.crmUpdate.priority === "high");
  ok("crmUpdate stage = Site Visit Requested", /Site Visit Requested/i.test(o.crmUpdate.stageHint));
  ok("crmUpdate lead carries address + source", o.crmUpdate.lead.address === "418 Cook Street, Glendive" && /Hearth/.test(o.crmUpdate.lead.source));
  ok("callbackTask present with phone", o.callbackTask && o.callbackTask.phone === "(406) 941-2428");
})();

// ---- spam / solicitation are FILTERED (no lead created) ----
(() => {
  const spam = h.build({ subject: "New call from Robo Dialer", body: "NEW CALL FROM ROBO DIALER · SPAM\nTHE LEAD\nROBO DIALER\n(000) 000-0000" }, NOW);
  ok("spam => classification spam", spam.classification === "spam");
  ok("spam => NOT actionable", spam.actionable === false);
  ok("spam => no crmUpdate (no lead)", spam.crmUpdate === null);
  ok("spam => owner alert says filtered", /filtered/i.test(spam.ownerAlert));
  const sol = h.build({ subject: "New call from Ad Agency", body: "NEW CALL FROM AD AGENCY · SOLICITATION" }, NOW);
  ok("solicitation => not actionable", sol.classification === "solicitation" && sol.actionable === false);
})();

// ---- pre-parsed fields (a Zapier template) win over the raw parse ----
(() => {
  const o = h.build({ subject: SUBJECT, body: BODY, name: "Override Name", phone: "4065559999" }, NOW);
  ok("explicit name wins", o.name === "Override Name");
  ok("explicit phone wins", o.phone === "4065559999");
})();

// ---- classify() unit ----
(() => {
  ok("classify legitimate", h.classify("this is LEGITIMATE") === "legitimate");
  ok("classify spam", h.classify("marked as spam") === "spam");
  ok("classify solicitation", h.classify("Solicitation call") === "solicitation");
  ok("classify unknown default", h.classify("") === "unknown");
})();

// ---- graceful degrade: empty / junk body never throws, invents nothing ----
(() => {
  let threw = false, o = null;
  try { o = h.build({}, NOW); } catch { threw = true; }
  ok("empty: no throw", threw === false);
  ok("empty: draftOnly", o && o.draftOnly === true);
  ok("empty: name null (nothing invented)", o && o.name === null);
  ok("empty: phone null", o && o.phone === null);
})();

// ---- brand safety: parser echoes Hearth's copy but our generated alert adds no barred claims ----
(() => {
  const o = h.build({ subject: SUBJECT, body: BODY }, NOW);
  ok("owner alert: no guaranteed-savings claim", !/guarantee|save \$|\d+% off/i.test(o.ownerAlert));
  ok("owner alert: no mold-elimination claim", !/eliminat\w* mold|mold.free/i.test(o.ownerAlert));
})();

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
