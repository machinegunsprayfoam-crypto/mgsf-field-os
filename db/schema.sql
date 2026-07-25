-- Klyfton structured brain — Supabase schema.
-- Run this ONCE in the Supabase SQL editor (Dashboard → SQL → New query → paste → Run).
-- Mirrors the app's KV collections into queryable tables so Klyfton can do real reporting,
-- forecasting, and pipeline analytics. Each table keeps typed columns for the fields we
-- analyze plus a `raw` JSONB catch-all so nothing is lost if the app adds fields later.
--
-- Security: Row Level Security is ON with NO public policies. All writes come from the
-- /api/db serverless function using the SERVICE ROLE key (which bypasses RLS). The
-- browser never touches this database directly, so the publishable key exposes nothing.

create table if not exists leads (
  id        text primary key,
  name      text,
  company   text,
  phone     text,
  email     text,
  service   text,
  state     text,
  value     numeric,
  source    text,
  status    text,
  date      date,
  notes     text,
  raw       jsonb,
  synced_at timestamptz default now()
);

create table if not exists jobs (
  id        text primary key,
  customer  text,
  service   text,
  state     text,
  status    text,
  value     numeric,
  date      date,
  crew      text,
  raw       jsonb,
  synced_at timestamptz default now()
);

create table if not exists estimates (
  id        text primary key,
  customer  text,
  service   text,
  state     text,
  status    text,
  total     numeric,
  date      date,
  raw       jsonb,
  synced_at timestamptz default now()
);

create table if not exists materials_log (
  id        text primary key,
  job       text,
  product   text,
  unit      text,
  est       numeric,
  act       numeric,
  cost      numeric,
  ts        timestamptz,
  raw       jsonb,
  synced_at timestamptz default now()
);

create table if not exists invoices (
  id        text primary key,
  customer  text,
  amount    numeric,
  deposit   numeric,
  due       text,
  date      date,
  raw       jsonb,
  synced_at timestamptz default now()
);

create table if not exists crew (
  id        text primary key,
  name      text,
  role      text,
  phone     text,
  email     text,
  raw       jsonb,   -- NOTE: the app strips PINs before syncing; no credentials land here
  synced_at timestamptz default now()
);

create table if not exists memory (
  id        text primary key,   -- hash of the note text
  note      text,
  synced_at timestamptz default now()
);

-- Agent-run telemetry — one row per Klyfton (Queen→Worker→Critic) request. This is the
-- REAL source for the Operations Command Center KPIs (tasks completed, success rate, top
-- agents). Written server-side by /api/klyfton via the service role; the numbers are only
-- ever what actually ran — never fabricated. `task` is a truncated request summary (≤200
-- chars); no credentials or PINs are ever written here.
create table if not exists agent_runs (
  id          bigint generated always as identity primary key,
  ts          timestamptz default now(),
  mode        text,      -- 'single' | 'hive'
  agent       text,      -- primary mind (first recruited) — for simple grouping
  minds       text,      -- comma-joined minds involved in the run
  task        text,      -- truncated user request (≤200 chars)
  status      text,      -- 'ok' | 'empty' | 'error'
  duration_ms integer,   -- wall-clock for the request
  model       text,      -- synthesizer/worker model that produced the answer
  cost_usd    numeric,   -- metered Anthropic spend for the run
  raw         jsonb,
  synced_at   timestamptz default now()
);

-- Lock everything down: RLS on, no policies → only the service role (server-side) can read/write.
alter table leads          enable row level security;
alter table jobs           enable row level security;
alter table estimates      enable row level security;
alter table materials_log  enable row level security;
alter table invoices       enable row level security;
alter table crew           enable row level security;
alter table memory         enable row level security;
alter table agent_runs     enable row level security;

-- Handy analytics views (optional but nice for the reporting layer).
create or replace view v_pipeline as
  select coalesce(state,'?') as state, count(*) as open_leads, coalesce(sum(value),0) as pipeline_value
  from leads where status not in ('Won','Lost') group by 1 order by 3 desc;

create or replace view v_close_rate as
  select count(*) filter (where status='Won')                    as won,
         count(*) filter (where status='Lost')                   as lost,
         round(100.0 * count(*) filter (where status='Won')
               / nullif(count(*) filter (where status in ('Won','Lost')),0), 1) as close_pct
  from leads;

-- Operations Command Center KPIs — the four stat tiles, over a rolling 7-day window.
-- Everything here is computed from real logged runs (agent_runs); nothing is fabricated.
create or replace view v_agent_kpis_7d as
  select count(*)                                                              as tasks_7d,
         count(distinct agent)                                                 as active_agents_7d,
         round(100.0 * count(*) filter (where status='ok')
               / nullif(count(*),0), 1)                                        as success_pct_7d,
         round(avg(duration_ms))                                              as avg_ms_7d
  from agent_runs
  where ts >= now() - interval '7 days';

-- Top-agents leaderboard — hive runs credit every mind involved (minds unnested), 30-day window.
create or replace view v_agent_leaderboard as
  select trim(m)                                                               as agent,
         count(*)                                                              as runs,
         round(100.0 * count(*) filter (where status='ok')
               / nullif(count(*),0), 1)                                        as success_pct
  from agent_runs, unnest(string_to_array(minds, ', ')) as m
  where ts >= now() - interval '30 days' and coalesce(minds,'') <> ''
  group by 1
  order by 2 desc;

-- ============================================================================
-- SEMANTIC MEMORY (pgvector) — Klyfton's long-term recall.
-- Today `memory` holds note strings and the app dumps the last ~20 into context. With
-- embeddings, recall retrieves the RELEVANT note for a given question instead of dumping
-- everything — so a customer preference or confirmed price surfaces exactly when it matters,
-- months later. Backward compatible: the `note` column stays; `embedding` is nullable, so rows
-- without an embedding still work via the old note recall. Written server-side by /api/memory.
-- Embeddings are 1536-dim (OpenAI text-embedding-3-small). If you switch providers, change the
-- dimension here AND re-embed existing rows.
-- Run this block once in Supabase after the tables above.
-- ============================================================================
create extension if not exists vector;
alter table memory add column if not exists embedding vector(1536);
alter table memory add column if not exists updated_at timestamptz default now();
-- Cosine-distance ANN index for fast top-K search.
create index if not exists memory_embedding_idx on memory using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Top-K semantic search: the closest notes to a query embedding (higher similarity = closer).
-- Called from /api/memory via PostgREST RPC (/rest/v1/rpc/match_memory).
create or replace function match_memory(query_embedding vector(1536), match_count int default 6)
returns table (id text, note text, similarity float)
language sql stable as $$
  select id, note, 1 - (embedding <=> query_embedding) as similarity
  from memory
  where embedding is not null
  order by embedding <=> query_embedding
  limit match_count;
$$;
