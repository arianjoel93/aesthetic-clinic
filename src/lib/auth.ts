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
  if (!session.avatarPath) return session;
  const client = getSupabaseClient();
  const { data, error } = await client.storage.from("admin-avatars").createSignedUrl(session.avatarPath, 60 * 60);
  if (error) return { ...session, avatarUrl: undefined };
  return { ...session, avatarUrl: data.signedUrl };
}
