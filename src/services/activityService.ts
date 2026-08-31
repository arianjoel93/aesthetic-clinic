import { apiRequest } from "./api";
import type { Activity, ActivityPayload } from "../types/activity";

export const activityService = {
  list(params?: {
    status?: string;
    customer_id?: number | null;
    lead_id?: number | null;
    contact_id?: number | null;
  }) {
    return apiRequest<Activity[]>("/activities", { params });
  },
  get(id: number) {
    return apiRequest<Activity>(`/activities/${id}`);
  },
  create(payload: ActivityPayload) {
    return apiRequest<Activity>("/activities", { method: "POST", body: JSON.stringify(payload) });
  },
  update(id: number, payload: Partial<ActivityPayload>) {
    return apiRequest<Activity>(`/activities/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },
  remove(id: number) {
    return apiRequest<{ message: string }>(`/activities/${id}`, { method: "DELETE" });
  },
};
