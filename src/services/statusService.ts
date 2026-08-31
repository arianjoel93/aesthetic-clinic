import { apiRequest } from "./api";
import type { Status } from "../types/status";

export type StatusPayload = Omit<Status, "id" | "created_at">;

export const statusService = {
  list(params?: { category?: string }) {
    return apiRequest<Status[]>("/statuses", { params });
  },
  create(payload: StatusPayload) {
    return apiRequest<Status>("/statuses", { method: "POST", body: JSON.stringify(payload) });
  },
  update(id: number, payload: Partial<StatusPayload>) {
    return apiRequest<Status>(`/statuses/${id}`, { method: "PUT", body: JSON.stringify(payload) });
  },
  remove(id: number) {
    return apiRequest<{ message: string }>(`/statuses/${id}`, { method: "DELETE" });
  },
};
