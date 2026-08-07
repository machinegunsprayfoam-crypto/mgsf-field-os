#!/usr/bin/env node
// SAM.gov mappers (api/samgov.js) — the GovCon specialist's pipeline into leads. Locks the two PURE
// transforms that run on every scanned opportunity, no network: normalize() (raw SAM notice → clean
// shape, primary-POC preference, "city, ST" place, safe on missing fields, id fallback chain) and
// oppToLead() (clean opp → CRM lead card: gov_ id, Government service, New status, joined notes,
// carried contact). Deterministic (pass posted date so no Date.now). Run: node tests/samgov.js

const path = require("path");
const S = require(path.join(__dirname, "..", "api", "samgov.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

console.log("SAM.gov mappers (normalize + oppToLead)\n");

// A realistic raw SAM opportunity with primary + secondary POCs.
const raw = {
  noticeId: "abc123", title: "Spray Foam Insulation — Bldg 400", solicitationNumber: "W912-26-Q-0007",
  fullParentPathName: "DEPT OF THE ARMY", type: "Solicitation", typeOfSetAsideDescription: "SDVOSB Set-Aside",
  postedDate: "2026-08-01", responseDeadLine: "2026-08-20T17:00:00-06:00", naicsCode: "238310",
  uiLink: "https://sam.gov/opp/abc123/view",
  placeOfPerformance: { city: { name: "Miles City" }, state: { code: "MT" } },
  pointOfContact: [
    { type: "secondary", fullName: "Second Person", email: "second@army.mil" },
    { type: "primary", fullName: "Jane Contract", email: "jane@army.mil", phone: "406-555-0101", title: "KO" },
  ],
};

// ---- normalize() ----
{
  const n = S.normalize(raw);
  ok("maps core fields", n.id === "abc123" && n.title === "Spray Foam Insulation — Bldg 400" && n.sol === "W912-26-Q-0007" && n.naics === "238310");
  ok("agency + set-aside carried", n.agency === "DEPT OF THE ARMY" && /SDVOSB/.test(n.setAside));
  ok("place is 'city, ST'", n.place === "Miles City, MT" && n.state === "MT");
  ok("prefers the PRIMARY point of contact", n.contactName === "Jane Contract" && n.contactEmail === "jane@army.mil" && n.contactPhone === "406-555-0101");
  ok("keeps the uiLink", n.link === "https://sam.gov/opp/abc123/view");
}
// id fallback chain + missing fields never throw
{
  const n = S.normalize({ solicitationNumber: "SOL-9" });
  ok("id falls back to solicitationNumber", n.id === "SOL-9");
  ok("missing title ⇒ (untitled), empty place, blank contacts (no throw)", n.title === "(untitled)" && n.place === "" && n.contactName === "" && n.contactPhone === "");
  const n2 = S.normalize({ pointOfContact: [{ fullName: "Only One", email: "a@b.gov" }] });
  ok("no 'primary' type ⇒ falls back to first POC", n2.contactName === "Only One");
}

// ---- oppToLead() ----
{
  const lead = S.oppToLead(S.normalize(raw));
  ok("lead id is gov_-prefixed", /^gov_/.test(lead.id));
  ok("lead is tagged Government + New + right state", lead.service === "Government" && lead.status === "New" && lead.state === "MT");
  ok("carries the primary contact phone/email", lead.phone === "406-555-0101" && lead.email === "jane@army.mil");
  ok("source cites the solicitation", /SAM\.gov #/.test(lead.source));
  ok("notes join only the non-empty bits (no leading/trailing separators)", lead.notes.length > 0 && !/^ ?·/.test(lead.notes) && !/· ?$/.test(lead.notes));
  ok("value is 0 — never fabricates a contract amount", lead.value === 0);
  ok("date from the posted date", lead.date === "2026-08-01");
}

console.log("\n" + (fail ? "✗ " : "✓ ") + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
