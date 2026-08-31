import { requireSupabaseSession } from "./cloud";

export interface AppointmentReminderLog {
  appointmentId: string;
  sentAt: string;
  dedupeKey: string;
}

export function appointmentReminderDedupeKey(appointmentId: string, appointmentDate: string) {
  return `${appointmentId}:reminder:${appointmentDate}`;
}

export async function fetchAppointmentReminderLogs(): Promise<AppointmentReminderLog[]> {
  const supabase = await requireSupabaseSession();
  const { data, error } = await supabase
    .from("appointment_email_logs")
    .select("appointment_id, created_at, dedupe_key")
    .eq("kind", "reminder")
    .order("created_at", { ascending: false });
  if (error) throw error;

  return (data ?? []).map((row) => ({
    appointmentId: String(row.appointment_id ?? ""),
    sentAt: String(row.created_at ?? ""),
    dedupeKey: String(row.dedupe_key ?? ""),
  }));
}

export async function saveAppointmentReminderLog(appointmentId: string, appointmentDate: string, recipientEmail: string) {
  const supabase = await requireSupabaseSession();
  const dedupeKey = appointmentReminderDedupeKey(appointmentId, appointmentDate);
  const { error } = await supabase.from("appointment_email_logs").upsert({
    appointment_id: appointmentId,
    kind: "reminder",
    recipient_email: recipientEmail,
    dedupe_key: dedupeKey,
  }, { onConflict: "dedupe_key", ignoreDuplicates: true });
  if (error) throw error;
  return dedupeKey;
}
