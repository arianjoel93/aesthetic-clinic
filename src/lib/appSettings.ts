import { requireSupabaseSession } from "./cloud";

export type AppTheme = "makeup" | "dark" | "terra" | "sea";

export type ModuleLockKey =
  | "agenda"
  | "clientes"
  | "servicios"
  | "tratamientos"
  | "seguimientos"
  | "ventas-cotizaciones"
  | "reportes"
  | "usuarios";

export type ModuleLockMap = Partial<Record<ModuleLockKey, boolean>>;

export interface ChangeHistoryItem {
  id: string;
  at: string;
  title: string;
  detail: string;
  userEmail?: string;
}

export async function getSetting(key: string) {
  const client = await requireSupabaseSession();
  const { data, error } = await client.from("app_settings").select("value").eq("key", key).maybeSingle();
  if (error) throw error;
  return typeof data?.value === "string" ? data.value : null;
}

export async function setSetting(key: string, value: string) {
  const client = await requireSupabaseSession();
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || !authData.user) throw authError ?? new Error("Sesión no disponible.");
  const { error } = await client.from("app_settings").upsert({
    owner_user_id: authData.user.id,
    key,
    value,
    updated_at: new Date().toISOString(),
  }, { onConflict: "owner_user_id,key" });
  if (error) throw error;
}

export async function getJsonSetting<T>(key: string, fallback: T): Promise<T> {
  const value = await getSetting(key);
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export async function setJsonSetting<T>(key: string, value: T) {
  await setSetting(key, JSON.stringify(value));
}

export async function appendChangeHistory(item: Omit<ChangeHistoryItem, "id" | "at">) {
  const current = await getJsonSetting<ChangeHistoryItem[]>("profile_change_history", []);
  const next: ChangeHistoryItem[] = [
    {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      ...item,
    },
    ...current,
  ].slice(0, 30);
  await setJsonSetting("profile_change_history", next);
  return next;
}

export function applyAppTheme(theme: AppTheme) {
  document.documentElement.dataset.crmTheme = theme;
}

export async function loadAppTheme() {
  const theme = ((await getSetting("app_theme")) || "makeup") as AppTheme;
  applyAppTheme(theme);
  return theme;
}
