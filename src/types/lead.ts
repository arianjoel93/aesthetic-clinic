export interface Lead {
  id: number;
  title: string;
  prospect_name?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  estimated_value: number;
  probability: number;
  stage_id?: number | null;
  status_id?: number | null;
  customer_id?: number | null;
  contact_id?: number | null;
  owner_id?: number | null;
  expected_close_date?: string | null;
  created_at: string;
  updated_at: string;
}

export type LeadPayload = Omit<Lead, "id" | "created_at" | "updated_at">;
