# MGOS Database Schema v1

This is the first database design for MGOS Alpha. Use PostgreSQL/Supabase.

## companies

- id uuid primary key
- name text
- website text
- phone text
- email text
- service_region text[]
- created_at timestamp

## users

- id uuid primary key
- company_id uuid references companies(id)
- full_name text
- email text
- phone text
- role text
- active boolean
- created_at timestamp

## customers

- id uuid primary key
- company_id uuid references companies(id)
- customer_type text
- first_name text
- last_name text
- company_name text
- phone text
- email text
- billing_address text
- notes text
- created_at timestamp
- updated_at timestamp

## properties

- id uuid primary key
- customer_id uuid references customers(id)
- property_name text
- address text
- city text
- state text
- zip text
- property_type text
- latitude numeric
- longitude numeric
- notes text

## leads

- id uuid primary key
- customer_id uuid references customers(id)
- property_id uuid references properties(id)
- source text
- service_type text
- status text
- urgency text
- budget_range text
- description text
- requested_start_date date
- assigned_to uuid references users(id)
- created_at timestamp
- updated_at timestamp

## estimates

- id uuid primary key
- lead_id uuid references leads(id)
- customer_id uuid references customers(id)
- property_id uuid references properties(id)
- estimate_number text
- service_type text
- status text
- total_price numeric
- material_cost numeric
- labor_cost numeric
- equipment_cost numeric
- travel_cost numeric
- overhead_cost numeric
- profit numeric
- margin_percent numeric
- assumptions text
- created_at timestamp
- updated_at timestamp

## estimate_line_items

- id uuid primary key
- estimate_id uuid references estimates(id)
- item_type text
- description text
- quantity numeric
- unit text
- unit_cost numeric
- markup_percent numeric
- line_total numeric
- notes text

## spray_foam_calculations

- id uuid primary key
- estimate_id uuid references estimates(id)
- square_feet numeric
- thickness_inches numeric
- board_feet numeric
- waste_percent numeric
- adjusted_board_feet numeric
- foam_type text
- yield_assumption numeric
- sets_required numeric

## concrete_lift_calculations

- id uuid primary key
- estimate_id uuid references estimates(id)
- slab_square_feet numeric
- estimated_void_depth_inches numeric
- cubic_feet_void numeric
- material_factor numeric
- polyurethane_required numeric
- notes text

## proposals

- id uuid primary key
- estimate_id uuid references estimates(id)
- proposal_number text
- status text
- scope_of_work text
- exclusions text
- warranty_terms text
- price numeric
- sent_at timestamp
- accepted_at timestamp
- declined_at timestamp
- google_drive_file_id text

## projects

- id uuid primary key
- proposal_id uuid references proposals(id)
- customer_id uuid references customers(id)
- property_id uuid references properties(id)
- project_name text
- status text
- scheduled_start date
- scheduled_end date
- actual_start timestamp
- actual_end timestamp
- crew_lead uuid references users(id)
- google_drive_folder_id text
- notes text

## project_photos

- id uuid primary key
- project_id uuid references projects(id)
- category text
- file_name text
- file_url text
- google_drive_file_id text
- caption text
- uploaded_by uuid references users(id)
- uploaded_at timestamp

## inventory_items

- id uuid primary key
- company_id uuid references companies(id)
- item_name text
- category text
- vendor text
- unit text
- current_quantity numeric
- reorder_point numeric
- unit_cost numeric
- notes text

## equipment

- id uuid primary key
- company_id uuid references companies(id)
- equipment_name text
- category text
- serial_number text
- status text
- maintenance_interval_days integer
- last_service_date date
- next_service_date date
- notes text

## government_contracting

- id uuid primary key
- company_id uuid references companies(id)
- opportunity_name text
- agency text
- solicitation_number text
- status text
- due_date date
- naics_code text
- psc_code text
- estimated_value numeric
- notes text

## activity_log

- id uuid primary key
- company_id uuid references companies(id)
- user_id uuid references users(id)
- entity_type text
- entity_id uuid
- action text
- notes text
- created_at timestamp
