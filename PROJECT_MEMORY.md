# PROJECT MEMORY — read this FIRST, every session

Single source of truth for the MGSF build so no session starts blind or re-derives what's
already known. If something here conflicts with a vague memory, **this file wins.** Keep it
current: when you finish a unit of work or make a decision, update the relevant section here in
the same commit. Doctrine numbers (`mgsf-core.skill`) still win over everything.

_Last updated: 2026-07-25._

## 1. What this is / repos
- **mgsf-field-os** — Klyfton AI (the app): `api/klyfton.js` = Queen router → worker minds → synthesizer/critic hive; `public/index.html` = single-file app; Supabase brain; **Vercel PRO**, auto-deploys **from `main`**.
- **mgsf-marketing** — the public site (20 pages), Vercel, cleanUrls.
- **MGSF** — MOGS (Apps Script ERP/CRM/estimator over Google Sheets).
- Work branch (all three): **`claude/klyfton-ai-problems-ynhx9f`**. **Never merge to main without Clifton's OK.**

## 2. Current build state
**Klyfton backend (field-os) — shipped to branch, not merged:**
- `agent_runs` telemetry table + KPI views (Command Center **Phase 1**). Owner step to activate: re-run `db/schema.sql` in Supabase + confirm `SUPABASE_URL`/service-role key in Vercel.
- Command Center **Phase C** ✅ — live drivetrain strip in the app (recent gear-turns from `events`).
- **VEHICLE ARCHITECTURE** ([`VEHICLE_ARCHITECTURE.md`](VEHICLE_ARCHITECTURE.md)) — Clifton's frame: the whole system is a car (engine=hive, transmission=gearbox, clutch=arms/approval, driveshaft=event spine, differential=Queen router, dashboard=Command Center, battery=memory, brakes=doctrine gates, wheels=outward actions). **★ Two prime movers:** the ENGINE (event-driven/reactive) and the **AXLE that drives TIME** (the scheduler — daily brief, sweeps, cert-expiry, SAM scans turn the same drivetrain on a cadence). Powertrain refinements: **engine powers the Queen** (Queen is driven); **dual AI⟷owner transmission** — same gears driven from both sides, gated gears owner-only (= the approval gate as a transmission); **RPM sets speed** (speed ≈ rpm × engaged; throttle=throughput). 3D model updated (same URL). Next build: the axle = a time-driven `turn()` that engages a saved transmission program on a schedule.
- Command Center **Phase 2 UI** ✅ — `api/command-center.js` (read endpoint) + `public/index.html` OPS nav → `mod-command` panel (KPI tiles + agent grid + leaderboard, `renderCommand()`). Real data once telemetry is on; honest roster-only state until then.
- Brain blocks added: STEM, HVAC, accounting/finance, MASTERY, GAP_BRIDGES, PROCUREMENT, EQUIPMENT, **COMPETITIVE_EDGE** (all wired into BOTH prompt builders; `node -c` clean).
- 4 capabilities: `api/missed-call.js`, `api/estimate-followup.js`, `api/photo-estimate.js`, self-healing `runMindResilient` in klyfton.js.
- **`api/act.js` = the "arms"** — gated outward executor (email/sms/appointment/crm/invoice/order). Requires `approved:true`; dispatches via `ALERTS_WEBHOOK_URL`; **inert until that env is set**.
- **`api/memory.js` = semantic memory (pgvector)** — Klyfton's real long-term recall. `remember`/`recall` (top-K by embedding similarity). Gated on Supabase + `OPENAI_API_KEY` (text-embedding-3-small, 1536-dim); stores notes without a vector if no embed key (degrades to note recall). Wired into klyfton.js: every non-trivial message best-effort recalls the 6 most relevant facts (no-op/zero-cost when unconfigured). **Owner activation:** run the SEMANTIC MEMORY block in `db/schema.sql` + set `OPENAI_API_KEY` in Vercel.
- Docs: COMPETITIVE_ANALYSIS.md, CAPABILITIES_ROADMAP.md, OPERATIONS_COMMAND_CENTER.md.

**Marketing — COMPLETE (Passes 16–25 in mgsf-marketing/NIGHT_LOG.md):** crawl-space page built (SEO_GAPS P1), all internal links + sitemap + og:url + FAQ schema (9/9 service pages) + canonical/robots/alt all verified. Nothing safe left to add.

