-- Klyfton WIKI — editable knowledge base (SOPs, playbooks, product notes, process docs).
-- Run once in Supabase (SQL editor or `supabase db push`). Safe to re-run (idempotent).
-- The brain retrieves the most relevant published articles for a question via api/wiki.js.
-- Truth order stays: mgsf-core doctrine > wiki article > semantic memory.

create table if not exists wiki_articles (
  id          text primary key,               -- sha1(slug) — stable upsert key
  slug        text unique not null,
  title       text not null,
  category    text default 'general',
  tags        text[] default '{}',
  body        text not null,
  status      text default 'published',        -- 'published' | 'draft' | 'archived'
  source      text default 'owner',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- retrieval reads published rows; index the common filters
create index if not exists wiki_status_idx   on wiki_articles (status);
create index if not exists wiki_updated_idx  on wiki_articles (updated_at desc);
-- optional full-text help for larger libraries (retrieval ranking is done in api/wiki.js today)
create index if not exists wiki_title_trgm   on wiki_articles using gin (to_tsvector('english', title));
create index if not exists wiki_body_trgm    on wiki_articles using gin (to_tsvector('english', body));
