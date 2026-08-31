import { apiRequest } from "./api";
import type { Note, NotePayload } from "../types/note";

export const noteService = {
  list(params?: { entity_type?: string; entity_id?: number | null }) {
    return apiRequest<Note[]>("/notes", { params });
  },
  get(id: number) {
    return apiRequest<Note>(`/notes/${id}`);
  },
  create(payload: NotePayload) {
    return apiRequest<Note>("/notes", { method: "POST", body: JSON.stringify(payload) });
  },
  update(id: number, payload: Partial<NotePayload>) {
    return apiRequest<Note>(`/notes/${id}`, { method: "PUT", body: JSON.stringify(payload) });
  },
  remove(id: number) {
    return apiRequest<{ message: string }>(`/notes/${id}`, { method: "DELETE" });
  },
};
