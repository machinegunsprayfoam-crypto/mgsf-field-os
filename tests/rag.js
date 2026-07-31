#!/usr/bin/env node
// Klyfton RAG — unified retrieval merge/rank/format. Run: `node tests/rag.js`.
// Pure/deterministic core tested offline; the live fan-out is gated/graceful. Keyless, no network.

const path = require("path");
const R = require(path.join(__dirname, "..", "api", "rag.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

async function main() {
  console.log("Klyfton RAG — unified retrieval\n");

  ok("exports retrieve/mergeResults/formatContext + normalizers", ["retrieve", "mergeResults", "formatContext", "normBrain", "normWiki", "normMemory"].every((f) => typeof R[f] === "function"));

  // ---- normalizers map each source's native shape ----
  ok("normBrain keeps scored clusters", R.normBrain({ clusters: [{ name: "Air Sealing", score: 0.9, concepts: ["dew point", "foam"] }, { name: "Zero", score: 0 }] }).length === 1);
  ok("normWiki maps title+snippet", R.normWiki({ results: [{ title: "Cold SOP", snippet: "check dew point" }] })[0].source === "wiki");
  ok("normMemory maps notes, drops empties", R.normMemory({ results: [{ note: "closed-cell for metal" }, { note: "" }] }).length === 1);

  // ---- merge: dedupe + source priority (brain > wiki > memory) + cap ----
  const brain = [{ source: "brain", ref: "A", text: "air sealing stops drafts" }];
  const wikiL = [{ source: "wiki", ref: "SOP", text: "closed-cell for metal shops" }];
  const mem = [{ source: "memory", ref: "", text: "closed-cell for metal shops" }]; // dup of wiki text
  const merged = R.mergeResults([mem, wikiL, brain], 8);
  ok("brain ranks first (truth order) even when added last", merged[0].source === "brain");
  ok("duplicate text is deduped (wiki kept over memory by priority)", merged.filter((r) => /metal shops/.test(r.text)).length === 1);
  ok("deduped survivor is the wiki one, not memory", (merged.find((r) => /metal shops/.test(r.text)) || {}).source === "wiki");
  ok("merge caps to k", R.mergeResults([[{ source: "wiki", text: "a" }, { source: "wiki", text: "b" }, { source: "wiki", text: "c" }]], 2).length === 2);
  ok("merge on empty ⇒ []", R.mergeResults([], 8).length === 0);

  // ---- format: attribution + truth order stated ----
  const ctx = R.formatContext(merged);
  ok("context states the truth order", /truth order: brain\/doctrine > wiki > memory/.test(ctx));
  ok("context attributes each line to its source", /\[brain:A\]/.test(ctx) && /\[wiki:SOP\]/.test(ctx));
  ok("empty merged ⇒ empty context", R.formatContext([]) === "");

  // ---- live fan-out: brain graph is keyless so it always grounds; wiki/memory gate gracefully ----
  const live = await R.retrieve("closed cell foam for a metal shop in the cold", 6, {});
  ok("retrieve returns results from the keyless brain graph with no other source configured", live.ok && live.results.length > 0, JSON.stringify(live.sources));
  ok("retrieve reports which sources answered", live.sources && typeof live.sources.brain === "boolean");
  ok("empty query ⇒ empty, no throw", (await R.retrieve("", 6, {})).results.length === 0);

  console.log("\n" + (fail ? "✗" : "✓") + " " + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
}
main();
