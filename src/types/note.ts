export interface Note {
  id: number;
  content: string;
  entity_type: "customer" | "contact" | "lead" | string;
  entity_id: number;
  creator_id?: number | null;
  created_at: string;
  updated_at: string;
}

export type NotePayload = Omit<Note, "id" | "creator_id" | "created_at" | "updated_at">;
