export interface Activity {
  id: number;
  activity_type: string;
  customer_id?: number | null;
  lead_id?: number | null;
  contact_id?: number | null;
  description: string;
  scheduled_at?: string | null;
  completed_at?: string | null;
  status: "pendiente" | "completada" | "cancelada" | string;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export type ActivityPayload = Omit<Activity, "id" | "created_at" | "updated_at">;
