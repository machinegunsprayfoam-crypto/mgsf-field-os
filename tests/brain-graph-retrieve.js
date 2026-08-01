#!/usr/bin/env node
// Brain graph retrieve — pure GraphRAG-lite core of api/brain-graph-retrieve.js. Run:
// `node tests/brain-graph-retrieve.js`. Deterministic, keyless (no embeddings/no API). Covers
// tokenize (stopword drop, MGSF alias expansion), score (query → ranked clusters, non-negative),
// and retrieve (identity ALWAYS blocks present, query routes to sensible blocks, a no-match query
// still returns a safe non-empty default). It only ROUTES to existing blocks — invents no facts.

const path = require("path");
const A = require(path.join(__dirname, "..", "api", "brain-graph-retrieve.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

console.log("Brain graph retrieve (GraphRAG-lite routing)\n");

// ---- tokenize: stopwords dropped, aliases expanded ----
const t1 = A.tokenize("How much margin should I price?");
ok("tokenize drops stopwords (how/should/i)", !t1.includes("how") && !t1.includes("should") && !t1.includes("i"));
ok("tokenize expands 'margin' alias → cost", t1.includes("margin") && t1.includes("cost"));
ok("tokenize expands 'price' alias → cost", A.tokenize("price").includes("cost"));
ok("tokenize short/empty ⇒ []", A.tokenize("").length === 0 && A.tokenize("a i we").length === 0);

// ---- score: ranked, non-negative, sorted desc ----
const s = A.score("dew point condensation substrate");
ok("score returns a ranked array", Array.isArray(s) && s.length > 0);
ok("scores are non-negative", s.every((c) => c.score >= 0));
ok("scores sorted descending", s.every((c, i) => i === 0 || s[i - 1].score >= c.score));
ok("score entries carry name + concepts", typeof s[0].name === "string" && Array.isArray(s[0].concepts));

// ---- retrieve: identity ALWAYS blocks always present ----
const r = A.retrieve("what should I charge to hit my margin");
ok("retrieve carries the ALWAYS identity blocks", A.ALWAYS.every((b) => r.blocks.includes(b)));
ok("retrieve routes a cost/margin query to DOCTRINE", r.blocks.includes("DOCTRINE"));
ok("retrieve returns matched clusters + a why", Array.isArray(r.matchedClusters) && r.matchedClusters.length > 0 && typeof r.why === "string");

// ---- a federal/SDVOSB query lights the procurement/federal side ----
const fed = A.retrieve("SDVOSB SAM.gov bid prevailing wage");
ok("federal query pulls a FEDERAL/PROCUREMENT block", fed.blocks.includes("FEDERAL") || fed.blocks.includes("PROCUREMENT"));

// ---- no concept match ⇒ safe non-empty default (never empty, never fabricated) ----
const none = A.retrieve("zzzz qqqq wwww");
ok("no-match query still returns identity blocks (non-empty)", none.blocks.length > 0 && A.ALWAYS.every((b) => none.blocks.includes(b)));
ok("no-match why explains the default", /No concept match/.test(none.why));

// ---- CLUSTER_BLOCKS only names real block strings (routing, not invention) ----
ok("every cluster maps to a non-empty block list", Object.values(A.CLUSTER_BLOCKS).every((v) => Array.isArray(v) && v.length > 0));

console.log("\n" + (fail ? "✗ " : "✓ ") + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
