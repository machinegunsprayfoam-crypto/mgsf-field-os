#!/usr/bin/env node
// Klyfton wiki SEED — validates the starter knowledge base (db/wiki_seed.json). Run:
// `node tests/wiki-seed.js`. Keyless, no network. Asserts every seed article is well-formed
// (passes the wiki's own validateArticle), slugs are unique, and the articles are actually
// RETRIEVABLE — a realistic owner/customer question ranks the right article first. This proves
// the seed the owner will load is usable, not just present.

const path = require("path");
const W = require(path.join(__dirname, "..", "api", "wiki.js"));
const SEED = require(path.join(__dirname, "..", "db", "wiki_seed.json"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

console.log("Klyfton wiki seed — validity + retrievability\n");

// ---- structure ----
ok("seed is a non-trivial array", Array.isArray(SEED) && SEED.length >= 6, SEED.length);
ok("every article passes validateArticle", SEED.every((a) => W.validateArticle(a).ok));
ok("slugs are unique", new Set(SEED.map((a) => a.slug)).size === SEED.length);
ok("every article has a category + tags + a Source line", SEED.every((a) => a.category && Array.isArray(a.tags) && a.tags.length && /source/i.test(a.body)));
ok("all articles are published", SEED.every((a) => a.status === "published"));

// ---- HARD-RULE guard: no pricing, no guarantees, no mold-elimination claims in seed content ----
const banned = /\bguarantee/i;
const moldKill = /(eliminate|get rid of|kill)s?\s+mold/i;
const dollar = /\$\s?\d/;
ok("no 'guarantee' language in any article", SEED.every((a) => !banned.test(a.body)));
ok("no mold-elimination claim in any article", SEED.every((a) => !moldKill.test(a.body)));
ok("no dollar figures (pricing stays in doctrine)", SEED.every((a) => !dollar.test(a.body)));

// ---- retrievability: the right article ranks first for a realistic question ----
const cases = [
  ["is it too cold, what about the dew point", "cold-weather-spray-sop"],
  ["which foam for a metal shop", "metal-building-playbook"],
  ["open cell or closed cell r-value", "open-vs-closed-cell"],
  ["do we need a thermal barrier over the foam", "code-barriers-basics"],
  ["what respirator for spraying inside", "spray-ppe"],
  ["can we recoat the foam roof instead of tear off", "spf-roof-recoat"],
  ["polyurethane concrete lifting vs mudjacking", "concrete-lifting-vs-mudjacking"],
];
for (const [q, expect] of cases) {
  const top = W.rank(SEED, q, 1)[0];
  ok("query '" + q.slice(0, 32) + "…' ⇒ " + expect, top && top.slug === expect, top && top.slug);
}

console.log("\n" + (fail ? "✗" : "✓") + " " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
