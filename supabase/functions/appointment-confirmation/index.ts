import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Status = "aceptada" | "rechazada";
type Action = "lookup" | "update";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function secretKey() {
  const jsonKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (jsonKeys) {
    const parsed = JSON.parse(jsonKeys);
    if (parsed.default) return parsed.default;
  }
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  throw new Error("Falta configurar la llave segura del servidor.");
}

function parseNotes(notes: unknown) {
  const value = typeof notes === "string" ? notes : "";
  const dataMatch = value.match(/crm_appointment_data:({.*})/);
  if (!dataMatch) return {};
  try {
    return JSON.parse(dataMatch[1]) as Record<string, string>;
  } catch {
    return {};
  }
}

function appointmentText(row: Record<string, unknown>) {
  const noteData = parseNotes(row.notes);
  const customerName = String(row.customer_name ?? noteData.customerName ?? "Cliente");
  const service = String(row.service ?? noteData.service ?? "Servicio");
  const date = String(row.appointment_date ?? noteData.date ?? "");
  const start = String(row.start_time ?? noteData.start ?? "").slice(0, 5);
  return { customerName, service, date, start };
}

async function findByToken(supabase: ReturnType<typeof createClient>, token: string) {
  const byColumn = await supabase
    .from("appointments")
    .select("*")
    .eq("confirmation_token", token)
    .maybeSingle();

  if (!byColumn.error && byColumn.data) return byColumn.data as Record<string, unknown>;

  const byNotes = await supabase
    .from("appointments")
    .select("*")
    .ilike("notes", `%crm_confirmation_token:${token}%`)
    .maybeSingle();

  if (byNotes.error) throw byNotes.error;
  return byNotes.data as Record<string, unknown> | null;
}

async function enqueueNotification(supabase: ReturnType<typeof createClient>, row: Record<string, unknown>, status: Status) {
  const appointmentId = String(row.id ?? "");
  if (!appointmentId) return;

  const accepted = status === "aceptada";
  const { customerName, service, date, start } = appointmentText(row);
  const title = accepted ? "Cita confirmada" : "Cita rechazada por cliente";
  const message = accepted
    ? `${customerName} confirmó su cita de ${service} (${date} ${start}).`
    : `${customerName} rechazó su cita de ${service} (${date} ${start}).`;
  const kind = accepted ? "appointment_confirmed" : "appointment_status_changed";
  const dedupeKey = `appointment:${appointmentId}:status:${status}`;

  const fullRecord = {
    owner_user_id: row.owner_user_id,
    appointment_id: appointmentId,
    title,
    message,
    kind,
    target_date: date || new Date().toISOString().slice(0, 10),
    read: false,
    dedupe_key: dedupeKey,
  };

  const { data: existing } = await supabase
    .from("notifications")
    .select("id")
    .eq("dedupe_key", dedupeKey)
    .maybeSingle();

  if (existing?.id) {
    await supabase.from("notifications").update(fullRecord).eq("id", existing.id);
    return;
  }

  const fullInsert = await supabase.from("notifications").insert(fullRecord);
  if (!fullInsert.error) return;

  await supabase.from("notifications").insert({
    owner_user_id: row.owner_user_id,
    appointment_id: appointmentId,
    title,
    message,
    kind,
    read: false,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, message: "Método no permitido." }, 405);

  try {
    const payload = await req.json() as { token?: string; status?: Status; action?: Action };
    const token = String(payload.token ?? "").trim();
    const status = payload.status;
    const action = payload.action ?? "update";

    if (!token || (action !== "lookup" && status !== "aceptada" && status !== "rechazada")) {
      return json({ ok: false, message: "Solicitud inválida." }, 400);
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, secretKey());
    const appointment = await findByToken(supabase, token);

    if (!appointment?.id) {
      return json({ ok: false, message: "No encontramos una cita asociada a este enlace." }, 404);
    }

    if (action === "lookup") {
      return json({ ok: true, appointment });
    }

    const { data, error } = await supabase
      .from("appointments")
      .update({ status: status as Status })
      .eq("id", appointment.id)
      .select("*")
      .single();
    if (error) throw error;

    const updated = (data ?? { ...appointment, status }) as Record<string, unknown>;

    return json({ ok: true, appointment: updated });
  } catch (error) {
    console.error("appointment-confirmation failed", error);
    return json({ ok: false, message: "No se pudo actualizar la cita en este momento." }, 500);
  }
});
