create extension if not exists "pgcrypto";

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  customer_type text not null default 'residential',
  company_name text,
  first_name text,
  last_name text,
  phone text,
  email text,
  lead_source text,
  notes text,
  hubspot_contact_id text,
  quickbooks_customer_id text,
  google_drive_folder_id text
);

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  nickname text,
  property_type text not null default 'residential',
  street text,
  city text,
  state text,
  postal_code text,
  county text,
  latitude numeric,
  longitude numeric,
  building_description text,
  access_notes text,
  google_drive_folder_id text
);

create table if not exists public.estimates (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  estimate_number text unique,
  status text not null default 'draft',
  service_type text not null,
  project_name text,
  scope_summary text,
  measurement_notes text,
  square_feet numeric default 0,
  thickness_inches numeric default 0,
  board_feet numeric generated always as (coalesce(square_feet, 0) * coalesce(thickness_inches, 0)) stored,
  unit_price numeric default 0,
  material_cost numeric default 0,
  labor_cost numeric default 0,
  equipment_cost numeric default 0,
  other_cost numeric default 0,
  subtotal numeric default 0,
  markup_percent numeric default 0,
  total numeric default 0,
  proposal_google_doc_id text,
  proposal_pdf_file_id text,
  quickbooks_estimate_id text,
  hubspot_deal_id text,
  signed_at timestamptz,
  customer_signature_file_id text
);

create table if not exists public.estimate_items (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references public.estimates(id) on delete cascade,
  created_at timestamptz not null default now(),
  line_type text not null default 'service',
  description text not null,
  quantity numeric not null default 1,
  unit text not null default 'each',
  unit_price numeric not null default 0,
  line_total numeric generated always as (coalesce(quantity, 0) * coalesce(unit_price, 0)) stored,
  sort_order integer not null default 0
);

create table if not exists public.field_photos (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete cascade,
  property_id uuid references public.properties(id) on delete cascade,
  estimate_id uuid references public.estimates(id) on delete cascade,
  created_at timestamptz not null default now(),
  photo_stage text not null default 'before',
  file_name text not null,
  file_url text,
  google_drive_file_id text,
  caption text,
  latitude numeric,
  longitude numeric
);

create table if not exists public.sync_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  entity_type text not null,
  entity_id uuid not null,
  target_system text not null,
  status text not null default 'pending',
  message text,
  external_id text
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid references public.estimates(id) on delete set null,
  customer_id uuid not null references public.customers(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  project_name text not null,
  status text not null default 'scheduled',
  scheduled_date date,
  completion_date date,
  crew_lead text,
  crew_notes text,
  internal_notes text,
  google_drive_folder_id text
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  first_name text,
  last_name text,
  company_name text,
  phone text,
  email text,
  lead_source text,
  service_interest text,
  property_address text,
  city text,
  state text,
  square_feet numeric,
  notes text,
  status text not null default 'new',
  converted_customer_id uuid references public.customers(id) on delete set null
);

create index if not exists idx_properties_customer_id on public.properties(customer_id);
create index if not exists idx_estimates_customer_id on public.estimates(customer_id);
create index if not exists idx_estimates_property_id on public.estimates(property_id);
create index if not exists idx_estimates_status on public.estimates(status);
create index if not exists idx_field_photos_estimate_id on public.field_photos(estimate_id);
create index if not exists idx_sync_events_entity on public.sync_events(entity_type, entity_id);
create index if not exists idx_projects_customer_id on public.projects(customer_id);
create index if not exists idx_projects_status on public.projects(status);
create index if not exists idx_leads_status on public.leads(status);

-- ── Inventory & consumables ───────────────────────────────────────────────────
create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  category text not null default 'consumable',
  unit text not null default 'each',
  quantity_on_hand numeric not null default 0,
  reorder_point numeric not null default 0,
  unit_cost numeric not null default 0,
  supplier text,
  part_number text,
  location text,
  notes text
);

create table if not exists public.inventory_usage (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  item_id uuid not null references public.inventory_items(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  quantity_used numeric not null,
  used_by text,
  notes text
);

-- ── Equipment & fleet ─────────────────────────────────────────────────────────
create table if not exists public.equipment (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  equipment_type text not null default 'tool',
  make text,
  model text,
  year integer,
  serial_number text,
  vin text,
  license_plate text,
  status text not null default 'operational',
  location text,
  purchase_date date,
  purchase_price numeric,
  next_service_date date,
  notes text
);

create table if not exists public.equipment_service_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  equipment_id uuid not null references public.equipment(id) on delete cascade,
  service_type text not null,
  service_date date not null,
  performed_by text,
  cost numeric,
  mileage_hours numeric,
  notes text
);

