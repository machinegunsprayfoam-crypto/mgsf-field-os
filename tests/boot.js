#!/usr/bin/env node
// Klyfton boot manifest — the live self-map. Run: `node tests/boot.js`. Deterministic on env,
// keyless, no network. Proves the map is real (counts come from the actual catalog/CMDB), env-driven
// (a key raises the live count), surfaces the brain snapshot with its staleness note, and lists the
// agent roster + biggest unlock.

const path = require("path");
const B = require(path.join(__dirname, "..", "api", "boot.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

console.log("Klyfton boot — live self-map\n");

const map = B.boot({});
ok("boot builds a map, no throw", map.ok === true && map.service === "klyfton-boot");
ok("generatedFrom is live-env (not a stored snapshot)", map.generatedFrom === "live-env");

// ---- summary is real (counts come from the actual modules) ----
ok("summary counts components + tools", map.summary.components > 0 && map.summary.tools >= 40, JSON.stringify(map.summary));
ok("summary lists the agent roster size", map.summary.agents >= 4);
ok("summary reports curriculum scenarios", map.summary.curriculumScenarios >= 25);
ok("summary reports brain clusters", map.summary.brainClusters >= 5);

// ---- env-driven: a key raises the live count (proves it's not frozen) ----
ok("setting a key raises live components", B.boot({ ANTHROPIC_API_KEY: "k" }).summary.live > map.summary.live);

// ---- biggest unlock is surfaced (decision-ready) ----
ok("biggestUnlock present with no env", map.biggestUnlock && map.biggestUnlock.unlocks > 0);

// ---- brain snapshot surfaced WITH its staleness note (honest) ----
ok("brain clusters listed", Array.isArray(map.brain.clusters) && map.brain.clusters.length >= 5);
ok("brain carries its snapshot source + a regenerate note (staleness visible)", /snapshot/i.test(map.brain.note) && !!map.brain.source);

// ---- tools grouped by category with live counts ----
ok("toolsByCategory has categories with live/total", Object.keys(map.toolsByCategory).length >= 6 && Object.values(map.toolsByCategory).every((c) => typeof c.total === "number"));

// ---- agents roster carries goals ----
ok("agent roster carries goals", map.agents.every((a) => a.id && a.goal));

console.log("\n" + (fail ? "✗" : "✓") + " " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
