#!/usr/bin/env node
// Klyfton CMDB — dependency graph + impact reasoning. Run: `node tests/cmdb.js`.
// Pure/deterministic against env maps, keyless, no network. Covers root-cause (blockedBy), blast
// radius (impactOf), the "biggest unlock" insight, and a DRIFT GUARD: every dark gated tool in the
// catalog must have a dependency edge (so the graph can't silently fall out of sync with the bag).

const path = require("path");
const C = require(path.join(__dirname, "..", "api", "cmdb.js"));
const TOOLS = require(path.join(__dirname, "..", "api", "tools.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

console.log("Klyfton CMDB — dependency graph + impact\n");

// ---- exports ----
ok("exports the graph API", ["CAPS", "DEPS", "blockedBy", "impactOf", "biggestUnlock", "report"].every((f) => C[f] !== undefined));

// ---- dependency edges ----
ok("memory depends on storage + embed", JSON.stringify(C.depsOf("memory").sort()) === JSON.stringify(["embed", "storage"]));
ok("the universal bus depends on the webhook", C.depsOf("zapier-bus").join() === "webhook");
ok("keyless tool (foam-calc) has no deps", C.depsOf("foam-calc").length === 0);

// ---- root cause (blockedBy) is env-driven ----
ok("with no env, crm is blocked by hubspot", C.blockedBy("crm", {}).join() === "hubspot");
ok("with HUBSPOT_TOKEN set, crm is no longer blocked", C.blockedBy("crm", { HUBSPOT_TOKEN: "t" }).length === 0);
ok("memory blocked by BOTH storage+embed with no env", C.blockedBy("memory", {}).sort().join() === "embed,storage");
ok("keyless tool never blocked", C.blockedBy("curriculum", {}).length === 0);

// ---- blast radius (impactOf) ----
const webhookImpact = C.impactOf("webhook");
ok("webhook powers the whole outward fleet (>=8 tools)", webhookImpact.length >= 8, webhookImpact.length);
ok("storage powers memory + wiki + others", C.impactOf("storage").includes("memory") && C.impactOf("storage").includes("wiki"));

// ---- biggest unlock: the single highest-leverage switch ----
const bu = C.biggestUnlock({});
ok("with nothing configured, biggest unlock is the webhook", bu && bu.cap === "webhook", bu && bu.cap);
ok("biggest unlock reports how many tools it lights", bu && bu.unlocks >= 8, bu && bu.unlocks);
ok("biggest unlock carries an arm instruction", bu && /ALERTS_WEBHOOK_URL/.test(bu.arm));
// once the webhook is set, the biggest unlock should shift to something else (not webhook)
const bu2 = C.biggestUnlock({ ALERTS_WEBHOOK_URL: "https://h/x" });
ok("after wiring the webhook, biggest unlock moves on", !bu2 || bu2.cap !== "webhook");

// ---- report shape ----
const r = C.report({});
ok("report counts components + capabilities", r.counts.components > 0 && r.counts.capabilities === Object.keys(C.CAPS).length);
ok("report marks capabilities live/dark", r.capabilities.every((c) => typeof c.live === "boolean"));
ok("setting a key raises the live count", C.report({ ANTHROPIC_API_KEY: "k" }).counts.live > r.counts.live);

// ---- DRIFT GUARD: every dark gated tool in the catalog has a dependency edge ----
const darkGated = TOOLS.catalog({}).tools.filter((t) => !t.live && t.gated);
const missing = darkGated.filter((t) => C.depsOf(t.id).length === 0);
ok("every dark gated tool is mapped in the dependency graph (no drift)", missing.length === 0, "unmapped: " + missing.map((t) => t.id).join(","));

console.log("\n" + (fail ? "✗" : "✓") + " " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
