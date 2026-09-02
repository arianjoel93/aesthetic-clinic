import { ClipboardList, Download, Eye, FileText, Pencil, Plus, Printer, Trash2, Upload, UserRound, X } from "lucide-react";
import Swal, { type SweetAlertOptions } from "sweetalert2";
import { ChevronLeft, ChevronRight, Mail, ReceiptText } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AppointmentLoading } from "../components/ui/AppointmentLoading";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { MakeupEmptyState } from "../components/ui/MakeupEmptyState";
import { Select } from "../components/ui/Select";
import { Textarea } from "../components/ui/Textarea";
import {
  listCustomerServiceHistory,
  markHistoryReceiptSent,
  updateCustomerServiceHistory,
} from "../lib/customerHistoryApi";
import {
  deleteSupabaseCustomer,
  listSupabaseCustomersPage,
  saveSupabaseCustomer,
  type CustomerSort,
} from "../lib/customersApi";
import { requireSupabaseSession } from "../lib/cloud";
import { useCrmStore } from "../store/crmStore";
import type { Customer, CustomerServiceHistory } from "../types/crm";
import { downloadQuestionnaire, printQuestionnaire, questionnaireOptions } from "../utils/customerQuestionnaires";
import { showActionCancelled, showActionSuccess } from "../utils/appAlert";
import { getDemoLimitNotice } from "../utils/demoAccess";
import { sendPaymentReceiptEmail } from "../utils/appointmentEmail";

function fireAppAlert(options: SweetAlertOptions) {
  return Swal.fire({
    ...options,
    customClass: {
      popup: "crm-swal-popup",
      title: "crm-swal-title",
      htmlContainer: "crm-swal-content",
      confirmButton: "crm-swal-btn crm-swal-btn-confirm",
      cancelButton: "crm-swal-btn crm-swal-btn-cancel",
      denyButton: "crm-swal-btn crm-swal-btn-neutral",
      actions: "crm-swal-actions crm-swal-actions-delete-customer",
    },
    buttonsStyling: false,
  });
}

const initialForm = {
  name: "",
  phone: "",
  email: "",
  rfc: "",
  profileImageUrl: "",
  profileImagePath: "",
  allergies: [] as string[],
  surgeries: [] as string[],
  diseases: [] as string[],
  previousProcedures: "",
  thyroidIssues: "" as Customer["thyroidIssues"],
  bodyProducts: "",
  previousBotoxOrSubstance: "" as Customer["previousBotoxOrSubstance"],
  previousSubstanceDetails: "",
  secondaryReactions: "" as Customer["secondaryReactions"],
  seafoodAllergy: "" as Customer["seafoodAllergy"],
  seafoodAllergyDetails: "",
  healingProblems: "" as Customer["healingProblems"],
};

const emptyHistoryDraft = {
  serviceDate: "",
  amount: "",
  paymentStatus: "sin_registro" as CustomerServiceHistory["paymentStatus"],
  paymentMethod: "" as CustomerServiceHistory["paymentMethod"] | "",
  receiptFolio: "",
  notes: "",
};

const money = (value?: number) => value === undefined
  ? "Sin importe"
  : new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(value);

const paymentLabel = (status: CustomerServiceHistory["paymentStatus"]) => ({
  sin_registro: "Sin registro",
  pendiente: "Pendiente",
  pagado: "Pagado",
})[status];

const sourceLabel = (source: CustomerServiceHistory["sourceType"]) => ({
  importacion: "Archivo importado",
  manual: "Registro manual",
  pos: "Punto de Venta",
  cita: "Cita completada",
})[source];

async function optimizeToWebp(file: File): Promise<{ dataUrl: string; blob: Blob }> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = 350;
  canvas.height = 350;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo procesar la imagen.");
  const sourceSize = Math.min(bitmap.width, bitmap.height);
  const sourceX = Math.max(0, (bitmap.width - sourceSize) / 2);
  const sourceY = Math.max(0, (bitmap.height - sourceSize) / 2);
  ctx.drawImage(bitmap, sourceX, sourceY, sourceSize, sourceSize, 0, 0, 350, 350);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => (result ? resolve(result) : reject(new Error("No se pudo convertir la imagen a WebP."))), "image/webp", 0.86);
  });
  return { dataUrl: canvas.toDataURL("image/webp", 0.86), blob };
}

function TagField({ title, items, onChange, onRemove }: { title: string; items: string[]; onChange: (next: string[]) => void; onRemove: (item: string) => void }) {
  const [draft, setDraft] = useState("");
  return (
    <div>
      <label className="mb-1 block text-sm text-zinc-700">{title}</label>
      <Input
        value={draft}
        placeholder="Escribe aquí..."
        onChange={(e) => {
          const value = e.target.value;
          if (!value.includes(",")) {
            setDraft(value);
            return;
          }
          const chunks = value.split(",").map((item) => item.trim()).filter(Boolean);
          if (chunks.length > 0) onChange([...new Set([...items, ...chunks])]);
          setDraft("");
        }}
      />
      <div className="mt-2 flex flex-wrap gap-2">
        {items.map((item) => (
          <span key={item} className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-3 py-1 text-xs text-rose-700">
            {item}
            <button type="button" onClick={() => onRemove(item)} className="rounded-full hover:bg-rose-200"><X className="h-3 w-3" /></button>
          </span>
        ))}
      </div>
    </div>
  );
}

