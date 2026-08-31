import type { SalesHistoryRecord, SalesHistorySource } from "../types/crm";
import { requireSupabaseSession } from "./cloud";

const salesHistoryColumns = `
  id, customer_id, customer_name, customer_email, customer_phone,
  service_id, service_name, sale_date, amount, payment_status,
  payment_method, receipt_folio, source_type, source_reference, created_at
`;

export interface SalesHistoryFilters {
  page: number;
  pageSize: number;
  search?: string;
  service?: string;
  paymentStatus?: string;
  sourceType?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface SalesHistoryPageResult {
  records: SalesHistoryRecord[];
  total: number;
}

export interface DashboardTreatmentCount {
  serviceName: string;
  count: number;
  total: number;
}

const dashboardFallbackPageSize = 1000;

function mapSalesHistory(row: Record<string, unknown>): SalesHistoryRecord {
  return {
    id: String(row.id),
    customerId: row.customer_id ? String(row.customer_id) : undefined,
    customerName: String(row.customer_name ?? "Venta general"),
    customerEmail: row.customer_email ? String(row.customer_email) : undefined,
    customerPhone: row.customer_phone ? String(row.customer_phone) : undefined,
    serviceId: row.service_id ? String(row.service_id) : undefined,
    serviceName: String(row.service_name ?? "Servicio"),
    saleDate: String(row.sale_date ?? ""),
    amount: row.amount === null || row.amount === undefined ? undefined : Number(row.amount),
    paymentStatus: String(row.payment_status ?? "sin_registro") as SalesHistoryRecord["paymentStatus"],
    paymentMethod: row.payment_method
      ? String(row.payment_method) as SalesHistoryRecord["paymentMethod"]
      : undefined,
    receiptFolio: row.receipt_folio ? String(row.receipt_folio) : undefined,
    sourceType: String(row.source_type ?? "manual") as SalesHistorySource,
    sourceReference: row.source_reference ? String(row.source_reference) : undefined,
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

function sanitizeSearch(value: string) {
  return value.trim().replace(/[,%()\\]/g, " ").replace(/\s+/g, " ");
}

export async function listSalesHistoryPage(filters: SalesHistoryFilters): Promise<SalesHistoryPageResult> {
  const client = await requireSupabaseSession();
  const safePage = Math.max(1, filters.page);
  const safePageSize = Math.min(100, Math.max(1, filters.pageSize));
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;
  const search = sanitizeSearch(filters.search ?? "");

  let query = client
    .from("sales_history")
    .select(salesHistoryColumns, { count: "exact" })
    .order("sale_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (search) {
    query = query.or(
      `customer_name.ilike.%${search}%,service_name.ilike.%${search}%,receipt_folio.ilike.%${search}%`,
    );
  }
  if (filters.service) query = query.ilike("service_name", `${filters.service}%`);
  if (filters.paymentStatus) query = query.eq("payment_status", filters.paymentStatus);
  if (filters.sourceType) query = query.eq("source_type", filters.sourceType);
  if (filters.dateFrom) query = query.gte("sale_date", filters.dateFrom);
  if (filters.dateTo) query = query.lte("sale_date", filters.dateTo);

  const { data, error, count } = await query;
  if (error) throw error;

  return {
    records: ((data ?? []) as unknown as Record<string, unknown>[]).map(mapSalesHistory),
    total: count ?? 0,
  };
}

export async function listDashboardTreatmentCounts(filters: {
  dateFrom?: string;
  dateTo?: string;
  service?: string;
}): Promise<DashboardTreatmentCount[]> {
  const client = await requireSupabaseSession();
  const { data, error } = await client.rpc("dashboard_treatment_counts", {
    p_date_from: filters.dateFrom || null,
    p_date_to: filters.dateTo || null,
    p_service: filters.service || null,
  });
  const rpcRows = ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
    serviceName: String(row.service_name ?? "Servicio"),
    count: Number(row.service_count ?? 0),
    total: Number(row.total_count ?? 0),
  }));
  if (!error && rpcRows.length > 0) return rpcRows;

  const names: string[] = [];
  let offset = 0;
  while (true) {
    let query = client
      .from("sales_history")
      .select("service_name")
      .order("sale_date", { ascending: false })
      .range(offset, offset + dashboardFallbackPageSize - 1);

    if (filters.dateFrom) query = query.gte("sale_date", filters.dateFrom);
    if (filters.dateTo) query = query.lte("sale_date", filters.dateTo);
    if (filters.service) query = query.ilike("service_name", `${filters.service}%`);

    const { data: fallbackData, error: fallbackError } = await query;
    if (fallbackError) throw error ?? fallbackError;

    const page = (fallbackData ?? []) as unknown as Array<{ service_name?: unknown }>;
    page.forEach((row) => {
      const name = String(row.service_name ?? "").trim();
      if (name) names.push(name);
    });
    if (page.length < dashboardFallbackPageSize) break;
    offset += dashboardFallbackPageSize;
  }

  const counts = new Map<string, number>();
  names.forEach((name) => counts.set(name, (counts.get(name) ?? 0) + 1));
  return [...counts.entries()]
    .map(([serviceName, count]) => ({ serviceName, count, total: names.length }))
    .sort((a, b) => b.count - a.count || a.serviceName.localeCompare(b.serviceName, "es"));
}
