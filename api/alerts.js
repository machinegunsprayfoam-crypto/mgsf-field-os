// Alert Nerve — telepathy phase 1 (staged DARK 2026-08-04, Clifton-approved).
//
// The field-os grows a nerve: deterministic rules watch the REAL business data (leads,
// estimates — the same KV collections api/mcp.js reads) and text the OWNER when something
// crosses a line. No LLM calls, no fabrication — a rule either matches a real record or it
// stays silent. READ-ONLY over business data; the ONLY keys this module writes are its own
// alert:* namespace (log/seen/sent/queue/recent/last_check/selftest).
//
// Triggers (hybrid): (1) Vercel cron, daily 13:00 UTC → this endpoint, authenticated by
// header x-cron-secret === CRON_SECRET (401 + challenge on miss; a query-string secret is
// READ BY NOTHING — same posture as the reqlog query-secret scrub). (2) maybeRunAlerts(),
// a debounced (30 min via alert:last_check) fire-and-forget helper hosts may call; every
// error is logged + swallowed so it can NEVER break a host request.
//
// Delivery: Twilio REST via global fetch (no SDK). Recipient is ALWAYS the owner's env
// number — NEVER a phone found in store data (injection guard). Plainspoken copy ≤300
// chars, no emoji. >2 pending → ONE combined SMS ("+N more"). Cap 5 SMS/day. Quiet hours
// 21:00–06:00 MT queue for the next run. Sundays only a GOV_DEADLINE day-of may send
// (family time — house rule). Twilio unset → still evaluates, records to the alert:recent
// ring buffer, and answers sms:"not_configured" — honest, never claims sent when not sent.
//
// House rules honored: pure core (injected `now`, America/Denver calendar) + gated live
// layer; no npm deps; env names REUSED from .env.example (TWILIO_* trio + OWNER_SMS/
// ALERT_SMS_TO as the recipient, CRON_SECRET) — no new vars invented.

// ---- env (same scan pattern as mcp.js / sync.js) ----
function _kvEnv(suffixRe, excludeRe) {
  for (const k of Object.keys(process.env)) {
    if (excludeRe && excludeRe.test(k)) continue;
    if (suffixRe.test(k) && process.env[k]) return process.env[k];
  }
  return undefined;
}
const KV_URL = _kvEnv(/KV_REST_API_URL$/i) || _kvEnv(/REST_API_URL$/i) || _kvEnv(/UPSTASH_REDIS_REST_URL$/i);
const KV_TOKEN = _kvEnv(/KV_REST_API_TOKEN$/i, /READ_ONLY/i) || _kvEnv(/REST_API_TOKEN$/i, /READ_ONLY/i);
const KV_ON = !!(KV_URL && KV_TOKEN);
const PREFIX = "mgsf:";
const TOMB = "_tomb";

// Twilio — same resolution as api/notify.js (existing documented names, no new vars).
const TW_SID = process.env.TWILIO_ACCOUNT_SID || "";
const TW_TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
const TW_FROM = process.env.TWILIO_FROM || process.env.TWILIO_PHONE_NUMBER || "";
// Recipient: ALWAYS this env value. Store data NEVER supplies a recipient (injection guard).
const TW_TO = process.env.ALERT_SMS_TO || process.env.OWNER_SMS || "";
const SMS_ON = !!(TW_SID && TW_TOKEN && TW_FROM && TW_TO);

const DAY_MS = 86400000;
const CAP_PER_DAY = 5;
const RECENT_MAX = 200;

// ---- KV I/O (reads mirror mcp.js kvGet; writes touch ONLY alert:* keys) ----
async function kvRead(key) {
  // {ok, value} — ok:false = the READ ITSELF failed (network/HTTP), which is a STORE_NUMB
  // fact, distinct from "key absent" (ok:true, value:null).
  try {
    const r = await fetch(KV_URL + "/get/" + encodeURIComponent(key), { headers: { Authorization: "Bearer " + KV_TOKEN } });
    if (!r.ok) return { ok: false, value: null };
    const j = await r.json();
    if (!j || j.result == null) return { ok: true, value: null };
    try { return { ok: true, value: JSON.parse(j.result) }; } catch { return { ok: true, value: null }; }
  } catch { return { ok: false, value: null }; }
}
async function kvWrite(key, value) {
  if (!/^alert:/.test(key)) throw new Error("alerts.js writes only alert:* keys: " + key);
  try {
    await fetch(KV_URL + "/set/" + encodeURIComponent(key), {
      method: "POST",
      headers: { Authorization: "Bearer " + KV_TOKEN, "content-type": "application/json" },
      body: JSON.stringify(value),
    });
    return true;
  } catch { return false; }
}
async function readCollection(col) {
  const r = await kvRead(PREFIX + col);
  return { ok: r.ok, rows: Array.isArray(r.value) ? r.value : [] };
}

