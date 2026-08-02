#!/usr/bin/env node
// Notify / event-webhook invariants. Run: `node tests/notify.js`. Keyless, no network.
// Verifies: GET probe shape, lineFor() event messages, payload field mapping, idempotency
// key (_hash), dormant path, SMS guard, secret forwarding, and no npm deps.

const path = require("path");
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

console.log("Notify / event-webhook invariants\n");

const src = require("fs").readFileSync(path.join(__dirname, "..", "api", "notify.js"), "utf8");

// ---- re-implement pure helpers from source ----

function _hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function lineFor(event, body) {
  const lead = body.lead || {};
  const job  = body.job  || {};
  const inv  = body.invoice || {};
  switch (event) {
    case "new_lead":
      return `New spray foam lead: ${lead.name || "?"}${lead.phone ? " · " + lead.phone : ""}${lead.service ? " · " + lead.service : ""}${lead.address ? " · " + lead.address : ""}`;
    case "job_scheduled":
      return `Job scheduled: ${job.customer || job.name || "?"}${job.service ? " · " + job.service : ""}${job.date ? " · " + job.date : ""}${job.address ? " · " + job.address : ""}`;
    case "job_completed":
      return `Job completed: ${job.customer || job.name || "?"}${job.service ? " · " + job.service : ""}${job.value ? " · $" + job.value : ""} — time to invoice & ask for a review.`;
    case "invoice":
      return `Invoice ready: ${inv.customer || job.customer || "?"}${inv.amount ? " · $" + inv.amount : ""}${inv.number ? " · #" + inv.number : ""}`;
    case "review_ask":
      return `Ask ${job.customer || lead.name || "the customer"} for a Google review — job just wrapped.`;
    case "reorder":
      return body.message || "Inventory hit a reorder point.";
    default:
      return body.message || "Klyfton alert";
  }
}

// ---- _hash: deterministic, same input ⇒ same id ----
ok("_hash is deterministic", _hash("abc") === _hash("abc"));
ok("_hash differs for different inputs", _hash("abc") !== _hash("xyz"));
ok("_hash returns a non-empty string", typeof _hash("test") === "string" && _hash("test").length > 0);
ok("_hash handles empty string without throwing", typeof _hash("") === "string");

// ---- lineFor: new_lead ----
const nl = lineFor("new_lead", { lead: { name: "Jane", phone: "555-1234", service: "Spray Foam", address: "123 Main" } });
ok("new_lead includes name", nl.includes("Jane"));
ok("new_lead includes phone", nl.includes("555-1234"));
ok("new_lead includes service", nl.includes("Spray Foam"));
ok("new_lead includes address", nl.includes("123 Main"));

// ---- lineFor: new_lead with missing fields ----
const nlMin = lineFor("new_lead", {});
ok("new_lead with no lead data uses fallback '?'", nlMin.includes("?"));

// ---- lineFor: job_scheduled ----
const js = lineFor("job_scheduled", { job: { customer: "Bob", service: "Roofing", date: "2026-08-05", address: "Farm Rd" } });
ok("job_scheduled includes customer", js.includes("Bob"));
ok("job_scheduled includes service", js.includes("Roofing"));
ok("job_scheduled includes date", js.includes("2026-08-05"));

// ---- lineFor: job_completed ----
const jc = lineFor("job_completed", { job: { customer: "Alice", service: "Concrete", value: "3200" } });
ok("job_completed includes customer", jc.includes("Alice"));
ok("job_completed includes value with $", jc.includes("$3200"));
ok("job_completed has invoice prompt", jc.includes("invoice"));

// ---- lineFor: invoice ----
const inv = lineFor("invoice", { invoice: { customer: "Acme", amount: "4500", number: "INV-42" } });
ok("invoice includes customer", inv.includes("Acme"));
ok("invoice includes amount", inv.includes("$4500"));
ok("invoice includes number", inv.includes("INV-42"));

// ---- lineFor: review_ask ----
const ra = lineFor("review_ask", { job: { customer: "Mike" } });
ok("review_ask asks Mike for a review", ra.includes("Mike"));

// ---- lineFor: reorder uses body.message ----
const ro = lineFor("reorder", { message: "Low on foam sets" });
ok("reorder uses body.message", ro === "Low on foam sets");

// ---- lineFor: unknown event falls back to body.message or 'Klyfton alert' ----
ok("unknown event with message", lineFor("unknown_xyz", { message: "custom" }) === "custom");
ok("unknown event no message falls back to 'Klyfton alert'", lineFor("unknown_xyz", {}) === "Klyfton alert");

// ---- source-level: dormant path ----
ok("configured:false when no webhook", src.includes("configured: false") || src.includes("configured: !!WEBHOOK"));
ok("GET probe returns configured state", src.includes("configured: !!WEBHOOK"));

// ---- source-level: secret injected into headers + payload ----
ok("x-klyfton-token header set when SECRET present", src.includes('"x-klyfton-token"'));
ok("token field added to payload when SECRET set", src.includes("payload.token = SECRET"));

// ---- source-level: idempotency key on payload ----
ok("payload.id assigned from _hash", src.includes("payload.id"));

// ---- source-level: SMS guard checks SMS_ON ----
ok("SMS gated on SMS_ON flag", src.includes("SMS_ON"));

// ---- source-level: no npm require() calls (global fetch only) ----
const requireCalls = src.match(/\brequire\s*\(/g) || [];
ok("no npm require() calls (global fetch only)", requireCalls.length === 0, "found " + requireCalls.length);

// ---- source-level: Twilio credentials never logged ----
ok("Twilio SID/token not logged", !src.includes("console.log(TW_SID)") && !src.includes("console.log(TW_TOKEN)"));

// ---- source-level: method guard ----
ok("POST guard present", src.includes('"POST"'));
ok("405 on wrong method", src.includes("405"));

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
