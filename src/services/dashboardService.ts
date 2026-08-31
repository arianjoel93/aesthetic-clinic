import { apiRequest } from "./api";
import type { DashboardSummary } from "../types/dashboard";

export const dashboardService = {
  summary() {
    return apiRequest<DashboardSummary>("/dashboard/summary");
  },
};