// ---- pure core: America/Denver calendar (injected now, no Date.now) ----
function denver(nowMs) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Denver", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short",
  }).formatToParts(new Date(nowMs));
  const g = (t) => ((parts.find((p) => p.type === t) || {}).value || "");
  return {
    y: +g("year"), m: +g("month"), d: +g("day"), hour: +g("hour"), minute: +g("minute"),
    weekday: g("weekday"), ymd: g("year") + "-" + g("month") + "-" + g("day"),
    yyyymmdd: g("year") + g("month") + g("day"),
  };
}
const isQuietHours = (dv) => dv.hour >= 21 || dv.hour < 6;
const isSunday = (dv) => dv.weekday === "Sun";

// Calendar-day distance from "today in Denver" to a YYYY-MM-DD date. Positive = future.
function daysUntil(ymd, dv) {
  const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const due = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const today = Date.UTC(dv.y, dv.m - 1, dv.d);
  return Math.round((due - today) / DAY_MS);
}
function fmtDate(ymd) {
  const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(ymd || "");
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()];
  return wd + " " + (+m[2]) + "/" + (+m[3]);
}

// ---- pure core: the RULES (deterministic functions over a snapshot + state) ----
const _day = (v) => String(v || "").slice(0, 10);
const _lc = (v) => String(v || "").trim().toLowerCase();
const _link = (r) => { const l = String((r && (r.link || r.url)) || "").trim(); return l ? " " + l : ""; };
const _name = (r) => String((r && (r.name || r.customer)) || "?").trim().slice(0, 60);
const sms = (s) => String(s).replace(/\s+/g, " ").trim().slice(0, 300);

const dueRe = /Due (\d{4}-\d{2}-\d{2})/;

// Urgency: lower = more urgent (sort key for batching "most urgent first").
const URGENCY = { "GOV_DEADLINE:dayof": 0, "STORE_NUMB:fail": 1, "GOV_DEADLINE:t3": 2, "NEW_LEAD_STALE:72h": 3, "GOV_DEADLINE:t10": 4, "ESTIMATE_AGING:d10": 5, "NEW_LEAD_STALE:24h": 6, "ESTIMATE_AGING:d5": 7 };

const logKey = (rule, id, tier) => "log:" + rule + ":" + id + ":" + tier;

// Which alert:* state keys an evaluation of this snapshot could consult. The live layer
// fetches exactly these (short names; "alert:" prefix added at the KV boundary).
function stateKeysFor(snapshot) {
  const keys = ["log:STORE_NUMB:store:fail"];
  for (const l of snapshot.leads || []) {
    if (!isNewLead(l)) continue;
    keys.push("seen:" + l.id, logKey("NEW_LEAD_STALE", l.id, "24h"), logKey("NEW_LEAD_STALE", l.id, "72h"));
    if (isGovDue(l)) keys.push(logKey("GOV_DEADLINE", l.id, "t10"), logKey("GOV_DEADLINE", l.id, "t3"), logKey("GOV_DEADLINE", l.id, "dayof"));
  }
  for (const e of snapshot.estimates || []) {
    if (_lc(e.status) !== "open") continue;
    keys.push(logKey("ESTIMATE_AGING", e.id, "d5"), logKey("ESTIMATE_AGING", e.id, "d10"));
  }
  return keys;
}
const isNewLead = (l) => _lc(l.status) === "new";
const isGovDue = (l) => _lc(l.service) === "government" && dueRe.test(String(l.notes || ""));

