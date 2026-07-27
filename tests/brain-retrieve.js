#!/usr/bin/env node
// Brain GraphRAG regression tests — locks the routing behaviour of api/brain-graph-retrieve.js.
// Run: `node tests/brain-retrieve.js`. Keyless, deterministic. Exits non-zero on any failure.

const path = require("path");
const R = require(path.join(__dirname, "..", "api", "brain-graph-retrieve.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail ? "  [" + detail + "]" : "")); } }
const has = (arr, x) => arr.indexOf(x) >= 0;

console.log("Brain GraphRAG — routing regression tests\n");

// identity + guardrails must ALWAYS be present, on every query incl. nonsense
["closed-cell foam for a metal shop", "zzzqxnonsense", ""].forEach(q => {
  const r = R.retrieve(q);
  ok("always keeps base_voice/DOCTRINE/COMPETITIVE_EDGE  (q=\"" + q.slice(0, 24) + "\")",
     r.ok && has(r.blocks, "base_voice") && has(r.blocks, "DOCTRINE") && has(r.blocks, "COMPETITIVE_EDGE"),
     r.blocks && r.blocks.join(","));
  ok("never returns empty blocks  (q=\"" + q.slice(0, 24) + "\")", r.blocks && r.blocks.length >= 3);
});

// domain routing invariants — the right knowledge shows up for the right question
function routes(q, mustHave) {
  const r = R.retrieve(q);
  mustHave.forEach(b => ok("\"" + q.slice(0, 34) + "…\" ⇒ " + b, has(r.blocks, b), r.blocks.join(",")));
}
routes("how much closed-cell foam and whats the ROI?", ["FOAM_SPECS", "ROI_GUIDE"]);
routes("whats my margin and price on this job?", ["ACCOUNTING_FINANCE", "DOCTRINE"]);
routes("draft a proposal and email it for approval", ["ACTIONS"]);
routes("SDVOSB set-asides on SAM.gov", ["FEDERAL"]);
routes("is it too cold to spray on this substrate today?", ["FOAM_SPECS"]);
routes("what equipment / rig do we need, buy or rent?", ["EQUIPMENT"]);

// determinism — same input, identical output (safe to cache / reason about)
(() => {
  const a = R.retrieve("closed-cell foam ROI for a pole barn");
  const b = R.retrieve("closed-cell foam ROI for a pole barn");
  ok("deterministic: identical blocks on repeat", JSON.stringify(a.blocks) === JSON.stringify(b.blocks));
  ok("deterministic: identical cluster ranking", JSON.stringify(a.matchedClusters) === JSON.stringify(b.matchedClusters));
})();

// clusters ranked descending by score
(() => {
  const r = R.retrieve("foam roof coating for a metal building with financing");
  let sorted = true; for (let i = 1; i < r.clusters.length; i++) if (r.clusters[i].score > r.clusters[i - 1].score) sorted = false;
  ok("clusters ranked by score (desc)", sorted, r.clusters.map(c => c.name + ":" + c.score).join(" | "));
})();

// tokenizer drops stopwords/short tokens, keeps concepts
(() => {
  const t = R.tokenize("How much is the foam for my shop?");
  ok("tokenize drops stopwords (how/the/for/is/my)", !has(t, "the") && !has(t, "how") && !has(t, "for"));
  ok("tokenize keeps content concepts (foam/shop)", has(t, "foam") && has(t, "shop"), t.join(","));
})();

console.log("\n" + pass + " passed, " + fail + " failed.");
process.exit(fail ? 1 : 0);
