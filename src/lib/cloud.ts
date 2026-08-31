import { hasSupabaseConfig, supabase } from "./supabaseClient";

export function getSupabaseClient() {
  if (!hasSupabaseConfig || !supabase) {
    throw new Error("La conexión con la base de datos no está configurada.");
  }
  return supabase;
}

export async function requireSupabaseSession() {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  if (!data.session) {
    throw new Error("Tu sesión expiró. Inicia sesión nuevamente para continuar.");
  }
  return client;
}
