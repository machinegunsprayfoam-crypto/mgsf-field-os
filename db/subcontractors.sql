-- Klyfton subcontractor roster — the prime-with-subs compliance ledger (api/subs.js). When MGSF runs
-- a job as PRIME, each sub must have its compliance packet on file BEFORE working. This table holds
-- the roster + each sub's docs (as jsonb) so Klyfton can compute readiness and warn on expiring
-- COI/license. NO pricing here — rates live in mgsf-core doctrine. Run once in Supabase (idempotent).
--
-- docs jsonb shape (array): [{ "type":"coi|license|subcontract|w9|lien-waivers|safety",
--                              "onFile": true, "expires":"YYYY-MM-DD" (COI/license only), "note":"" }]

create table if not exists subcontractors (
  id         bigint generated always as identity primary key,
  name       text not null,          -- sub / crew lead name
  trade      text,                   -- construction.js trade id (electrical, plumbing, framing, …)
  company    text,
  contact    text,
  phone      text,
  email      text,
  state      text,                   -- MT | ND | SD | WY (license verified per state)
  license_no text,
  status     text default 'active',  -- active | inactive
  docs       jsonb default '[]'::jsonb,  -- compliance packet, see shape above
  updated_at timestamptz default now()
);

create index if not exists subcontractors_trade_idx on subcontractors (trade);
create index if not exists subcontractors_status_idx on subcontractors (status);
