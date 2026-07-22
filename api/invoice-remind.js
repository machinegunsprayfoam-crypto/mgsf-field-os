// Invoice reminder sweep — finds unpaid invoices that are due/overdue and DRAFTS a reminder for
// each, with the tone escalating by how late it is. It never sends and never charges — every
// message is a draft a human fires (golden rule: no auto-send of outward truth).
//
// Two ways to feed it invoices:
//   A) POST { invoices:[{id,customer,amount,due,email,phone,status}], asOf } — score a supplied list
//   B) GET /api/invoice-remind?sweep=1 — read the app's invoices from the same KV store the app
//      syncs to, and draft reminders for the overdue ones.
// No npm, global fetch only. Amounts/dates are caller data — we never invent a balance.

// ---- KV access (same store + mgsf: prefix as api/sync.js / api/samgov.js) ----
function _kvEnv(suffixRe, excludeRe) {
  for (const k of Object.keys(process.env)) { if (excludeRe && excludeRe.test(k)) continue; if (suffixRe.test(k) && process.env[k]) return process.env[k]; }
  return undefined;
}
const KV_URL = _kvEnv(/KV_REST_API_URL$/i) || _kvEnv(/REST_API_URL$/i) || _kvEnv(/UPSTASH_REDIS_REST_URL$/i);
const KV_TOKEN = _kvEnv(/KV_REST_API_TOKEN$/i, /READ_ONLY/i) || _kvEnv(/REST_API_TOKEN$/i, /READ_ONLY/i);
const KV_ON = !!(KV_URL && KV_TOKEN);
async function kvGet(col) {
  try {
    const r = await fetch(KV_URL + "/get/" + encodeURIComponent("mgsf:" + col), { headers: { Authorization: "Bearer " + KV_TOKEN } });
    if (!r.ok) return [];
    const j = await r.json(); if (!j || j.result == null) return [];
    const p = JSON.parse(j.result); return Array.isArray(p) ? p : [];
  } catch { return []; }
}

