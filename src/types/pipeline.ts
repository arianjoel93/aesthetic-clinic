export interface PipelineStage {
  id: number;
  name: string;
  order_index: number;
  color: string;
  created_at: string;
}

export type PipelineStagePayload = Omit<PipelineStage, "id" | "created_at">;
