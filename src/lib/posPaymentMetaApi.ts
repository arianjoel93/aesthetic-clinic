import { requireSupabaseSession } from "./cloud";
import type { PosSale } from "../types/crm";

const POS_PAYMENT_META_KEY = "pos_sale_payment_meta_v1";

export type PosPaymentMeta = {
  saleId: string;
  paymentStatus: NonNullable<PosSale["paymentStatus"]>;
  advanceAmount: number;
  paidAmount: number;
  appointmentId?: string;
  updatedAt: string;
};

type PosSalePaymentFields = Pick<PosSale, "id" | "paymentStatus" | "advanceAmount" | "paidAmount" | "appointmentId">;

function normalizeRows(value: unknown): PosPaymentMeta[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => row as Partial<PosPaymentMeta>)
    .filter((row): row is PosPaymentMeta => Boolean(row.saleId))
    .map((row) => ({
      saleId: String(row.saleId),
      paymentStatus: (row.paymentStatus === "pagado" ? "pagado" : row.paymentStatus === "anticipo_pagado" ? "anticipo_pagado" : "anticipo"),
      advanceAmount: Number(row.advanceAmount ?? 0),
      paidAmount: Number(row.paidAmount ?? 0),
      appointmentId: row.appointmentId ? String(row.appointmentId) : undefined,
      updatedAt: row.updatedAt ? String(row.updatedAt) : new Date().toISOString(),
    }));
}

export async function loadPosPaymentMeta() {
  const client = await requireSupabaseSession();
  const { data, error } = await client
    .from("app_settings")
    .select("value")
    .eq("key", POS_PAYMENT_META_KEY)
    .maybeSingle();
  if (error) throw error;
  if (!data?.value) return new Map<string, PosPaymentMeta>();
  try {
    return new Map(normalizeRows(JSON.parse(String(data.value))).map((row) => [row.saleId, row]));
  } catch {
    return new Map<string, PosPaymentMeta>();
  }
}

async function saveAllPosPaymentMeta(rows: PosPaymentMeta[]) {
  const client = await requireSupabaseSession();
  const value = JSON.stringify(rows);
  const updated_at = new Date().toISOString();
  const { data: authData } = await client.auth.getUser();

  if (authData.user) {
    const withOwner = await client
      .from("app_settings")
      .upsert({ owner_user_id: authData.user.id, key: POS_PAYMENT_META_KEY, value, updated_at }, { onConflict: "owner_user_id,key" });
    if (!withOwner.error) return;
    if (withOwner.error.code !== "PGRST204" && !/owner_user_id|on conflict/i.test(withOwner.error.message)) {
      throw withOwner.error;
    }
  }

  const legacy = await client
    .from("app_settings")
    .upsert({ key: POS_PAYMENT_META_KEY, value, updated_at }, { onConflict: "key" });
  if (legacy.error) throw legacy.error;
}

export async function savePosPaymentMeta(meta: Omit<PosPaymentMeta, "updatedAt">) {
  const current = Array.from((await loadPosPaymentMeta()).values());
  const next = [
    { ...meta, updatedAt: new Date().toISOString() },
    ...current.filter((row) => row.saleId !== meta.saleId),
  ].slice(0, 1000);
  await saveAllPosPaymentMeta(next);
}

export function applyPosPaymentMeta<T extends PosSalePaymentFields>(sale: T, meta?: PosPaymentMeta): T {
  if (!meta) return sale;
  return {
    ...sale,
    paymentStatus: meta.paymentStatus,
    advanceAmount: meta.advanceAmount,
    paidAmount: meta.paidAmount,
    appointmentId: sale.appointmentId ?? meta.appointmentId,
  };
}

export async function applyPosPaymentMetaToSales<T extends PosSalePaymentFields>(sales: T[]) {
  if (sales.length === 0) return sales;
  const metaBySale = await loadPosPaymentMeta();
  return sales.map((sale) => applyPosPaymentMeta(sale, metaBySale.get(sale.id)));
}
