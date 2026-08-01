#!/usr/bin/env node
// InfraNodus — pure helpers of api/infranodus.js. Run: `node tests/infranodus.js`.
// Deterministic, keyless, no network (only normalize/htmlToText/isConfigured; the live analyze()
// fetch is not exercised). Covers isConfigured() reflecting the env key (INACTIVE by default in
// the test env), the defensive normalize() (field-name fallbacks, never fabricates — unknown ⇒ []),
// and the HTML→text reducer (strips script/style/tags, decodes a few entities, collapses space).

const path = require("path");
const A = require(path.join(__dirname, "..", "api", "infranodus.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

console.log("InfraNodus (content-gap bridge helpers)\n");

// ---- isConfigured reflects the key (absent in the test env ⇒ INACTIVE) ----
ok("isConfigured false without INFRANODUS_API_KEY", A.isConfigured() === false);

// ---- normalize: primary field names ----
const prim = A.normalize({ contentGaps: ["gap1"], mainTopicalClusters: ["t1"], mainConcepts: ["c1"], graphSummary: "s" });
ok("normalize maps primary gap/topic/concept fields", prim.gaps[0] === "gap1" && prim.topics[0] === "t1" && prim.concepts[0] === "c1" && prim.summary === "s");

// ---- normalize: fallback field names ----
const fb = A.normalize({ gaps: ["g2"], topicalClusters: ["t2"], concepts: ["c2"], summary: "s2" });
ok("normalize falls back to gaps/topicalClusters/concepts", fb.gaps[0] === "g2" && fb.topics[0] === "t2" && fb.concepts[0] === "c2" && fb.summary === "s2");
const fb2 = A.normalize({ gapAdvice: ["g3"], topics: ["t3"], keywords: ["k3"] });
ok("normalize falls back to gapAdvice/topics/keywords", fb2.gaps[0] === "g3" && fb2.topics[0] === "t3" && fb2.concepts[0] === "k3");

// ---- normalize: never fabricates ----
const empty = A.normalize({});
ok("empty object ⇒ empty arrays, empty summary", Array.isArray(empty.gaps) && empty.gaps.length === 0 && empty.topics.length === 0 && empty.concepts.length === 0 && empty.summary === "");
const bad = A.normalize(null);
ok("null/garbage ⇒ safe empty shape", bad.gaps.length === 0 && bad.topics.length === 0 && bad.summary === "");

// ---- htmlToText ----
ok("strips <script> content", !/alert/.test(A.htmlToText("<p>Hi</p><script>alert(1)</script>")) && /Hi/.test(A.htmlToText("<p>Hi</p><script>alert(1)</script>")));
ok("strips <style> content", !/color/.test(A.htmlToText("<style>a{color:red}</style><p>Text</p>")));
ok("strips tags, keeps text", A.htmlToText("<h1>Foam</h1> <b>facts</b>").indexOf("Foam") >= 0 && A.htmlToText("<h1>Foam</h1> <b>facts</b>").indexOf("facts") >= 0);
ok("decodes &amp; and collapses whitespace", A.htmlToText("A &amp;   B") === "A & B");
ok("empty/null ⇒ empty string", A.htmlToText(null) === "" && A.htmlToText("") === "");

console.log("\n" + (fail ? "✗ " : "✓ ") + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
