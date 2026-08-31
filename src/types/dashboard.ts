import type { Customer } from "./customer";
import type { Lead } from "./lead";

export interface LeadsByStage {
  stage_id?: number | null;
  stage_name: string;
  count: number;
}

export interface DashboardSummary {
  total_customers: number;
  total_contacts: number;
  total_leads: number;
  open_leads: number;
  won_leads: number;
  lost_leads: number;
  estimated_value_total: number;
  pending_activities: number;
  latest_customers: Customer[];
  latest_leads: Lead[];
  leads_by_stage: LeadsByStage[];
}
