import { randomBytes } from "node:crypto";
import tls from "node:tls";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

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

interface StoredAppointment {
  id: string;
  customerName: string;
  customerEmail?: string;
  customerWhatsapp?: string;
  service: string;
  serviceSubtype?: string;
  date: string;
  start: string;
  end: string;
  status: string;
  cost?: number;
  discountPercent?: number;
  confirmationToken?: string;
  notes?: string;
}

interface StoredNotification {
  id: string;
  appointmentId: string;
  title: string;
  message: string;
  kind: string;
  date: string;
  read: boolean;
  dedupeKey: string;
}

const smtpConfig = {
  host: process.env.SMTP_HOST || "smtp.hostinger.com",
  port: Number(process.env.SMTP_PORT || "465"),
  secure: (process.env.SMTP_SECURE || "true").toLowerCase() !== "false",
  user: process.env.SMTP_USER || "",
  pass: process.env.SMTP_PASS || "",
  from: process.env.SMTP_FROM || process.env.SMTP_USER || "",
  fromName: process.env.SMTP_FROM_NAME || "Daniela Rodríguez",
};

function readRequestBody(req: import("node:http").IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function writeJson(res: import("node:http").ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function smtpRead(socket: tls.TLSSocket) {
  return new Promise<string>((resolve, reject) => {
    let response = "";
    const onData = (chunk: Buffer) => {
      response += chunk.toString("utf8");
      const lines = response.split(/\r?\n/).filter(Boolean);
      const last = lines.at(-1) ?? "";
      if (/^\d{3}\s/.test(last)) {
        cleanup();
        resolve(response);
      }
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      socket.off("data", onData);
      socket.off("error", onError);
    };
    socket.on("data", onData);
    socket.on("error", onError);
  });
}

async function smtpExpect(socket: tls.TLSSocket, expected: number[]) {
  const response = await smtpRead(socket);
  const code = Number(response.slice(0, 3));
  if (!expected.includes(code)) {
    throw new Error(response.trim());
  }
  return response;
}

async function smtpCommand(socket: tls.TLSSocket, command: string, expected: number[]) {
  socket.write(`${command}\r\n`);
  return smtpExpect(socket, expected);
}

function mimeHeader(value: string) {
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function dotStuff(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => (line.startsWith(".") ? `.${line}` : line))
    .join("\r\n");
}

function buildAppointmentEmail(payload: AppointmentEmailPayload) {
  const customerName = payload.customerName?.trim() || "cliente";
  const serviceName = [payload.service, payload.serviceSubtype].filter(Boolean).join(" - ") || "Servicio agendado";
  const when = `${payload.date ?? ""} de ${payload.start ?? ""} a ${payload.end ?? ""}`.trim();
  const isReminder = payload.kind === "reminder";
  const subject = isReminder ? "Recordatorio de tu cita" : "Confirma tu cita";
  const intro = isReminder
    ? "Te recordamos que tienes una cita agendada para mañana."
    : "Tu cita fue registrada correctamente. Puedes confirmarla o cancelarla desde el siguiente enlace.";
  const action = payload.confirmationLink
    ? `<a href="${payload.confirmationLink}" style="display:inline-block;margin-top:18px;padding:12px 18px;border-radius:999px;background:#e85c93;color:#fff;text-decoration:none;font-weight:700;">Confirmar o cancelar cita</a>`
    : "";

  const text = [
    `Hola ${customerName},`,
    intro,
    `Servicio: ${serviceName}`,
    `Fecha y hora: ${when}`,
    payload.confirmationLink ? `Confirmar o cancelar: ${payload.confirmationLink}` : "",
    "Gracias por tu preferencia.",
  ].filter(Boolean).join("\n\n");

  const html = `
    <div style="font-family:Arial,sans-serif;background:#fff7fb;padding:28px;color:#27272a;">
      <div style="max-width:620px;margin:auto;background:white;border:1px solid #f3d1df;border-radius:24px;padding:28px;">
        <p style="margin:0;color:#e85c93;font-size:13px;letter-spacing:.16em;text-transform:uppercase;">${smtpConfig.fromName}</p>
        <h1 style="margin:8px 0 14px;font-size:28px;color:#18181b;">${subject}</h1>
        <p>Hola ${customerName},</p>
        <p>${intro}</p>
        <div style="margin:20px 0;padding:16px;border-radius:18px;background:#fff7fb;border:1px solid #f3d1df;">
          <p style="margin:0 0 8px;"><strong>Servicio:</strong> ${serviceName}</p>
          <p style="margin:0;"><strong>Fecha y hora:</strong> ${when}</p>
        </div>
        ${action}
        <p style="margin-top:24px;color:#71717a;">Gracias por tu preferencia.</p>
      </div>
    </div>
  `;

  return { subject, text, html };
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildCashReportEmail(payload: AppointmentEmailPayload) {
  const companyName = payload.companyName?.trim() || smtpConfig.fromName;
  const subject = `Reporte de cierre de caja - ${payload.reportDate ?? "POS"}`;
  const formatMoney = (value: number | undefined) =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(value ?? 0));
  const rows = [
    ["Apertura", payload.openedAt ?? "Sin dato"],
    ["Cierre", payload.closedAt ?? "Sin dato"],
    ["Cajero", payload.cashier ?? "Administrador"],
    ["Monto inicial", formatMoney(payload.openingAmount)],
    ["Total vendido", formatMoney(payload.soldTotal)],
    ["Número de ventas", String(payload.salesCount ?? 0)],
    ["Total esperado", formatMoney(payload.expectedTotal)],
  ];
  const text = [
    companyName,
    subject,
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "",
    "El detalle de las ventas está disponible en el reporte de caja.",
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
      </div>
    </div>
  `;
  return { subject, text, html };
}

function buildPaymentReceiptEmail(payload: AppointmentEmailPayload) {
  const companyName = payload.companyName?.trim() || smtpConfig.fromName;
  const customerName = payload.customerName?.trim() || "cliente";
  const paymentLabel = payload.paymentStatus === "pagado"
    ? "Pagado"
    : payload.paymentStatus === "pendiente"
      ? "Pendiente"
      : "Pago sin registrar";
  const formatMoney = (value: number | undefined) =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(value ?? 0));
  const subject = `Comprobante de servicio${payload.folio ? ` - ${payload.folio}` : ""}`;
  const rows = [
    ["Servicio", payload.service ?? "Servicio"],
    ["Fecha", payload.serviceDate ?? "Sin fecha registrada"],
    ["Estado del pago", paymentLabel],
    ["Importe", payload.amount === undefined ? "Sin importe registrado" : formatMoney(payload.amount)],
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
  return { subject, text, html };
}

function buildSystemEmail(payload: AppointmentEmailPayload) {
  if (payload.kind === "cash_report") return buildCashReportEmail(payload);
  if (payload.kind === "payment_receipt") return buildPaymentReceiptEmail(payload);
  return buildAppointmentEmail(payload);
}

function buildMimeMessage(to: string, subject: string, text: string, html: string) {
  const boundary = `crm_${randomBytes(12).toString("hex")}`;
  const headers = [
    `Date: ${new Date().toUTCString()}`,
    `From: ${mimeHeader(smtpConfig.fromName)} <${smtpConfig.from}>`,
    `To: <${to}>`,
    `Subject: ${mimeHeader(subject)}`,
    `Message-ID: <${randomBytes(12).toString("hex")}@danielarodriguez.nodavexa.com>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];

  return [
    headers.join("\r\n"),
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    dotStuff(text),
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    dotStuff(html),
    `--${boundary}--`,
  ].join("\r\n");
}

async function sendSmtpMail(to: string, subject: string, text: string, html: string) {
  if (!smtpConfig.user || !smtpConfig.pass || !smtpConfig.from) {
    throw new Error("El respaldo SMTP local no está configurado.");
  }
  const socket = tls.connect({
    host: smtpConfig.host,
    port: smtpConfig.port,
    servername: smtpConfig.host,
    timeout: 20000,
  });

  await new Promise<void>((resolve, reject) => {
    socket.once("secureConnect", resolve);
    socket.once("timeout", () => reject(new Error("Tiempo de conexión agotado.")));
    socket.once("error", reject);
  });

  try {
    await smtpExpect(socket, [220]);
    await smtpCommand(socket, "EHLO localhost", [250]);
    await smtpCommand(socket, "AUTH LOGIN", [334]);
    await smtpCommand(socket, Buffer.from(smtpConfig.user).toString("base64"), [334]);
    await smtpCommand(socket, Buffer.from(smtpConfig.pass).toString("base64"), [235]);
    await smtpCommand(socket, `MAIL FROM:<${smtpConfig.from}>`, [250]);
    await smtpCommand(socket, `RCPT TO:<${to}>`, [250, 251]);
    await smtpCommand(socket, "DATA", [354]);
    socket.write(`${buildMimeMessage(to, subject, text, html)}\r\n.\r\n`);
    await smtpExpect(socket, [250]);
    await smtpCommand(socket, "QUIT", [221]);
  } finally {
    socket.end();
  }
}

function devAppointmentEmailPlugin(): Plugin {
  return {
    name: "dev-appointment-email",
    configureServer(server) {
      server.middlewares.use("/api/send-appointment-email.php", async (req, res) => {
        if (req.method === "OPTIONS") {
          res.statusCode = 204;
          res.end();
          return;
        }

        if (req.method !== "POST") {
          writeJson(res, 405, { ok: false, message: "Método no permitido." });
          return;
        }

        try {
          const payload = JSON.parse(await readRequestBody(req)) as AppointmentEmailPayload;
          if (!payload.to) {
            writeJson(res, 400, { ok: false, message: "El cliente no tiene correo registrado." });
            return;
          }

          const email = buildSystemEmail(payload);
          await sendSmtpMail(payload.to, email.subject, email.text, email.html);
          writeJson(res, 200, {
            ok: true,
            kind: payload.kind ?? "confirmation",
            message: "Correo enviado correctamente.",
          });
        } catch (error) {
          console.error("dev appointment email failed", error);
          writeJson(res, 500, { ok: false, message: "No se pudo enviar el correo desde Hostinger." });
        }
      });
    },
  };
}

function devAppointmentsStorePlugin(): Plugin {
  const appointments = new Map<string, StoredAppointment>();
  const notifications = new Map<string, StoredNotification>();
  const today = () => new Date().toISOString().slice(0, 10);

  const pushNotification = (appointment: StoredAppointment, title: string, message: string, kind: string) => {
    const dedupeKey = `${appointment.id}:${kind}:${appointment.status}`;
    if ([...notifications.values()].some((item) => item.dedupeKey === dedupeKey)) return;
    notifications.set(`host-not-${randomBytes(8).toString("hex")}`, {
      id: `host-not-${randomBytes(8).toString("hex")}`,
      appointmentId: appointment.id,
      title,
      message,
      kind,
      date: today(),
      read: false,
      dedupeKey,
    });
  };

  const statusNotification = (appointment: StoredAppointment) => {
    if (appointment.status === "aceptada") {
      pushNotification(appointment, "Cita confirmada", `${appointment.customerName} confirmó su cita de ${appointment.service} (${appointment.date} ${appointment.start}).`, "appointment_confirmed");
      return;
    }
    if (appointment.status === "rechazada") {
      pushNotification(appointment, "Cita rechazada por cliente", `${appointment.customerName} rechazó su cita de ${appointment.service} (${appointment.date} ${appointment.start}).`, "appointment_status_changed");
      return;
    }
    pushNotification(appointment, "Estado de cita actualizado", `${appointment.customerName}: ${appointment.status}`, "appointment_status_changed");
  };

  return {
    name: "dev-appointments-store",
    configureServer(server) {
      server.middlewares.use("/api/appointments-store.php", async (req, res) => {
        try {
          const url = new URL(req.url ?? "", "http://localhost");
          const action = url.searchParams.get("action") || "list";
          const body = req.method === "POST" ? JSON.parse((await readRequestBody(req)) || "{}") : {};

          if (action === "list") {
            writeJson(res, 200, { ok: true, appointments: [...appointments.values()], notifications: [...notifications.values()] });
            return;
          }

          if (action === "create") {
            const appointment = { ...(body.appointment ?? {}), id: `host-${randomBytes(8).toString("hex")}` } as StoredAppointment;
            appointments.set(appointment.id, appointment);
            pushNotification(appointment, "Nueva cita", `${appointment.customerName} - ${appointment.service} (${appointment.date} ${appointment.start})`, "appointment_created");
            writeJson(res, 200, { ok: true, appointment });
            return;
          }

          if (action === "update") {
            const current = appointments.get(String(body.id));
            if (!current) {
              writeJson(res, 404, { ok: false, message: "No encontramos la cita." });
              return;
            }
            const updated = { ...current, ...(body.patch ?? {}) } as StoredAppointment;
            appointments.set(updated.id, updated);
            if (current.status !== updated.status) statusNotification(updated);
            writeJson(res, 200, { ok: true, appointment: updated });
            return;
          }

          if (action === "delete") {
            const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
            ids.forEach((id) => appointments.delete(id));
            writeJson(res, 200, { ok: true, deleted: ids });
            return;
          }

          if (action === "find-by-token") {
            const token = String(body.token ?? url.searchParams.get("token") ?? "");
            const appointment = [...appointments.values()].find((item) => item.confirmationToken === token) ?? null;
            writeJson(res, appointment ? 200 : 404, { ok: Boolean(appointment), appointment });
            return;
          }

          if (action === "confirm") {
            const token = String(body.token ?? "");
            const status = String(body.status ?? "");
            const appointment = [...appointments.values()].find((item) => item.confirmationToken === token);
            if (!appointment || (status !== "aceptada" && status !== "rechazada")) {
              writeJson(res, 404, { ok: false, message: "No encontramos la cita." });
              return;
            }
            const updated = { ...appointment, status } as StoredAppointment;
            appointments.set(updated.id, updated);
            statusNotification(updated);
            writeJson(res, 200, { ok: true, appointment: updated });
            return;
          }

          writeJson(res, 400, { ok: false, message: "Acción no permitida." });
        } catch (error) {
          console.error("dev appointments store failed", error);
          writeJson(res, 500, { ok: false, message: "No se pudo procesar la cita." });
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), devAppointmentEmailPlugin(), devAppointmentsStorePlugin()],
  server: {
    host: "127.0.0.1",
    port: 5175,
  },
});
