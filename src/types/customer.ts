export interface Customer {
  id: number;
  business_name: string;
  legal_name?: string | null;
  rfc?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  status_id?: number | null;
  created_at: string;
  updated_at: string;
}

export type CustomerPayload = Omit<Customer, "id" | "created_at" | "updated_at">;
