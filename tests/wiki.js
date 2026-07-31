#!/usr/bin/env node
// Klyfton wiki — pure ranking + gated/graceful behavior. Run: `node tests/wiki.js`.
// The sandbox has no Supabase, so every live path early-returns { configured:false } with no
// network — we assert it degrades gracefully (never throws, never fabricates) and that the pure
// retrieval RANKING is correct and deterministic. Keyless, no network.

const path = require("path");
const W = require(path.join(__dirname, "..", "api", "wiki.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

const ARTICLES = [
  { slug: "cold-weather-spray", title: "Cold-Weather Spray SOP", tags: ["safety", "dew point", "winter"], body: "Check substrate temperature and dew point before spraying closed-cell foam. No-go under a 5 degree spread." },
  { slug: "metal-building-playbook", title: "Metal Building Closed-Cell Playbook", tags: ["metal", "closed-cell"], body: "For metal shops and pole barns, closed-cell foam seals the metal, stops condensation, and adds rigidity." },
  { slug: "financing-hearth", title: "Hearth Financing Walkthrough", tags: ["financing", "sales"], body: "Zero-down financing through Hearth. Checking a rate is a soft pull that does not affect credit." },
];

async function main() {
  console.log("Klyfton wiki — ranking + gated behavior\n");

  // ---- exports ----
  ok("exports retrieve/list/save/rank/validateArticle/slugify", ["retrieve", "list", "save", "rank", "scoreArticle", "validateArticle", "slugify"].every((f) => typeof W[f] === "function"));

  // ---- slugify ----
  ok("slugify normalizes to a clean slug", W.slugify("Cold-Weather Spray SOP!") === "cold-weather-spray-sop");
  ok("slugify empty ⇒ 'untitled'", W.slugify("  ") === "untitled");

  // ---- PURE ranking: right article for the query, title/tag weighting, deterministic ----
  ok("query matches the metal-building article", (W.rank(ARTICLES, "which foam for a metal shop", 1)[0] || {}).slug === "metal-building-playbook");
  ok("query matches the cold-weather SOP", (W.rank(ARTICLES, "is it too cold, what about dew point", 1)[0] || {}).slug === "cold-weather-spray");
  ok("query matches the financing article", (W.rank(ARTICLES, "can the customer finance it", 1)[0] || {}).slug === "financing-hearth");
  ok("title hit outweighs a body hit", W.scoreArticle(ARTICLES[1], "metal") > W.scoreArticle(ARTICLES[0], "metal"));
  ok("irrelevant query ⇒ no results (score 0 filtered)", W.rank(ARTICLES, "quantum astrophysics banana", 3).length === 0);
  ok("ranking is deterministic", JSON.stringify(W.rank(ARTICLES, "closed-cell metal", 3)) === JSON.stringify(W.rank(ARTICLES, "closed-cell metal", 3)));
  ok("stopwords don't match", W.rank(ARTICLES, "the a of to for", 3).length === 0);

  // ---- validateArticle ----
  ok("valid article passes", W.validateArticle({ title: "T", body: "B" }).ok);
  ok("missing title/body flagged", (() => { const v = W.validateArticle({ title: "" }); return v.ok === false && v.errors.length >= 1; })());

  // ---- gated + graceful (no Supabase in sandbox) — never throws, never fabricates ----
  const rec = await W.retrieve("metal shop foam", 3);
  ok("retrieve unconfigured ⇒ configured:false, empty, no throw", rec.configured === false && Array.isArray(rec.results) && rec.results.length === 0);
  const l = await W.list();
  ok("list unconfigured ⇒ configured:false, empty", l.configured === false && l.results.length === 0);
  const rblank = await W.retrieve("", 3);
  ok("retrieve empty query ⇒ no throw", rblank && Array.isArray(rblank.results));

  // ---- writes are OWNER-gated: nothing saves without approval ----
  const s1 = await W.save({ title: "New SOP", body: "steps..." }, {});
  ok("save without approval ⇒ needs_approval (not saved)", s1.ok && s1.status === "needs_approval", JSON.stringify(s1));
  const s2 = await W.save({ title: "", body: "" }, { approved: true });
  ok("save invalid article ⇒ rejected before any I/O", s2.ok === false && s2.error === "invalid_article");
  const s3 = await W.save({ title: "Ok", body: "b" }, { approved: true });
  ok("approved but unconfigured ⇒ not_configured (no fabrication)", s3.ok === false && s3.configured === false);

  console.log("\n" + (fail ? "✗" : "✓") + " " + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
}
main();
