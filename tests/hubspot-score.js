#!/usr/bin/env node
// HubSpot call-list scoring integration — mapContact attaches a priority score/band.
// Run: `node tests/hubspot-score.js`. Pure (no network): we feed mapContact a fake
// HubSpot contact shape and assert it comes back scored. Keyless, deterministic.

const path = require("path");
const H = require(path.join(__dirname, "..", "api", "hubspot.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

console.log("HubSpot call-list scoring integration\n");

ok("mapContact exported", typeof H.mapContact === "function");

const strong = H.mapContact({ id: "1", properties: {
  firstname: "Cliff", lastname: "B", phone: "406-555-1234", email: "c@x.com",
  state: "MT", city: "Glendive", hs_lead_status: "NEW" } });
ok("attaches numeric score", typeof strong.score === "number", strong.score);
ok("attaches band", typeof strong.band === "string", strong.band);
ok("in-territory reachable ⇒ warm/hot", strong.score >= 55, strong.score);
ok("preserves the lead shape (name/phone/url)", !!strong.name && (strong.phone === "4065551234" || strong.phone === "406-555-1234"));

const weak = H.mapContact({ id: "2", properties: {
  firstname: "Out", lastname: "Ofarea", state: "FL", hs_lead_status: "NEW" } });
ok("out-of-area, no phone ⇒ lower than strong", weak.score < strong.score, weak.score + " < " + strong.score);

// resilience: a junk contact must not throw and must still return a lead object
ok("empty contact ⇒ no throw, still scored", (() => {
  try { const l = H.mapContact({}); return typeof l.score === "number"; } catch (e) { return false; }
})());

console.log("\n" + (fail ? "✗" : "✓") + " " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
