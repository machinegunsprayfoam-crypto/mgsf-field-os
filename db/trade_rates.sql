-- Klyfton per-trade rate memory (api/trade-rates.js). Saves the owner's usual material unit costs +
-- labor rates per trade + item so estimates don't get re-typed. OWNER-ENTERED rates only — nothing
-- fabricated; these are the crew's working rates for trades WITHOUT locked doctrine pricing (MGSF's
-- own trades price via mgsf-core doctrine, not here). Run once in Supabase (idempotent).

create table if not exists trade_rates (
  id         bigint generated always as identity primary key,
  trade      text not null,          -- construction.js trade id (electrical, plumbing, hvac, framing, …)
  item       text not null,          -- line-item description the rate applies to
  unit       text,                   -- ft, ea, sets, gal, hr, …
  unit_cost  numeric,                -- owner's material $/unit
  labor_rate numeric,                -- owner's labor $/hr
  updated_at timestamptz default now(),
  unique (trade, item)               -- upsert on (trade,item) so re-saving updates in place
);

create index if not exists trade_rates_trade_idx on trade_rates (trade);