function YesNoField({ title, value, onChange }: { title: string; value: "si" | "no" | ""; onChange: (next: "si" | "no" | "") => void }) {
  return (
    <div>
      <p className="mb-2 text-sm text-zinc-700">{title}</p>
      <div className="flex gap-2">
        {(["si", "no"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(value === option ? "" : option)}
            className={`rounded-full border px-4 py-2 text-sm transition ${value === option ? "border-rose-400 bg-rose-50 text-rose-600" : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"}`}
          >
            {option === "si" ? "Sí" : "No"}
          </button>
        ))}
      </div>
    </div>
  );
}

function customerToForm(customer: Customer) {
  return {
    name: customer.name,
    phone: customer.whatsapp ?? customer.phone ?? "",
    email: customer.email ?? "",
    rfc: customer.rfc ?? "",
    profileImageUrl: customer.profileImageUrl ?? "",
    profileImagePath: customer.profileImagePath ?? "",
    allergies: customer.allergies ?? [],
    surgeries: customer.surgeries ?? [],
    diseases: customer.diseases ?? [],
    previousProcedures: customer.previousProcedures ?? "",
    thyroidIssues: customer.thyroidIssues ?? "",
    bodyProducts: customer.bodyProducts ?? "",
    previousBotoxOrSubstance: customer.previousBotoxOrSubstance ?? "",
    previousSubstanceDetails: customer.previousSubstanceDetails ?? "",
    secondaryReactions: customer.secondaryReactions ?? "",
    seafoodAllergy: customer.seafoodAllergy ?? "",
    seafoodAllergyDetails: customer.seafoodAllergyDetails ?? "",
    healingProblems: customer.healingProblems ?? "",
  };
}

async function uploadCustomerAvatar(blob: Blob) {
  const supabase = await requireSupabaseSession();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw authError ?? new Error("Sesión no disponible.");
  const path = `${authData.user.id}/avatars/${crypto.randomUUID()}.webp`;
  const { error } = await supabase.storage.from("customer-avatars").upload(path, blob, {
    cacheControl: "31536000",
    contentType: "image/webp",
    upsert: true,
  });
  if (error) throw error;
  const { data, error: signedUrlError } = await supabase.storage.from("customer-avatars").createSignedUrl(path, 60 * 60);
  if (signedUrlError) throw signedUrlError;
  return { path, signedUrl: data.signedUrl };
}

