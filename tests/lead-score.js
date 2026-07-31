#!/usr/bin/env node
// Lead-score invariants — deterministic heuristic priority. Run: `node tests/lead-score.js`
//
// Pure function score(lead): assert territory/reachability/intent/source signals move the
// score the right direction, bands map correctly, dead statuses cap low, and it never
// throws on junk. No fabrication: only reads real lead fields. Keyless, deterministic.

const path = require("path");
const L = require(path.join(__dirname, "..", "api", "lead-score.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

console.log("Lead-score invariants — deterministic heuristic priority\n");

const base = { name: "Test", phone: "406-555-1234", email: "a@b.com", state: "MT", service: "spray foam insulation", city: "Glendive", source: "referral", message: "Need my shop sprayed, 2400 sqft metal building" };

// ---- a strong in-territory lead scores hot ----
(() => {
  const r = L.score(base);
  ok("strong lead ⇒ hot (>=75)", r.band === "hot" && r.score >= 75, JSON.stringify(r.score));
  ok("reasons explain the score", Array.isArray(r.reasons) && r.reasons.length >= 4);
  ok("in-territory reason present", r.reasons.some((x) => /territory/.test(x.signal)));
})();

// ---- territory drives a big swing ----
(() => {
  const inMT = L.score({ ...base, state: "MT" }).score;
  const outFL = L.score({ ...base, state: "FL" }).score;
  ok("in-territory > out-of-territory", inMT > outFL, inMT + " vs " + outFL);
  ok("out-of-area penalty noted", L.score({ ...base, state: "FL" }).reasons.some((x) => /outside/.test(x.signal)));
})();

// ---- reachability matters ----
(() => {
  const withPhone = L.score(base).score;
  const noPhone = L.score({ ...base, phone: "" }).score;
  ok("callable phone > no phone", withPhone > noPhone, withPhone + " vs " + noPhone);
  ok("bad phone flagged", L.score({ ...base, phone: "12" }).reasons.some((x) => /no callable phone/.test(x.signal)));
})();

// ---- service recognition ----
ok("known service line credited", L.score(base).reasons.some((x) => /known service line/.test(x.signal)));
ok("unknown service ⇒ no service credit", !L.score({ ...base, service: "asdf qwer", message: "" }).reasons.some((x) => /known service line/.test(x.signal)));

// ---- source quality ordering ----
(() => {
  const ref = L.score({ ...base, source: "referral" }).score;
  const paid = L.score({ ...base, source: "facebook ad" }).score;
  const cold = L.score({ ...base, source: "purchased list" }).score;
  ok("referral >= paid >= cold", ref >= paid && paid >= cold, [ref, paid, cold].join(","));
})();

// ---- dead status caps low regardless of other signals ----
(() => {
  const r = L.score({ ...base, status: "lost" });
  ok("dead status caps <=10", r.score <= 10, r.score);
  ok("dead status ⇒ cold band", r.band === "cold");
  ok("cap reason recorded", r.reasons.some((x) => /status marked/.test(x.signal)));
})();

// ---- bands + bounds ----
(() => {
  const empty = L.score({});
  ok("empty lead ⇒ scored, not thrown", typeof empty.score === "number");
  ok("score bounded 0..100", empty.score >= 0 && empty.score <= 100);
  ok("state sniffed from city text", L.score({ phone: "4065551234", city: "Billings MT" }).reasons.some((x) => /territory/.test(x.signal)));
})();

// ---- resilience: junk input never throws ----
ok("null ⇒ no throw", (() => { try { L.score(null); return true; } catch (e) { return false; } })());
ok("weird types ⇒ no throw", (() => { try { L.score({ phone: 4065551234, state: 5, service: null }); return true; } catch (e) { return false; } })());

// ---- hubspot-sync threshold alignment (score>=75 ⇒ IN_PROGRESS) ----
ok("hot threshold aligns with hubspot-sync (>=75)", L.score(base).score >= 75);

console.log("\n" + (fail ? "✗" : "✓") + " " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
