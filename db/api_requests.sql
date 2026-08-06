-- Klyfton API request log — the durable sink for api/reqlog.js.
-- Run this in Supabase (SQL editor) to turn on cross-instance request logging. Until it exists,
-- reqlog falls back to a per-instance in-memory ring buffer and says so honestly in its report.
--
-- Deliberately NARROW: route/method/status/ms/cap only. No request bodies, no query strings, no
-- headers, no customer data — a request log is not an audit trail of what customers typed, and
-- anything wider becomes a PII liability the moment someone pastes something into a form.

create table if not exists api_requests (
  id          bigserial primary key,
  route       text        not null,              -- normalized: /api/foam-calc (never the query string)
  method      text        not null,
  status      int         not null,
  ok          boolean     not null,
  ms          int         not null default 0,    -- server-side duration
  cap         text,                              -- capability key this call exercised (cmdb CAPS id)
  denied      boolean     not null default false,-- 401/403 — the crew-code gate refusing
  at          timestamptz not null default now()
);

-- the three reads reqlog actually performs
create index if not exists api_requests_at_idx        on api_requests (at desc);
create index if not exists api_requests_route_at_idx  on api_requests (route, at desc);
create index if not exists api_requests_cap_at_idx    on api_requests (cap, at desc) where cap is not null;

alter table api_requests enable row level security;

-- Service-role writes only (the app posts with the service key). No anon read: this table
-- reveals traffic shape and which capabilities are armed, which is internal-only.
drop policy if exists api_requests_service_all on api_requests;
create policy api_requests_service_all on api_requests
  for all to service_role using (true) with check (true);

-- Retention: keep 90 days. Traffic shape older than a quarter answers no question worth the rows.
-- Run manually or wire to pg_cron if available:
--   delete from api_requests where at < now() - interval '90 days';
