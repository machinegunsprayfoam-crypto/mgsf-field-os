#!/usr/bin/env node
// tests/engineer.js — Engineer agent: platform assessment + suggestions + improvement planning.
// Keyless, no network. `node tests/engineer.js`.

const { assess, suggest, buildFindings, bankCoverage } = require("../api/engineer");
const health = require("../api/health");

let pass = 0, fail = 0;
function ok(label, cond) { if (cond) { pass++; } else { fail++; console.error("  FAIL:", label); } }

// ---- bankCoverage ----
ok("bankCoverage empty array → {}", JSON.stringify(bankCoverage([])) === "{}");
ok("bankCoverage counts by module", (() => {
  const bank = [
    { module: "a", id: "a1" }, { module: "a", id: "a2" }, { module: "b", id: "b1" }
  ];
  const c = bankCoverage(bank);
  return c.a === 2 && c.b === 1;
})());
ok("bankCoverage ignores items with no module", (() => {
  const c = bankCoverage([{ id: "x" }, { module: "m", id: "m1" }]);
  return !c.undefined && c.m === 1;
})());
ok("bankCoverage reads curriculum.BANK when no arg", (() => {
  const c = bankCoverage();
  return typeof c === "object" && Object.keys(c).length > 0;
})());

// ---- buildFindings ----
const noEnvReport   = health.buildReport({});
const fullEnvReport = health.buildReport({ ANTHROPIC_API_KEY: "x", HUBSPOT_TOKEN: "x",
  SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "x",
  OPENAI_API_KEY: "x", ALERTS_WEBHOOK_URL: "x", KLYFTON_MONTHLY_BUDGET_USD: "100",
  TWILIO_ACCOUNT_SID: "x", TWILIO_AUTH_TOKEN: "x", TWILIO_FROM: "+1",
  SAM_API_KEY: "x", GOOGLE_MAPS_API_KEY: "x", PRICING_CSV_URL: "x",
  CREW_CODE: "x", CRON_SECRET: "x" });
const cmdb          = require("../api/cmdb");
const noEnvCmdb     = cmdb.report({});
const fullEnvCmdb   = cmdb.report({ ANTHROPIC_API_KEY: "x", HUBSPOT_TOKEN: "x",
  SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "x",
  OPENAI_API_KEY: "x", ALERTS_WEBHOOK_URL: "x", KLYFTON_MONTHLY_BUDGET_USD: "100" });

ok("buildFindings returns array", Array.isArray(buildFindings(noEnvReport, noEnvCmdb)));
ok("buildFindings on no-env includes core_down finding (hive off)", (() => {
  const f = buildFindings(noEnvReport, noEnvCmdb);
  return f.some(x => x.type === "core_down" && x.id === "hive");
})());
ok("core_down has priority 1", (() => {
  const f = buildFindings(noEnvReport, noEnvCmdb);
  return f.find(x => x.type === "core_down")?.priority === 1;
})());
ok("buildFindings on full-env → no core_down", (() => {
  const f = buildFindings(fullEnvReport, fullEnvCmdb);
  return !f.some(x => x.type === "core_down");
})());
ok("biggest_unlock has priority 2", (() => {
  // No-env: webhook is the biggest unlock (arms + 10 crons all need it)
  const f = buildFindings(noEnvReport, noEnvCmdb);
  const bu = f.find(x => x.type === "biggest_unlock");
  return !bu || bu.priority === 2;
})());
ok("biggest_unlock listed only when unlocks>1", (() => {
  // With full env, nothing to unlock → no biggest_unlock
  const f = buildFindings(fullEnvReport, fullEnvCmdb);
  return !f.some(x => x.type === "biggest_unlock");
})());
ok("findings sorted by priority", (() => {
  const f = buildFindings(noEnvReport, noEnvCmdb);
  for (let i = 1; i < f.length; i++) if (f[i].priority < f[i - 1].priority) return false;
  return true;
})());
ok("findings have required fields", (() => {
  const f = buildFindings(noEnvReport, noEnvCmdb);
  return f.every(x => x.type && x.id && x.label && typeof x.priority === "number" && x.action);
})());
ok("partial subsystem appears in findings", (() => {
  // Memory is partial when Supabase is set but OPENAI_API_KEY is not
  const e = { SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "x", ANTHROPIC_API_KEY: "x" };
  const r = health.buildReport(e);
  const c = cmdb.report(e);
  const f = buildFindings(r, c);
  return f.some(x => x.type === "partial" && x.id === "memory");
})());
ok("dark subsystem appears in findings", (() => {
  // CRM is dark when HUBSPOT_TOKEN absent
  const e = { ANTHROPIC_API_KEY: "x" };
  const r = health.buildReport(e);
  const c = cmdb.report(e);
  const f = buildFindings(r, c);
  return f.some(x => x.id === "crm");
})());

