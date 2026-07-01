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

create index if not exists idx_properties_customer_id on public.properties(customer_id);
create index if not exists idx_estimates_customer_id on public.estimates(customer_id);
create index if not exists idx_estimates_property_id on public.estimates(property_id);
create index if not exists idx_estimates_status on public.estimates(status);
create index if not exists idx_field_photos_estimate_id on public.field_photos(estimate_id);
create index if not exists idx_sync_events_entity on public.sync_events(entity_type, entity_id);

-- Active job execution tracker (linked to an approved/won estimate)
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references public.estimates(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null default 'scheduled',
  scheduled_date date,
  completed_date date,
  crew_lead text,
  crew_members text[],
  google_drive_folder_id text,
  drive_before_folder_id text,
  drive_during_folder_id text,
  drive_after_folder_id text,
  drive_docs_folder_id text,
  notes text,
  invoice_number text,
  invoice_total numeric,
  invoice_paid boolean not null default false,
  invoice_paid_at timestamptz
);

create index if not exists idx_projects_estimate_id on public.projects(estimate_id);
create index if not exists idx_projects_customer_id on public.projects(customer_id);
create index if not exists idx_projects_status on public.projects(status);

-- Per-project closeout checklist
create table if not exists public.closeout_checklist (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  before_photos_done boolean not null default false,
  during_photos_done boolean not null default false,
  after_photos_done boolean not null default false,
  contract_signed boolean not null default false,
  materials_noted boolean not null default false,
  invoice_ready boolean not null default false,
  site_clean boolean not null default false,
  customer_walkthrough boolean not null default false,
  review_requested boolean not null default false,
  notes text
);

create index if not exists idx_closeout_project_id on public.closeout_checklist(project_id);
