const SUPPORT_EMAIL = "soporte@danielarodriguez.nodavexa.com";

export function isDemoEmail(email?: string | null) {
  return Boolean(email && email.toLowerCase().includes("@demo.com"));
}

function errorText(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message ?? "");
  }
  return "";
}

export interface DemoLimitNotice {
  title: string;
  message: string;
}

export function getDemoLimitNotice(error: unknown): DemoLimitNotice | null {
  const message = errorText(error);
  const supportText = `Para ampliar el acceso, envía una solicitud a ${SUPPORT_EMAIL}.`;

  if (message.includes("DEMO_LIMIT_CUSTOMERS")) {
    return {
      title: "Límite de cuenta demo",
      message: `La cuenta demo permite registrar un máximo de 1 cliente. Puedes consultar y editar el cliente creado. ${supportText}`,
    };
  }
  if (message.includes("DEMO_LIMIT_POS_SALES")) {
    return {
      title: "Límite de cuenta demo",
      message: `La cuenta demo permite registrar un máximo de 5 ventas en el Punto de Venta. ${supportText}`,
    };
  }
  if (message.includes("DEMO_LIMIT_SERVICES")) {
    return {
      title: "Límite de cuenta demo",
      message: `La cuenta demo permite registrar un máximo de 3 servicios propios. ${supportText}`,
    };
  }
  return null;
}