// Evaluate every rule. Pure: (snapshot, state, nowMs) → { alerts, logWrites, seenWrites }.
//  snapshot = { leads, estimates, storeError }   state = { log:{short→ISO}, seen:{id→ISO} }
// Tier ladders fire the MOST urgent eligible un-logged tier only, and log the less-urgent
// tiers with it — a late first evaluation sends ONE text, not the whole ladder.
function evaluate(snapshot, state, nowMs) {
  const dv = denver(nowMs);
  const nowIso = new Date(nowMs).toISOString();
  const alerts = [], logWrites = [], seenWrites = [];
  const fire = (rule, tier, id, message, extraLogTiers) => {
    alerts.push({ rule, tier, id: String(id), urgency: URGENCY[rule + ":" + tier], message: sms(message), at: nowIso });
    logWrites.push({ key: logKey(rule, id, tier), ts: nowIso });
    for (const t of extraLogTiers || []) logWrites.push({ key: logKey(rule, id, t), ts: nowIso });
  };
  const logged = (rule, id, tier) => !!state.log[logKey(rule, id, tier)];

  for (const l of snapshot.leads || []) {
    if (!isNewLead(l)) continue;

    // GOV_DEADLINE — service Government, status New, "Due YYYY-MM-DD" in notes.
    if (isGovDue(l)) {
      const due = String(l.notes).match(dueRe)[1];
      const n = daysUntil(due, dv);
      if (n != null && n >= 0) {
        const ladder = [
          { tier: "dayof", hit: n === 0, msg: "MGSF ALERT: " + _name(l) + " closes TODAY — " + fmtDate(due) + ". Status New." + _link(l), below: ["t3", "t10"] },
          { tier: "t3", hit: n <= 3, msg: "MGSF ALERT: " + _name(l) + " closes in " + n + " days — " + fmtDate(due) + ". Status New." + _link(l), below: ["t10"] },
          { tier: "t10", hit: n <= 10, msg: "MGSF ALERT: " + _name(l) + " closes in " + n + " days — " + fmtDate(due) + ". Status New." + _link(l), below: [] },
        ];
        for (const step of ladder) {
          if (!step.hit || logged("GOV_DEADLINE", l.id, step.tier)) continue;
          fire("GOV_DEADLINE", step.tier, l.id, step.msg, step.below);
          break;
        }
      }
    }

    // NEW_LEAD_STALE — first-seen bootstrap, then 24h / 72h tiers. The bootstrap run
    // writes alert:seen:<id> and does NOT count as stale (age starts at 0).
    const seen = state.seen[String(l.id)];
    if (!seen) { seenWrites.push(String(l.id)); continue; }
    const ageH = (nowMs - Date.parse(seen)) / 3600000;
    if (ageH >= 72 && !logged("NEW_LEAD_STALE", l.id, "72h")) {
      fire("NEW_LEAD_STALE", "72h", l.id, "MGSF ALERT: Lead " + _name(l) + " untouched 72h — still New. Call or close it." + _link(l), ["24h"]);
    } else if (ageH >= 24 && !logged("NEW_LEAD_STALE", l.id, "24h")) {
      fire("NEW_LEAD_STALE", "24h", l.id, "MGSF ALERT: Lead " + _name(l) + " sitting New 24h — nobody has touched it." + _link(l));
    }
  }

  // ESTIMATE_AGING — open estimates crossing 5, then 10 calendar days.
  for (const e of snapshot.estimates || []) {
    if (_lc(e.status) !== "open") continue;
    const d = daysUntil(_day(e.date || e.at), dv);
    if (d == null) continue;
    const open = -d; // date in the past → positive days open
    if (open >= 10 && !logged("ESTIMATE_AGING", e.id, "d10")) {
      fire("ESTIMATE_AGING", "d10", e.id, "MGSF ALERT: Estimate " + _name(e) + " open 10+ days — last call, chase or mark lost." + _link(e), ["d5"]);
    } else if (open >= 5 && !logged("ESTIMATE_AGING", e.id, "d5")) {
      fire("ESTIMATE_AGING", "d5", e.id, "MGSF ALERT: Estimate " + _name(e) + " open 5+ days with no answer — follow up." + _link(e));
    }
  }

  // STORE_NUMB — a store read failed during evaluation. One alert, max once per 24h
  // (this rule's log ts is a throttle, not a tombstone).
  if (snapshot.storeError) {
    const last = state.log[logKey("STORE_NUMB", "store", "fail")];
    if (!last || nowMs - Date.parse(last) >= 24 * 3600000) {
      fire("STORE_NUMB", "fail", "store", "MGSF ALERT: field-os store read FAILED during the alert sweep — flying blind on live data. Check KV/Vercel.");
    }
  }

  return { alerts, logWrites, seenWrites };
}

