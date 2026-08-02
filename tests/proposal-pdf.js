#!/usr/bin/env node
// Proposal-PDF — pure renderPDF() core of api/proposal-pdf.js. Run: `node tests/proposal-pdf.js`.
// Deterministic, keyless, no network (a fixed date is passed so the new-Date fallback never runs).
// Covers: a valid PDF is produced (%PDF header + %%EOF trailer), caller-supplied line items +
// customer render into the byte stream, the money formatter, and the golden rule — an empty
// customer / no items emits an OWNER-INPUT-REQUIRED marker rather than a fabricated value.

const path = require("path");
const A = require(path.join(__dirname, "..", "api", "proposal-pdf.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

console.log("Proposal PDF (branded proposal document)\n");

const spec = {
  customer: { name: "Jane Doe", address: "123 Main", cityStateZip: "Glendive, MT 59330", email: "jane@x.com", phone: "406-555-0101" },
  proposalNo: "P-1001", date: "2026-08-01",
  items: [{ desc: "Closed-cell foam — attic", qty: 1200, unit: "bf", amount: 4800 }],
  notes: "Thanks for the opportunity.", terms: "50% deposit", validDays: 30,
};
const buf = A.renderPDF(spec);
const s = buf.toString("latin1");

// ---- it is a real PDF ----
ok("returns a Buffer", Buffer.isBuffer(buf));
ok("starts with the %PDF header", s.slice(0, 5) === "%PDF-");
ok("ends with the %%EOF trailer", /%%EOF\s*$/.test(s));
ok("declares required PDF objects (xref + trailer)", /xref/.test(s) && /trailer/.test(s));

// ---- caller-supplied content lands in the stream ----
ok("renders the customer name", s.indexOf("Jane Doe") >= 0);
ok("renders a line-item description", s.indexOf("Closed-cell foam") >= 0);
ok("renders the proposal number", s.indexOf("P-1001") >= 0);
ok("money formatted with a $ and 2 decimals", /\$4,800\.00|\$4800\.00/.test(s));

// ---- golden rule: no customer / no items ⇒ OWNER-INPUT markers, not fabrication ----
const bare = A.renderPDF({ date: "2026-08-01" }).toString("latin1");
ok("empty customer ⇒ OWNER INPUT REQUIRED marker", /OWNER INPUT REQUIRED/.test(bare));
ok("no items ⇒ OWNER INPUT REQUIRED (add line items)", /OWNER INPUT REQUIRED.*line items|add line items/.test(bare));

console.log("\n" + (fail ? "✗ " : "✓ ") + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
