-- job_actuals — the rig-side spray-session log: what ACTUALLY happened on the job. This is the data
-- spine the whole Yield-Intelligence layer runs on (yield-variance, crew/rig scorecards, mix/temp
-- correlation, equipment-health, chain-of-custody / warranty defense, lot traceability). One row per
-- logged session. Idempotent — safe to run once or re-run.
create table if not exists job_actuals (
  id            bigint generated always as identity primary key,
  job_id        text not null,
  crew          text,
  rig           text,
  logged_date   date,
  -- material
  sets_used     jsonb,        -- [{cell:'closed', sets:1.5, lot:'A12345'}]
  board_feet    numeric,      -- actual BF placed (logged or derived)
  drum_lots     text[],       -- lot numbers for traceability / warranty
  -- conditions (claims defense + yield correlation)
  substrate_type text,
  substrate_temp numeric,
  substrate_rh   numeric,
  ambient_temp   numeric,
  ambient_rh     numeric,
  wind_mph       numeric,
  a_temp         numeric,     -- A-side (iso) drum temp
  b_temp         numeric,     -- B-side (resin) drum temp
  mix_notes      text,        -- ratio / winter-mix notes
  -- equipment
  pressure_psi   numeric,
  tip_changes    integer,
  hose_len_ft    numeric,
  gun_hours      numeric,
  -- time (spray time vs on-site time)
  spray_start    timestamptz,
  spray_stop     timestamptz,
  onsite_start   timestamptz,
  onsite_stop    timestamptz,
  labor_hours    numeric,
  -- record
  photos         jsonb,       -- [{url, tag:'before|during|after|issue', at}]
  notes          text,
  signoff        text,        -- customer/crew sign-off name or token
  created_at     timestamptz default now()
);
create index if not exists job_actuals_job_id_idx on job_actuals (job_id);
create index if not exists job_actuals_date_idx on job_actuals (logged_date);
