#!/usr/bin/env node
// Calendar (api/calendar.js) — the .ics generator the Scheduling/Dispatch mind uses. Locks: valid
// iCalendar structure, all-day (DATE) vs timed (DATE-TIME) handling + default end, the SUNDAY hard
// refusal (MGSF family-time doctrine), RFC5545 escaping, and the input guards. Keyless, deterministic
// (DTSTAMP is injected). Run: node tests/calendar.js

const path = require("path");
const C = require(path.join(__dirname, "..", "api", "calendar.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }
const STAMP = "2026-08-07T12:00:00Z";

console.log("Calendar (.ics) generator\n");

// ---- day-of-week helper (2026-08-09 is a Sunday, 08-10 a Monday) ----
ok("dayOfWeekUTC: 2026-08-09 is Sunday (0)", C.dayOfWeekUTC("2026-08-09") === 0);
ok("dayOfWeekUTC: 2026-08-10 is Monday (1)", C.dayOfWeekUTC("2026-08-10") === 1);

// ---- SUNDAY hard refusal (doctrine) ----
{
  const r = C.build({ title: "Spray job", start: "2026-08-09" }, STAMP);
  ok("Sunday start ⇒ refused", r.ok === false && r.blocked === "sunday");
  ok("Sunday refusal explains why", /family/i.test(r.note || ""));
  const rt = C.build({ title: "Spray job", start: "2026-08-09T08:00" }, STAMP);
  ok("Sunday refusal also catches a timed Sunday", rt.ok === false && rt.blocked === "sunday");
}

// ---- timed event: valid VEVENT + default +2h end ----
{
  const r = C.build({ title: "Spray foam — TK Barn", start: "2026-08-10T09:00", location: "Glendive MT", notes: "Closed cell" }, STAMP);
  ok("weekday timed event ⇒ ok", r.ok === true && r.event.allDay === false && r.event.day === "Monday");
  ok("wraps in VCALENDAR/VEVENT", /^BEGIN:VCALENDAR/.test(r.ics) && r.ics.includes("BEGIN:VEVENT") && r.ics.trim().endsWith("END:VCALENDAR"));
  ok("uses CRLF line endings", r.ics.includes("\r\n"));
  ok("DTSTART is UTC date-time", /DTSTART:20260810T090000Z/.test(r.ics));
  ok("default end is +2h", /DTEND:20260810T110000Z/.test(r.ics));
  ok("SUMMARY + LOCATION present", /SUMMARY:Spray foam/.test(r.ics) && /LOCATION:Glendive MT/.test(r.ics));
  ok("carries a stable UID + injected DTSTAMP", /UID:[^\r\n]+@machinegunsprayfoam/.test(r.ics) && /DTSTAMP:20260807T120000Z/.test(r.ics));
  ok("returns a filename + data URI", /\.ics$/.test(r.filename) && r.dataUri.indexOf("data:text/calendar") === 0);
  ok("never claims it booked anything", /never auto-book/i.test(r.note));
}

// ---- all-day event: DATE value + end = next day ----
{
  const r = C.build({ title: "Site visit", start: "2026-08-10" }, STAMP);
  ok("date-only ⇒ all-day", r.ok === true && r.event.allDay === true);
  ok("all-day DTSTART uses VALUE=DATE", /DTSTART;VALUE=DATE:20260810/.test(r.ics));
  ok("all-day DTEND is the next day", /DTEND;VALUE=DATE:20260811/.test(r.ics));
}

// ---- RFC5545 escaping ----
{
  const r = C.build({ title: "Bid; foam, roof", start: "2026-08-10", notes: "line1\nline2" }, STAMP);
  ok("semicolons/commas in SUMMARY are escaped", /SUMMARY:Bid\\;\s?foam\\,\s?roof/.test(r.ics.replace(/\r\n /g, "")) || /SUMMARY:Bid\\; foam\\, roof/.test(r.ics));
  ok("newline in DESCRIPTION becomes \\n", /DESCRIPTION:line1\\nline2/.test(r.ics));
}

// ---- input guards ----
ok("missing title ⇒ error", C.build({ start: "2026-08-10" }, STAMP).ok === false);
ok("garbage start ⇒ error", C.build({ title: "x", start: "not-a-date" }, STAMP).ok === false);
ok("icsWhen: date vs date-time", C.icsWhen("2026-08-10").kind === "DATE" && C.icsWhen("2026-08-10T09:00").kind === "DATE-TIME");

console.log("\n" + (fail ? "✗ " : "✓ ") + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
