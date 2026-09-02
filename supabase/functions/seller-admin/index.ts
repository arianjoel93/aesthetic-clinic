import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type SellerPayload = {
  action: "create" | "update" | "deactivate";
  sellerId?: string;
  authUserId?: string;
  username?: string;
  email?: string;
  password?: string;
  displayName?: string;
  permissions?: Record<string, boolean>;
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
});

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ ok: false, message: "Método no permitido." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = request.headers.get("Authorization");
  if (!supabaseUrl || !serviceRoleKey || !authorization) return json({ ok: false, message: "Configuración de servidor incompleta." }, 500);

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: caller, error: callerError } = await adminClient.auth.getUser(authorization.replace(/^Bearer\s+/i, ""));
  if (callerError || !caller.user) return json({ ok: false, message: "Sesión no válida." }, 401);
  const { data: callerSeller } = await adminClient.from("seller_profiles").select("id").eq("auth_user_id", caller.user.id).eq("active", true).maybeSingle();
  if (callerSeller) return json({ ok: false, message: "Solo el administrador puede gestionar perfiles de vendedor." }, 403);

  let payload: SellerPayload;
  try {
    payload = await request.json() as SellerPayload;
  } catch {
    return json({ ok: false, message: "Solicitud inválida." }, 400);
  }

  const ownerUserId = caller.user.id;
  if (payload.action === "create") {
    if (!payload.username || !payload.email || !payload.password || !payload.displayName || payload.password.length < 8) {
      return json({ ok: false, message: "Captura usuario, nombre, correo y una contraseña de al menos 8 caracteres." }, 400);
    }
    const { data: createdUser, error: createError } = await adminClient.auth.admin.createUser({
      email: payload.email.trim().toLowerCase(),
      password: payload.password,
      email_confirm: true,
      user_metadata: { full_name: payload.displayName.trim(), role: "Vendedor" },
    });
    if (createError || !createdUser.user) return json({ ok: false, message: createError?.message ?? "No se pudo crear el acceso." }, 400);

    const { data: profile, error: profileError } = await adminClient.from("seller_profiles").insert({
      owner_user_id: ownerUserId,
      auth_user_id: createdUser.user.id,
      username: payload.username.trim(),
      email: payload.email.trim().toLowerCase(),
      display_name: payload.displayName.trim(),
      permissions: payload.permissions ?? {},
    }).select("*").single();
    if (profileError) {
      await adminClient.auth.admin.deleteUser(createdUser.user.id);
      return json({ ok: false, message: profileError.message }, 400);
    }
    return json({ ok: true, profile });
  }

  if (!payload.sellerId) return json({ ok: false, message: "Falta el vendedor." }, 400);
  const { data: profile, error: lookupError } = await adminClient.from("seller_profiles").select("*").eq("id", payload.sellerId).eq("owner_user_id", ownerUserId).maybeSingle();
  if (lookupError || !profile) return json({ ok: false, message: "No se encontró el perfil del vendedor." }, 404);

  if (payload.action === "deactivate") {
    const { error } = await adminClient.from("seller_profiles").update({ active: false, updated_at: new Date().toISOString() }).eq("id", profile.id);
    if (error) return json({ ok: false, message: error.message }, 400);
    if (profile.auth_user_id) await adminClient.auth.admin.updateUserById(profile.auth_user_id, { ban_duration: "876000h" });
    return json({ ok: true });
  }

  const patch: Record<string, unknown> = {
    username: payload.username?.trim() || profile.username,
    email: payload.email?.trim().toLowerCase() || profile.email,
    display_name: payload.displayName?.trim() || profile.display_name,
    permissions: payload.permissions ?? profile.permissions,
    updated_at: new Date().toISOString(),
  };
  const { data: updated, error: updateError } = await adminClient.from("seller_profiles").update(patch).eq("id", profile.id).select("*").single();
  if (updateError) return json({ ok: false, message: updateError.message }, 400);
  if (profile.auth_user_id) {
    const authPatch: { email?: string; password?: string; user_metadata?: Record<string, unknown> } = {
      email: String(patch.email),
      user_metadata: { full_name: String(patch.display_name), role: "Vendedor" },
    };
    if (payload.password) authPatch.password = payload.password;
    await adminClient.auth.admin.updateUserById(profile.auth_user_id, authPatch);
  }
  return json({ ok: true, profile: updated });
});
