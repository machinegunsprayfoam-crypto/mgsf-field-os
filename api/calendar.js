// Calendar — turn a job/appointment into a standards-valid iCalendar (.ics) entry the office can
// drop straight into Google/Apple/Outlook. Pure text generation, keyless, no npm. It never sends or
// books anything itself — it hands back the .ics; the outward "add to Google Calendar" push goes
// through the approval-gated arms (act.js → zap). This is the module the Scheduling/Dispatch mind
// reaches for when it says "calendar for scheduling entries."
//
// DOCTRINE: MGSF never schedules work/meetings on a SUNDAY (family time). A Sunday start is a hard
// refusal here — no override — so nothing downstream can quietly put a job on the Lord's day.
//
// POST { title, start, end?, location?, notes?, allDay? } -> { ok, ics, filename, dataUri, event }
// GET  -> shape + the Sunday rule.

function esc(s) { return String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n"); }
function slug(s) { return String(s || "event").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "event"; }
// RFC5545 line folding: fold long lines at 74 octets with CRLF + a leading space.
function fold(line) {
  if (line.length <= 74) return line;
  let out = line.slice(0, 74), rest = line.slice(74);
  while (rest.length) { out += "\r\n " + rest.slice(0, 73); rest = rest.slice(73); }
  return out;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?/;
const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function dayOfWeekUTC(isoDate) { return new Date(isoDate + "T00:00:00Z").getUTCDay(); } // 0 = Sunday
function addDaysISO(isoDate, days) { const d = new Date(isoDate + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
// ICS value + kind ("DATE" all-day or "DATE-TIME") for a start/end string.
function icsWhen(s) {
  if (DATE.test(s)) return { kind: "DATE", value: s.replace(/-/g, "") };
  if (DATETIME.test(s)) {
    const digits = s.replace(/[^\dT ]/g, "").replace(" ", "T");
    let d = digits.slice(0, 8), t = (digits.split("T")[1] || "").padEnd(6, "0").slice(0, 6);
    return { kind: "DATE-TIME", value: d + "T" + t + "Z" };
  }
  return null;
}

// Pure: build the .ics (and the event echo). `stampISO` is the caller's DTSTAMP (UTC ISO) so the
// core stays deterministic (no Date.now inside). Returns { ok:false, ... } on bad input or a Sunday.
function build(body, stampISO) {
  body = body || {};
  const title = String(body.title == null ? "" : body.title).trim();
  if (!title) return { ok: false, error: "need_title" };
  const startRaw = String(body.start == null ? "" : body.start).trim();
  const startWhen = icsWhen(startRaw);
  if (!startWhen) return { ok: false, error: "need_valid_start", note: "start must be YYYY-MM-DD or YYYY-MM-DDTHH:MM" };

  const startDate = startRaw.slice(0, 10);
  if (dayOfWeekUTC(startDate) === 0) {
    return { ok: false, blocked: "sunday", error: "sunday_not_allowed",
      note: "MGSF never schedules work or meetings on a Sunday (family time). Pick another day." };
  }

  // end: explicit, else all-day → +1 day (DATE), else datetime → +2h default.
  let endWhen = null, endRaw = String(body.end == null ? "" : body.end).trim();
  if (endRaw) { endWhen = icsWhen(endRaw); if (!endWhen) return { ok: false, error: "need_valid_end" }; }
  else if (startWhen.kind === "DATE") endWhen = icsWhen(addDaysISO(startDate, 1));
  else { const d = new Date(startWhen.value.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/, "$1-$2-$3T$4:$5:$6Z")); d.setUTCHours(d.getUTCHours() + 2); endWhen = { kind: "DATE-TIME", value: d.toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z" }; }

  const stamp = (stampISO || "1970-01-01T00:00:00Z").replace(/[-:]/g, "").slice(0, 15) + "Z";
  const uid = slug(title) + "-" + startWhen.value.replace(/[^\d]/g, "") + "@machinegunsprayfoam";
  const dtLine = (name, w) => w.kind === "DATE" ? `${name};VALUE=DATE:${w.value}` : `${name}:${w.value}`;

  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Machine Gun Spray Foam//Klyfton//EN",
    "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VEVENT",
    "UID:" + uid, "DTSTAMP:" + stamp,
    dtLine("DTSTART", startWhen), dtLine("DTEND", endWhen),
    "SUMMARY:" + esc(title),
  ];
  if (body.location) lines.push("LOCATION:" + esc(body.location));
  if (body.notes) lines.push("DESCRIPTION:" + esc(body.notes));
  lines.push("STATUS:CONFIRMED", "END:VEVENT", "END:VCALENDAR");
  const ics = lines.map(fold).join("\r\n") + "\r\n";

  return {
    ok: true, ics, filename: slug(title) + ".ics",
    dataUri: "data:text/calendar;charset=utf-8," + encodeURIComponent(ics),
    event: { title, start: startWhen.value, end: endWhen.value, allDay: startWhen.kind === "DATE", day: DOW[dayOfWeekUTC(startDate)], location: body.location || null },
    note: "Draft calendar entry for review — download the .ics or push it via the approval-gated arms. MGSF never auto-books.",
  };
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({ ok: true, configured: true,
      shape: { title: "", start: "YYYY-MM-DD or YYYY-MM-DDTHH:MM", end: "(optional)", location: "(optional)", notes: "(optional)" },
      rule: "Sunday starts are refused (MGSF family-time doctrine). Generates a standards-valid .ics; never books on its own." });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const stampISO = new Date().toISOString();
  try { res.status(200).json(build(body || {}, stampISO)); }
  catch (e) { res.status(200).json({ ok: false, error: String(e).slice(0, 140) }); }
};

module.exports.build = build;
module.exports.icsWhen = icsWhen;
module.exports.dayOfWeekUTC = dayOfWeekUTC;
