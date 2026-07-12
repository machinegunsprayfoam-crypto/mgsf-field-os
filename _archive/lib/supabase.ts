import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error(
        "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables."
      );
    }
    _client = createClient(url, key);
  }
  return _client;
}

/** Convenience proxy — only usable in client components after env vars are set. */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_t, prop) {
    return (getSupabase() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export type Customer = {
  id: string;
  created_at: string;
  updated_at: string;
  customer_type: string;
  company_name: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  lead_source: string | null;
  notes: string | null;
  hubspot_contact_id: string | null;
  google_drive_folder_id: string | null;
};

export type Property = {
  id: string;
  customer_id: string;
  created_at: string;
  updated_at: string;
  nickname: string | null;
  property_type: string;
  street: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  county: string | null;
  latitude: number | null;
  longitude: number | null;
  building_description: string | null;
  access_notes: string | null;
};

export type Lead = {
  id: string;
  created_at: string;
  updated_at: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  phone: string | null;
  email: string | null;
  lead_source: string | null;
  service_interest: string | null;
  property_address: string | null;
  city: string | null;
  state: string | null;
  square_feet: number | null;
  notes: string | null;
  status: string;
  converted_customer_id: string | null;
  next_follow_up_at: string | null;
  last_contacted_at: string | null;
  converted_project_id: string | null;
};

export type LeadActivityEntry = {
  id: string;
  created_at: string;
  lead_id: string;
  stage_from: string | null;
  stage_to: string | null;
  note: string | null;
  performed_by: string | null;
};

export type Project = {
  id: string;
  estimate_id: string | null;
  customer_id: string;
  property_id: string | null;
  created_at: string;
  updated_at: string;
  project_name: string;
  status: string;
  scheduled_date: string | null;
  completion_date: string | null;
  crew_lead: string | null;
  crew_notes: string | null;
  internal_notes: string | null;
  google_drive_folder_id: string | null;
  source_lead_id: string | null;
};

export type FieldPhoto = {
  id: string;
  customer_id: string | null;
  property_id: string | null;
  estimate_id: string | null;
  created_at: string;
  photo_stage: string;
  file_name: string;
  file_url: string | null;
  caption: string | null;
};

export type InventoryItem = {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  category: string;
  unit: string;
  quantity_on_hand: number;
  reorder_point: number;
  unit_cost: number;
  supplier: string | null;
  part_number: string | null;
  location: string | null;
  notes: string | null;
};

export type Equipment = {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  equipment_type: string;
  make: string | null;
  model: string | null;
  year: number | null;
  serial_number: string | null;
  vin: string | null;
  license_plate: string | null;
  status: string;
  location: string | null;
  purchase_date: string | null;
  purchase_price: number | null;
  next_service_date: string | null;
  notes: string | null;
};

export type GovconDoc = {
  id: string;
  created_at: string;
  updated_at: string;
  doc_type: string;
  title: string;
  content: string | null;
  status: string;
  expiration_date: string | null;
  file_url: string | null;
  notes: string | null;
};

export type GovconOpportunity = {
  id: string;
  created_at: string;
  updated_at: string;
  title: string;
  solicitation_number: string | null;
  agency: string | null;
  naics_code: string | null;
  psc_code: string | null;
  posted_date: string | null;
  due_date: string | null;
  estimated_value: number | null;
  status: string;
  source_url: string | null;
  notes: string | null;
};

export type SafetyChecklist = {
  id: string;
  created_at: string;
  project_id: string | null;
  checklist_type: string;
  completed_by: string | null;
  completed_at: string | null;
  status: string;
  notes: string | null;
  items: { label: string; checked: boolean }[];
};

export type SafetyIncident = {
  id: string;
  created_at: string;
  project_id: string | null;
  incident_date: string;
  incident_type: string;
  severity: string;
  involved_person: string | null;
  description: string;
  corrective_action: string | null;
  reported_by: string | null;
  osha_recordable: boolean;
};

export type MarketingPost = {
  id: string;
  created_at: string;
  updated_at: string;
  title: string;
  content: string | null;
  platform: string;
  status: string;
  scheduled_date: string | null;
  published_at: string | null;
  image_url: string | null;
  tags: string | null;
  notes: string | null;
};

export type PortalToken = {
  id: string;
  created_at: string;
  token: string;
  estimate_id: string;
  expires_at: string | null;
  viewed_at: string | null;
};

export type Estimate = {
  id: string;
  customer_id: string;
  property_id: string | null;
  created_at: string;
  updated_at: string;
  estimate_number: string | null;
  status: string;
  service_type: string;
  project_name: string | null;
  scope_summary: string | null;
  measurement_notes: string | null;
  square_feet: number;
  thickness_inches: number;
  board_feet: number;
  unit_price: number;
  material_cost: number;
  labor_cost: number;
  equipment_cost: number;
  other_cost: number;
  subtotal: number;
  markup_percent: number;
  total: number;
};
