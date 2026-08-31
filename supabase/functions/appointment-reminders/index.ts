import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import nodemailer from "npm:nodemailer@6.9.16";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

function tomorrowKey() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

function requireEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw Object.assign(new Error(`Falta configurar ${name}.`), { code: "MISSING_SMTP_CONFIG" });
  return value;
}

function boolEnv(name: string, fallback: boolean) {
  const value = Deno.env.get(name);
  if (!value) return fallback;
  return ["1", "true", "yes", "si", "sí"].includes(value.toLowerCase());
}

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  fromName: string;
}

async function loadSmtpConfig(supabase: ReturnType<typeof createClient>): Promise<SmtpConfig> {
  const envHost = Deno.env.get("SMTP_HOST");
  const envUser = Deno.env.get("SMTP_USER");
  const envPass = Deno.env.get("SMTP_PASS");

  if (envHost && envUser && envPass) {
    const port = Number(Deno.env.get("SMTP_PORT") ?? "465");
    return {
      host: envHost,
      port,
      secure: boolEnv("SMTP_SECURE", port === 465),
      user: envUser,
      pass: envPass,
      from: Deno.env.get("SMTP_FROM") || envUser,
      fromName: Deno.env.get("SMTP_FROM_NAME") || "Daniela Rodríguez",
    };
  }

  const { data, error } = await supabase.rpc("get_smtp_config");
  if (error || !data || typeof data !== "object") {
    throw Object.assign(new Error("Falta configurar el correo seguro."), { code: "MISSING_SMTP_CONFIG" });
  }

  const config = data as Record<string, unknown>;
  const host = String(config.host ?? "");
  const user = String(config.user ?? "");
  const pass = String(config.pass ?? "");
  const port = Number(config.port ?? 465);
  if (!host || !user || !pass) {
    throw Object.assign(new Error("La configuración del correo está incompleta."), { code: "MISSING_SMTP_CONFIG" });
  }

  return {
    host,
    port,
    secure: typeof config.secure === "boolean" ? config.secure : port === 465,
    user,
    pass,
    from: String(config.from ?? user),
    fromName: String(config.from_name ?? "Daniela Rodríguez"),
  };
}

function friendlyMailError(error: unknown) {
  const mailError = error as { code?: string; responseCode?: number; message?: string };
  const message = mailError?.message ?? "";
  const responseCode = Number(mailError?.responseCode);
  const code = mailError?.code ?? "";

  if (code === "MISSING_SMTP_CONFIG" || message.includes("Falta configurar")) {
    return "Falta configurar el servidor de correo para enviar recordatorios.";
  }

  if ([530, 534, 535, 550, 553].includes(responseCode) || /auth|login|password|credencial|contrase/i.test(message)) {
    return "No se pudo autenticar la cuenta de correo para enviar recordatorios.";
  }

  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|ESOCKET|ECONNECTION|certificate|TLS|SSL/i.test(`${code} ${message}`)) {
    return "No se pudo conectar con el servidor SMTP para enviar recordatorios.";
  }

  return "No se pudieron enviar los recordatorios.";
}

function buildReminder(appointment: Record<string, string | null>) {
  const serviceName = [appointment.service, appointment.service_subtype].filter(Boolean).join(" - ") || "Servicio agendado";
  const start = appointment.start_time?.slice(0, 5) ?? "";
  const end = appointment.end_time?.slice(0, 5) ?? "";
  const text = [
    `Hola ${appointment.customer_name ?? "cliente"},`,
    "Te recordamos que tienes una cita agendada para mañana.",
    `Servicio: ${serviceName}`,
    `Fecha y hora: ${appointment.appointment_date} de ${start} a ${end}`,
    "Gracias por tu preferencia.",
  ].join("\n\n");
  const html = `
    <div style="font-family:Arial,sans-serif;background:#fff7fb;padding:28px;color:#27272a;">
      <div style="max-width:620px;margin:auto;background:white;border:1px solid #f3d1df;border-radius:24px;padding:28px;">
        <p style="margin:0;color:#e85c93;font-size:13px;letter-spacing:.16em;text-transform:uppercase;">Daniela Rodríguez</p>
        <h1 style="margin:8px 0 14px;font-size:28px;color:#18181b;">Recordatorio de tu cita</h1>
        <p>Hola ${appointment.customer_name ?? "cliente"},</p>
        <p>Te recordamos que tienes una cita agendada para mañana.</p>
        <div style="margin:20px 0;padding:16px;border-radius:18px;background:#fff7fb;border:1px solid #f3d1df;">
          <p style="margin:0 0 8px;"><strong>Servicio:</strong> ${serviceName}</p>
          <p style="margin:0;"><strong>Fecha y hora:</strong> ${appointment.appointment_date} de ${start} a ${end}</p>
        </div>
        <p style="margin-top:24px;color:#71717a;">Gracias por tu preferencia.</p>
      </div>
    </div>
  `;
  return { text, html };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, secretKey());
    const targetDate = tomorrowKey();

    const { data: appointments, error } = await supabase
      .from("appointments")
      .select("id, owner_user_id, customer_name, customer_email, service, service_subtype, appointment_date, start_time, end_time, status")
      .eq("appointment_date", targetDate)
      .eq("status", "aceptada")
      .not("customer_email", "is", null);
    if (error) throw error;

    const smtp = await loadSmtpConfig(supabase);
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: { user: smtp.user, pass: smtp.pass },
      connectionTimeout: 12000,
      greetingTimeout: 12000,
      socketTimeout: 20000,
      tls: { servername: smtp.host },
    });

    await transporter.verify();

    let sent = 0;
    for (const appointment of appointments ?? []) {
      const logKey = `${appointment.id}:reminder:${targetDate}`;
      const { data: existing } = await supabase
        .from("appointment_email_logs")
        .select("id")
        .eq("dedupe_key", logKey)
        .maybeSingle();
      if (existing) continue;

      const email = buildReminder(appointment);
      await transporter.sendMail({
        from: `${smtp.fromName} <${smtp.from}>`,
        to: appointment.customer_email,
        subject: "Recordatorio de tu cita",
        text: email.text,
        html: email.html,
      });

      await supabase.from("appointment_email_logs").insert({
        owner_user_id: appointment.owner_user_id,
        appointment_id: appointment.id,
        kind: "reminder",
        recipient_email: appointment.customer_email,
        dedupe_key: logKey,
      });
      sent += 1;
    }

    return json({ ok: true, sent });
  } catch (error) {
    console.error("appointment-reminders failed", error);
    return json({ ok: false, message: friendlyMailError(error) }, 500);
  }
});
