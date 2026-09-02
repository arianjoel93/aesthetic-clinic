import type { Customer } from "../types/crm";
import { requireSupabaseSession } from "./cloud";

const customerColumns = `
  id, customer_number, full_name, company, email, phone, whatsapp, rfc, profile_image_url, status, owner, owner_name,
  created_at, birth_date, gender, preferred_schedule, first_visit_date, medical_alerts, notes,
  allergies, surgeries, diseases, previous_procedures, thyroid_issues, body_products,
  previous_botox_or_substance, previous_substance_details, secondary_reactions,
  seafood_allergy, seafood_allergy_details, healing_problems, preferred_contact_channel
`;
const legacyCustomerColumns = customerColumns.replace(", customer_number", "").replace(", preferred_contact_channel", "");
const customerOptionColumns = `
  id, customer_number, full_name, company, email, phone, whatsapp, status, created_at, preferred_contact_channel
`;
const legacyCustomerOptionColumns = customerOptionColumns.replace(", customer_number", "").replace(", preferred_contact_channel", "");

export type CustomerSort = "recent" | "name_asc";

export interface CustomerPageResult {
  customers: Customer[];
  total: number;
}

function mapCustomer(row: Record<string, unknown>): Customer {
  const owner = String(row.owner ?? row.owner_name ?? "Sin asignar");
  const phone = String(row.phone ?? row.whatsapp ?? "");
  const profileImagePath = row.profile_image_url ? String(row.profile_image_url) : "";
  return {
    id: String(row.id),
    customerNumber: row.customer_number === null || row.customer_number === undefined ? undefined : String(row.customer_number),
    name: String(row.full_name ?? "Cliente"),
    company: String(row.company ?? "Particular"),
    email: row.email ? String(row.email) : "",
    phone,
    whatsapp: row.whatsapp ? String(row.whatsapp) : phone,
    rfc: row.rfc ? String(row.rfc) : "",
    profileImagePath,
    profileImageUrl: profileImagePath,
    status: String(row.status ?? "prospecto") as Customer["status"],
    owner,
    createdAt: String(row.created_at ?? new Date().toISOString()).slice(0, 10),
    birthDate: row.birth_date ? String(row.birth_date) : undefined,
    gender: row.gender ? String(row.gender) as Customer["gender"] : undefined,
    preferredSchedule: row.preferred_schedule ? String(row.preferred_schedule) : undefined,
    firstVisitDate: row.first_visit_date ? String(row.first_visit_date) : undefined,
    medicalAlerts: row.medical_alerts ? String(row.medical_alerts) : undefined,
    notes: row.notes ? String(row.notes) : undefined,
    allergies: Array.isArray(row.allergies) ? row.allergies.map(String) : [],
    surgeries: Array.isArray(row.surgeries) ? row.surgeries.map(String) : [],
    diseases: Array.isArray(row.diseases) ? row.diseases.map(String) : [],
    previousProcedures: row.previous_procedures ? String(row.previous_procedures) : "",
    thyroidIssues: row.thyroid_issues ? String(row.thyroid_issues) as Customer["thyroidIssues"] : "",
    bodyProducts: row.body_products ? String(row.body_products) : "",
    previousBotoxOrSubstance: row.previous_botox_or_substance ? String(row.previous_botox_or_substance) as Customer["previousBotoxOrSubstance"] : "",
    previousSubstanceDetails: row.previous_substance_details ? String(row.previous_substance_details) : "",
    secondaryReactions: row.secondary_reactions ? String(row.secondary_reactions) as Customer["secondaryReactions"] : "",
    seafoodAllergy: row.seafood_allergy ? String(row.seafood_allergy) as Customer["seafoodAllergy"] : "",
    seafoodAllergyDetails: row.seafood_allergy_details ? String(row.seafood_allergy_details) : "",
    healingProblems: row.healing_problems ? String(row.healing_problems) as Customer["healingProblems"] : "",
    preferredContactChannel: row.preferred_contact_channel
      ? String(row.preferred_contact_channel) as Customer["preferredContactChannel"]
      : (row.email ? "email" : "whatsapp"),
  };
}

