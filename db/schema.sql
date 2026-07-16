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

-- Lock everything down: RLS on, no policies → only the service role (server-side) can read/write.
alter table leads          enable row level security;
alter table jobs           enable row level security;
alter table estimates      enable row level security;
alter table materials_log  enable row level security;
alter table invoices       enable row level security;
alter table crew           enable row level security;
alter table memory         enable row level security;

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
