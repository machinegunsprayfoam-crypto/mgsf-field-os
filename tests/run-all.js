#!/usr/bin/env node
// Runs every brain/estimator test suite and reports one combined result. `node tests/run-all.js`.
// Exit 0 only if all suites pass — usable as a pre-commit / pre-deploy gate. Keyless, no npm.

const { execFileSync } = require("child_process");
const path = require("path");

const SUITES = [
  ["calc-invariants", "estimator math invariants"],
  ["calc-money", "commission / payment-schedule / unit-convert math"],
  ["brain-retrieve", "GraphRAG routing"],
  ["brain-assembly", "brain block selection (live wiring)"],
  ["brain-context", "live-data grounding (gated)"],
  ["missed-call", "speed-to-lead / missed-call recovery"],
  ["orchestrator", "verify-and-correct loop (plan/run/critique/retry)"],
];

let totalPass = 0, totalFail = 0, suitesFailed = 0;
console.log("MGSF brain/estimator test gate\n");
for (const [file, desc] of SUITES) {
  let out = "", failedRun = false;
  try { out = execFileSync("node", [path.join(__dirname, file + ".js")], { encoding: "utf8" }); }
  catch (e) { failedRun = true; out = (e.stdout || "") + (e.stderr || ""); }
  const m = out.match(/(\d+) passed, (\d+) failed/);
  const p = m ? +m[1] : 0, f = m ? +m[2] : (failedRun ? 1 : 0);
  totalPass += p; totalFail += f;
  const bad = failedRun || f > 0;
  if (bad) suitesFailed++;
  console.log((bad ? "  ✗ " : "  ✓ ") + file.padEnd(16) + " " + (m ? m[0] : (failedRun ? "RUN ERROR" : "(no result)")) + "  — " + desc);
}
console.log("\n" + (suitesFailed ? "✗ " : "✓ ") + SUITES.length + " suites, " + totalPass + " checks passed, " + totalFail + " failed"
  + (suitesFailed ? " (" + suitesFailed + " suite(s) failing)" : " — all green"));
process.exit(suitesFailed ? 1 : 0);
