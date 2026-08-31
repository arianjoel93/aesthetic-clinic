import { hasSupabaseConfig, supabase } from "../lib/supabaseClient";

export interface AppointmentEmailRequest {
  to: string;
  customerName: string;
  service: string;
  serviceSubtype?: string;
  date: string;
  start: string;
  end: string;
  confirmationLink?: string;
  kind: "confirmation" | "reminder";
}

export interface CashReportEmailRequest {
  to: string;
  kind: "cash_report";
  companyName: string;
  reportDate: string;
  openedAt: string;
  closedAt: string;
  cashier: string;
  openingAmount: number;
  soldTotal: number;
  expectedTotal: number;
  salesCount: number;
  csv: string;
}

export interface PaymentReceiptEmailRequest {
  to: string;
  kind: "payment_receipt";
  customerName: string;
  companyName: string;
  service: string;
  serviceDate?: string;
  amount?: number;
  paymentStatus: "sin_registro" | "pendiente" | "pagado";
  paymentMethod?: string;
  folio?: string;
}

type SystemEmailRequest =
  | AppointmentEmailRequest
  | CashReportEmailRequest
  | PaymentReceiptEmailRequest;

const HOSTINGER_EMAIL_ENDPOINT = import.meta.env.VITE_APPOINTMENT_EMAIL_ENDPOINT || "/api/send-appointment-email.php";
const HOSTINGER_FALLBACK_ENABLED = import.meta.env.VITE_APPOINTMENT_EMAIL_FALLBACK !== "false";

async function sendViaHostinger(payload: SystemEmailRequest) {
  try {
    const response = await fetch(HOSTINGER_EMAIL_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return { ok: false, message: "No se pudo contactar el servicio de correo. Intenta nuevamente." };
    }

    const data = await response.json() as { ok?: boolean; message?: string };
    if (!response.ok || !data.ok) {
      return { ok: false, message: data.message ?? "No se pudo enviar el correo desde Hostinger." };
    }

    return { ok: true, message: data.message ?? "Correo enviado correctamente." };
  } catch {
    return { ok: false, message: "No se pudo conectar con el servidor de correo de Hostinger." };
  }
}

async function sendSystemEmail(payload: SystemEmailRequest) {
  if (!payload.to) {
    return { ok: false, message: "No hay un correo electrónico registrado para realizar el envío." };
  }

  if (!hasSupabaseConfig || !supabase) {
    if (HOSTINGER_FALLBACK_ENABLED) return sendViaHostinger(payload);
    return { ok: false, message: "El servicio de correo no está disponible. Revisa la conexión e intenta nuevamente." };
  }

  const { data, error } = await supabase.functions.invoke("appointment-email", {
    body: payload,
  });

  if (error) {
    if (HOSTINGER_FALLBACK_ENABLED) {
      const hostingerResult = await sendViaHostinger(payload);
      if (hostingerResult.ok) return hostingerResult;
    }

    const context = typeof error.message === "string" ? error.message.toLowerCase() : "";
    if (context.includes("not found") || context.includes("404")) {
      return { ok: false, message: "El servidor de correo no está desplegado todavía. Revisa la función de envío antes de intentar de nuevo." };
    }
    if (context.includes("unauthorized") || context.includes("401") || context.includes("403")) {
      return { ok: false, message: "No se pudo autorizar el envío de correo. Revisa la sesión o la configuración del servidor." };
    }
    return { ok: false, message: "No se pudo conectar con el servidor de correo. Revisa la conexión e intenta nuevamente." };
  }

  if (data && typeof data === "object" && "ok" in data && !data.ok) {
    if (HOSTINGER_FALLBACK_ENABLED) {
      const hostingerResult = await sendViaHostinger(payload);
      if (hostingerResult.ok) return hostingerResult;
    }
    return {
      ok: false,
      message: typeof data.message === "string"
        ? data.message
        : "No se pudo enviar el correo. Intenta nuevamente.",
    };
  }

  if (payload.kind === "cash_report" || payload.kind === "payment_receipt") {
    const responseKind = data && typeof data === "object" && "kind" in data ? data.kind : undefined;
    if (responseKind !== payload.kind) {
      if (HOSTINGER_FALLBACK_ENABLED) {
        const hostingerResult = await sendViaHostinger(payload);
        if (hostingerResult.ok) return hostingerResult;
      }
      return {
        ok: false,
        message: "El servicio de correo aún no está actualizado para este envío. Intenta nuevamente en unos minutos.",
      };
    }
  }

  return { ok: true, message: "Correo enviado correctamente." };
}

export function sendAppointmentEmail(payload: AppointmentEmailRequest) {
  return sendSystemEmail(payload);
}

export function sendCashReportEmail(payload: CashReportEmailRequest) {
  return sendSystemEmail(payload);
}

export function sendPaymentReceiptEmail(payload: PaymentReceiptEmailRequest) {
  return sendSystemEmail(payload);
}