// ---- assess ----
ok("assess returns ok:true on empty env", (() => {
  const a = assess({});
  return a && a.ok === true;
})());
ok("assess has assessed.health field", typeof assess({}).assessed.health === "string");
ok("assess has findings array", Array.isArray(assess({}).findings));
ok("assess has topPriority (when env is empty)", (() => {
  const a = assess({});
  return a.topPriority !== null && a.topPriority.type !== undefined;
})());
ok("assess.curriculum has modules + totalItems", (() => {
  const a = assess({});
  return typeof a.curriculum.modules === "number" && typeof a.curriculum.totalItems === "number";
})());
ok("assess.curriculum.totalItems > 0", assess({}).curriculum.totalItems > 0);
ok("assess.curriculum.coverage is array", Array.isArray(assess({}).curriculum.coverage));
ok("assess.cmdb has live/dark/total", (() => {
  const a = assess({});
  return typeof a.cmdb.live === "number" && typeof a.cmdb.dark === "number" && typeof a.cmdb.total === "number";
})());
ok("assess.summary is object (type counts)", typeof assess({}).summary === "object");
ok("assess has note about drafts", typeof assess({}).note === "string" && assess({}).note.includes("approval"));
ok("assess on fully-wired env → health not degraded", (() => {
  const e = { ANTHROPIC_API_KEY: "x", HUBSPOT_TOKEN: "x",
    SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "x" };
  const a = assess(e);
  return a.assessed.health !== "degraded";
})());

// ---- suggest ----
ok("suggest unknown id → ok:false", (() => {
  const s = suggest("nonexistent", []);
  return s && s.ok === false && s.error === "finding_not_found";
})());
ok("suggest known id → ok:true", (() => {
  const findings = assess({}).findings;
  if (!findings.length) return true; // nothing to suggest on a bare env
  const s = suggest(findings[0].id, findings);
  return s && s.ok === true;
})());
ok("suggest returns action field", (() => {
  const findings = assess({}).findings;
  if (!findings.length) return true;
  const s = suggest(findings[0].id, findings);
  return typeof s.action === "string" && s.action.length > 0;
})());
ok("suggest core_down gets strong note", (() => {
  const findings = [{ type: "core_down", id: "hive", label: "Hive", priority: 1, action: "set ANTHROPIC_API_KEY" }];
  const s = suggest("hive", findings);
  return s.ok && s.note.includes("Core");
})());
ok("suggest biggest_unlock mentions tools count", (() => {
  const findings = [{ type: "biggest_unlock", id: "webhook", label: "Webhook", priority: 2, action: "set ALERTS_WEBHOOK_URL", unlocks: 10, tools: [] }];
  const s = suggest("webhook", findings);
  return s.ok && s.note.includes("10");
})());
ok("suggest warning mentions misnamed", (() => {
  const findings = [{ type: "warning", id: "OPENAI_API_KEY", label: "OPENAI_API_KEY", priority: 2, action: "rename it" }];
  const s = suggest("OPENAI_API_KEY", findings);
  return s.ok && s.note.toLowerCase().includes("misnamed");
})());
ok("suggest partial mentions finishing keys", (() => {
  const findings = [{ type: "partial", id: "memory", label: "Memory", priority: 3, action: "set OPENAI_API_KEY" }];
  const s = suggest("memory", findings);
  return s.ok && s.note.toLowerCase().includes("partial") || s.note.toLowerCase().includes("finish");
})());
ok("suggest dark describes optional", (() => {
  const findings = [{ type: "dark", id: "govcon", label: "GovCon", priority: 4, action: "set SAM_API_KEY" }];
  const s = suggest("govcon", findings);
  return s.ok && s.note.toLowerCase().includes("optional") || s.note.toLowerCase().includes("set when");
})());
ok("suggest returns typeLabel", (() => {
  const findings = [{ type: "core_down", id: "hive", label: "Hive", priority: 1, action: "set key" }];
  const s = suggest("hive", findings);
  return typeof s.typeLabel === "string" && s.typeLabel.length > 0;
})());

// ---- plan: no ANTHROPIC_API_KEY → graceful error ----
(async () => {
  const r = await require("../api/engineer").plan({}, {});
  ok("plan no api key → ok:false + hive_dark error", r && !r.ok && r.error === "hive_dark");
  ok("plan no api key → descriptive detail", r && typeof r.detail === "string" && r.detail.includes("ANTHROPIC_API_KEY"));

  // ---- module syntax check ----
  ok("engineer.js passes node -c", (() => {
    const { execFileSync } = require("child_process");
    try { execFileSync("node", ["--check", require("path").join(__dirname, "../api/engineer.js")]); return true; }
    catch { return false; }
  })());

  console.log("\n" + (fail ? "  ✗ " : "  ✓ ") + (pass + fail) + " passed, " + fail + " failed  — engineer: assessment + suggestions + plan-gating");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("UNCAUGHT:", e); process.exit(1); });
