#!/usr/bin/env node
// Capability-statement — pure build() core of api/capability-statement.js. Run: `node tests/capability-statement.js`.
// Deterministic, keyless, no network (build() returns the element list; the PDF render is not
// exercised). Covers the verified public identity (legal name, UEI — public federal ID), the
// SDVOSB framing + NAICS, and the golden rule: anything NOT independently verified (past
// performance, bonding) prints an OWNER-INPUT-REQUIRED marker — never fabricated. Overrides fill.

const path = require("path");
const A = require(path.join(__dirname, "..", "api", "capability-statement.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }
const txt = (els) => els.map((e) => String(e.text || e.v || "")).join("\n");
const kv = (els, k) => (els.find((e) => e.type === "kv" && e.k === k) || {}).v;

console.log("Capability statement (SDVOSB one-pager)\n");

const d = A.build({});
const body = txt(d.elements);

// ---- verified public identity is present ----
ok("legal name present", /Machine Gun Spray Foam & Concrete Lifting, LLC/.test(body));
ok("public UEI present", kv(d.elements, "UEI") === "H63EELL3K7Z4");
ok("SDVOSB framing present", /SDVOSB|Service-Disabled Veteran-Owned/.test(body));
ok("NAICS codes present", /238310/.test(body) && /238160/.test(body));
ok("service area = MT/ND/SD/WY", /Montana, North Dakota, South Dakota, Wyoming/.test(body));

// ---- never fabricates: unverified fields ⇒ OWNER INPUT marker ----
ok("no past performance ⇒ OWNER INPUT marker", /OWNER INPUT REQUIRED/.test(body) && /completed jobs/.test(body));
ok("no bonding ⇒ OWNER INPUT marker", /OWNER INPUT REQUIRED/.test(kv(d.elements, "Bonding")));
ok("no CAGE ⇒ 'Pending' placeholder (not invented)", /Pending/.test(kv(d.elements, "CAGE")));

// ---- EIN never appears (private federal ID) ----
ok("no EIN in output", !/\bEIN\b/i.test(body));

// ---- carrier authority: never an "active USDOT/MC" overclaim (the #21 fix) ----
ok("default output is SILENT on USDOT (no unverified claim)", !/USDOT/i.test(body));
ok("default output never claims for-hire MC authority", !/\bMC\b|for-hire|motor carrier/i.test(body));
const carrier = A.build({ usdot: "1234567" });
const cb = txt(carrier.elements);
ok("supplied USDOT prints as a private-carrier line", /USDOT 1234567/.test(cb) && /private carrier/i.test(cb));
ok("even with a USDOT #, it states no for-hire MC authority (never claims one)", /no for-hire MC authority required/i.test(cb) && !/active\s+(?:USDOT|MC)/i.test(cb));

// ---- caller-supplied real values fill in (no marker then) ----
const filled = A.build({ cage: "9ABC1", contactName: "C. Behner", pastPerformance: ["City shop — 6000 sqft SPF — 2025"], bonding: "$500K single / $1M aggregate", differentiators: ["Custom diff"] });
const fb = txt(filled.elements);
ok("supplied CAGE used", kv(filled.elements, "CAGE") === "9ABC1");
ok("supplied past performance replaces the marker", /City shop/.test(fb) && !/list 2-3 completed jobs/.test(fb));
ok("supplied bonding replaces the marker", /\$500K single/.test(kv(filled.elements, "Bonding")));
ok("supplied differentiators used", /Custom diff/.test(fb));
ok("entity object returned", filled.entity && filled.entity.uei === "H63EELL3K7Z4");

console.log("\n" + (fail ? "✗ " : "✓ ") + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
