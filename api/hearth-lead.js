// Hearth lead receiver — Hearth (gethearth.com) is MGSF's AI receptionist AND financing partner;
// it answers calls and emails the owner from noreply@gethearth.com a richly-structured "New call
// from <name>" notification: the lead (name/phone/town), a classification (Legitimate/Solicitation/
// Spam), urgency, "appointment requested", call duration + summary, THE JOB (type + description),
// qualifying Q&A (incl. service address), and a SUGGESTED NEXT MOVE. This receiver parses that email
// SERVER-SIDE (so the fragile part lives in tested code, not a Zapier template) into a structured,
// CRM-ready lead + owner alert + suggested next move. Legitimate → actionable lead; Solicitation/Spam
// → flagged and NOT turned into a lead. Draft/report only: it structures + SUGGESTS, never writes the
// CRM or messages anyone itself, and NEVER invents a field (missing → null). No keys required to parse.
//
// POST { subject, body }            -> parses the raw Hearth email
// POST { name, phone, service, ... } -> also accepts already-parsed fields (a Zapier template) — those win
// GET  ?event=1 &subject=...&body=.. -> parse + fire webhook
// GET  (no query) -> shape.

function _kvEnv(suffixRe, excludeRe) {
  for (const k of Object.keys(process.env)) { if (excludeRe && excludeRe.test(k)) continue; if (suffixRe.test(k) && process.env[k]) return process.env[k]; }
  return undefined;
}
const WEBHOOK = process.env.ALERTS_WEBHOOK_URL || process.env.NOTIFY_WEBHOOK_URL || "";
const SECRET = process.env.WEBHOOK_SECRET || process.env.ALERTS_WEBHOOK_SECRET || "";
async function fireWebhook(event, message, extra) {
  if (!WEBHOOK) return false;
  try {
    const payload = Object.assign({ event, message, at: new Date().toISOString() }, extra || {});
    if (SECRET) payload.token = SECRET;
    const hdrs = { "content-type": "application/json", "x-klyfton-event": event };
    if (SECRET) hdrs["x-klyfton-token"] = SECRET;
    const r = await fetch(WEBHOOK, { method: "POST", headers: hdrs, body: JSON.stringify(payload) });
    return r.ok;
  } catch { return false; }
}

function clean(s, max) { return String(s == null ? "" : s).trim().slice(0, max || 200); }
function pick(o, aliases) {
  if (!o || typeof o !== "object") return "";
  const lower = {}; for (const k of Object.keys(o)) lower[k.toLowerCase()] = o[k];
  for (const a of aliases) { const v = lower[a.toLowerCase()]; if (v != null && String(v).trim() !== "") return v; }
  return "";
}

