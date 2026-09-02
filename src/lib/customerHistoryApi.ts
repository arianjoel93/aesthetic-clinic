import type { CustomerServiceHistory } from "../types/crm";
import { requireSupabaseSession } from "./cloud";
import { loadPosPaymentMeta } from "./posPaymentMetaApi";

const historyColumns = `
  id, customer_id, service_id, service_name, service_date, amount, payment_status,
  payment_method, receipt_folio, receipt_sent_at, receipt_email, notes,
  source_type, source_reference, created_at
`;

function mapStoredHistory(row: Record<string, unknown>): CustomerServiceHistory {
  return {
    id: String(row.id),
    customerId: String(row.customer_id),
    serviceId: row.service_id ? String(row.service_id) : undefined,
    serviceName: String(row.service_name ?? "Servicio"),
    serviceDate: row.service_date ? String(row.service_date) : undefined,
    amount: row.amount === null || row.amount === undefined ? undefined : Number(row.amount),
    paymentStatus: String(row.payment_status ?? "sin_registro") as CustomerServiceHistory["paymentStatus"],
    paymentMethod: row.payment_method
      ? String(row.payment_method) as CustomerServiceHistory["paymentMethod"]
      : undefined,
    receiptFolio: row.receipt_folio ? String(row.receipt_folio) : undefined,
    receiptSentAt: row.receipt_sent_at ? String(row.receipt_sent_at) : undefined,
    receiptEmail: row.receipt_email ? String(row.receipt_email) : undefined,
    notes: row.notes ? String(row.notes) : undefined,
    sourceType: String(row.source_type ?? "manual") as CustomerServiceHistory["sourceType"],
    sourceReference: row.source_reference ? String(row.source_reference) : undefined,
    editable: true,
  };
}

function historyTime(item: CustomerServiceHistory) {
  return item.serviceDate ? new Date(`${item.serviceDate}T12:00:00`).getTime() : 0;
}

export async function listCustomerServiceHistory(customerId: string) {
  const client = await requireSupabaseSession();
  const [storedResult, appointmentsResult] = await Promise.all([
    client
      .from("customer_service_history")
      .select(historyColumns)
      .eq("customer_id", customerId)
      .order("service_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
    client
      .from("appointments")
      .select("id, service_id, service, service_subtype, appointment_date, cost, discount_percent")
      .eq("customer_id", customerId)
      .eq("status", "completada")
      .order("appointment_date", { ascending: false }),
  ]);

  if (storedResult.error) throw storedResult.error;
  if (appointmentsResult.error) throw appointmentsResult.error;

  let salesResult = await client
    .from("pos_sales")
    .select(`
      id, folio, created_at, payment_method, payment_status, payment_type, payment_installments,
      paid_amount, advance_amount,
      pos_sale_items(id, service_id, service_name, total)
    `)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
  if (salesResult.error && /payment_status|payment_type|payment_installments|paid_amount|advance_amount/i.test(salesResult.error.message)) {
    salesResult = await client
      .from("pos_sales")
      .select("id, folio, created_at, payment_method, pos_sale_items(id, service_id, service_name, total)")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false }) as typeof salesResult;
  }
  if (salesResult.error) throw salesResult.error;
  const paymentMeta = await loadPosPaymentMeta().catch(() => new Map());

  const stored = (storedResult.data ?? []).map((row) =>
    mapStoredHistory(row as Record<string, unknown>));

  const sales = (salesResult.data ?? []).flatMap((sale) => {
    const saleRow = sale as unknown as Record<string, unknown>;
    const items = Array.isArray(saleRow.pos_sale_items)
      ? saleRow.pos_sale_items as Record<string, unknown>[]
      : [];
    return items.map<CustomerServiceHistory>((item) => ({
      id: `pos-${String(item.id)}`,
      customerId,
      serviceId: item.service_id ? String(item.service_id) : undefined,
      serviceName: String(item.service_name ?? "Servicio"),
      serviceDate: String(saleRow.created_at ?? "").slice(0, 10) || undefined,
      amount: Number(item.total ?? 0),
      paymentStatus: ["anticipo", "anticipo_pagado", "pendiente"].includes(String(paymentMeta.get(String(saleRow.id))?.paymentStatus ?? saleRow.payment_status ?? "pagado")) ? "pendiente" : "pagado",
      paymentMethod: String(paymentMeta.get(String(saleRow.id))?.paymentMethod ?? saleRow.payment_method ?? "efectivo") as CustomerServiceHistory["paymentMethod"],
      receiptFolio: String(saleRow.folio ?? ""),
      sourceType: "pos",
      sourceReference: "Punto de Venta",
      editable: false,
    }));
  });

  const appointments = (appointmentsResult.data ?? []).map<CustomerServiceHistory>((appointment) => {
    const cost = Number(appointment.cost ?? 0);
    const discount = Number(appointment.discount_percent ?? 0);
    return {
      id: `cita-${String(appointment.id)}`,
      customerId,
      serviceId: appointment.service_id ? String(appointment.service_id) : undefined,
      serviceName: [appointment.service, appointment.service_subtype].filter(Boolean).join(" - "),
      serviceDate: String(appointment.appointment_date),
      amount: Math.max(0, cost * (1 - discount / 100)),
      paymentStatus: "pagado",
      sourceType: "cita",
      sourceReference: "Cita completada",
      editable: false,
    };
  });

  return [...stored, ...sales, ...appointments]
    .sort((a, b) => historyTime(b) - historyTime(a));
}

export async function updateCustomerServiceHistory(
  historyId: string,
  patch: Partial<CustomerServiceHistory>,
) {
  const client = await requireSupabaseSession();
  const { data, error } = await client
    .from("customer_service_history")
    .update({
      service_date: patch.serviceDate || null,
      amount: patch.amount ?? null,
      payment_status: patch.paymentStatus,
      payment_method: patch.paymentMethod || null,
      receipt_folio: patch.receiptFolio || null,
      notes: patch.notes || null,
    })
    .eq("id", historyId)
    .select(historyColumns)
    .single();
  if (error) throw error;
  return mapStoredHistory(data as Record<string, unknown>);
}

export async function markHistoryReceiptSent(
  historyId: string,
  receiptEmail: string,
) {
  const client = await requireSupabaseSession();
  const sentAt = new Date().toISOString();
  const { data, error } = await client
    .from("customer_service_history")
    .update({ receipt_sent_at: sentAt, receipt_email: receiptEmail })
    .eq("id", historyId)
    .select(historyColumns)
    .single();
  if (error) throw error;
  return mapStoredHistory(data as Record<string, unknown>);
}
