# Klyfton AI — MGSF Field OS (working guide for Claude)

Klyfton AI is the multi-agent command system for **Machine Gun Spray Foam & Concrete Lifting, LLC**
(Glendive, MT — serving MT/ND/SD/WY). It is a single-file PWA over a set of Vercel serverless
functions, with a Claude "hive" (Queen → worker → critic) as the brain.

> **Note on history:** earlier versions of this file described a "Silvr" / "v2.0" integration layer
> (a `SilvrWorker`, `SILVR_*` env vars, an `api/silvr.js`). **None of that was ever built** — per
> [`PROJECT_MEMORY.md`](PROJECT_MEMORY.md) (the authoritative source of truth) it was dead scaffolding.
> The capabilities it *described* were since rebuilt in plain `fetch`: **arms** = `api/act.js`,
> **parallelism** = the hive in `api/klyfton.js`, **persistence** = Supabase (`agent_runs` etc.),
> **GovCon** = `api/samgov.js`. This file now documents only what actually exists. For live build
> state, always defer to `PROJECT_MEMORY.md`.

## ⚡ Session-Start Protocol (do this FIRST, every session)

**0. Read [`PROJECT_MEMORY.md`](PROJECT_MEMORY.md) FIRST** — the single source of truth for build
state, decisions already made, standing constraints, open threads, and environment gotchas. It
exists so no session starts blind or re-derives settled facts. When you finish a unit of work or
make a decision, update it in the same commit. It wins over vague memory (doctrine still wins over it).

**Google Drive changes constantly — audit it before doing any work.** At the start of every
session, before building or advising:

1. **Check the skills area** — `02_Skills_and_Packs` folder (and `claude-code-skills` / `skills`)
   for new or updated `mgsf-*.skill` packages. `mgsf-core.skill` is the authoritative doctrine
   (locked pricing, cost constants, GM targets, state multipliers, gates) — **it wins over any
   conflicting number in code.**
2. **Check recent Drive files** (`list_recent_files`) for new expert docs, pricing CSVs, or
   decision logs since last session.
3. **Reconcile** anything new/changed into Klyfton's brain (`api/klyfton.js` DOCTRINE /
   EXPERT_LIBRARY blocks) before working. Flag pricing conflicts to Clifton — never silently
   pick a rate. Newest-dated locked rate wins.
4. **GovCon check (Tango, not GovTribe — GovTribe is cancelled):** run a quick Tango
   `search_opportunities` for MGSF's lane (NAICS 238310/238160/238190) in MT/ND/SD/WY + VA
   SDVOSB set-asides. Flag only real, in-region, in-trade opportunities. (The app's SAM.gov
   daily scanner already covers the regional baseline automatically.) A scheduled cron can't
   carry the Tango/Drive connectors, so this check has to happen in an interactive session.

Skip only if the user explicitly says to skip the Drive check.

## Architecture (what actually exists)

- **Frontend**: `public/index.html` — single-file PWA (~13k lines). All UI/modules live here; it
  talks to the backend only through `/api/*` endpoints. `public/portal.html` is the customer-facing
  token-gated portal.
- **Backend**: Vercel serverless functions in `api/*.js` (plain `fetch`, no `package.json`/npm;
  `vercel.json` uses `echo skip-install`). Each module = a **pure core** (keyless, deterministic,
  no `Date.now`) + a **gated live layer** (inert without its env key, never fabricates/throws) +
  approval-gated outward actions.
- **The hive**: `api/klyfton.js` — Queen router → worker → critic over the Anthropic API. Brain
  assembly is a deterministic `BRAIN_ORDER` of blocks; GraphRAG retrieval in
  `api/brain-graph-retrieve.js` over `api/brain-graph-data.js`.
- **Arms (outward actions)**: `api/act.js` — every outward action is a draft/suggestion behind an
  approval gate; nothing auto-sends. Fired over an outbound webhook (`ALERTS_WEBHOOK_URL`) /
  Zapier bus.
- **Data spine**: Supabase (`db/` holds schema + seeds; run order in `db/SETUP.md`) + Vercel KV.
- **Self-map**: `GET /api/boot` computes the live component/capability map FROM THE REAL ENV at
  call time (never stale). `GET /api/health` is the smoke check. `api/cmdb.js` defines which env
  var arms each capability.
- **Access gate**: `api/guard.js` — every data endpoint is dormant until `CREW_CODE` is set; the
  crew enters the code once in the app.
- **Hosting**: Vercel (auto-deploys from GitHub `main`). **CRM**: HubSpot. **Intelligence**:
  Claude via `ANTHROPIC_API_KEY`.

## The test gate (run before every commit — must be green)

```
node tests/run-all.js        # every tests/*.js must be registered in the SUITES array
node -c api/<file>.js         # verify any changed function parses
```

Keep the gate green. Add a `tests/<x>.js` for any new pure logic and register it in
`tests/run-all.js` (a meta-suite enforces the 1:1 mapping).

## Go-live / configuration

Subsystems are **inert until their env var is set in Vercel** (Production scope) and the project is
redeployed. `.env.example` lists every variable (no secrets — real values go in Vercel only).
`GET /api/boot` reports which capabilities are live and names the single biggest unlock. Current
standing unlocks (owner-set): `CREW_CODE` (access gate) and `ALERTS_WEBHOOK_URL` (arms + all
automation crons — the biggest single unlock).

## Owner communication profile (how Clifton wants AI to work)

Clifton Behner — USMC combat veteran, owner of MGSF. Match this style in every reply and in the
app's AI features:
- **Blunt, numbers-first, decision-ready.** Lead with a TL;DR + the top numbers driving the choice.
- **Give 2–3 options** with cost / time / risk, then **name the pick and why**.
- **Ask ≤2 clarifying questions**, otherwise state 1–2 assumptions and proceed. Don't stall a decision.
- Provide **checklists, timelines, KPIs/ROI, go/no-go criteria**. Keep to one screen when possible.
- **Never fabricate** numbers/claims; never guarantee savings; never claim mold elimination.
  Doctrine (`mgsf-core`) wins over any conflicting number in code.
- **Boundaries:** never schedule work/meetings/reminders on **Sundays**; protect family time.
  Brand voice: professional, veteran-owned, direct, confident, practical, blue-collar.

## Build helpers (repo-scoped agents + skills — use them)
- **Agents** (`.claude/agents/`): `gate-keeper` (run the gate → PASS/FAIL verdict), `brain-block-author`
  (author a grounded brain block end-to-end + wire retrieval/curriculum/tests), `field-os-reviewer`
  (review a change against this repo's hard rules before commit/PR).
- **Skill** (`.claude/skills/`): `klyfton-module` — the checklist for adding/changing an `api/*.js`
  module the right way (pure-core + gated-live pattern, test + SUITES registration, env docs).

## Cross-references
- [`PROJECT_MEMORY.md`](PROJECT_MEMORY.md) — authoritative build state · [`db/SETUP.md`](db/SETUP.md) — go-live DB checklist
- `GET /api/boot` — live self-map · `tests/run-all.js` — the gate
