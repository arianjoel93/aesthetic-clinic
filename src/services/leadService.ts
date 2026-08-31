import { apiRequest } from "./api";
import type { Lead, LeadPayload } from "../types/lead";

export const leadService = {
  list(params?: {
    search?: string;
    stage_id?: number | null;
    status_id?: number | null;
    customer_id?: number | null;
    contact_id?: number | null;
  }) {
    return apiRequest<Lead[]>("/leads", { params });
  },
  get(id: number) {
    return apiRequest<Lead>(`/leads/${id}`);
  },
  create(payload: LeadPayload) {
    return apiRequest<Lead>("/leads", { method: "POST", body: JSON.stringify(payload) });
  },
  update(id: number, payload: Partial<LeadPayload>) {
    return apiRequest<Lead>(`/leads/${id}`, { method: "PUT", body: JSON.stringify(payload) });
  },
  updateStage(id: number, stage_id: number) {
    return apiRequest<Lead>(`/leads/${id}/stage`, {
      method: "PATCH",
      body: JSON.stringify({ stage_id }),
    });
  },
  remove(id: number) {
    return apiRequest<{ message: string }>(`/leads/${id}`, { method: "DELETE" });
  },
};