export function CustomersPage() {
  const customers = useCrmStore((state) => state.customers);
  const setCustomers = useCrmStore((state) => state.setCustomers);
  const session = useCrmStore((state) => state.session);
  const companyName = useCrmStore((state) => state.companyName);

  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const [debouncedQuery, setDebouncedQuery] = useState(query.trim());
  const [pageCustomers, setPageCustomers] = useState<Customer[]>([]);
  const [page, setPage] = useState(1);
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [sort, setSort] = useState<CustomerSort>("recent");
  const [customersLoading, setCustomersLoading] = useState(true);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [databaseAction, setDatabaseAction] = useState<{ title: string; message: string } | null>(null);
  const customersTopRef = useRef<HTMLDivElement | null>(null);
  const initialPageRender = useRef(true);
  const [form, setForm] = useState(initialForm);
  const [imageError, setImageError] = useState("");
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [viewingCustomerId, setViewingCustomerId] = useState<string | null>(null);
  const [questionnaireCustomer, setQuestionnaireCustomer] = useState<Customer | null>(null);
  const [customerHistory, setCustomerHistory] = useState<CustomerServiceHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [editingHistory, setEditingHistory] = useState<CustomerServiceHistory | null>(null);
  const [historyDraft, setHistoryDraft] = useState(emptyHistoryDraft);

  const isFormOpen = searchParams.get("nuevo") === "1" || selectedCustomerId !== null;
  const viewingCustomer = pageCustomers.find((customer) => customer.id === viewingCustomerId) ?? null;
  const pageSize = 50;
  const totalPages = Math.max(1, Math.ceil(totalCustomers / pageSize));
  const pageStart = totalCustomers === 0 ? 0 : ((page - 1) * pageSize) + 1;
  const pageEnd = Math.min(page * pageSize, totalCustomers);
  const paginationStart = Math.max(1, Math.min(page - 2, totalPages - 4));
  const paginationPages = Array.from(
    { length: Math.min(5, totalPages) },
    (_, index) => paginationStart + index,
  );

  const setSearchQuery = useCallback((value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set("q", value);
    else next.delete("q");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(query.trim()), 350);
    return () => window.clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, sort]);

  useEffect(() => {
    if (initialPageRender.current) {
      initialPageRender.current = false;
      return;
    }
    window.requestAnimationFrame(() => {
      customersTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [page]);

  useEffect(() => {
    if (!viewingCustomerId) {
      setCustomerHistory([]);
      setHistoryError("");
      return;
    }
    let active = true;
    setHistoryLoading(true);
    setHistoryError("");
    void listCustomerServiceHistory(viewingCustomerId)
      .then((items) => {
        if (active) setCustomerHistory(items);
      })
      .catch(() => {
        if (active) setHistoryError("No fue posible cargar el historial en este momento.");
      })
      .finally(() => {
        if (active) setHistoryLoading(false);
      });
    return () => {
      active = false;
    };
  }, [viewingCustomerId]);

  useEffect(() => {
    let active = true;
    setCustomersLoading(true);
    void listSupabaseCustomersPage({
      page,
      pageSize,
      search: debouncedQuery,
      sort,
    })
      .then((result) => {
        if (!active) return;
        const lastPage = Math.max(1, Math.ceil(result.total / pageSize));
        setTotalCustomers(result.total);
        if (page > lastPage) {
          setPage(lastPage);
          return;
        }
        setPageCustomers(result.customers);
      })
      .catch((error) => {
        if (!active) return;
        setPageCustomers([]);
        void fireAppAlert({
          title: "No se pudieron cargar los clientes",
          text: error instanceof Error ? error.message : "Revisa tu conexión e inicia sesión nuevamente.",
          icon: "error",
          confirmButtonText: "Entendido",
        });
      })
      .finally(() => {
        if (active) setCustomersLoading(false);
      });
    return () => {
      active = false;
    };
  }, [debouncedQuery, page, reloadVersion, sort]);

  const closeForm = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("nuevo");
    setSearchParams(next, { replace: true });
    setSelectedCustomerId(null);
    setForm(initialForm);
    setImageError("");
  };

  const cancelCustomerForm = async () => {
    closeForm();
    await showActionCancelled("El formulario del cliente se cerró sin guardar cambios.");
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      await fireAppAlert({
        title: "Falta el nombre",
        text: "Escribe el nombre del cliente para continuar.",
        icon: "warning",
        confirmButtonText: "Entendido",
      });
      return;
    }
    if (!form.phone.trim() && !form.email.trim()) {
      await fireAppAlert({
        title: "Falta un medio de contacto",
        text: "Registra al menos un teléfono o un correo electrónico.",
        icon: "warning",
        confirmButtonText: "Entendido",
      });
      return;
    }
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      await fireAppAlert({
        title: "Correo no válido",
        text: "Revisa el correo electrónico o deja el campo vacío y utiliza el teléfono.",
        icon: "warning",
        confirmButtonText: "Entendido",
      });
      return;
    }
    const payload = {
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      whatsapp: form.phone.trim(),
      preferredContactChannel: form.email.trim() ? "email" as const : "whatsapp" as const,
      rfc: form.rfc || undefined,
      profileImageUrl: form.profileImageUrl || undefined,
      profileImagePath: form.profileImagePath || undefined,
      allergies: form.allergies,
      surgeries: form.surgeries,
      diseases: form.diseases,
      previousProcedures: form.previousProcedures || undefined,
      thyroidIssues: form.thyroidIssues,
      bodyProducts: form.bodyProducts || undefined,
      previousBotoxOrSubstance: form.previousBotoxOrSubstance,
      previousSubstanceDetails: form.previousSubstanceDetails || undefined,
      secondaryReactions: form.secondaryReactions,
      seafoodAllergy: form.seafoodAllergy,
      seafoodAllergyDetails: form.seafoodAllergyDetails || undefined,
      healingProblems: form.healingProblems,
    };
    if (form.profileImageUrl.startsWith("data:") && !form.profileImagePath) {
      void fireAppAlert({
        title: "La foto aún no está guardada",
        text: "Espera a que termine la carga de la imagen o vuelve a seleccionarla.",
        icon: "warning",
        confirmButtonText: "Entendido",
      });
      return;
    }

    setDatabaseAction({
      title: selectedCustomerId ? "Actualizando cliente" : "Guardando cliente",
      message: "Estamos sincronizando la información con la base de datos.",
    });
    try {
      const saved = await saveSupabaseCustomer(selectedCustomerId, {
        ...payload,
        company: "Particular",
        status: "prospecto",
        owner: session?.name || session?.email || "Sin asignar",
      });
      setCustomers([saved, ...customers.filter((customer) => customer.id !== selectedCustomerId && customer.id !== saved.id)]);
      closeForm();
      if (!selectedCustomerId) setPage(1);
      setReloadVersion((value) => value + 1);
      setDatabaseAction(null);
      await showActionSuccess(selectedCustomerId ? "Cliente actualizado" : "Cliente guardado", "La información se guardó correctamente.");
      setQuestionnaireCustomer(saved);
    } catch (error) {
      setDatabaseAction(null);
      const demoLimit = getDemoLimitNotice(error);
      void fireAppAlert({
        title: demoLimit?.title ?? "No se pudo guardar el cliente",
        text: demoLimit?.message ?? (error instanceof Error ? error.message : "Revisa la conexión e intenta nuevamente."),
        icon: demoLimit ? "info" : "error",
        confirmButtonText: "Entendido",
      });
    } finally {
      setDatabaseAction(null);
    }
  };

  const handleDeleteCustomer = async (customer: Customer) => {
    const result = await fireAppAlert({
      title: "Eliminar cliente",
      text: `¿Seguro que deseas eliminar a ${customer.name}?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Eliminar",
      cancelButtonText: "Cancelar",
    });
    if (!result.isConfirmed) {
      await showActionCancelled("El cliente no fue eliminado.");
      return;
    }

    setDatabaseAction({
      title: "Eliminando cliente",
      message: "Estamos actualizando la base de clientes.",
    });
    try {
      await deleteSupabaseCustomer(customer.id);
      setCustomers(customers.filter((item) => item.id !== customer.id));
      setReloadVersion((value) => value + 1);
      setDatabaseAction(null);
      await showActionSuccess("Cliente eliminado", "El registro fue borrado correctamente.");
    } catch (error) {
      setDatabaseAction(null);
      void fireAppAlert({
        title: "No se pudo eliminar el cliente",
        text: error instanceof Error ? error.message : "Revisa la conexión e intenta nuevamente.",
        icon: "error",
        confirmButtonText: "Entendido",
      });
    }
  };

  const openHistoryEditor = (item: CustomerServiceHistory) => {
    setEditingHistory(item);
    setHistoryDraft({
      serviceDate: item.serviceDate ?? "",
      amount: item.amount === undefined ? "" : String(item.amount),
      paymentStatus: item.paymentStatus,
      paymentMethod: item.paymentMethod ?? "",
      receiptFolio: item.receiptFolio ?? "",
      notes: item.notes ?? "",
    });
  };

  const saveHistoryChanges = async () => {
    if (!editingHistory) return;
    setDatabaseAction({
      title: "Guardando historial",
      message: "Estamos actualizando los datos del servicio y pago.",
    });
    try {
      const saved = await updateCustomerServiceHistory(editingHistory.id, {
        serviceDate: historyDraft.serviceDate || undefined,
        amount: historyDraft.amount === "" ? undefined : Number(historyDraft.amount),
        paymentStatus: historyDraft.paymentStatus,
        paymentMethod: historyDraft.paymentMethod || undefined,
        receiptFolio: historyDraft.receiptFolio || undefined,
        notes: historyDraft.notes || undefined,
      });
      setCustomerHistory((items) => items.map((item) => item.id === saved.id ? saved : item));
      setEditingHistory(null);
      setDatabaseAction(null);
      await showActionSuccess("Historial actualizado", "Los datos del servicio y pago se guardaron correctamente.");
    } catch (error) {
      setDatabaseAction(null);
      await fireAppAlert({
        title: "No se pudo actualizar el historial",
        text: error instanceof Error ? error.message : "Revisa la conexión e intenta nuevamente.",
        icon: "error",
        confirmButtonText: "Entendido",
      });
    } finally {
      setDatabaseAction(null);
    }
  };

  const sendHistoryReceipt = async (item: CustomerServiceHistory) => {
    if (!viewingCustomer?.email) return;
    void fireAppAlert({
      title: "Enviando comprobante",
      text: "Estamos preparando el correo con la información del servicio.",
      allowOutsideClick: false,
      allowEscapeKey: false,
      showConfirmButton: false,
      didOpen: () => Swal.showLoading(),
    });
    const result = await sendPaymentReceiptEmail({
      to: viewingCustomer.email,
      kind: "payment_receipt",
      customerName: viewingCustomer.name,
      companyName: companyName || "Daniela Makeup Artist",
      service: item.serviceName,
      serviceDate: item.serviceDate,
      amount: item.amount,
      paymentStatus: item.paymentStatus,
      paymentMethod: item.paymentMethod,
      folio: item.receiptFolio,
    });
    Swal.close();
    if (!result.ok) {
      await fireAppAlert({
        title: "No se pudo enviar el comprobante",
        text: result.message,
        icon: "error",
        confirmButtonText: "Entendido",
      });
      return;
    }
    if (item.editable) {
      try {
        const saved = await markHistoryReceiptSent(item.id, viewingCustomer.email);
        setCustomerHistory((items) => items.map((history) => history.id === saved.id ? saved : history));
      } catch {
        // El correo ya fue enviado; el sello de auditoría puede reintentarse después.
      }
    }
    await showActionSuccess("Comprobante enviado", `El correo se envió a ${viewingCustomer.email}.`);
  };

  const handleImageUpload = async (file: File) => {
    setIsUploadingImage(true);
    setImageError("");
    try {
      const optimized = await optimizeToWebp(file);
      setForm((current) => ({ ...current, profileImageUrl: optimized.dataUrl }));
      try {
        const uploaded = await uploadCustomerAvatar(optimized.blob);
        setForm((current) => ({ ...current, profileImageUrl: uploaded.signedUrl, profileImagePath: uploaded.path }));
      } catch (error) {
        setImageError(error instanceof Error ? `No se pudo guardar la imagen: ${error.message}` : "No se pudo guardar la imagen.");
      }
    } catch (error) {
      setImageError(error instanceof Error ? error.message : "Error al procesar imagen");
    } finally {
      setIsUploadingImage(false);
    }
  };

  return (
    <>
      {databaseAction ? (
        <AppointmentLoading title={databaseAction.title} message={databaseAction.message} mode="database" />
      ) : null}

      <div ref={customersTopRef} className="scroll-mt-24"><h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">Clientes</h1></div>

      <Card>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div><h2 className="text-xl font-semibold">Base de clientes</h2><p className="text-sm text-zinc-500">Datos de contacto y padecimientos.</p></div>
          <div className="grid gap-2 sm:grid-cols-[minmax(240px,1fr)_190px]">
            <Input
              aria-label="Buscar en clientes"
              className="md:min-w-[280px]"
              placeholder="Buscar cliente..."
              value={query}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
            <Select value={sort} onChange={(event) => setSort(event.target.value as CustomerSort)} aria-label="Ordenar clientes">
              <option value="recent">Más recientes</option>
              <option value="name_asc">Nombre A-Z</option>
            </Select>
          </div>
        </div>

        {!customersLoading && pageCustomers.length === 0 ? (
          <MakeupEmptyState
            title={debouncedQuery ? "No encontramos a esa clienta" : "Todavía no hay clientes"}
            message={debouncedQuery
              ? "La maquillista buscó en nombres, correos, teléfonos y RFC, pero no encontró coincidencias."
              : "Cuando registres tu primera clienta, aparecerá en esta sección."}
          />
        ) : (
          <>
            <div className="mt-4 space-y-2 md:hidden">
              {pageCustomers.map((customer) => (
                <article key={`mobile-${customer.id}`} className="rounded-2xl border border-zinc-200 bg-stone-50 p-3">
                  <div className="flex items-start gap-3"><img src={customer.profileImageUrl || "https://placehold.co/56x56/webp?text=Cliente"} alt={customer.name} className="h-11 w-11 shrink-0 rounded-full object-cover" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-zinc-900">{customer.name}</p><p className="text-xs font-semibold text-rose-600">Cliente #{customer.customerNumber ?? "Pendiente"}</p><p className="truncate text-xs text-zinc-500">{customer.email || "Sin correo"}</p><p className="text-xs text-zinc-500">{customer.whatsapp || customer.phone || "Sin WhatsApp"}</p></div></div>
                  <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => setViewingCustomerId(customer.id)} className="rounded-lg border border-zinc-200 p-2 text-zinc-600" title="Ver"><Eye className="h-4 w-4" /></button><button type="button" onClick={() => { setSelectedCustomerId(customer.id); setForm(customerToForm(customer)); }} className="rounded-lg border border-zinc-200 p-2 text-zinc-600" title="Editar"><Pencil className="h-4 w-4" /></button><button type="button" onClick={() => setQuestionnaireCustomer(customer)} className="rounded-lg border border-rose-200 p-2 text-rose-600" title="Cuestionarios"><FileText className="h-4 w-4" /></button><button type="button" onClick={() => void handleDeleteCustomer(customer)} className="rounded-lg border border-rose-200 p-2 text-rose-600" title="Eliminar"><Trash2 className="h-4 w-4" /></button></div>
                </article>
              ))}
            </div>

            <div className="crm-scrollbar mt-5 hidden overflow-x-auto md:block">
              <table className="w-full min-w-[900px] border-separate border-spacing-y-2 text-left text-xs">
                <thead className="text-xs uppercase tracking-[0.18em] text-stone-500"><tr><th className="px-4 py-2">Cliente</th><th className="px-4 py-2">Contacto</th><th className="px-4 py-2">RFC</th><th className="px-4 py-2">Alergias</th><th className="px-4 py-2">Acciones</th></tr></thead>
                <tbody>
                  {pageCustomers.map((customer) => (
                    <tr key={customer.id} className="bg-stone-50">
                      <td className="rounded-l-2xl px-4 py-4"><div className="flex items-center gap-3"><img src={customer.profileImageUrl || "https://placehold.co/56x56/webp?text=Cliente"} alt={customer.name} className="h-12 w-12 rounded-full object-cover" /><div><p className="text-zinc-900">{customer.name}</p><p className="text-xs font-semibold text-rose-600">Cliente #{customer.customerNumber ?? "Pendiente"}</p></div></div></td>
                      <td className="px-4 py-4"><div>{customer.email || "Sin correo"}</div><div className="text-zinc-500">{customer.whatsapp || customer.phone || "Sin WhatsApp"}</div></td>
                      <td className="px-4 py-4 text-zinc-700">{customer.rfc || "Sin RFC"}</td>
                      <td className="px-4 py-4 text-zinc-700">{(customer.allergies ?? []).join(", ") || "Sin alergias"}</td>
                      <td className="rounded-r-2xl px-4 py-4"><div className="flex items-center gap-2"><button type="button" onClick={() => setViewingCustomerId(customer.id)} className="rounded-lg border border-zinc-200 p-2 text-zinc-600 hover:bg-zinc-50" title="Ver"><Eye className="h-4 w-4" /></button><button type="button" onClick={() => { setSelectedCustomerId(customer.id); setForm(customerToForm(customer)); }} className="rounded-lg border border-zinc-200 p-2 text-zinc-600 hover:bg-zinc-50" title="Editar"><Pencil className="h-4 w-4" /></button><button type="button" onClick={() => setQuestionnaireCustomer(customer)} className="rounded-lg border border-rose-200 p-2 text-rose-600 hover:bg-rose-50" title="Cuestionarios"><FileText className="h-4 w-4" /></button><button type="button" onClick={() => void handleDeleteCustomer(customer)} className="rounded-lg border border-rose-200 p-2 text-rose-600 hover:bg-rose-50" title="Eliminar"><Trash2 className="h-4 w-4" /></button></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-5 flex flex-col gap-3 border-t border-zinc-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-zinc-500">
                Mostrando {pageStart}-{pageEnd} de {totalCustomers.toLocaleString("es-MX")} clientes
              </p>
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                <button type="button" className="crm-pagination-button grid h-9 w-9 place-items-center rounded-lg border disabled:cursor-not-allowed disabled:opacity-40" disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))} aria-label="Página anterior"><ChevronLeft className="h-4 w-4" /></button>
                {paginationPages.map((pageNumber) => (
                  <button key={pageNumber} type="button" data-active={pageNumber === page} className="crm-pagination-button h-9 min-w-9 rounded-lg border px-2 text-xs" onClick={() => setPage(pageNumber)} aria-label={`Página ${pageNumber}`}>{pageNumber}</button>
                ))}
                <button type="button" className="crm-pagination-button grid h-9 w-9 place-items-center rounded-lg border disabled:cursor-not-allowed disabled:opacity-40" disabled={page === totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} aria-label="Página siguiente"><ChevronRight className="h-4 w-4" /></button>
              </div>
            </div>
          </>
        )}
      </Card>

      {isFormOpen ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/30 p-3 backdrop-blur-sm md:p-5">
          <div className="mx-auto max-h-[94dvh] w-full max-w-6xl overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-4 shadow-2xl sm:rounded-3xl sm:p-5">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div><h3 className="text-xl font-semibold text-rose-500 sm:text-2xl">Nuevo Cliente</h3><div className="mt-2 h-[3px] w-16 rounded-full bg-rose-300" /></div>
              <button onClick={() => void cancelCustomerForm()} className="rounded-full p-2 text-zinc-500 hover:bg-zinc-100"><X className="h-5 w-5" /></button>
            </div>

            <div className="grid gap-5 lg:grid-cols-[1.45fr_0.9fr]">
              <section className="rounded-2xl border border-zinc-200 p-5"><div className="mb-5 flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-full bg-rose-50 text-rose-500"><UserRound className="h-5 w-5" /></div><h4 className="text-2xl font-semibold text-zinc-900">Datos del cliente</h4></div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="md:col-span-2"><label className="mb-1 block text-sm text-zinc-700">Nombre</label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nombre completo" /></div>
                  <div><label className="mb-1 block text-sm text-zinc-700">Teléfono</label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Número de teléfono" /></div>
                  <div><label className="mb-1 block text-sm text-zinc-700">Correo electrónico</label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Correo electrónico" /></div>
                  <p className="md:col-span-2 text-xs text-zinc-500">Debes registrar al menos un teléfono o un correo electrónico.</p>
                  <div><label className="mb-1 block text-sm text-zinc-700">RFC</label><Input value={form.rfc} onChange={(e) => setForm({ ...form, rfc: e.target.value })} placeholder="RFC" /></div>
                </div>
              </section>

              <section className="rounded-2xl border border-zinc-200 p-5"><h4 className="text-2xl font-semibold text-zinc-900">Foto del cliente</h4>
                <div className="mt-5 flex flex-col items-center gap-4">
                   <div className="grid h-36 w-36 place-items-center overflow-hidden rounded-full bg-rose-50 sm:h-44 sm:w-44">
                    {form.profileImageUrl ? <img src={form.profileImageUrl} alt="Preview" className="h-full w-full object-cover" /> : <UserRound className="h-24 w-24 text-rose-300" />}
                  </div>
                  <label className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-rose-200 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50"><Upload className="h-4 w-4" />{isUploadingImage ? "Procesando foto..." : "Subir foto"}<input type="file" accept="image/*" className="hidden" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; await handleImageUpload(file); e.target.value = ""; }} /></label>
                  <p className="text-center text-xs text-zinc-500">Acepta cualquier tamaño. Se recorta y optimiza a WebP 350 x 350 px.</p>
                  {imageError ? <p className="text-xs text-rose-600">{imageError}</p> : null}
                </div>
              </section>
            </div>

            <section className="mt-5 rounded-2xl border border-zinc-200 p-5"><div className="mb-5 flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-full bg-rose-50 text-rose-500"><ClipboardList className="h-5 w-5" /></div><h4 className="text-2xl font-semibold text-zinc-900">Procedimientos / Padecimientos</h4></div>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-4"><TagField title="Alergias" items={form.allergies} onChange={(next) => setForm({ ...form, allergies: next })} onRemove={(item) => setForm({ ...form, allergies: form.allergies.filter((x) => x !== item) })} /><TagField title="Cirugías" items={form.surgeries} onChange={(next) => setForm({ ...form, surgeries: next })} onRemove={(item) => setForm({ ...form, surgeries: form.surgeries.filter((x) => x !== item) })} /><TagField title="Enfermedades" items={form.diseases} onChange={(next) => setForm({ ...form, diseases: next })} onRemove={(item) => setForm({ ...form, diseases: form.diseases.filter((x) => x !== item) })} /></div>
                 <div><label className="mb-1 block text-sm text-zinc-700">Procedimientos anteriores</label><Textarea className="min-h-[160px] sm:min-h-[240px]" value={form.previousProcedures} onChange={(e) => setForm({ ...form, previousProcedures: e.target.value })} placeholder="Escribe aquí..." /></div>
              </div>
              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <YesNoField title="¿Problemas o desajustes en la tiroides?" value={form.thyroidIssues ?? ""} onChange={(next) => setForm({ ...form, thyroidIssues: next })} />
                <div><label className="mb-1 block text-sm text-zinc-700">Productos que esté usando en su cuerpo</label><Input value={form.bodyProducts} onChange={(e) => setForm({ ...form, bodyProducts: e.target.value })} placeholder="Cremas, medicamentos tópicos, activos..." /></div>
                <YesNoField title="¿Se ha aplicado anteriormente botox o alguna otra sustancia?" value={form.previousBotoxOrSubstance ?? ""} onChange={(next) => setForm({ ...form, previousBotoxOrSubstance: next })} />
                {form.previousBotoxOrSubstance === "si" ? <div><label className="mb-1 block text-sm text-zinc-700">Cuál y fecha de aplicación</label><Input value={form.previousSubstanceDetails} onChange={(e) => setForm({ ...form, previousSubstanceDetails: e.target.value })} placeholder="Ej. Botox, 12/05/2026" /></div> : null}
                <YesNoField title="¿Hubo reacciones secundarias en ese procedimiento?" value={form.secondaryReactions ?? ""} onChange={(next) => setForm({ ...form, secondaryReactions: next })} />
                <div className="grid gap-3 md:grid-cols-[0.65fr_1fr]">
                  <YesNoField title="¿Alergias a mariscos?" value={form.seafoodAllergy ?? ""} onChange={(next) => setForm({ ...form, seafoodAllergy: next })} />
                  {form.seafoodAllergy === "si" ? <div><label className="mb-1 block text-sm text-zinc-700">Menciónalos</label><Input value={form.seafoodAllergyDetails} onChange={(e) => setForm({ ...form, seafoodAllergyDetails: e.target.value })} placeholder="Escribe aquí..." /></div> : null}
                </div>
                <YesNoField title="¿Problemas de cicatrización?" value={form.healingProblems ?? ""} onChange={(next) => setForm({ ...form, healingProblems: next })} />
              </div>
            </section>

            <div className="mt-6 grid grid-cols-2 gap-2 sm:flex sm:justify-end"><Button variant="secondary" onClick={() => void cancelCustomerForm()}>Cancelar</Button><Button onClick={handleSave}><Plus className="h-4 w-4" />{selectedCustomerId ? "Actualizar cliente" : "Guardar cliente"}</Button></div>
          </div>
        </div>
      ) : null}

      {questionnaireCustomer ? (
        <div className="fixed inset-0 z-50 bg-black/35 p-3 backdrop-blur-sm md:p-6">
          <div className="mx-auto max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-zinc-200 bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <div className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-rose-50 text-rose-500"><FileText className="h-6 w-6" /></div>
                <h3 className="text-2xl font-semibold text-zinc-900">Cuestionarios del cliente</h3>
                <p className="mt-1 text-sm text-zinc-500">Selecciona el cuestionario que deseas imprimir o descargar con los datos automáticos de {questionnaireCustomer.name}.</p>
              </div>
              <button onClick={() => setQuestionnaireCustomer(null)} className="rounded-full p-2 text-zinc-500 hover:bg-zinc-100"><X className="h-5 w-5" /></button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {questionnaireOptions.map((option) => (
                <article key={option.kind} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                  <h4 className="text-lg font-semibold text-zinc-900">{option.title}</h4>
                  <p className="mt-1 text-sm text-zinc-500">{option.description}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button onClick={() => printQuestionnaire(option.kind, questionnaireCustomer)}><Printer className="h-4 w-4" /> Imprimir</Button>
                    <Button variant="secondary" onClick={() => downloadQuestionnaire(option.kind, questionnaireCustomer)}><Download className="h-4 w-4" /> Descargar</Button>
                  </div>
                </article>
              ))}
            </div>
            <p className="mt-5 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">Los campos que no existan en el perfil del cliente quedan con línea en blanco para completarlos manualmente después de imprimir.</p>
          </div>
        </div>
      ) : null}

      {viewingCustomer ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/30 p-3 backdrop-blur-sm md:p-6">
          <div className="max-h-[94dvh] w-full max-w-6xl overflow-y-auto rounded-3xl border border-zinc-200 bg-white p-4 shadow-2xl sm:p-6">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <img src={viewingCustomer.profileImageUrl || "https://placehold.co/96x96/webp?text=Cliente"} alt={viewingCustomer.name} className="h-14 w-14 rounded-full object-cover" />
                <div><h3 className="text-xl font-semibold text-zinc-900">Detalle del cliente</h3><p className="text-sm text-zinc-500">{viewingCustomer.name}</p></div>
              </div>
              <button onClick={() => setViewingCustomerId(null)} className="rounded-full p-2 text-zinc-500 hover:bg-zinc-100"><X className="h-5 w-5" /></button>
            </div>

            <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
              <section className="rounded-2xl border border-zinc-200 p-4">
                <h4 className="font-semibold text-zinc-900">Información y padecimientos</h4>
                <div className="mt-4 space-y-2 text-sm text-zinc-700">
                  <p><span className="text-zinc-500">Número de cliente:</span> {viewingCustomer.customerNumber ?? "Pendiente"}</p>
                  <p><span className="text-zinc-500">WhatsApp:</span> {viewingCustomer.whatsapp || viewingCustomer.phone || "Sin dato"}</p>
                  <p><span className="text-zinc-500">Correo:</span> {viewingCustomer.email || "Sin dato"}</p>
                  <p><span className="text-zinc-500">Canal preferido:</span> {viewingCustomer.preferredContactChannel === "whatsapp" ? "WhatsApp" : "Correo electrónico"}</p>
                  <p><span className="text-zinc-500">RFC:</span> {viewingCustomer.rfc || "Sin dato"}</p>
                  <p><span className="text-zinc-500">Alergias:</span> {(viewingCustomer.allergies ?? []).join(", ") || "Sin dato"}</p>
                  <p><span className="text-zinc-500">Cirugías:</span> {(viewingCustomer.surgeries ?? []).join(", ") || "Sin dato"}</p>
                  <p><span className="text-zinc-500">Enfermedades:</span> {(viewingCustomer.diseases ?? []).join(", ") || "Sin dato"}</p>
                  <p><span className="text-zinc-500">Problemas o desajustes en la tiroides:</span> {viewingCustomer.thyroidIssues === "si" ? "Sí" : viewingCustomer.thyroidIssues === "no" ? "No" : "Sin dato"}</p>
                  <p><span className="text-zinc-500">Productos que esté usando en su cuerpo:</span> {viewingCustomer.bodyProducts || "Sin dato"}</p>
                  <p><span className="text-zinc-500">Botox o alguna otra sustancia anteriormente:</span> {viewingCustomer.previousBotoxOrSubstance === "si" ? "Sí" : viewingCustomer.previousBotoxOrSubstance === "no" ? "No" : "Sin dato"}</p>
                  <p><span className="text-zinc-500">Cuál y fecha de aplicación:</span> {viewingCustomer.previousSubstanceDetails || "Sin dato"}</p>
                  <p><span className="text-zinc-500">Reacciones secundarias:</span> {viewingCustomer.secondaryReactions === "si" ? "Sí" : viewingCustomer.secondaryReactions === "no" ? "No" : "Sin dato"}</p>
                  <p><span className="text-zinc-500">Alergias a mariscos:</span> {viewingCustomer.seafoodAllergy === "si" ? `Sí${viewingCustomer.seafoodAllergyDetails ? ` - ${viewingCustomer.seafoodAllergyDetails}` : ""}` : viewingCustomer.seafoodAllergy === "no" ? "No" : "Sin dato"}</p>
                  <p><span className="text-zinc-500">Problemas de cicatrización:</span> {viewingCustomer.healingProblems === "si" ? "Sí" : viewingCustomer.healingProblems === "no" ? "No" : "Sin dato"}</p>
                  <p><span className="text-zinc-500">Procedimientos anteriores:</span> {viewingCustomer.previousProcedures || "Sin dato"}</p>
                </div>
              </section>

              <section className="min-w-0 rounded-2xl border border-zinc-200 p-4">
                <div className="flex items-center gap-2"><ReceiptText className="h-5 w-5 text-rose-500" /><h4 className="font-semibold text-zinc-900">Historial de servicios y pagos</h4></div>
                {historyLoading ? <div className="mt-4"><AppointmentLoading title="Cargando historial" message="Estamos consultando los servicios y pagos de esta clienta." mode="database" overlay={false} /></div> : null}
                {historyError ? <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{historyError}</p> : null}
                {!historyLoading && !historyError && customerHistory.length === 0 ? <p className="mt-4 text-sm text-zinc-500">Este cliente aún no tiene servicios registrados.</p> : null}
                <div className="mt-4 space-y-2">
                  {customerHistory.map((item) => (
                    <article key={item.id} className="rounded-2xl border border-zinc-200 bg-stone-50 p-3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-zinc-900">{item.serviceName}</p>
                          <p className="mt-1 text-xs text-zinc-500">{item.serviceDate || "Fecha sin registrar"} · {sourceLabel(item.sourceType)}</p>
                          <div className="mt-2 flex flex-wrap gap-2 text-xs">
                            <span className={`rounded-full px-2.5 py-1 ${item.paymentStatus === "pagado" ? "bg-emerald-100 text-emerald-700" : item.paymentStatus === "pendiente" ? "bg-amber-100 text-amber-700" : "bg-zinc-200 text-zinc-600"}`}>{paymentLabel(item.paymentStatus)}</span>
                            <span className="rounded-full bg-white px-2.5 py-1 text-zinc-700">{money(item.amount)}</span>
                            {item.receiptFolio ? <span className="rounded-full bg-white px-2.5 py-1 text-zinc-700">Folio {item.receiptFolio}</span> : null}
                            {item.receiptSentAt ? <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-700">Comprobante enviado</span> : null}
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          {item.editable ? <button type="button" onClick={() => openHistoryEditor(item)} className="rounded-lg border border-zinc-200 bg-white p-2 text-zinc-600 hover:bg-zinc-100" title="Editar pago"><Pencil className="h-4 w-4" /></button> : null}
                          {viewingCustomer.email ? <button type="button" onClick={() => void sendHistoryReceipt(item)} className="rounded-lg border border-rose-200 bg-white p-2 text-rose-600 hover:bg-rose-50" title="Enviar comprobante por correo"><Mail className="h-4 w-4" /></button> : null}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </div>
      ) : null}

      {editingHistory ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-3 backdrop-blur-sm">
          <div className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4"><div><h3 className="text-xl font-semibold text-zinc-900">Editar servicio y pago</h3><p className="mt-1 text-sm text-zinc-500">{editingHistory.serviceName}</p></div><button onClick={() => setEditingHistory(null)} className="rounded-full p-2 text-zinc-500 hover:bg-zinc-100"><X className="h-5 w-5" /></button></div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div><label className="mb-1 block text-sm text-zinc-700">Fecha del servicio</label><Input type="date" value={historyDraft.serviceDate} onChange={(event) => setHistoryDraft({ ...historyDraft, serviceDate: event.target.value })} /></div>
              <div><label className="mb-1 block text-sm text-zinc-700">Importe</label><Input type="number" min="0" step="0.01" value={historyDraft.amount} onChange={(event) => setHistoryDraft({ ...historyDraft, amount: event.target.value })} placeholder="0.00" /></div>
              <div><label className="mb-1 block text-sm text-zinc-700">Estado del pago</label><Select value={historyDraft.paymentStatus} onChange={(event) => setHistoryDraft({ ...historyDraft, paymentStatus: event.target.value as CustomerServiceHistory["paymentStatus"] })}><option value="sin_registro">Sin registro</option><option value="pendiente">Pendiente</option><option value="pagado">Pagado</option></Select></div>
              <div><label className="mb-1 block text-sm text-zinc-700">Método de pago</label><Select value={historyDraft.paymentMethod} onChange={(event) => setHistoryDraft({ ...historyDraft, paymentMethod: event.target.value as CustomerServiceHistory["paymentMethod"] | "" })}><option value="">Sin método</option><option value="efectivo">Efectivo</option><option value="tarjeta">Tarjeta</option><option value="transferencia">Transferencia</option><option value="otro">Otro</option></Select></div>
              <div className="sm:col-span-2"><label className="mb-1 block text-sm text-zinc-700">Folio o referencia</label><Input value={historyDraft.receiptFolio} onChange={(event) => setHistoryDraft({ ...historyDraft, receiptFolio: event.target.value })} /></div>
              <div className="sm:col-span-2"><label className="mb-1 block text-sm text-zinc-700">Notas</label><Textarea value={historyDraft.notes} onChange={(event) => setHistoryDraft({ ...historyDraft, notes: event.target.value })} /></div>
            </div>
            <div className="mt-5 flex justify-end gap-3"><Button variant="secondary" onClick={() => setEditingHistory(null)}>Cancelar</Button><Button onClick={() => void saveHistoryChanges()}>Guardar cambios</Button></div>
          </div>
        </div>
      ) : null}
    </>
  );
}











