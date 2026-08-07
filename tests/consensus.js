#!/usr/bin/env node
// Regression suite for consensus mode (api/consensus.js). Locks the PURE agreement logic: jaccard,
// tokenize (stopword/punct strip), and analyze() — strong-consensus vs one-outlier vs single vs
// empty, medoid selection, outlier flagging, and verdict banding. Also checks the live run() safety
// contract (redacts before broadcast; inert with <2 providers) via injected fakes — no network.
// Keyless, deterministic. Run: node tests/consensus.js

const path = require("path");
const c = require(path.join(__dirname, "..", "api", "consensus.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

(async () => {
  console.log("Consensus mode invariants\n");

  // ---- jaccard + tokenize ----
  ok("jaccard identical = 1", c.jaccard(c.tokenize("closed cell foam moisture"), c.tokenize("closed cell foam moisture")) === 1);
  ok("jaccard disjoint = 0", c.jaccard(c.tokenize("bananas potassium tropical"), c.tokenize("closed cell foam")) === 0);
  ok("tokenize strips stopwords + short words", !c.tokenize("the of a is closed").has("the") && c.tokenize("the of a is closed").has("closed"));
  const j = c.jaccard(c.tokenize("closed cell foam higher rvalue"), c.tokenize("closed cell foam lower price"));
  ok("jaccard partial between 0 and 1", j > 0 && j < 1, j);

  // ---- strong consensus: three similar answers ----
  {
    const o = c.analyze([
      { provider: "groq", text: "Closed cell foam gives higher R value per inch and blocks moisture intrusion." },
      { provider: "gemini", text: "Closed cell spray foam has higher R value per inch and stops moisture." },
      { provider: "together", text: "Higher R value per inch and moisture blocking come from closed cell foam." },
    ]);
    ok("counts all 3", o.count === 3);
    ok("agreement is meaningful (>35)", o.agreementPct > 35, o.agreementPct);
    ok("no outliers when all align", o.outliers.length === 0, JSON.stringify(o.outliers));
    ok("majority answer present + aligned", !!o.majority && o.majority.alignmentPct > 0);
  }

  // ---- one clear outlier ----
  {
    const o = c.analyze([
      { provider: "groq", text: "Closed cell foam gives higher R value per inch and blocks moisture intrusion." },
      { provider: "gemini", text: "Closed cell spray foam has higher R value per inch and stops moisture." },
      { provider: "kimi", text: "Bananas are a yellow tropical fruit that are rich in potassium and cheap." },
    ]);
    ok("banana flagged as outlier", o.outliers.includes("kimi"), JSON.stringify(o.outliers));
    ok("majority is a foam answer, not the outlier", o.majority.provider !== "kimi");
    ok("agreement lower than the all-aligned case", o.agreementPct < 60, o.agreementPct);
  }

  // ---- single answer: no consensus to measure ----
  {
    const o = c.analyze([{ provider: "groq", text: "Use closed cell foam for the rim joist." }]);
    ok("single → count 1, agreement 100", o.count === 1 && o.agreementPct === 100);
    ok("single → no outliers, verdict notes single", o.outliers.length === 0 && /single/i.test(o.verdict));
  }

  // ---- empty / all-blank ----
  {
    const o = c.analyze([]);
    ok("empty → count 0, agreement null", o.count === 0 && o.agreementPct === null);
    const b = c.analyze([{ provider: "x", text: "   " }, { provider: "y", text: "" }]);
    ok("all-blank → count 0", b.count === 0);
  }

  // ---- verdict banding ----
  {
    const strong = c.analyze([
      { provider: "a", text: "closed cell foam higher rvalue moisture barrier" },
      { provider: "b", text: "closed cell foam higher rvalue moisture barrier" },
    ]);
    ok("identical answers → strong consensus", strong.verdict === "strong consensus", strong.agreementPct + " " + strong.verdict);
  }

  // ---- live run(): SAFETY — redacts before broadcast; inert with <2 providers ----
  const oneProv = { listProviders: () => [{ id: "groq", label: "Groq", configured: true }, { id: "gemini", label: "Gemini", configured: false }], chat: async () => ({ ok: true, text: "hi" }) };
  const inert = await c.run({ question: "test?" }, { provider: oneProv, redact: null });
  ok("<2 providers → configured:false, honest", inert.configured === false && inert.reason === "need_2_providers");

  const seen = [];
  const twoProv = {
    listProviders: () => [{ id: "groq", configured: true }, { id: "gemini", configured: true }],
    chat: async (opts) => { seen.push(opts.message); return { ok: true, text: "closed cell foam higher rvalue moisture" }; },
  };
  const fakeRedact = { sanitizeForModel: (t) => t.replace(/sk-[a-z0-9]+/gi, "[REDACTED]") };
  const out = await c.run({ question: "review this key sk-abc123 please" }, { provider: twoProv, redact: fakeRedact });
  ok("run ok with 2 providers", out.ok === true && out.answers.length === 2);
  ok("secret masked BEFORE broadcast", out.maskedSensitive === true && seen.every((m) => m.indexOf("sk-abc123") < 0));
  ok("analysis computed over the answers", out.analysis && out.analysis.count === 2);
  ok("no question → error", (await c.run({}, { provider: twoProv })).reason === "no_question");

  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
