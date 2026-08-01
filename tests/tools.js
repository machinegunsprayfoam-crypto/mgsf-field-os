#!/usr/bin/env node
// Klyfton tool bag — catalog integrity + honest live-status. Run: `node tests/tools.js`.
// Deterministic, keyless, no network. Proves the catalog is well-formed, that gated tools
// report dark with no keys and live when their key is present (status sourced from health.js),
// and that keyless compute tools are always live.

const path = require("path");
const T = require(path.join(__dirname, "..", "api", "tools.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

console.log("Klyfton tool bag — catalog + live-status\n");

// ---- integrity ----
const v = T.validate({});
ok("catalog is valid (ids unique, every tool has does/category/module)", v.ok, v.errors.join("; "));
ok("catalog has a real toolkit (>=20 tools)", v.count >= 20, v.count);

// ---- empty env: keyless tools live, gated tools dark, never throws ----
const empty = T.catalog({});
ok("empty env ⇒ catalog builds, no throw", empty.ok === true);
ok("keyless compute tools are live with no env", T.find("foam-calc", {}).live === true && T.find("curriculum", {}).live === true);
ok("gated tools are dark with no env", T.find("crm", {}).live === false && T.find("arms", {}).live === false);
ok("dark tools come with an 'arm' hint (how to turn on)", empty.darkTools.length > 0 && empty.darkTools.every((d) => typeof d.arm === "string"));
ok("live count = sum of live tools", empty.live === empty.tools.filter((t) => t.live).length);

// ---- status is sourced from health (turns on when the key is present) ----
const withHive = T.catalog({ ANTHROPIC_API_KEY: "sk-test" });
ok("hive goes live when ANTHROPIC_API_KEY is set", (T.find("hive", { ANTHROPIC_API_KEY: "sk-test" }) || {}).live === true, JSON.stringify(withHive.byCategory));
const withCrm = T.find("crm", { HUBSPOT_TOKEN: "tok" });
ok("crm goes live when HUBSPOT_TOKEN is set", withCrm && withCrm.live === true);
ok("more keys ⇒ more live tools than empty env", withHive.live > empty.live);

// ---- keyless tools never depend on env ----
ok("keyless tool live-status is identical across envs", T.find("roi", {}).live === T.find("roi", { ANYTHING: "x" }).live);

// ---- categories + counts ----
ok("byCategory totals sum to count", Object.values(empty.byCategory).reduce((a, c) => a + c.total, 0) === empty.count);
ok("catalog spans multiple categories (>=6)", Object.keys(empty.byCategory).length >= 6, Object.keys(empty.byCategory).join(","));

// ---- handler returns the catalog without needing a real res ----
const viaHandler = T.handler({}, null);
ok("handler returns the catalog object", viaHandler && viaHandler.ok === true && typeof viaHandler.count === "number");

// ---- find on a miss ----
ok("find() on unknown id ⇒ null (no throw)", T.find("nope", {}) === null);

// ---- WIRING INTEGRITY: every catalog entry's module path points to a real file ----
// (the catalog powers cmdb/boot/toolBagBlock; a renamed/removed module left in the catalog would
//  advertise a phantom tool in the self-map. This guards that drift — same class as klyfton/retriever guards.)
const fs = require("fs");
const cat = T.catalog().tools;
ok("catalog is non-trivial", Array.isArray(cat) && cat.length >= 40, cat && cat.length);
const withMod = cat.filter((e) => e.module);
const brokenMod = withMod.filter((e) => !fs.existsSync(path.join(__dirname, "..", e.module)));
ok("every catalog module path resolves to a real file (no phantom tool)", brokenMod.length === 0, brokenMod.map((e) => e.id + "→" + e.module).join(","));
const ids = cat.map((e) => e.id);
ok("catalog tool ids are unique", ids.length === new Set(ids).size);

console.log("\n" + (fail ? "✗" : "✓") + " " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
