import nodemailer from "npm:nodemailer@6.9.16";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface AppointmentEmailPayload {
  to?: string;
  customerName?: string;
  service?: string;
  serviceSubtype?: string;
  date?: string;
  start?: string;
  end?: string;
  confirmationLink?: string;
  kind?: "confirmation" | "reminder" | "cash_report" | "payment_receipt";
  companyName?: string;
  reportDate?: string;
  openedAt?: string;
  closedAt?: string;
  cashier?: string;
  openingAmount?: number;
  soldTotal?: number;
  expectedTotal?: number;
  salesCount?: number;
  csv?: string;
  serviceDate?: string;
  amount?: number;
  paymentStatus?: "sin_registro" | "pendiente" | "pagado";
  paymentMethod?: string;
  folio?: string;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function requireEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw Object.assign(new Error(`Falta configurar ${name}.`), { code: "MISSING_SMTP_CONFIG" });
  return value;
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

function secretKey() {
  const jsonKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (jsonKeys) {
    const parsed = JSON.parse(jsonKeys);
    if (parsed.default) return parsed.default;
  }
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  throw Object.assign(new Error("Falta la llave segura del servidor."), { code: "MISSING_SMTP_CONFIG" });
}

async function loadSmtpConfig(): Promise<SmtpConfig> {
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

  const supabase = createClient(requireEnv("SUPABASE_URL"), secretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
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

function boolEnv(name: string, fallback: boolean) {
  const value = Deno.env.get(name);
  if (!value) return fallback;
  return ["1", "true", "yes", "si", "sí"].includes(value.toLowerCase());
}

function friendlyMailError(error: unknown) {
  const mailError = error as { code?: string; responseCode?: number; message?: string; command?: string };
  const message = mailError?.message ?? "";
  const responseCode = mailError?.responseCode;
  const code = mailError?.code ?? "";

  if (code === "MISSING_SMTP_CONFIG" || message.includes("Falta configurar")) {
    return "Falta configurar el servidor de correo. Revisa los datos SMTP antes de enviar la cita.";
  }

  if ([530, 534, 535, 550, 553].includes(Number(responseCode)) || /auth|login|password|credencial|contrase/i.test(message)) {
    return "No se pudo autenticar la cuenta de correo. Revisa que el usuario y la contraseña del buzón sean correctos.";
  }

  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|ESOCKET|ECONNECTION|certificate|TLS|SSL/i.test(`${code} ${message}`)) {
    return "No se pudo conectar con el servidor SMTP. Verifica host, puerto y seguridad SSL del correo.";
  }

  return "No se pudo enviar el correo. Revisa la configuración del servidor de correo e intenta nuevamente.";
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function money(value: number | undefined) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(value ?? 0));
}

function buildCashReportEmail(payload: AppointmentEmailPayload) {
  const companyName = payload.companyName?.trim() || "Daniela Rodríguez";
  const subject = `Reporte de cierre de caja - ${payload.reportDate ?? "POS"}`;
  const rows = [
    ["Apertura", payload.openedAt ?? "Sin dato"],
    ["Cierre", payload.closedAt ?? "Sin dato"],
    ["Cajero", payload.cashier ?? "Administrador"],
    ["Monto inicial", money(payload.openingAmount)],
    ["Total vendido", money(payload.soldTotal)],
    ["Número de ventas", String(payload.salesCount ?? 0)],
    ["Total esperado", money(payload.expectedTotal)],
  ];
  const text = [
    companyName,
    subject,
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "",
    "Se adjunta el detalle del cierre en formato CSV.",
  ].join("\n");
  const reportRows = rows
    .map(([label, value]) => `<tr><td style="padding:9px 12px;border-bottom:1px solid #f4dce6;color:#71717a;">${escapeHtml(label)}</td><td style="padding:9px 12px;border-bottom:1px solid #f4dce6;text-align:right;color:#18181b;font-weight:600;">${escapeHtml(value)}</td></tr>`)
    .join("");
  const html = `
    <div style="font-family:Arial,sans-serif;background:#fff7fb;padding:28px;color:#27272a;">
      <div style="max-width:620px;margin:auto;background:white;border:1px solid #f3d1df;border-radius:24px;padding:28px;">
        <p style="margin:0;color:#e85c93;font-size:13px;letter-spacing:.16em;text-transform:uppercase;">${escapeHtml(companyName)}</p>
        <h1 style="margin:8px 0 8px;font-size:28px;color:#18181b;">Cierre de caja</h1>
        <p style="margin:0 0 20px;color:#71717a;">Resumen de la sesión del punto de venta.</p>
        <table style="width:100%;border-collapse:collapse;border:1px solid #f3d1df;border-radius:16px;overflow:hidden;">${reportRows}</table>
        <p style="margin-top:22px;color:#71717a;">El archivo CSV adjunto contiene el detalle de las ventas.</p>
      </div>
    </div>
  `;

  return {
    subject,
    text,
    html,
    attachments: payload.csv
      ? [{
          filename: `reporte-caja-${payload.reportDate ?? "pos"}.csv`,
          content: `\uFEFF${payload.csv}`,
          contentType: "text/csv; charset=utf-8",
        }]
      : [],
  };
}

function buildPaymentReceiptEmail(payload: AppointmentEmailPayload) {
  const companyName = payload.companyName?.trim() || "Daniela Rodríguez";
  const customerName = payload.customerName?.trim() || "cliente";
  const subject = `Comprobante de servicio${payload.folio ? ` - ${payload.folio}` : ""}`;
  const paymentLabel = payload.paymentStatus === "pagado"
    ? "Pagado"
    : payload.paymentStatus === "pendiente"
      ? "Pendiente"
      : "Pago sin registrar";
  const rows = [
    ["Servicio", payload.service ?? "Servicio"],
    ["Fecha", payload.serviceDate ?? "Sin fecha registrada"],
    ["Estado del pago", paymentLabel],
    ["Importe", payload.amount === undefined ? "Sin importe registrado" : money(payload.amount)],
    ["Método", payload.paymentMethod ?? "Sin método registrado"],
    ["Folio", payload.folio ?? "Sin folio"],
  ];
  const text = [
    `Hola ${customerName},`,
    `Te compartimos el comprobante de tu servicio en ${companyName}.`,
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "",
    "Gracias por tu preferencia.",
  ].join("\n");
  const detailRows = rows
    .map(([label, value]) => `<tr><td style="padding:9px 12px;border-bottom:1px solid #f4dce6;color:#71717a;">${escapeHtml(label)}</td><td style="padding:9px 12px;border-bottom:1px solid #f4dce6;text-align:right;color:#18181b;font-weight:600;">${escapeHtml(value)}</td></tr>`)
    .join("");
  const html = `
    <div style="font-family:Arial,sans-serif;background:#fff7fb;padding:28px;color:#27272a;">
      <div style="max-width:620px;margin:auto;background:white;border:1px solid #f3d1df;border-radius:24px;padding:28px;">
        <p style="margin:0;color:#e85c93;font-size:13px;letter-spacing:.16em;text-transform:uppercase;">${escapeHtml(companyName)}</p>
        <h1 style="margin:8px 0 8px;font-size:28px;color:#18181b;">Comprobante de servicio</h1>
        <p>Hola ${escapeHtml(customerName)}, te compartimos el detalle guardado en tu historial.</p>
        <table style="width:100%;margin-top:20px;border-collapse:collapse;border:1px solid #f3d1df;border-radius:16px;overflow:hidden;">${detailRows}</table>
        <p style="margin-top:22px;color:#71717a;">Gracias por tu preferencia.</p>
      </div>
    </div>
  `;
  return { subject, text, html, attachments: [] };
}

function buildEmail(payload: AppointmentEmailPayload) {
  if (payload.kind === "cash_report") return buildCashReportEmail(payload);
  if (payload.kind === "payment_receipt") return buildPaymentReceiptEmail(payload);

  const serviceName = [payload.service, payload.serviceSubtype].filter(Boolean).join(" - ") || "Servicio agendado";
  const when = `${payload.date ?? ""} de ${payload.start ?? ""} a ${payload.end ?? ""}`.trim();
  const isReminder = payload.kind === "reminder";
  const subject = isReminder ? "Recordatorio de tu cita" : "Confirma tu cita";
  const intro = isReminder
    ? "Te recordamos que tienes una cita agendada para mañana."
    : "Tu anticipo ya fue registrado como pagado. Ahora puedes confirmar o cancelar tu cita desde el siguiente enlace.";
  const action = payload.confirmationLink
    ? `<a href="${payload.confirmationLink}" style="display:inline-block;margin-top:18px;padding:12px 18px;border-radius:999px;background:#e85c93;color:#fff;text-decoration:none;font-weight:700;">Confirmar o cancelar cita</a>`
    : "";
  const text = [
    `Hola ${payload.customerName ?? "cliente"},`,
    intro,
    `Servicio: ${serviceName}`,
    `Fecha y hora: ${when}`,
    "Anticipo/pago: registrado",
    payload.confirmationLink ? `Confirmar o cancelar: ${payload.confirmationLink}` : "",
    "Gracias por tu preferencia.",
  ].filter(Boolean).join("\n\n");
  const html = `
    <div style="font-family:Arial,sans-serif;background:#fff7fb;padding:28px;color:#27272a;">
      <div style="max-width:620px;margin:auto;background:white;border:1px solid #f3d1df;border-radius:24px;padding:28px;">
        <p style="margin:0;color:#e85c93;font-size:13px;letter-spacing:.16em;text-transform:uppercase;">Daniela Rodríguez</p>
        <h1 style="margin:8px 0 14px;font-size:28px;color:#18181b;">${subject}</h1>
        <p>Hola ${payload.customerName ?? "cliente"},</p>
        <p>${intro}</p>
        <div style="margin:20px 0;padding:16px;border-radius:18px;background:#fff7fb;border:1px solid #f3d1df;">
          <p style="margin:0 0 8px;"><strong>Servicio:</strong> ${serviceName}</p>
          <p style="margin:0;"><strong>Fecha y hora:</strong> ${when}</p>
          <p style="margin:8px 0 0;"><strong>Anticipo/pago:</strong> registrado</p>
        </div>
        ${action}
        <p style="margin-top:24px;color:#71717a;">Gracias por tu preferencia.</p>
      </div>
    </div>
  `;
  return { subject, text, html, attachments: [] };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, message: "Método no permitido." }, 405);

  try {
    const payload = (await req.json()) as AppointmentEmailPayload;
    if (!payload.to) return json({ ok: false, message: "El cliente no tiene correo registrado." }, 400);

    const smtp = await loadSmtpConfig();

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

    const email = buildEmail(payload);
    await transporter.sendMail({
      from: `${smtp.fromName} <${smtp.from}>`,
      to: payload.to,
      subject: email.subject,
      text: email.text,
      html: email.html,
      attachments: email.attachments,
    });

    return json({
      ok: true,
      kind: payload.kind ?? "confirmation",
      message: "Correo enviado correctamente.",
    });
  } catch (error) {
    console.error("appointment-email failed", error);
    return json({ ok: false, message: friendlyMailError(error) }, 500);
  }
});