// ---- pure core: delivery planning (batching, cap, quiet hours, Sunday) ----
function combineSms(alerts) {
  const first = alerts[0].message;
  const more = " +" + (alerts.length - 1) + " more";
  return sms(first.slice(0, 300 - more.length) + more);
}
// (pending sorted most-urgent-first, ctx = {sentToday}, nowMs) → {send:[{body,covers}], queue:[alerts]}
function planDelivery(pending, ctx, nowMs) {
  const dv = denver(nowMs);
  if (!pending.length) return { send: [], queue: [] };
  if (isQuietHours(dv)) return { send: [], queue: pending.slice(), reason: "quiet_hours" };
  let eligible = pending, queue = [];
  if (isSunday(dv)) {
    eligible = pending.filter((a) => a.rule === "GOV_DEADLINE" && a.tier === "dayof");
    queue = pending.filter((a) => !(a.rule === "GOV_DEADLINE" && a.tier === "dayof"));
  }
  let capLeft = Math.max(0, CAP_PER_DAY - (ctx.sentToday || 0));
  const send = [];
  if (eligible.length > 2) {
    // more than 2 pending → ONE combined SMS, most urgent first, "+N more"
    if (capLeft >= 1) send.push({ body: combineSms(eligible), covers: eligible });
    else queue = queue.concat(eligible);
  } else {
    for (const a of eligible) {
      if (capLeft > 0) { send.push({ body: a.message, covers: [a] }); capLeft--; }
      else queue.push(a); // cap hit → queues, not sends
    }
  }
  return { send, queue };
}

const alertKey = (a) => a.rule + "|" + a.id + "|" + a.tier;
function dedupe(alerts) {
  const seen = new Set(), out = [];
  for (const a of alerts) { const k = alertKey(a); if (!seen.has(k)) { seen.add(k); out.push(a); } }
  return out;
}

