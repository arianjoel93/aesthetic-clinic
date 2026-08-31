import { apiRequest } from "./api";
import type { PipelineStage, PipelineStagePayload } from "../types/pipeline";

export const pipelineService = {
  listStages() {
    return apiRequest<PipelineStage[]>("/pipeline/stages");
  },
  createStage(payload: PipelineStagePayload) {
    return apiRequest<PipelineStage>("/pipeline/stages", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  updateStage(id: number, payload: Partial<PipelineStagePayload>) {
    return apiRequest<PipelineStage>(`/pipeline/stages/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },
  deleteStage(id: number, force = false) {
    return apiRequest<{ message: string }>(`/pipeline/stages/${id}`, {
      method: "DELETE",
      params: { force: force ? "true" : undefined },
    });
  },
  reorderStages(order: Array<{ id: number; order_index: number }>) {
    return apiRequest<PipelineStage[]>("/pipeline/stages/reorder", {
      method: "PATCH",
      body: JSON.stringify(order),
    });
  },
};