function num(v, d) { const n = parseFloat(v); return Number.isFinite(n) ? n : d; }
function clean(s, max) { return String(s == null ? "" : s).trim().slice(0, max || 120); }
function money(n) { return "$" + (Math.round(num(n, 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function daysBetween(a, b) { return Math.floor((a - b) / 86400000); }

// Tone ladder by days overdue. Never threatening — just clearer each step.
function tierFor(daysLate) {
  if (daysLate < 0) return { tier: "upcoming", label: "Due soon" };
  if (daysLate <= 7) return { tier: "gentle", label: "Friendly nudge" };
  if (daysLate <= 30) return { tier: "firm", label: "Firm reminder" };
  return { tier: "final", label: "Final notice (call)" };
}

function draftFor(inv, asOf) {
  const customer = clean(inv.customer || inv.name, 80);
  const fn = (customer.split(/\s+/)[0]) || "there";
  const amount = num(inv.amount ?? inv.total ?? inv.value, 0);
  const dueRaw = clean(inv.due || inv.dueDate || inv.date, 20);
  const dueMs = Date.parse(dueRaw);
  const hasDue = Number.isFinite(dueMs);
  const daysLate = hasDue ? daysBetween(asOf, dueMs) : 0;
  const { tier, label } = tierFor(daysLate);
  const idTxt = clean(inv.id || inv.number, 24);
  const co = "Machine Gun Spray Foam";

  let sms, subject, emailBody;
  const amt = money(amount);
  const invRef = idTxt ? ` (invoice ${idTxt})` : "";

  if (tier === "upcoming") {
    sms = `Hi ${fn}, quick heads-up from ${co}: your balance of ${amt}${invRef} is coming due ${dueRaw}. Thanks!`;
    subject = `${co}: invoice coming due`;
    emailBody = `${fn},\n\nJust a friendly heads-up that your balance of ${amt}${invRef} is due ${dueRaw}. ` +
      `No action needed if it's already on the way — thanks for your business.\n\n${co}`;
  } else if (tier === "gentle") {
    sms = `Hi ${fn}, ${co} here — your ${amt} balance${invRef} came due ${dueRaw}. Mind squaring it up when you get a sec? Thanks!`;
    subject = `${co}: quick reminder on your balance`;
    emailBody = `${fn},\n\nHope the work's holding up great. Your balance of ${amt}${invRef} came due ${dueRaw}. ` +
      `Whenever you get a minute, we'd appreciate you squaring it up. If it's already handled, ignore this.\n\n${co}`;
  } else if (tier === "firm") {
    sms = `${fn}, this is ${co}. Your ${amt} balance${invRef} is now ${daysLate} days past due. Please take care of it or call us to work it out.`;
    subject = `${co}: ${amt} balance ${daysLate} days past due`;
    emailBody = `${fn},\n\nOur records show ${amt}${invRef} is now ${daysLate} days past due (due ${dueRaw}). ` +
      `Please arrange payment, or call us so we can work something out. We'd rather sort it than let it sit.\n\n${co}`;
  } else {
    sms = `${fn}, ${co}: ${amt}${invRef} is ${daysLate} days overdue. This is a final reminder before next steps — please call us today.`;
    subject = `${co}: FINAL reminder — ${amt} overdue`;
    emailBody = `${fn},\n\nThis is a final reminder that ${amt}${invRef} is ${daysLate} days overdue (due ${dueRaw}). ` +
      `Please call us today to resolve it before we consider next steps. We want to keep this simple for both of us.\n\n${co}`;
  }

  return {
    invoiceId: idTxt || null,
    customer, amount, amountFmt: amt, due: dueRaw, daysLate: hasDue ? daysLate : null,
    tier, tierLabel: label,
    draft: {
      sms: { to: clean(inv.phone, 20) || null, text: sms, chars: sms.length },
      email: { to: clean(inv.email, 80) || null, subject, body: emailBody },
    },
  };
}

function sweep(invoices, asOf) {
  // "settled" words — but guard against 'unpaid'/'not paid'/'past due' where 'paid'/'due'
  // appears as a substring (the bug: /paid/ matched 'unPAID').
  const settledRe = /paid|closed|complete|settled|void|cancel/i;
  const notSettledRe = /unpaid|not\s*paid|past\s*due|over\s*due|open|outstanding/i;
  const drafts = [];
  for (const inv of Array.isArray(invoices) ? invoices : []) {
    if (!inv) continue;
    const status = clean(inv.status, 20);
    if (status && settledRe.test(status) && !notSettledRe.test(status)) continue;   // skip settled invoices
    const amount = num(inv.amount ?? inv.total ?? inv.value, 0);
    if (amount <= 0) continue;                                  // nothing owed
    const dueMs = Date.parse(clean(inv.due || inv.dueDate || inv.date, 20));
    const daysLate = Number.isFinite(dueMs) ? daysBetween(asOf, dueMs) : 0;
    if (daysLate < -3) continue;                                // not due for a while — leave it
    drafts.push(draftFor(inv, asOf));
  }
  // Most overdue first — that's where the money's at risk.
  drafts.sort((a, b) => (b.daysLate ?? -999) - (a.daysLate ?? -999));
  return drafts;
}

module.exports = async (req, res) => {
  const asOf = Date.parse((req.query && clean(req.query.asOf, 20)) || "") || Date.now();

  if (req.method === "GET") {
    if (req.query && String(req.query.sweep) === "1") {
      if (!KV_ON) { res.status(200).json({ ok: false, error: "kv_not_attached" }); return; }
      try {
        const invoices = await kvGet("invoices");
        const drafts = sweep(invoices, asOf);
        res.status(200).json({ ok: true, draftOnly: true, scanned: invoices.length, drafts: drafts.length, reminders: drafts });
      } catch (e) { res.status(200).json({ ok: false, error: String(e).slice(0, 140) }); }
      return;
    }
    res.status(200).json({ ok: true, configured: true, draftOnly: true, autoSweep: KV_ON,
      note: "POST { invoices:[...] } to draft, or GET ?sweep=1 to draft from the app's invoices. Never auto-sends." });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  try {
    const list = Array.isArray(body.invoices) ? body.invoices : (Array.isArray(body) ? body : []);
    const drafts = sweep(list, Date.parse(clean(body.asOf, 20)) || asOf);
    res.status(200).json({ ok: true, draftOnly: true, scanned: list.length, drafts: drafts.length, reminders: drafts });
  } catch (e) { res.status(200).json({ ok: false, error: String(e).slice(0, 140) }); }
};

module.exports.sweep = sweep;
module.exports.draftFor = draftFor;