## 3. Key decisions + rationale (don't relitigate)
- **v2.0 / Silvr is DEAD scaffolding, not a TODO.** `IMPROVEMENTS.md`'s "✓ Deployed" was false. 6 of the 7 files never existed; only `hubspot-sync.js` exists (pure fetch, redundant with `hubspot.js`, kept ignored). Vercel **Pro** lifted the old 12-fn cap (api/ already ~38 fns). Intent since rebuilt in plain fetch: arms=`act.js`, parallelism=the hive, persistence=`agent_runs`, govcon=`samgov.js`. Only genuinely-unbuilt idea = **predictive lead scoring** (fresh build).
- **KLYFTON_V2_UPGRADE_PLAN (Drive doc, 7/24)** is the real roadmap — "same rooms, real hallways." Its InfraNodus gap pass already ran (3 gaps: brain can't see certs/docs; assistant↔CRM don't talk; assistant can't see the job). Recommended start = **Phase A** (stage certs/docs + cert-expiry watch).
- **Hearth** is Clifton's missed-call AI → `missed-call.js` must defer to Hearth (don't double-text). Also Hearth = $0-down financing partner on the marketing site.
- Competitor scan done (~34 tools); Klyfton's edge = vertical contractor fit + owner's voice + self-hosted (no per-seat bill).
- **Klyfton's brain stays CLAUDE-LOCKED (Clifton's call 2026-07-25)** — Haiku router + Sonnet workers/critic (Opus optional). One tuned voice > swappable. Other models only for UTILITY: OpenAI embeddings (semantic memory) + OpenAI/ElevenLabs TTS. Do NOT make the brain model-agnostic. (MOGS, the separate ERP, IS multi-provider via AIProvider.gs — that's fine, different system.)

## 4. Standing constraints (hard rules — always)
- Never fabricate numbers/prices/specs; label ESTIMATED; doctrine (`mgsf-core`) wins.
- Never guarantee savings; never claim mold elimination; no implied engineering w/o a licensed PE.
- Everything outward = **draft for Clifton's approval**; hard gate on money/binding/irreversible.
- Do NOT touch pricing or the `g.pe`/`g.page` review link (flagged for Clifton).
- **No Sunday** work/scheduling. Commit author: `Machine Gun Spray Foam <machinegunsprayfoam@gmail.com>`. Never put the model identifier in commits/PRs/code. Verify code parses before commit.
- Reference existing PRs (MGSF #3, marketing #1, setup-assistant #3, html-parsing #2) — don't open new ones unless asked.

## 5. Open threads / pending (what to pick up)
- **Owner-gated (do NOT do unilaterally):** merge branch→main; confirm Terra-Lok/soil pricing; fix `g.pe`→`g.page`; submit sitemap to Search Console; enter real fleet #s in `equipment_database.csv`; wire `ALERTS_WEBHOOK_URL` to bring the arms live.
- **Bigger builds awaiting Clifton's go:** Command Center **UI (Phase 2)** ✅ built; **predictive lead scoring**; v2 plan **Phase A**.
- **★ GEARBOX — Phase A+B+DUAL-DRIVE BUILT (2026-07-25): `api/gearbox.js` + `events` table + `v_gearbox_recent` + drivetrain field in command-center. Remaining: Phase C (Command Center UI strip) + wiring real `turn()` triggers into modules (estimate close → turn a gear) + Phase D health. Spec: [`GEARBOX_SPEC.md`](GEARBOX_SPEC.md).**
- **★ DUAL-DRIVE (BUILT 2026-07-25):** every handler in gearbox.js is tagged `{drive:"ai"|"owner", fn}`. **AI gears** run autonomously + cascade; **owner gears** (Invoice, Review-SMS, Follow-up nudge) draft via act.js and go `blocked`, stopping the cascade, until the same `turn()` is re-issued with `approved:true` (owner transmission engages → arms.execute approved:true, still act.js-gated, inert until `ALERTS_WEBHOOK_URL`). API: `POST {action:"turn",event:{…},approved?:true}`; response carries `drive` + `blocked`. Verified: estimate.closed(AI) cascades lead.won→invoice.created then blocks; invoice.created+approved engages. The approval gate IS the owner's transmission (§7a of the spec).
- **★ TRANSMISSION COUPLING (SPEC 2026-07-25, [`TRANSMISSION_COUPLING.md`](TRANSMISSION_COUPLING.md)):** Clifton's idea — every OTHER AI platform (Hearth, Zapier, vendor agents) bolts its own transmission onto the gearbox via one standard port: `POST /api/gearbox {…, coupling:{platform, token}}`. Per-platform token→**grade** (read / signal / drive / bonded) caps which gears it can turn + whether it can touch the owner side. Default grade=signal; `bonded` (owner-side, `approved:true`) is owner-granted per-gear, audited. First live coupling = Hearth (`call.missed` at signal). Reverse coupling = outbound gated drafts to `COUPLING_<PLATFORM>_URL`. NOT BUILT yet — spec only, awaiting Clifton's go + token envs. **3D MODEL of it published (artifact):** https://claude.ai/code/artifact/d691e871-9e49-4c03-b2cf-af208672ca7d — interactive drivetrain: spine=event backbone, nerves=signals, Queen=driver that turns many, transmission=clutch engaging gears, outward gears (⚠) gated. Expanded concepts to fold into the build: **spine has nerves** (each event = a signal traveling a nerve from the spine to a gear); **one gear drives many/all** (driver fan-out); **transmission plug-in** = selectable engagement (config choosing which consumer gears couple to a driving event). **Refined (Clifton):** transmission must support ANY/ALL combinations (one → few → many → all) — per-gear clutch + presets (All/None/Workers/Money). Mechanically, each gear rides a **rod on its backside pushed FORWARD along Z to mesh the Queen** (engagement = depth motion, not a flag). In code terms: engagement = a subscription binding that can couple any arbitrary subset of consumer gears to a driving event; the "rod forward" = subscribe/engage, "rod back" = free-wheel/unsubscribe. Clifton's model: modules as **gears**, not arms — each has an output face (emits typed events) + input face (consumes them); they **mesh** (turn one, the train turns). Arms = reach OUT of the machine (act.js); gears = the transmission INSIDE (module↔module, both ways). Fixes the "good rooms, missing hallways" gap InfraNodus keeps flagging. Build: `events` table + `emit()` + `/api/gearbox` dispatcher + per-module `GEARS` {emits,consumes}; first meshes estimate.closed→CRM→invoice, job.completed→review/roof, estimate.sent→follow-up. Outward teeth ALWAYS gated through act.js approval; internal turns auto (reversible/zero-$). Command Center gets a live drivetrain strip. Supersedes the plain "octopus" idea (gears is the more important half — integration, not just parallel output).
- **InfraNodus scan queue** (`/home/user/REPO_SCAN_PROGRESS.md`): SKILLS→MODULES→EXPERTS→DRIVE→setup-assistant→html-parsing. Only MGSF done. Corpora staged. **Only runs interactively** (connector absent in cron; ~1 call/15min rate limit).
- **Clifton's Command-Center↔Klyfton pipeline (4 steps, staged, awaiting InfraNodus):** (1) scan `/home/user/CC_CORPUS.md` (Command Center); (2) scan `/home/user/KLYFTON_CORPUS.md` (whole brain); (3) FIX discrepancies in both — safe code/doc fixes directly, FLAG owner-gated ones, never fabricate; (4) CROSS-COMPARE the two for mutual upgrades. Both corpora staged; pipeline steps written at the bottom of KLYFTON_CORPUS.md. Runs when InfraNodus reconnects (flapping all session; ~1 call/15min).

## 6. Environment gotchas (save yourself the rediscovery)
- **Cron/scheduled fires carry NO MCP connectors** (InfraNodus/Drive/Vercel/GitHub-MCP). Local tools only. Connectors work only in Clifton's **interactive** sessions.
- InfraNodus: interactive-only + **429 after ~1 call/15min**. Don't churn scheduled retries — they always miss.
- App runs on built-in `fetch` only — **no `package.json`, no npm** (`vercel.json` = `echo skip-install`). New api functions must be plain fetch.
- Klyfton brain blocks must be wired into BOTH builders in klyfton.js (specialist `runMind` + `buildSynthSys`).

## 7. Doc index (where detail lives)
- Marketing worklog → `mgsf-marketing/NIGHT_LOG.md` · Scan queue → `/home/user/REPO_SCAN_PROGRESS.md`
- Competitors → `COMPETITIVE_ANALYSIS.md` · Capabilities → `CAPABILITIES_ROADMAP.md` · Command Center → `OPERATIONS_COMMAND_CENTER.md`
- v2.0 truth → `IMPROVEMENTS.md` + `.vercelignore` · MOGS guide → `../MGSF/CLAUDE.md`

## Cross-references
- [`CLAUDE.md`](CLAUDE.md) · [`api/klyfton.js`](api/klyfton.js) · [`CAPABILITIES_ROADMAP.md`](CAPABILITIES_ROADMAP.md) · [`OPERATIONS_COMMAND_CENTER.md`](OPERATIONS_COMMAND_CENTER.md)
