-- ============================================================================
-- CODING LESSONS (pgvector) — cross-session memory for the build/coding agents.
-- The problem this solves: each Klyfton build/overnight session starts fresh and
-- re-derives fixes it already found (today handled by hand via NIGHT_LOG.md /
-- PROJECT_MEMORY.md). This table lets a session CAPTURE a "problem → fix" lesson
-- and a later session SUGGEST the relevant prior lesson by MEANING (pgvector),
-- before it burns tokens re-solving. Your data, your Supabase — no third party.
-- Written server-side by /api/lessons via the service role. Gated + graceful:
-- inert until Supabase + an embedding key (OPENAI_API_KEY) are set. Embeddings are
-- 1536-dim (OpenAI text-embedding-3-small) — must match /api/memory's dimension.
-- Run this block once in Supabase after schema.sql (which enables `vector`).
-- ============================================================================
create extension if not exists vector;

create table if not exists lessons (
  id          text primary key,          -- hash of the normalized problem (stable → updates, no dupes)
  problem     text not null,             -- what went wrong / the situation
  fix         text not null,             -- what actually resolved it
  area        text,                      -- e.g. 'field-os/api', 'marketing', 'db', 'vercel'
  tags        text[] default '{}',       -- freeform labels for filtering
  hits        integer default 0,         -- times this lesson was surfaced/reused
  embedding   vector(1536),              -- of "PROBLEM … FIX … AREA … TAGS …"
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Cosine-distance ANN index for fast top-K search.
create index if not exists lessons_embedding_idx on lessons using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Lock down: RLS on, no policies → only the service role (server-side) can read/write.
alter table lessons enable row level security;

-- Top-K semantic search: the prior lessons closest to a new problem's embedding.
-- Called from /api/lessons via PostgREST RPC (/rest/v1/rpc/match_lessons).
create or replace function match_lessons(query_embedding vector(1536), match_count int default 5)
returns table (id text, problem text, fix text, area text, tags text[], similarity float)
language sql stable as $$
  select id, problem, fix, area, tags, 1 - (embedding <=> query_embedding) as similarity
  from lessons
  where embedding is not null
  order by embedding <=> query_embedding
  limit match_count;
$$;