-- ── Government contracting ────────────────────────────────────────────────────
create table if not exists public.govcon_docs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  doc_type text not null,
  title text not null,
  content text,
  status text not null default 'draft',
  expiration_date date,
  file_url text,
  notes text
);

create table if not exists public.govcon_opportunities (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  title text not null,
  solicitation_number text,
  agency text,
  naics_code text,
  psc_code text,
  posted_date date,
  due_date date,
  estimated_value numeric,
  status text not null default 'watching',
  source_url text,
  notes text
);

-- ── Safety & OSHA ─────────────────────────────────────────────────────────────
create table if not exists public.safety_checklists (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  project_id uuid references public.projects(id) on delete set null,
  checklist_type text not null default 'job_start',
  completed_by text,
  completed_at timestamptz,
  status text not null default 'pending',
  notes text,
  items jsonb not null default '[]'
);

create table if not exists public.safety_incidents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  project_id uuid references public.projects(id) on delete set null,
  incident_date date not null,
  incident_type text not null,
  severity text not null default 'near_miss',
  involved_person text,
  description text not null,
  corrective_action text,
  reported_by text,
  osha_recordable boolean not null default false
);

-- ── Marketing hub ─────────────────────────────────────────────────────────────
create table if not exists public.marketing_posts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  title text not null,
  content text,
  platform text not null default 'facebook',
  status text not null default 'idea',
  scheduled_date date,
  published_at timestamptz,
  image_url text,
  tags text,
  notes text
);

-- ── Customer portal tokens ────────────────────────────────────────────────────
create table if not exists public.portal_tokens (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  token text unique not null default encode(gen_random_bytes(24), 'hex'),
  estimate_id uuid not null references public.estimates(id) on delete cascade,
  expires_at timestamptz,
  viewed_at timestamptz
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
create index if not exists idx_inventory_items_category on public.inventory_items(category);
create index if not exists idx_inventory_usage_item_id on public.inventory_usage(item_id);
create index if not exists idx_equipment_status on public.equipment(status);
create index if not exists idx_govcon_opps_status on public.govcon_opportunities(status);
create index if not exists idx_safety_incidents_date on public.safety_incidents(incident_date);
create index if not exists idx_marketing_posts_status on public.marketing_posts(status);
create index if not exists idx_portal_tokens_token on public.portal_tokens(token);


-- ── Funnel pipeline migration (2026-07) ───────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'leads' and column_name = 'next_follow_up_at'
  ) then
    alter table public.leads add column next_follow_up_at timestamptz;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'leads' and column_name = 'last_contacted_at'
  ) then
    alter table public.leads add column last_contacted_at timestamptz;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'leads' and column_name = 'converted_project_id'
  ) then
    alter table public.leads
      add column converted_project_id uuid references public.projects(id) on delete set null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'projects' and column_name = 'source_lead_id'
  ) then
    alter table public.projects
      add column source_lead_id uuid references public.leads(id) on delete set null;
  end if;
end $$;

create table if not exists public.lead_activity_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  stage_from text,
  stage_to text,
  note text,
  performed_by text
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'leads_status_funnel_stage_check'
      and conrelid = 'public.leads'::regclass
  ) then
    update public.leads
      set status = 'new'
      where status is null
         or status not in ('new', 'contacted', 'qualified', 'estimate_started', 'proposal_sent', 'follow_up', 'won', 'lost', 'scheduled', 'completed');
    alter table public.leads
      add constraint leads_status_funnel_stage_check
      check (status in ('new', 'contacted', 'qualified', 'estimate_started', 'proposal_sent', 'follow_up', 'won', 'lost', 'scheduled', 'completed'));
  end if;
end $$;

create index if not exists idx_leads_next_follow_up_at on public.leads(next_follow_up_at);
create index if not exists idx_leads_last_contacted_at on public.leads(last_contacted_at);
create index if not exists idx_lead_activity_log_lead_id on public.lead_activity_log(lead_id);

-- ── Composite index for funnel-remind query (status + next_follow_up_at) ─────
create index if not exists idx_leads_status_follow_up
  on public.leads(status, next_follow_up_at)
  where next_follow_up_at is not null;

-- ── updated_at auto-maintenance ───────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'customers','properties','estimates','projects','leads',
    'inventory_items','equipment','govcon_docs','govcon_opportunities',
    'safety_checklists','safety_incidents','marketing_posts','portal_tokens',
    'lead_activity_log'
  ]
  loop
    if not exists (
      select 1 from pg_trigger
      where tgname = 'trg_' || t || '_updated_at'
        and tgrelid = ('public.' || t)::regclass
    ) then
      execute format(
        'create trigger trg_%I_updated_at
         before update on public.%I
         for each row execute function public.set_updated_at()',
        t, t
      );
    end if;
  end loop;
end $$;
