-- Klyfton idempotency ledger — records the key of each SUCCESSFULLY dispatched outward action so a
-- retry can't send it twice. Written by api/idempotency.js (via act.js after a successful send).
-- Key content only — no message body. Run once in Supabase (idempotent).

create table if not exists dispatched_actions (
  k          text primary key,     -- sha1(type|target|content|day)
  kind       text,                 -- arm type (send_email, send_sms, create_invoice, zap, ...)
  at         timestamptz default now()
);

-- optional: prune old keys periodically (keys are day-scoped, so anything older than a few days is dead)
create index if not exists dispatched_at_idx on dispatched_actions (at);
