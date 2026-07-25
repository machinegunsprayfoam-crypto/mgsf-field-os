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

## Phase 2 — Command Center UI ✅ BUILT
- **`api/command-center.js`** — read endpoint: 7-day KPI tiles + top-agents leaderboard (from the
  `v_agent_kpis_7d` / `v_agent_leaderboard` views) + the real 8-mind roster with live per-agent
  stats merged in. Read-only, gated on Supabase, honest empty state (no fabricated numbers).
- **`public/index.html`** — new **OPS** nav item → `mod-command` panel: 4 KPI tiles + agent grid +
  30-day leaderboard + refresh, in the app's theme. `renderCommand()` fetches the endpoint; shows a
  roster-only state until telemetry is turned on. Additive/isolated — no other module touched.
- **Activation:** run `db/schema.sql` in Supabase + set `SUPABASE_URL` + service-role key; then the
  tiles fill from real logged runs.

## Phase 3 — Roster
Grow the agent roster with agents that do real MGSF work (e.g. the Latent Node / knowledge-
graph agent), not a vanity count.

## Cross-references
- [`db/schema.sql`](db/schema.sql) · [`api/klyfton.js`](api/klyfton.js) · [`api/sync.js`](api/sync.js)
- [`CLAUDE.md`](CLAUDE.md)
