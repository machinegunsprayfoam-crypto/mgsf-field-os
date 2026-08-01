#!/usr/bin/env node
// Customer portal (api/portal.js) — customer-facing, read-only, token-gated. The security-critical guard
// is that safeView is a strict ALLOWLIST: no cost/material/labor/margin/gm/overhead/internal-notes/source/
// other-customer data can ever leave, even when the source record is loaded with all of it. Also covers
// the HMAC token derivation/verify (unguessable, deterministic, tamper-evident) and the plain-English
// status mapping. Run: `node tests/portal.js`. Deterministic, keyless, no network.

const path = require("path");
const P = require(path.join(__dirname, "..", "api", "portal.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

console.log("Customer portal (token-gated, allowlist-projected)\n");

const SECRET = "test-portal-secret-abc";

// ---- token derivation + verify ----
(() => {
  const t = P.tokenFor(101, SECRET);
  ok("tokenFor → 24-char hex", /^[0-9a-f]{24}$/.test(t), t);
  ok("tokenFor deterministic (same id+secret)", P.tokenFor(101, SECRET) === t);
  ok("different id → different token", P.tokenFor(102, SECRET) !== t);
  ok("different secret → different token", P.tokenFor(101, "other-secret") !== t);
  ok("no secret → empty token (dormant-safe)", P.tokenFor(101, "") === "");
  ok("verify accepts the real token", P.verify(101, t, SECRET));
  ok("verify rejects a tampered token", !P.verify(101, t.slice(0, -1) + (t.slice(-1) === "a" ? "b" : "a"), SECRET));
  ok("verify rejects token for a different id", !P.verify(999, t, SECRET));
  ok("verify rejects empty token", !P.verify(101, "", SECRET));
})();

// ---- SECURITY: safeView is an allowlist — internal data must NEVER leak ----
(() => {
  const record = {
    id: 101, customer: "Dane Oasis", name: "Dane Oasis", service: "SPF roofing", status: "scheduled",
    date: "2026-08-14", scheduled: "2026-08-14", value: 118500, lastEstimate: 118500,
    // everything below is INTERNAL and must NOT appear in the view:
    material: 35682, labor: 12000, equipment: 3000, other: 500, cost: 51182, margin: 0.55, gm: 0.55,
    overhead: 6000, notes: "customer haggled; floor is 45%", source: "Estimator", laborRate: 80,
    internalMemo: "watch this one", competitorBid: 99000,
  };
  const v = P.safeView(record);
  const blob = JSON.stringify(v).toLowerCase();
  ["material", "labor", "equipment", "cost", "margin", "overhead", "35682", "12000", "51182", "0.55",
    "haggled", "floor is 45", "competitor", "99000", "internalmemo", "watch this one", "estimator", "80"]
    .forEach((leak) => ok("safeView does NOT leak \"" + leak + "\"", blob.indexOf(String(leak).toLowerCase()) < 0));
  // and it DOES carry the safe, customer-facing fields
  ok("safeView shows the customer name", v.customer === "Dane Oasis");
  ok("safeView shows plain-English status", v.status === "Your job is scheduled");
  ok("safeView shows the scheduled date", v.scheduled === "2026-08-14");
  ok("safeView shows the quote (sell value they were given)", v.quote === 118500);
  ok("safeView shows the company + contact", /Machine Gun/.test(v.company) && v.contact.phone === "406-939-8301");
  ok("safeView never emits the raw record id", blob.indexOf("\"id\"") < 0 && v.id === undefined);
})();

// ---- quote is the SELL value, never a cost fallback ----
(() => {
  const v = P.safeView({ customer: "X", material: 5000, labor: 2000 });   // no value/lastEstimate
  ok("no sell value → quote is null (never falls back to a cost)", v.quote === null);
})();

// ---- status labels ----
ok("status: estimate sent → customer-friendly", P.statusLabel("Estimate Sent") === "Your quote is ready to review");
ok("status: paid → thank-you", /Paid in full/.test(P.statusLabel("paid")));
ok("status: unknown → title-cased, never blank", P.statusLabel("weird stage") === "Weird Stage");
ok("status: empty → sensible default", P.statusLabel("") === "In progress");

// ---- awaiting-signature surfacing ----
(() => {
  const v = P.safeView({ customer: "X", value: 1000, signatures: [{ name: "Proposal", status: "signed" }, { name: "JSA", status: "pending" }] });
  ok("awaitingSignature lists only unsigned docs", JSON.stringify(v.awaitingSignature) === JSON.stringify(["JSA"]));
})();

// ---- matchByToken: finds the right record, rejects everything else ----
(() => {
  const recs = [{ id: 1, customer: "A", value: 100 }, { id: 2, customer: "B", value: 200 }, { id: 3, customer: "C", value: 300 }];
  const t2 = P.tokenFor(2, SECRET);
  const hit = P.matchByToken(recs, t2, SECRET);
  ok("matchByToken finds the record whose id derives the token", hit && hit.customer === "B");
  ok("matchByToken returns null for a token from no record", P.matchByToken(recs, P.tokenFor(999, SECRET), SECRET) === null);
  ok("matchByToken returns null under a wrong secret", P.matchByToken(recs, t2, "wrong-secret") === null);
  ok("matchByToken returns null for empty token", P.matchByToken(recs, "", SECRET) === null);
})();

// ---- linkFor builds a shareable url with the token ----
(() => {
  const l = P.linkFor(101, SECRET, "https://app.example.com");
  ok("linkFor returns token + url", l && l.token === P.tokenFor(101, SECRET) && /portal\.html\?token=/.test(l.url));
  ok("linkFor url carries the token", l.url.endsWith(l.token));
})();

console.log("\n" + (fail ? "✗ " : "✓ ") + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
