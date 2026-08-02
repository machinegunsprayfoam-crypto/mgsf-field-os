#!/usr/bin/env node
// Subcontractor roster — pure compliance-readiness core of api/subs.js. Run: `node tests/subs.js`.
// Deterministic, keyless, no network (nowMs injected). Covers per-doc status + expiry boundaries,
// overall readiness (ready/expiring/blocked), the roster expiring-sweep ordering, validation, and
// that the required-doc set is derived from the construction sub packet (single source of truth).

const path = require("path");
const A = require(path.join(__dirname, "..", "api", "subs.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

console.log("Subcontractor roster (prime-with-subs compliance readiness)\n");

const NOW = Date.parse("2026-08-01T00:00:00Z");
// a fully-compliant sub: all required docs on file; COI + license dated well into the future
function fullSub(over) {
  const docs = [
    { type: "subcontract", onFile: true }, { type: "w9", onFile: true },
    { type: "coi", onFile: true, expires: "2027-06-01" }, { type: "license", onFile: true, expires: "2027-06-01" },
    { type: "lien-waivers", onFile: true }, { type: "safety", onFile: true },
  ];
  return Object.assign({ id: 1, name: "Ace Electric", trade: "electrical", docs }, over || {});
}

// ---- required-doc set derived from construction packet (not re-invented) ----
["subcontract", "w9", "coi", "license", "lien-waivers", "safety"].forEach((t) => ok("REQUIRED includes " + t, A.REQUIRED.includes(t)));
ok("COI + license are the dated docs", A.BASELINE.coi && A.BASELINE.license);

// ---- complianceStatus: readiness states ----
ok("all docs on file + future expiry ⇒ ready", A.complianceStatus(fullSub(), NOW).readiness === "ready");
const missingCoi = fullSub({ docs: fullSub().docs.filter((d) => d.type !== "coi") });
const mc = A.complianceStatus(missingCoi, NOW);
ok("missing a required doc ⇒ blocked", mc.readiness === "blocked" && mc.blockers.includes("coi"));
const expiredCoi = fullSub(); expiredCoi.docs = expiredCoi.docs.map((d) => d.type === "coi" ? { ...d, expires: "2026-06-01" } : d);
ok("expired COI ⇒ blocked", A.complianceStatus(expiredCoi, NOW).readiness === "blocked");
const expiringCoi = fullSub(); expiringCoi.docs = expiringCoi.docs.map((d) => d.type === "coi" ? { ...d, expires: "2026-08-20" } : d);
const ec = A.complianceStatus(expiringCoi, NOW);
ok("COI expiring within 30d ⇒ expiring (still cleared)", ec.readiness === "expiring" && ec.expiring.some((e) => e.type === "coi"));
ok("ready note says cleared to work", /cleared to work/i.test(A.complianceStatus(fullSub(), NOW).note));
ok("blocked note says do not put on a job", /[Dd]o not put/.test(mc.note));

// ---- docStatus: expiry boundaries ----
ok("expiry today (0 days) ⇒ expiring not expired", A.docStatus("coi", { onFile: true, expires: "2026-08-01" }, NOW, 30).status === "expiring");
ok("expiry day 30 ⇒ expiring", A.docStatus("coi", { onFile: true, expires: "2026-08-31" }, NOW, 30).status === "expiring");
ok("expiry day 31 ⇒ current", A.docStatus("coi", { onFile: true, expires: "2026-09-01" }, NOW, 30).status === "current");
ok("expiry in the past ⇒ expired", A.docStatus("coi", { onFile: true, expires: "2026-07-31" }, NOW, 30).status === "expired");
ok("missing doc ⇒ missing", A.docStatus("coi", null, NOW, 30).status === "missing");
ok("dated doc on file but no date ⇒ flagged, not guessed", A.docStatus("license", { onFile: true }, NOW, 30).note === "no expiry date entered");
ok("non-dated doc on file ⇒ on-file (no expiry needed)", A.docStatus("w9", { onFile: true }, NOW, 30).status === "on-file");

// ---- sweepExpiring: filter ready, order blocked-before-expiring-before-soonest ----
const roster = [fullSub({ id: 1, name: "Ready Co" }), missingCoi, expiringCoi,
  fullSub({ id: 4, name: "SoonerExpiry", docs: fullSub().docs.map((d) => d.type === "coi" ? { ...d, expires: "2026-08-05" } : d) })];
const alerts = A.sweepExpiring(roster, NOW, 30);
ok("sweep drops ready subs", !alerts.some((a) => a.name === "Ready Co"));
ok("sweep surfaces blocked + expiring", alerts.some((a) => a.readiness === "blocked") && alerts.some((a) => a.readiness === "expiring"));
ok("sweep orders blocked first", alerts[0].readiness === "blocked");
ok("among expiring, soonest daysLeft first", (() => { const exp = alerts.filter((a) => a.readiness === "expiring"); return exp.length < 2 || exp[0].name === "SoonerExpiry"; })());

// ---- validation ----
ok("valid sub passes", A.validateSub({ name: "X", trade: "electrical" }).ok === true);
ok("name required", A.validateSub({ trade: "electrical" }).ok === false);
ok("trade required", A.validateSub({ name: "X" }).ok === false);
ok("docs must be array", A.validateSub({ name: "X", trade: "y", docs: {} }).ok === false);
ok("non-object ⇒ invalid", A.validateSub(null).ok === false);

console.log("\n" + (fail ? "✗ " : "✓ ") + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