// HTML → text, entity-decode the common ones, normalize whitespace (keep line breaks as anchors).
function toText(s) {
  return String(s == null ? "" : s)
    .replace(/<\s*(br|\/p|\/div|\/tr|\/h[1-6]|\/td)\s*[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&#39;|&rsquo;|&apos;/g, "'")
    .replace(/&quot;/g, '"').replace(/&mdash;/g, "—").replace(/&middot;|&#183;/g, "·")
    .replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/[ \t]*\n[ \t]*/g, "\n").replace(/\n{2,}/g, "\n").trim();
}
// Grab the text between a start label and the first of the end labels (or end of text).
function section(text, start, ends) {
  const re = new RegExp(start, "i");
  const m = re.exec(text); if (!m) return "";
  let rest = text.slice(m.index + m[0].length);
  let cut = rest.length;
  for (const e of ends) { const em = new RegExp(e, "i").exec(rest); if (em && em.index < cut) cut = em.index; }
  return rest.slice(0, cut).trim();
}
function firstLine(s) { return clean((String(s || "").split("\n").find((l) => l.trim() !== "") || ""), 120); }
function phoneOf(s) { const m = String(s || "").match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/); return m ? m[0].trim() : ""; }

// Classify Hearth's own label. Legitimate → real lead; Solicitation/Spam → filtered (not a lead).
function classify(text) {
  const s = String(text || "").toLowerCase();
  if (/\bspam\b/.test(s)) return "spam";
  if (/solicitation|unsolicited/.test(s)) return "solicitation";
  if (/legitimate/.test(s)) return "legitimate";
  return "unknown";
}

// Pure: parse a raw Hearth "New call from …" email (subject + body) into structured fields.
function parseHearthEmail(subject, rawBody) {
  const subj = clean(subject, 160);
  const body = toText(rawBody);
  const all = (subj + "\n" + body);

  const nameFromSubj = (subj.match(/new call from\s+(.+)$/i) || [])[1] || "";
  const lead = section(body, "THE LEAD", ["CALL DETAILS", "THE JOB", "QUALIFYING", "SUGGESTED NEXT MOVE"]);
  const name = clean(nameFromSubj || firstLine(lead), 80);

  const phone = phoneOf(lead) || phoneOf(body);
  // City sits after the phone on the same line: "(406) 941-2428 · Glendive"
  const cityLine = (lead.split("\n").find((l) => phoneOf(l)) || "");
  const city = clean(((cityLine.split(/·|\|/)[1]) || "").trim(), 60);

  const classification = classify(all.slice(0, 400)) === "unknown" ? classify(all) : classify(all.slice(0, 400));
  const urgency = clean(((all.match(/\b(low|medium|high)\s+urgency/i) || [])[1] || ""), 10).toLowerCase();
  const appointmentRequested = /appointment requested/i.test(all);

  const duration = clean(((section(body, "Duration", ["Summary", "THE JOB"])).match(/\d+\s*m(?:\s*\d+\s*s)?|\d+\s*s|\d+:\d+/i) || [])[0] || "", 20);
  const summary = clean(section(body, "Summary", ["THE JOB", "QUALIFYING", "SUGGESTED NEXT MOVE"]), 800);

  const jobBlk = section(body, "THE JOB", ["QUALIFYING", "SUGGESTED NEXT MOVE"]);
  const jobType = firstLine(jobBlk);
  const jobDescription = clean(jobBlk.split("\n").slice(1).join(" ").trim(), 400);

  const address = clean(((all.match(/Address:\s*([^\n]+)/i) || [])[1] || "").replace(/\s{2,}/g, " ").trim(), 160);

  const moveBlk = section(body, "SUGGESTED NEXT MOVE", ["View Activity", "Notifications from Hearth", "Unsubscribe"]);
  const nextMove = firstLine(moveBlk);
  const nextMovePriority = clean(((moveBlk.match(/\b(low|medium|high)\b/i) || [])[1] || ""), 10).toLowerCase();

  return { name, phone, city, classification, urgency, appointmentRequested, duration, summary,
    jobType, jobDescription, address, nextMove, nextMovePriority };
}

function build(input, nowMs) {
  input = input || {};
  // Prefer explicit pre-parsed fields (a Zapier template); else parse the raw email.
  const parsed = parseHearthEmail(pick(input, ["subject", "title"]), pick(input, ["body", "text", "html", "plaintextBody", "htmlBody", "message"]));
  const g = (k, aliases) => clean(pick(input, aliases) || parsed[k], 200);

  const name = clean(pick(input, ["name", "customer", "caller", "lead", "contact"]) || parsed.name, 80);
  const phone = clean(pick(input, ["phone", "phone_number", "callback", "number"]) || parsed.phone, 20);
  const city = g("city", ["city", "town", "location"]);
  const address = g("address", ["address", "service_address", "serviceAddress"]);
  const service = clean(pick(input, ["service", "job", "job_type", "jobType"]) || parsed.jobType, 80);
  const jobDescription = clean(pick(input, ["description", "job_description", "jobDescription", "details"]) || parsed.jobDescription, 400);
  const summary = clean(pick(input, ["summary", "call_summary"]) || parsed.summary, 800);
  const classification = classify(pick(input, ["classification", "category", "status"]) || parsed.classification || "");
  const urgency = clean(pick(input, ["urgency"]) || parsed.urgency, 10).toLowerCase();
  const appointmentRequested = /^(1|true|yes)$/i.test(String(pick(input, ["appointment_requested", "appointmentRequested"]))) || parsed.appointmentRequested === true;
  const nextMove = clean(pick(input, ["next_move", "nextMove", "suggested"]) || parsed.nextMove, 120);
  const nextMovePriority = clean(pick(input, ["priority", "next_move_priority"]) || parsed.nextMovePriority, 10).toLowerCase();
  const duration = clean(pick(input, ["duration"]) || parsed.duration, 20);

  const actionable = classification === "legitimate" || classification === "unknown"; // filter spam/solicitation only
  const who = name || phone || "A caller";
  const svcBit = service ? ` — ${service}` : "";
  const locBit = city ? ` (${city})` : "";

  let ownerAlert;
  if (classification === "spam" || classification === "solicitation") {
    ownerAlert = `🛈 Hearth filtered a ${classification} call${name ? " from " + name : ""} — no action needed.`;
  } else {
    const apptBit = appointmentRequested ? " · APPOINTMENT REQUESTED" : "";
    const moveBit = nextMove ? ` Next: ${nextMove}${nextMovePriority ? " (" + nextMovePriority + ")" : ""}.` : "";
    ownerAlert = `📞 NEW LEAD via Hearth — ${who}${svcBit}${locBit}${apptBit}.${moveBit} Call to book the site visit.`;
  }

  const crmUpdate = actionable ? {
    action: "suggest",
    match: { name: name || null, phone: phone || null },
    lead: { name: name || null, phone: phone || null, city: city || null, address: address || null,
      service: service || null, description: jobDescription || null, source: "Hearth (AI receptionist)" },
    priority: (nextMovePriority === "high" || appointmentRequested) ? "high" : (urgency === "high" ? "high" : "normal"),
    stageHint: appointmentRequested ? "Site Visit Requested" : "New Lead",
    note: "Qualified lead from Hearth. Draft only — owner/arms approve any CRM write.",
  } : null;

  const callbackTask = actionable ? {
    title: `Call back ${name || phone || "Hearth lead"} — book site visit`,
    due: "within the hour",
    phone: phone || null,
    note: nextMove ? ("Hearth suggested: " + nextMove) : "Qualified inbound lead — call to schedule the estimate.",
  } : null;

  return {
    ok: true, draftOnly: true, source: "hearth", emailType: "call_lead",
    actionable, classification: classification || "unknown",
    name: name || null, phone: phone || null, city: city || null, address: address || null,
    service: service || null, jobDescription: jobDescription || null, summary: summary || null,
    urgency: urgency || null, appointmentRequested, duration: duration || null,
    nextMove: nextMove || null, nextMovePriority: nextMovePriority || null,
    ownerAlert, crmUpdate, callbackTask,
  };
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    const q = req.query || {};
    if (String(q.event) === "1") {
      try {
        const out = build(q, Date.now());
        const notified = await fireWebhook("hearth_lead", out.ownerAlert,
          { name: out.name, phone: out.phone, city: out.city, service: out.service, classification: out.classification, actionable: out.actionable });
        out.notified = notified;
        res.status(200).json(out);
      } catch (e) { res.status(200).json({ ok: false, error: String(e).slice(0, 140) }); }
      return;
    }
    res.status(200).json({ ok: true, configured: true, draftOnly: true, webhook: !!WEBHOOK,
      note: "POST a Hearth 'New call from …' email as { subject, body } (raw — parsed server-side) or as already-parsed fields (name, phone, service, city, address, classification, …). Returns a structured CRM-ready lead + owner alert + suggested next move. Legitimate = actionable; Solicitation/Spam are filtered. GET ?event=1&subject=..&body=.. also fires the webhook. Never writes the CRM or messages anyone on its own." });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = { body: body }; } }
  body = body || {};
  try { res.status(200).json(build(body, Date.now())); }
  catch (e) { res.status(200).json({ ok: false, error: String(e).slice(0, 140) }); }
};

module.exports.build = build;
module.exports.parseHearthEmail = parseHearthEmail;
module.exports.classify = classify;
