#!/usr/bin/env node
// HubSpot — pure mapContact() core of api/hubspot.js. Run: `node tests/hubspot.js`.
// Deterministic, keyless, no network (only the pure contact→lead mapper; the live API calls are
// not exercised). Covers the name fallback chain (first+last → email → 'Unknown contact'), the
// phone fallback (phone → mobilephone), field trimming, and that a priority score/band is attached
// so the crew calls the best leads first. No fabrication — empty fields map to empty strings.

const path = require("path");
const A = require(path.join(__dirname, "..", "api", "hubspot.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

console.log("HubSpot (contact → call-list lead mapper)\n");

// ---- full contact ----
const full = A.mapContact({ id: "101", properties: { firstname: " Jane ", lastname: "Doe", phone: "406-555-0101", email: "jane@x.com", lifecyclestage: "lead", hs_lead_status: "NEW", city: "Glendive", state: "MT" } });
ok("name = first + last (trimmed)", full.name === "Jane Doe");
ok("phone carried + trimmed", full.phone === "406-555-0101");
ok("email/stage/status/city/state mapped", full.email === "jane@x.com" && full.stage === "lead" && full.status === "NEW" && full.city === "Glendive" && full.state === "MT");
ok("id carried through", full.id === "101");
ok("a priority score is attached", typeof full.score === "number");
ok("a priority band is attached", typeof full.band === "string" && full.band.length > 0);

// ---- name fallback chain ----
ok("no name ⇒ falls back to email", A.mapContact({ id: "1", properties: { email: "only@x.com" } }).name === "only@x.com");
ok("no name/email ⇒ 'Unknown contact'", A.mapContact({ id: "2", properties: {} }).name === "Unknown contact");
ok("first only ⇒ uses first name", A.mapContact({ id: "3", properties: { firstname: "Sam" } }).name === "Sam");

// ---- phone fallback: mobilephone when no phone ----
ok("mobilephone used when phone absent", A.mapContact({ id: "4", properties: { firstname: "M", mobilephone: "701-555-0000" } }).phone === "701-555-0000");
ok("no phone at all ⇒ empty string", A.mapContact({ id: "5", properties: { firstname: "N" } }).phone === "");

// ---- url is always a string (never throws) ----
ok("url field is a string", typeof full.url === "string");

console.log("\n" + (fail ? "✗ " : "✓ ") + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
