export interface Contact {
  id: number;
  first_name: string;
  last_name?: string | null;
  job_title?: string | null;
  email?: string | null;
  phone?: string | null;
  customer_id?: number | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export type ContactPayload = Omit<Contact, "id" | "created_at" | "updated_at">;
