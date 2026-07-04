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
