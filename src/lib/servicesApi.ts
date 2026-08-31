import type { Service } from "../types/crm";
import { requireSupabaseSession } from "./cloud";

export function mapService(row: Record<string, unknown>): Service {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    description: row.description ? String(row.description) : "",
    category: row.category ? String(row.category) : "",
    price: Number(row.price ?? 0),
    active: Boolean(row.active),
    ownerUserId: row.owner_user_id ? String(row.owner_user_id) : undefined,
    isShared: Boolean(row.is_shared),
    createdAt: row.created_at ? String(row.created_at) : undefined,
    updatedAt: row.updated_at ? String(row.updated_at) : undefined,
  };
}

export async function listServices(options: { activeOnly?: boolean } = {}) {
  const client = await requireSupabaseSession();
  let query = client.from("services").select("*").order("name", { ascending: true });
  if (options.activeOnly) query = query.eq("active", true);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => mapService(row as Record<string, unknown>));
}

export async function saveService(payload: Omit<Service, "id"> & { id?: string }) {
  if (!payload.name.trim()) throw new Error("El nombre del servicio es obligatorio.");
  if (Number.isNaN(Number(payload.price)) || Number(payload.price) < 0) {
    throw new Error("El precio debe ser mayor o igual a cero.");
  }

  const client = await requireSupabaseSession();
  const record = {
    name: payload.name.trim(),
    description: payload.description?.trim() || null,
    category: payload.category?.trim() || null,
    price: Number(payload.price),
    active: payload.active,
  };
  const request = payload.id
    ? client.from("services").update(record).eq("id", payload.id).select("*").single()
    : client.from("services").insert(record).select("*").single();
  const { data, error } = await request;
  if (error) throw error;
  return mapService(data as Record<string, unknown>);
}

export async function setServiceActive(serviceId: string, active: boolean) {
  const client = await requireSupabaseSession();
  const { data, error } = await client
    .from("services")
    .update({ active })
    .eq("id", serviceId)
    .select("*")
    .single();
  if (error) throw error;
  return mapService(data as Record<string, unknown>);
}
