-- Klyfton agent run-history — makes agents STATEFUL so they don't repeat a step (shouldSkip reads
-- this within a cooldown) and so you can see what each agent did. Records who+stage+outcome+time
-- only — NO customer message content. Run once in Supabase (idempotent). Written by api/agents.js.

create table if not exists agent_runs (
  id         bigint generated always as identity primary key,
  agent      text not null,        -- pm | collector | bid-chaser | lead-closer
  who        text,                 -- customer/job the step targeted
  stage      text,                 -- lifecycle stage at the time
  outcome    text,                 -- dispatched | needs_approval | incomplete | blocked | skipped | in_app
  at         bigint,               -- epoch ms (passed in; deterministic)
  created_at timestamptz default now()
);

create index if not exists agent_runs_agent_at_idx on agent_runs (agent, at desc);
create index if not exists agent_runs_who_stage_idx on agent_runs (who, stage);
