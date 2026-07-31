-- Klyfton deployed scenarios — installed "when X do Y" automations. A validated scenario is
-- persisted here (owner-approved) and a runner (gearbox/axle/webhook) queries matching rows when a
-- trigger fires. Steps only reference tool ids + ops — the arms compose + send, approval-gated.
-- Written by api/scenarios.js. Run once in Supabase (idempotent).

create table if not exists scenarios (
  id           bigint generated always as identity primary key,
  name         text not null,
  trigger_kind text not null,       -- 'event' | 'schedule'
  trigger_name text not null,       -- a real gearbox event or axle cadence
  steps        jsonb not null,      -- [{tool, op}]
  status       text default 'enabled',   -- 'enabled' | 'disabled'
  created_by   text default 'owner',
  created_at   timestamptz default now()
);

create index if not exists scenarios_trigger_idx on scenarios (trigger_kind, trigger_name, status);