// ---- live layer: Twilio REST (global fetch, no SDK) ----
async function sendSms(body) {
  // To is ALWAYS the owner's env number. No record field can ever steer this.
  const form = new URLSearchParams({ To: TW_TO, From: TW_FROM, Body: sms(body) });
  try {
    const r = await fetch("https://api.twilio.com/2010-04-01/Accounts/" + encodeURIComponent(TW_SID) + "/Messages.json", {
      method: "POST",
      headers: { Authorization: "Basic " + Buffer.from(TW_SID + ":" + TW_TOKEN).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    return { ok: r.ok };
  } catch { return { ok: false }; }
}

// ---- live layer: the sweep ----
async function runSweep(nowMs) {
  const dv = denver(nowMs);
  const nowIso = new Date(nowMs).toISOString();
  if (!KV_ON) return { ok: false, configured: false, hint: "Vercel KV not attached — nothing to watch yet.", sms: SMS_ON ? "configured" : "not_configured" };

  // 1) snapshot (same collections/liveRows semantics as api/mcp.js)
  const [leadsR, estR, tombR] = await Promise.all([readCollection("leads"), readCollection("estimates"), readCollection(TOMB)]);
  const storeError = !leadsR.ok || !estR.ok || !tombR.ok;
  const tset = new Set((tombR.rows || []).map((t) => t.c + "|" + String(t.id)));
  const live = (rows, col) => (rows || []).filter((r) => r && r.id != null && !tset.has(col + "|" + String(r.id)));
  const snapshot = { leads: live(leadsR.rows, "leads"), estimates: live(estR.rows, "estimates"), storeError };

  // 2) state for exactly the keys this snapshot could need
  const shortKeys = stateKeysFor(snapshot);
  const state = { log: {}, seen: {} };
  await Promise.all(shortKeys.map(async (k) => {
    const r = await kvRead("alert:" + k);
    if (r.value == null) return;
    if (k.startsWith("seen:")) state.seen[k.slice(5)] = r.value;
    else state.log[k] = r.value;
  }));

  // 3) evaluate (pure) + persist first-seen bootstraps and fire-logs (dedup)
  const { alerts, logWrites, seenWrites } = evaluate(snapshot, state, nowMs);
  await Promise.all(seenWrites.map((id) => kvWrite("alert:seen:" + id, nowIso)));
  await Promise.all(logWrites.map((w) => kvWrite("alert:" + w.key, w.ts)));

  // 4) ring buffer entry helper (always written — the honest trail even with no SMS)
  const recentR = await kvRead("alert:recent");
  const recent = Array.isArray(recentR.value) ? recentR.value : [];
  const record = (a, delivered) => recent.push({ at: nowIso, rule: a.rule, tier: a.tier, id: a.id, message: a.message, delivered });
  const summary = { ok: true, at: nowIso, denver: dv.ymd + " " + dv.weekday, fired: alerts.length, sent: 0, queued: 0, storeError, sms: SMS_ON ? "configured" : "not_configured" };

  if (!SMS_ON) {
    // Honest dark mode: evaluate + record, never claim sent, leave any old queue alone.
    for (const a of alerts) record(a, "not_configured");
    await kvWrite("alert:recent", recent.slice(-RECENT_MAX));
    return summary;
  }

  // 5) drain queue + merge this run's fires, most urgent first
  const queueR = await kvRead("alert:queue");
  const prior = Array.isArray(queueR.value) ? queueR.value : [];
  const pending = dedupe(prior.concat(alerts)).sort((a, b) => (a.urgency ?? 9) - (b.urgency ?? 9));

  // 6) self-test — once ever, first configured run (single-shot alert:selftest key)
  const dayKey = "alert:sent:" + dv.yyyymmdd;
  const sentR = await kvRead(dayKey);
  let sentToday = Number(sentR.value) || 0;
  const selftestR = await kvRead("alert:selftest");
  if (!selftestR.value) {
    const st = await sendSms("MGSF ALERT: nerve online — self-test");
    if (st.ok) { await kvWrite("alert:selftest", nowIso); sentToday++; summary.selftest = true; summary.sent++; }
  }

  // 7) plan + deliver
  const plan = planDelivery(pending, { sentToday }, nowMs);
  const requeue = plan.queue.slice();
  for (const s of plan.send) {
    const r = await sendSms(s.body);
    if (r.ok) { sentToday++; summary.sent++; for (const a of s.covers) record(a, true); }
    else { for (const a of s.covers) { requeue.push(a); record(a, false); } } // failed send: honest + retried next run
  }
  for (const a of plan.queue) record(a, "queued");

  await kvWrite(dayKey, sentToday);
  await kvWrite("alert:queue", dedupe(requeue).slice(0, 100));
  await kvWrite("alert:recent", recent.slice(-RECENT_MAX));
  summary.queued = requeue.length;
  return summary;
}

// ---- debounced helper for hosts (fire-and-forget; may NEVER break a host request) ----
async function maybeRunAlerts() {
  try {
    if (!KV_ON) return { skipped: "no_kv" };
    const now = Date.now();
    const last = await kvRead("alert:last_check");
    if (last.value && now - Date.parse(last.value) < 30 * 60000) return { skipped: "debounced" };
    await kvWrite("alert:last_check", new Date(now).toISOString());
    return await runSweep(now);
  } catch (e) {
    try { console.error("alerts.maybeRunAlerts (swallowed):", String((e && e.message) || e).slice(0, 200)); } catch {}
    return { ok: false, swallowed: true };
  }
}

// ---- endpoint ----
// Auth is HEADER-ONLY: x-cron-secret (or the Authorization bearer Vercel's cron sends).
// A ?secret= query value is deliberately read by nothing — secrets don't belong in URLs.
function cronAuthed(req) {
  const want = String(process.env.CRON_SECRET || "").trim();
  if (!want) return false; // no secret configured = closed, not open
  const h = (req && req.headers) || {};
  return String(h["x-cron-secret"] || "") === want || String(h["authorization"] || "") === "Bearer " + want;
}
function deny(res) {
  res.setHeader("WWW-Authenticate", 'Bearer realm="mgsf-alerts"');
  res.status(401).json({ error: "unauthorized" });
}

async function handler(req, res) {
  const h = (req && req.headers) || {};
  if (req.method === "GET") {
    // A cron/authed GET runs the sweep (Vercel crons GET); a bad credential is refused;
    // a plain GET is the public status probe (dormant-honest, no data).
    if (h["x-cron-secret"] || /^Bearer /.test(String(h["authorization"] || ""))) {
      if (!cronAuthed(req)) return deny(res);
      res.status(200).json(await runSweep(Date.now()));
      return;
    }
    res.status(200).json({ ok: true, nerve: "alerts", kv: KV_ON, sms: SMS_ON ? "configured" : "not_configured", auth_required: true });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  if (!cronAuthed(req)) return deny(res);
  res.status(200).json(await runSweep(Date.now()));
}

module.exports = handler;
module.exports.maybeRunAlerts = maybeRunAlerts;
module.exports.runSweep = runSweep;
// pure core (fixture-driven tests)
module.exports.evaluate = evaluate;
module.exports.planDelivery = planDelivery;
module.exports.stateKeysFor = stateKeysFor;
module.exports.denver = denver;
module.exports.daysUntil = daysUntil;
module.exports.combineSms = combineSms;
module.exports.dedupe = dedupe;
