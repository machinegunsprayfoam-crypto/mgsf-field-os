-- Klyfton WIKI — editable knowledge base (SOPs, playbooks, product notes, process docs).
-- Run once in Supabase (SQL editor or `supabase db push`). Safe to re-run (idempotent).
-- The brain retrieves the most relevant published articles for a question via api/wiki.js.
-- Truth order stays: mgsf-core doctrine > wiki article > semantic memory.

-- pgvector powers SEMANTIC wiki retrieval (same extension as memory). Safe if already enabled.
create extension if not exists vector;

create table if not exists wiki_articles (
  id          text primary key,               -- sha1(slug) — stable upsert key
  slug        text unique not null,
  title       text not null,
  category    text default 'general',
  tags        text[] default '{}',
  body        text not null,
  status      text default 'published',        -- 'published' | 'draft' | 'archived'
  source      text default 'owner',
  embedding   vector(1536),                    -- set when OPENAI_API_KEY is present; NULL ⇒ keyword ranking
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
-- If the table pre-existed without the column:
alter table wiki_articles add column if not exists embedding vector(1536);

-- retrieval reads published rows; index the common filters
create index if not exists wiki_status_idx   on wiki_articles (status);
create index if not exists wiki_updated_idx  on wiki_articles (updated_at desc);
-- optional full-text help for larger libraries (retrieval ranking is done in api/wiki.js today)
create index if not exists wiki_title_trgm   on wiki_articles using gin (to_tsvector('english', title));
create index if not exists wiki_body_trgm    on wiki_articles using gin (to_tsvector('english', body));
