import type { User } from "@supabase/supabase-js";
import type { UserSession } from "../types/crm";
import { getSupabaseClient } from "./cloud";

export function buildSessionFromSupabaseUser(user: User): UserSession {
  const metadata = user.user_metadata ?? {};
  const email = user.email ?? "";
  const firstName = typeof metadata.first_name === "string" ? metadata.first_name : "";
  const lastName = typeof metadata.last_name === "string" ? metadata.last_name : "";
  const fullName =
    (typeof metadata.full_name === "string" && metadata.full_name.trim()) ||
    (typeof metadata.name === "string" && metadata.name.trim()) ||
    `${firstName} ${lastName}`.trim() ||
    email.split("@")[0] ||
    "Usuario";

  return {
    name: fullName,
    firstName: firstName || fullName.split(" ")[0] || "",
    lastName: lastName || fullName.split(" ").slice(1).join(" "),
    email,
    role: "Administrador",
    avatarUrl: typeof metadata.avatar_url === "string" ? metadata.avatar_url : undefined,
    avatarPath: typeof metadata.avatar_path === "string" ? metadata.avatar_path : undefined,
    address: typeof metadata.address === "string" ? metadata.address : undefined,
    companyName: typeof metadata.company_name === "string" ? metadata.company_name : undefined,
  };
}

export async function buildCloudSessionFromSupabaseUser(user: User): Promise<UserSession> {
  const session = buildSessionFromSupabaseUser(user);
  const client = getSupabaseClient();
  const { data: profile } = await client
    .from("seller_profiles")
    .select("display_name, email, permissions, active")
    .eq("auth_user_id", user.id)
    .eq("active", true)
    .maybeSingle();
  const withRole: UserSession = profile
    ? {
      ...session,
      name: String(profile.display_name ?? session.name),
      email: String(profile.email ?? session.email),
      role: "Vendedor",
      permissions: profile.permissions && typeof profile.permissions === "object"
        ? profile.permissions as Record<string, boolean>
        : {},
    }
    : session;
  if (!withRole.avatarPath) return withRole;
  const { data, error } = await client.storage.from("admin-avatars").createSignedUrl(withRole.avatarPath, 60 * 60);
  if (error) return { ...withRole, avatarUrl: undefined };
  return { ...withRole, avatarUrl: data.signedUrl };
}