async function withSignedAvatar(customer: Customer): Promise<Customer> {
  const path = customer.profileImagePath;
  if (!path || path.startsWith("http") || path.startsWith("data:")) return customer;
  const client = await requireSupabaseSession();
  const { data, error } = await client.storage.from("customer-avatars").createSignedUrl(path, 60 * 60);
  if (error) return { ...customer, profileImageUrl: "" };
  return { ...customer, profileImageUrl: data.signedUrl };
}

async function withSignedAvatars(customers: Customer[]): Promise<Customer[]> {
  const avatarPaths = [...new Set(
    customers
      .map((customer) => customer.profileImagePath)
      .filter((path): path is string => Boolean(path && !path.startsWith("http") && !path.startsWith("data:"))),
  )];
  if (avatarPaths.length === 0) return customers;

  const client = await requireSupabaseSession();
  const { data, error } = await client.storage.from("customer-avatars").createSignedUrls(avatarPaths, 60 * 60);
  if (error || !data) return customers.map((customer) => (
    avatarPaths.includes(customer.profileImagePath ?? "") ? { ...customer, profileImageUrl: "" } : customer
  ));

  const signedUrls = new Map(data.map((item) => [item.path, item.signedUrl]));
  return customers.map((customer) => ({
    ...customer,
    profileImageUrl: signedUrls.get(customer.profileImagePath ?? "") ?? customer.profileImageUrl,
  }));
}

function customerPayloadToSupabase(payload: Partial<Customer>) {
  const storedAvatar = payload.profileImagePath
    || (payload.profileImageUrl && !payload.profileImageUrl.startsWith("http") && !payload.profileImageUrl.startsWith("data:")
      ? payload.profileImageUrl
      : null);
  return {
    full_name: payload.name,
    company: payload.company ?? "Particular",
    email: payload.email || null,
    phone: payload.phone || null,
    whatsapp: payload.whatsapp || payload.phone || "",
    rfc: payload.rfc || null,
    profile_image_url: storedAvatar,
    status: payload.status ?? "prospecto",
    owner: payload.owner ?? "Sin asignar",
    owner_name: payload.owner ?? "Sin asignar",
    allergies: payload.allergies ?? [],
    surgeries: payload.surgeries ?? [],
    diseases: payload.diseases ?? [],
    previous_procedures: payload.previousProcedures || null,
    thyroid_issues: payload.thyroidIssues || null,
    body_products: payload.bodyProducts || null,
    previous_botox_or_substance: payload.previousBotoxOrSubstance || null,
    previous_substance_details: payload.previousSubstanceDetails || null,
    secondary_reactions: payload.secondaryReactions || null,
    seafood_allergy: payload.seafoodAllergy || null,
    seafood_allergy_details: payload.seafoodAllergyDetails || null,
    healing_problems: payload.healingProblems || null,
    preferred_contact_channel: payload.preferredContactChannel
      ?? (payload.email ? "email" : "whatsapp"),
  };
}

function isUuid(value: string | null) {
  return Boolean(value?.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i));
}

export async function listSupabaseCustomers() {
  const client = await requireSupabaseSession();
  const result = await client.from("customers").select(customerOptionColumns).order("full_name", { ascending: true });
  if (!result.error) {
    return (result.data ?? []).map((row) => mapCustomer(row as unknown as Record<string, unknown>));
  }
  if (!/preferred_contact_channel|customer_number/i.test(result.error.message)) throw result.error;
  const fallback = await client.from("customers").select(legacyCustomerOptionColumns).order("full_name", { ascending: true });
  if (fallback.error) throw fallback.error;
  return (fallback.data ?? []).map((row) => mapCustomer(row as unknown as Record<string, unknown>));
}

