import Swal, { type SweetAlertOptions } from "sweetalert2";

export function fireAppAlert(options: SweetAlertOptions) {
  return Swal.fire({
    ...options,
    customClass: {
      popup: "crm-swal-popup",
      title: "crm-swal-title",
      htmlContainer: "crm-swal-content",
      confirmButton: "crm-swal-btn crm-swal-btn-confirm",
      cancelButton: "crm-swal-btn crm-swal-btn-cancel",
      denyButton: "crm-swal-btn crm-swal-btn-neutral",
      actions: "crm-swal-actions",
      ...options.customClass,
    },
    buttonsStyling: false,
  });
}

export function showActionSuccess(title: string, text?: string) {
  return fireAppAlert({
    title,
    text,
    icon: "success",
    confirmButtonText: "Entendido",
  });
}

export function showActionCancelled(text = "No se realizaron cambios.") {
  return fireAppAlert({
    title: "Acción cancelada",
    text,
    icon: "info",
    confirmButtonText: "Entendido",
  });
}
