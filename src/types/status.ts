export interface Status {
  id: number;
  name: string;
  category: "customer" | "lead" | string;
  color: string;
  created_at: string;
}
