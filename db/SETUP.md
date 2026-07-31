# Klyfton — Supabase setup (one-shot go-live checklist)

Run these SQL files **in order** in the Supabase SQL editor (project already wired via
`SUPABASE_URL` + a service-role key in Vercel). **All are idempotent** (`if not exists`) — safe to
run once or re-run. After running them, set the paired env var(s) below and redeploy; each subsystem
turns on. `GET /api/health` and `GET /api/cmdb` then show what's live and the biggest next unlock.

## Order to run
| # | File | Creates | Turns on (with env) |
|---|---|---|---|
| 1 | **`schema.sql`** | `leads`, `jobs`, `estimates`, `materials_log`, `invoices`, `crew`, `memory`, `agent_runs` + the **SEMANTIC MEMORY (pgvector)** block | data spine (storage), semantic **memory** |
| 2 | **`wiki_schema.sql`** | `wiki_articles` (+ `embedding` vector) | the **wiki** knowledge base |
| 3 | **`scenarios.sql`** | `scenarios` | deployed **automations** (scenario builder) |
| 4 | **`dispatched_actions.sql`** | `dispatched_actions` | **idempotency** (no double-send) |
| 5 | **`agent_runs.sql`** | `agent_runs` (same table as #1 defines — harmless if already made) | agent **run-history** + **telemetry** |

## Table → env var → feature (what each unlocks)
| Subsystem | Needs (in Vercel) | Notes |
|---|---|---|
| **Storage / data spine** | `SUPABASE_URL` + a service-role key | powers memory, wiki, photo, sync, command-center, telemetry, scenarios, idempotency |
| **Memory (semantic recall)** | + `OPENAI_API_KEY` | embeddings; without it, notes still store (keyword only) |
| **Wiki (semantic retrieval)** | + `OPENAI_API_KEY` | without it, wiki ranks by keyword (still works) |
| **Arms + universal bus** | `ALERTS_WEBHOOK_URL` | **biggest unlock** — lights ~10 outward tools (per `/api/cmdb`) |
| **Access gate** | `CREW_CODE` | gates the data/map endpoints (dormant until set) |
| **CRM call list** | `HUBSPOT_TOKEN` | HubSpot leads → scored call list |
| **Budget throttle (ATS)** | `KLYFTON_MONTHLY_BUDGET_USD` | caps monthly AI spend |
| **Maps / mobilization** | `GOOGLE_MAPS_API_KEY` | drive-distance (math works keyless) |

## Seed content (optional, after #2)
Load the 8 starter wiki articles: `POST /api/wiki { "action":"save", "article":{…}, "approved":true }`
for each entry in **`wiki_seed.json`** (owner-approved writes only).

## Verify
1. `GET /api/health` → each subsystem on/off + what to set.
2. `GET /api/boot` → the full live self-map (components, live/dark, biggest unlock).
3. `node tools/smoke_test.js` (where the keys live) → live checks against the real services.

_All schema files are idempotent; env vars are read by name in the code (see `mgsf-env` skill for exact names)._
