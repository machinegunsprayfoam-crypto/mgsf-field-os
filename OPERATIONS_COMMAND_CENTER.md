# Operations Command Center — build status

Goal: a Klyfton "Operations Command Center" (like the Mindra ad) — an agent roster with
**real** KPIs (tasks completed, success rate, top agents). Built on actual logged runs,
never fabricated numbers (doctrine).

## Phase 1 — Agent-run telemetry ✅ (this commit)
Every Klyfton request (Queen → Worker → Critic) now records one row so the KPIs have a
real source.

- **`db/schema.sql`** — new `agent_runs` table (mode, agent, minds, task, status,
  duration_ms, model, cost_usd, ts) with RLS on (server-only), plus two views the
  dashboard will read:
  - `v_agent_kpis_7d` — the four stat tiles (tasks, active agents, success %, avg ms) over 7 days.
  - `v_agent_leaderboard` — top agents (hive runs credit every mind), 30 days.
- **`api/klyfton.js`** — `logAgentRun()` writes one row per request (single & hive,
  streaming & non-streaming, plus empty/error). Fire-and-forget: never throws, never
  blocks the answer.

### Owner step to turn it on (one time)
1. In Supabase → SQL editor, re-run `db/schema.sql` (idempotent — `create table if not
   exists` / `create or replace view`; only the new `agent_runs` + views get added).
2. Confirm Vercel env has `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (or
   `SUPABASE_SECRET_KEY`). If they're already set for `/api/sync`, nothing to do.
3. Redeploy. Logging is **dormant until both are present** — no error if they're not.

Until then Klyfton behaves exactly as before; telemetry is purely additive.

## Phase 2 — Command Center UI (next)
A view in `public/index.html`: agent grid + a 4-tile KPI strip + top-agents leaderboard,
reading `v_agent_kpis_7d` and `v_agent_leaderboard` through `/api/sync` (or a small read
endpoint). Matches the look; the numbers are real (small at first — that's honest).

## Phase 3 — Roster
Grow the agent roster with agents that do real MGSF work (e.g. the Latent Node / knowledge-
graph agent), not a vanity count.

## Cross-references
- [`db/schema.sql`](db/schema.sql) · [`api/klyfton.js`](api/klyfton.js) · [`api/sync.js`](api/sync.js)
- [`CLAUDE.md`](CLAUDE.md)
