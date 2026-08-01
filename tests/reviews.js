#!/usr/bin/env node
// Reviews — pure review-request draft core of api/reviews.js. Run: `node tests/reviews.js`.
// Deterministic, keyless, no network. Covers the first-name greeting + fallback, the job/tech
// defaults, the OWNER-INPUT review-link marker (never invents a Google link), draft-only + the
// needsReviewUrl flag, SMS char count, and the hard rules: draftOnly (never sends), brand voice.

const path = require("path");
const A = require(path.join(__dirname, "..", "api", "reviews.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

console.log("Reviews (review-request draft)\n");

const full = A.build({ customer: "Jane Doe", jobType: "attic spray foam", tech: "Cody", reviewUrl: "https://g.example/review", phone: "406-555-0101", email: "jane@x.com" });
ok("uses the customer first name", /Hey Jane,/.test(full.channels.sms.text));
ok("includes the job type", /attic spray foam/.test(full.channels.sms.text));
ok("includes the tech name", /Cody/.test(full.channels.sms.text));
ok("includes the supplied review link", full.channels.sms.text.indexOf("https://g.example/review") >= 0);
ok("draftOnly true (never sends)", full.draftOnly === true);
ok("needsReviewUrl false when a link is given", full.needsReviewUrl === false);
ok("sms char count matches the text", full.channels.sms.chars === full.channels.sms.text.length);
ok("sms/email 'to' carried through", full.channels.sms.to === "406-555-0101" && full.channels.email.to === "jane@x.com");
ok("email subject personalized", /Jane/.test(full.channels.email.subject));

// ---- no review link ⇒ OWNER INPUT marker, never a fabricated URL ----
const noLink = A.build({ customer: "Bob", jobType: "crawlspace" });
ok("missing link ⇒ OWNER INPUT marker + flag", noLink.needsReviewUrl === true && /OWNER INPUT REQUIRED/.test(noLink.channels.sms.text));
ok("never fabricates an http link when none given", !/https?:\/\//.test(noLink.channels.sms.text));

// ---- defaults / fallbacks ----
const bare = A.build({});
ok("empty customer ⇒ 'there' greeting", /Hey there,/.test(bare.channels.sms.text));
ok("empty jobType ⇒ 'your project'", /your project/.test(bare.channels.sms.text));
ok("empty tech ⇒ 'the crew'", /the crew/.test(bare.channels.sms.text));
ok("null contacts when absent", bare.channels.sms.to === null && bare.channels.email.to === null);

// ---- brand voice (veteran-owned, one ask) ----
ok("brand voice: veteran-owned + Semper Fi in email", /veteran-owned/i.test(full.channels.email.body) && /Semper Fi/.test(full.channels.email.body));

console.log("\n" + (fail ? "✗ " : "✓ ") + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
