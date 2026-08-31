import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import Swal from "sweetalert2";
import { getSetting } from "../lib/appSettings";
import { isValidPin, sha256 } from "../utils/security";

async function requestAdminPin() {
  const [storedHash, requiresChange] = await Promise.all([
    getSetting("admin_access_pin_hash"),
    getSetting("admin_pin_requires_change"),
  ]);
  const isDefaultPin = !storedHash || requiresChange === "true";

  const result = await Swal.fire({
    title: "PIN de acceso admin",
    html: `<p style="font-size:14px;color:#52525b;margin:0 0 12px;">Ingresa el PIN para abrir esta sección.${isDefaultPin ? "<br><strong>PIN predeterminado: 0000. Cámbialo desde Mi perfil.</strong>" : ""}</p>`,
    input: "password",
    inputAttributes: {
      autocapitalize: "off",
      autocomplete: "one-time-code",
      inputmode: "numeric",
      maxlength: "4",
    },
    inputPlaceholder: "PIN de 4 dígitos",
    showCancelButton: true,
    confirmButtonText: "Entrar",
    cancelButtonText: "Cancelar",
    customClass: {
      popup: "crm-swal-popup",
      title: "crm-swal-title",
      htmlContainer: "crm-swal-content",
      confirmButton: "crm-swal-btn crm-swal-btn-confirm",
      cancelButton: "crm-swal-btn crm-swal-btn-cancel",
      actions: "crm-swal-actions",
    },
    buttonsStyling: false,
    preConfirm: async (value) => {
      const pin = String(value ?? "").trim();
      if (!isValidPin(pin)) {
        Swal.showValidationMessage("El PIN debe tener 4 dígitos.");
        return false;
      }
      if (isDefaultPin && pin === "0000") return true;
      const hashedPin = await sha256(pin);
      if (hashedPin === storedHash) return true;
      Swal.showValidationMessage("PIN incorrecto.");
      return false;
    },
  });

  return Boolean(result.isConfirmed);
}

export function AdminPinGate() {
  const [status, setStatus] = useState<"checking" | "allowed" | "blocked">("checking");

  useEffect(() => {
    let mounted = true;
    void requestAdminPin().then((allowed) => {
      if (!mounted) return;
      setStatus(allowed ? "allowed" : "blocked");
    });
    return () => {
      mounted = false;
    };
  }, []);

  if (status === "checking") {
    return <div className="grid min-h-[60vh] place-items-center text-sm text-zinc-500">Validando acceso administrativo...</div>;
  }

  return status === "allowed" ? <Outlet /> : <Navigate to="/app/panel-general" replace />;
}
