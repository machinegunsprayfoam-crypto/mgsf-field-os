#!/usr/bin/env node
// Brain assembly (GraphRAG wiring) tests — validates that klyfton.js's assembleBrainBlocks() selects
// the right knowledge per question, ALWAYS keeps identity/guardrails/action-contract/expert-router, and
// falls back to the full brain safely. Run: `node tests/brain-assembly.js`. Keyless, deterministic.

const path = require("path");
const m = require(path.join(__dirname, "..", "api", "klyfton.js"));
const A = m.assembleBrainBlocks;
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail ? "  [" + detail + "]" : "")); } }

// distinctive markers per block
const M = {
  voice: "owner: Clifton", DOCTRINE: "LOCKED DOCTRINE", ACTIONS: "TAKING ACTION IN THE APP",
  EXPERT: "MGSF EXPERT LIBRARY", COMPETITIVE: "HOW KLYFTON OPERATES", PLATFORM: "",
  FOAM: "FOAM SPECS WE RUN", HVAC: "HVAC ENGINEERING", ACCT: "ACCOUNTING & FINANCE",
};

console.log("Brain assembly (GraphRAG wiring) tests\n");

const FULL = A("");
ok("trivial input ('') -> FULL brain", FULL.length > 60000, FULL.length);
["", "hi"].forEach(q => ok("trivial ('" + q + "') -> full", A(q).length === FULL.length));

// CORE always present on every query (identity, doctrine, operating principles, actions, expert router)
["closed-cell foam for a shop", "zzznonsense", "whats my AR", "is it too cold to spray?"].forEach(q => {
  const s = A(q);
  ok("core: keeps owner voice        (q=\"" + q.slice(0, 20) + "\")", s.includes(M.voice));
  ok("core: keeps LOCKED DOCTRINE    (q=\"" + q.slice(0, 20) + "\")", s.includes(M.DOCTRINE));
  ok("core: keeps ACTIONS contract   (q=\"" + q.slice(0, 20) + "\")", s.includes(M.ACTIONS));
  ok("core: keeps EXPERT_LIBRARY     (q=\"" + q.slice(0, 20) + "\")", s.includes(M.EXPERT));
  ok("core: keeps COMPETITIVE_EDGE   (q=\"" + q.slice(0, 20) + "\")", s.includes(M.COMPETITIVE));
});

// domain routing: foam question keeps FOAM_SPECS
(() => {
  const s = A("how much closed-cell foam for a metal shop and whats the ROI?");
  ok("foam/ROI query keeps FOAM_SPECS", s.includes(M.FOAM));
  ok("foam/ROI query length <= full", s.length <= FULL.length);
})();

// a narrow question actually trims (proves selection is doing something, not just returning full)
(() => {
  const s = A("is it too cold to spray on this substrate today?");
  ok("narrow spray-conditions query trims below full", s.length < FULL.length, s.length + " < " + FULL.length);
  ok("narrow spray query still keeps FOAM_SPECS (relevant)", s.includes(M.FOAM));
})();

// determinism
ok("deterministic: same query -> identical assembly",
   A("foam roof coating for a pole barn") === A("foam roof coating for a pole barn"));

// ---- tool bag wired into the brain: minds are told their real, current toolkit ----
(() => {
  const savedA = process.env.ANTHROPIC_API_KEY, savedH = process.env.HUBSPOT_TOKEN;
  delete process.env.ANTHROPIC_API_KEY; delete process.env.HUBSPOT_TOKEN;
  const off = m.toolBagBlock();
  ok("toolBagBlock returns a TOOLBOX grounding block", off.includes("KLYFTON TOOLBOX"));
  ok("keyless compute tools show as LIVE even with no keys", off.includes("LIVE now:") && off.includes("curriculum"));
  ok("unconfigured tools listed as OFF (won't be offered as working)", off.includes("OFF (needs") && /crm|arms/.test(off));
  process.env.ANTHROPIC_API_KEY = "sk-test";
  ok("setting a key moves that tool into LIVE", /LIVE now:[^\n]*hive/.test(m.toolBagBlock()));
  // restore env so nothing leaks to other suites
  if (savedA === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = savedA;
  if (savedH === undefined) delete process.env.HUBSPOT_TOKEN; else process.env.HUBSPOT_TOKEN = savedH;
})();

// ---- router is taught to prefer live tools ----
(() => {
  const savedW = process.env.ALERTS_WEBHOOK_URL;
  delete process.env.ALERTS_WEBHOOK_URL;
  const hint = m.routerToolHint();
  ok("routerToolHint gives the Queen a CAPABILITY STATUS rule", hint.includes("CAPABILITY STATUS") && /prefer recruiting minds/.test(hint));
  ok("router hint separates LIVE from OFF tools", hint.includes("LIVE:") && hint.includes("OFF:"));
  ok("webhook-gated tool (notify) shows OFF with no webhook", /OFF:[^]*notify/.test(hint));
  process.env.ALERTS_WEBHOOK_URL = "https://hook.example/x";
  ok("setting the webhook moves notify to LIVE for the router", /LIVE:[^]*notify/.test(m.routerToolHint()));
  if (savedW === undefined) delete process.env.ALERTS_WEBHOOK_URL; else process.env.ALERTS_WEBHOOK_URL = savedW;
})();

console.log("\n" + pass + " passed, " + fail + " failed.");
process.exit(fail ? 1 : 0);
