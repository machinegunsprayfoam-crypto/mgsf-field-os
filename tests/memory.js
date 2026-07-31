#!/usr/bin/env node
// Semantic memory — gated/graceful behavior + pure helpers. Run: `node tests/memory.js`.
// The sandbox has no SUPABASE_URL/OPENAI_API_KEY, so every live path early-returns without
// network — we assert it degrades gracefully (never throws, never fabricates) and that the
// vector literal is well-formed. Deterministic, keyless, no network.

const path = require("path");
const M = require(path.join(__dirname, "..", "api", "memory.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

async function main() {
  console.log("Semantic memory — gated behavior + helpers\n");

  // ---- exports ----
  ok("exports remember/recall/charge/backfill/schemaReady", ["remember", "recall", "charge", "backfill", "schemaReady"].every((f) => typeof M[f] === "function"));

  // ---- vecLiteral: well-formed + guards non-finite ----
  ok("vecLiteral formats a vector", M._vecLiteral([0.1, 0.2, 0.3]) === "[0.1,0.2,0.3]");
  ok("vecLiteral coerces NaN/Infinity to 0", M._vecLiteral([1, NaN, Infinity, -2]) === "[1,0,0,-2]");
  ok("vecLiteral empty ⇒ []", M._vecLiteral([]) === "[]");

  // ---- gated + graceful (no Supabase/OpenAI in sandbox) — never throws, never fabricates ----
  ok("empty note ⇒ rejected before any I/O", (await M.remember("")).error === "empty_note");
  const rem = await M.remember("Clifton prefers closed-cell for metal shops");
  ok("remember unconfigured ⇒ configured:false, ok:false", rem.ok === false && rem.configured === false, JSON.stringify(rem));
  const rec = await M.recall("what foam for a shop", 6);
  ok("recall unconfigured ⇒ configured:false, empty results, no throw", rec.configured === false && Array.isArray(rec.results) && rec.results.length === 0);
  const bf = await M.backfill();
  ok("backfill unconfigured ⇒ configured:false, ok:false", bf.ok === false && bf.configured === false, JSON.stringify(bf));
  ok("schemaReady unconfigured ⇒ false (no throw)", (await M.schemaReady()) === false);
  const ch = await M.charge();
  ok("charge unconfigured ⇒ configured:false, count 0", ch.configured === false && ch.count === 0);

  console.log("\n" + (fail ? "✗" : "✓") + " " + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
}
main();