function sanitizeCustomerSearch(value: string) {
  return value.trim().replace(/[(),]/g, " ").replace(/\s+/g, " ");
}

export async function listSupabaseCustomersPage({
  page,
  pageSize = 50,
  search = "",
  sort = "recent",
}: {
  page: number;
  pageSize?: number;
  search?: string;
  sort?: CustomerSort;
}): Promise<CustomerPageResult> {
  const client = await requireSupabaseSession();
  const safePage = Math.max(1, Math.trunc(page));
  const safePageSize = Math.min(100, Math.max(1, Math.trunc(pageSize)));
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;
  const term = sanitizeCustomerSearch(search);

  const runQuery = (columns: string, includeCustomerNumber = true) => {
    let request = client.from("customers").select(columns, { count: "exact" });
    if (term) {
      const pattern = `%${term}%`;
      request = request.or([
        `full_name.ilike.${pattern}`,
        `email.ilike.${pattern}`,
        `phone.ilike.${pattern}`,
        `whatsapp.ilike.${pattern}`,
        `rfc.ilike.${pattern}`,
        ...(includeCustomerNumber && term.match(/^\d+$/) ? [`customer_number.eq.${term}`] : []),
      ].join(","));
    }
    request = sort === "name_asc"
      ? request.order("full_name", { ascending: true }).order("id", { ascending: true })
      : request.order("created_at", { ascending: false }).order("id", { ascending: false });
    return request.range(from, to);
  };

  const result = await runQuery(customerColumns);
  if (!result.error) {
    const customers = (result.data ?? []).map((row) => mapCustomer(row as unknown as Record<string, unknown>));
    return { customers: await withSignedAvatars(customers), total: result.count ?? 0 };
  }
  if (!/preferred_contact_channel|customer_number/i.test(result.error.message)) throw result.error;

  const fallback = await runQuery(legacyCustomerColumns, false);
  if (fallback.error) throw fallback.error;
  const customers = (fallback.data ?? []).map((row) => mapCustomer(row as unknown as Record<string, unknown>));
  return { customers: await withSignedAvatars(customers), total: fallback.count ?? 0 };
}

export async function saveSupabaseCustomer(customerId: string | null, payload: Partial<Customer>) {
  const client = await requireSupabaseSession();
  const record = customerPayloadToSupabase(payload);
  const request = isUuid(customerId)
    ? client.from("customers").update(record).eq("id", customerId!).select(customerColumns).single()
    : client.from("customers").insert(record).select(customerColumns).single();
  const result = await request;
  if (!result.error) {
    return withSignedAvatar(mapCustomer(result.data as unknown as Record<string, unknown>));
  }
  if (!/preferred_contact_channel|customer_number/i.test(result.error.message)) throw result.error;
  const { preferred_contact_channel: _preferredContactChannel, ...legacyRecord } = record;
  const fallback = isUuid(customerId)
    ? client.from("customers").update(legacyRecord).eq("id", customerId!).select(legacyCustomerColumns).single()
    : client.from("customers").insert(legacyRecord).select(legacyCustomerColumns).single();
  const legacyResult = await fallback;
  if (legacyResult.error) throw legacyResult.error;
  return withSignedAvatar(mapCustomer(legacyResult.data as unknown as Record<string, unknown>));
}

export async function deleteSupabaseCustomer(customerId: string) {
  if (!isUuid(customerId)) throw new Error("El identificador del cliente no es válido.");
  const client = await requireSupabaseSession();
  const { data: customer } = await client.from("customers").select("profile_image_url").eq("id", customerId).maybeSingle();
  const { error } = await client.from("customers").delete().eq("id", customerId);
  if (error) throw error;
  const avatarPath = customer?.profile_image_url ? String(customer.profile_image_url) : "";
  if (avatarPath && !avatarPath.startsWith("http") && !avatarPath.startsWith("data:")) {
    await client.storage.from("customer-avatars").remove([avatarPath]);
  }
}
