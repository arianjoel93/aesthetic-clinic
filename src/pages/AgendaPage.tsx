import { CalendarDays, ChevronLeft, ChevronRight, Link2, List, Search, Send, Trash2, X } from "lucide-react";
import Swal, { type SweetAlertOptions } from "sweetalert2";
import { CheckCircle2, Clock3, Loader2, Mail } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AppointmentLoading } from "../components/ui/AppointmentLoading";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { MakeupEmptyState } from "../components/ui/MakeupEmptyState";
import { Select } from "../components/ui/Select";
import {
  createSupabaseAppointment,
  deleteSupabaseAppointments,
  updateSupabaseAppointment,
} from "../lib/appointmentsApi";
import { requireSupabaseSession } from "../lib/cloud";
import { applyPosPaymentMetaToSales, savePosPaymentMeta } from "../lib/posPaymentMetaApi";
import { useCrmStore } from "../store/crmStore";
import type { Appointment, PosSale, PosSaleItem } from "../types/crm";
import { sendAppointmentEmail } from "../utils/appointmentEmail";
import {
  appointmentReminderDedupeKey,
  fetchAppointmentReminderLogs,
  saveAppointmentReminderLog,
} from "../lib/appointmentReminderApi";
import { hasSupabaseConfig, supabase } from "../lib/supabaseClient";
import { showActionCancelled, showActionSuccess } from "../utils/appAlert";

const weekDays = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const timeSlots = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"];
type OrderForAppointment = PosSale & { customerEmail?: string; customerWhatsapp?: string; customerPhone?: string; customerNumber?: string };

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
      actions: "crm-swal-actions",
    },
    buttonsStyling: false,
  });
}

function formatCurrencyMXN(value: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 }).format(Number.isFinite(value) ? value : 0);
}

const orderPaidAmount = (order: Pick<PosSale, "paidAmount" | "total" | "paymentStatus">) => order.paymentStatus === "garantia" ? 0 : Number(order.paidAmount ?? order.total);
const orderBalance = (order: Pick<PosSale, "paidAmount" | "total" | "paymentStatus">) => order.paymentStatus === "garantia" ? 0 : Math.max(0, Number(order.total || 0) - orderPaidAmount(order));
const orderPaymentLabel = (order: Pick<PosSale, "paymentStatus" | "paidAmount" | "total">) =>
  order.paymentStatus === "garantia" ? "Garantía" : order.paymentStatus === "pendiente" ? "Cita sin anticipo" : (order.paymentStatus === "anticipo" || order.paymentStatus === "anticipo_pagado") && orderBalance(order) > 0 ? "Anticipo pagado" : "Pagado completo";

function appointmentContactPhone(appointment: Pick<Appointment, "customerWhatsapp">) {
  return appointment.customerWhatsapp?.replace(/[^\d]/g, "") ?? "";
}

function buildConfirmationText(customerName: string, confirmLink: string, advancePending = false) {
  return [
    advancePending
      ? `Hola ${customerName}, tu cita quedó registrada y tiene un saldo pendiente por cubrir.`
      : `Hola ${customerName}, ya registramos el pago/anticipo de tu orden.`,
    `Por favor confirma o cancela tu fecha y hora aquí: ${confirmLink}`,
    "Gracias por tu preferencia.",
  ].join("\n\n");
}

function mapPosSaleItem(row: Record<string, unknown>): PosSaleItem {
  return {
    id: String(row.id),
    serviceId: row.service_id ? String(row.service_id) : undefined,
    treatmentId: row.treatment_id ? String(row.treatment_id) : undefined,
    serviceName: String(row.service_name ?? "Servicio"),
    quantity: Number(row.quantity ?? 1),
    unitPrice: Number(row.unit_price ?? 0),
    total: Number(row.total ?? 0),
  };
}

function mapOrderForAppointment(row: Record<string, unknown>, customer?: { email?: string; phone?: string; whatsapp?: string }): OrderForAppointment {
  const rawItems = Array.isArray(row.pos_sale_items) ? row.pos_sale_items as Record<string, unknown>[] : [];
  const total = Number(row.total ?? 0);
  const advanceAmount = Number(row.advance_amount ?? 500);
  const paymentStatus = String(row.payment_status ?? "pagado") as PosSale["paymentStatus"];
  const paymentType = String(row.payment_type ?? (paymentStatus === "pendiente" ? "sin_anticipo" : paymentStatus === "garantia" ? "garantia" : "anticipo")) as PosSale["paymentType"];
  const paidAmount = paymentStatus === "anticipo" || paymentStatus === "anticipo_pagado"
    ? Number(row.paid_amount ?? advanceAmount)
    : paymentStatus === "pendiente" || paymentStatus === "garantia"
      ? Number(row.paid_amount ?? 0)
    : Number(row.paid_amount ?? total);
  return {
    id: String(row.id),
    folio: String(row.folio),
    cashSessionId: String(row.cash_session_id),
    createdAt: String(row.created_at),
    userName: String(row.user_name ?? "Administrador"),
    customerId: row.customer_id ? String(row.customer_id) : undefined,
    customerName: row.customer_name ? String(row.customer_name) : undefined,
    subtotal: Number(row.subtotal ?? 0),
    total,
    advanceAmount,
    paidAmount,
    paymentType,
    paymentStatus,
    paymentMethod: String(row.payment_method ?? "efectivo") as PosSale["paymentMethod"],
    paymentInstallments: row.payment_installments ? Number(row.payment_installments) as 3 | 6 : undefined,
    appointmentId: row.appointment_id ? String(row.appointment_id) : undefined,
    customerEmail: customer?.email,
    customerWhatsapp: customer?.whatsapp,
    customerPhone: customer?.phone,
    customerNumber: customer && "customerNumber" in customer && customer.customerNumber ? String(customer.customerNumber) : undefined,
    items: rawItems.map(mapPosSaleItem),
  };
}

function appointmentStatusClass(status: Appointment["status"]) {
  if (status === "creada") return "border-blue-200 bg-blue-50 text-blue-700";
  if (status === "enviada") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "aceptada") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "completada") return "border-transparent bg-gradient-to-r from-emerald-500 to-sky-500 text-white";
  if (status === "rechazada" || status === "cancelada") return "border-rose-200 bg-rose-50 text-rose-700";
  if (status === "reagendada") return "border-zinc-300 bg-zinc-100 text-zinc-700";
  return "border-zinc-200 bg-zinc-50 text-zinc-700";
}

const formatDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const nextBusinessDay = (base = new Date()) => {
  const next = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1);
  while (next.getDay() === 0) next.setDate(next.getDate() + 1);
  return formatDate(next);
};

function reminderButtonState(appointment: Appointment, sentKeys: Set<string>) {
  const sent = sentKeys.has(appointmentReminderDedupeKey(appointment.id, appointment.date));
  const eligibleStatus = !["rechazada", "cancelada", "completada"].includes(appointment.status);
  const due = eligibleStatus && appointment.date === nextBusinessDay();
  return { sent, due, enabled: due && !sent && Boolean(appointment.customerEmail) };
}
const mondayOf = (date: Date) => {
  const copy = new Date(date);
  const day = copy.getDay();
  copy.setDate(copy.getDate() + (day === 0 ? -6 : 1 - day));
  copy.setHours(0, 0, 0, 0);
  return copy;
};
const weekRangeLabel = (monday: Date) => {
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 5);
  return `${monday.toLocaleDateString("es-MX")} - ${sunday.toLocaleDateString("es-MX")}`;
};
const addDays = (baseDate: string, amount: number) => {
  const base = new Date(`${baseDate}T00:00:00`);
  base.setDate(base.getDate() + amount);
  return formatDate(base);
};
const addMonths = (baseDate: string, amount: number) => {
  const base = new Date(`${baseDate}T00:00:00`);
  base.setMonth(base.getMonth() + amount);
  return formatDate(base);
};

function followupRecommendations(service: string): Array<{ key: string; label: string }> {
  const name = service.toLowerCase();
  const common = [
    { key: "d7", label: "En 7 días" },
    { key: "d15", label: "En 15 días" },
    { key: "d30", label: "En 30 días" },
    { key: "d45", label: "En 45 días" },
    { key: "m2", label: "En 2 meses" },
    { key: "m5", label: "En 5 meses" },
    { key: "y1", label: "En 1 año" },
    { key: "q4", label: "4 veces al año" },
  ];

  if (name.includes("botox")) return [{ key: "both_botox", label: "15 días y 5 meses" }, ...common];
  if (name.includes("hialur")) return [{ key: "both_hial", label: "7 días y 5 meses" }, ...common];
  if (name.includes("micropig")) return [{ key: "both_micro", label: "45 días y 1 año" }, ...common];
  if (name.includes("adn salmón") || name.includes("enzimas")) return [{ key: "q4", label: "4 veces al año" }, { key: "q5", label: "5 veces al año" }, ...common];
  return common;
}

function buildFollowupDates(baseDate: string, planKey: string): string[] {
  if (planKey === "d7") return [addDays(baseDate, 7)];
  if (planKey === "d15") return [addDays(baseDate, 15)];
  if (planKey === "d30") return [addDays(baseDate, 30)];
  if (planKey === "d45") return [addDays(baseDate, 45)];
  if (planKey === "m2") return [addMonths(baseDate, 2)];
  if (planKey === "m5") return [addMonths(baseDate, 5)];
  if (planKey === "y1") return [addMonths(baseDate, 12)];
  if (planKey === "both_botox") return [addDays(baseDate, 15), addMonths(baseDate, 5)];
  if (planKey === "both_hial") return [addDays(baseDate, 7), addMonths(baseDate, 5)];
  if (planKey === "both_micro") return [addDays(baseDate, 45), addMonths(baseDate, 12)];
  if (planKey === "q4") return [addMonths(baseDate, 3), addMonths(baseDate, 6), addMonths(baseDate, 9), addMonths(baseDate, 12)];
  if (planKey === "q5") return [addDays(baseDate, 73), addDays(baseDate, 146), addDays(baseDate, 219), addDays(baseDate, 292), addDays(baseDate, 365)];
  return [];
}

export function AgendaPage() {
  const customers = useCrmStore((state) => state.customers);
  const appointments = useCrmStore((state) => state.appointments);
  const upsertAppointment = useCrmStore((state) => state.upsertAppointment);
  const deleteAppointments = useCrmStore((state) => state.deleteAppointments);

  const [searchParams, setSearchParams] = useSearchParams();
  const [reference, setReference] = useState(new Date());
  const [viewMode, setViewMode] = useState<"calendar" | "table">("calendar");
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [draggingAppointmentId, setDraggingAppointmentId] = useState<string | null>(null);
  const [orderSearch, setOrderSearch] = useState("");
  const [orderResults, setOrderResults] = useState<OrderForAppointment[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<OrderForAppointment | null>(null);
  const [isSearchingOrders, setIsSearchingOrders] = useState(false);
  const [lastCreatedLink, setLastCreatedLink] = useState("");
  const [editableCost, setEditableCost] = useState(0);
  const [editableStatus, setEditableStatus] = useState<Appointment["status"]>("creada");
  const [editableAdvancePaymentStatus, setEditableAdvancePaymentStatus] = useState<NonNullable<Appointment["advancePaymentStatus"]>>("pendiente");
  const [editableDate, setEditableDate] = useState("");
  const [editableStart, setEditableStart] = useState("");
  const [editableEnd, setEditableEnd] = useState("");
  const [isSendingAppointment, setIsSendingAppointment] = useState(false);
  const [sendingReminderId, setSendingReminderId] = useState<string | null>(null);
  const [sentReminderKeys, setSentReminderKeys] = useState<Set<string>>(new Set());
  const [sendingMessage, setSendingMessage] = useState("Preparando la cita y el enlace de confirmación.");

  const [newAppointment, setNewAppointment] = useState({
    date: formatDate(new Date()),
    start: "09:00",
    end: "10:00",
    sendVia: "whatsapp" as "whatsapp" | "email",
  });

  const isFormOpen = searchParams.get("nuevo") === "1";
  const agendaQuery = searchParams.get("q")?.trim().toLocaleLowerCase("es") ?? "";
  const visibleAppointments = useMemo(() => {
    if (!agendaQuery) return appointments;
    return appointments.filter((appointment) => [
      appointment.customerName,
      appointment.customerEmail,
      appointment.customerWhatsapp,
      appointment.service,
      appointment.serviceSubtype,
      appointment.date,
      appointment.status,
    ].join(" ").toLocaleLowerCase("es").includes(agendaQuery));
  }, [agendaQuery, appointments]);
  const sortedAppointments = useMemo(() => [...visibleAppointments].sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`)), [visibleAppointments]);
  const selectedOrderCustomer = selectedOrder?.customerId ? customers.find((customer) => customer.id === selectedOrder.customerId) : undefined;

  const openAppointment = (appointment: Appointment) => {
    setSelectedAppointment(appointment);
    setEditableCost(appointment.cost ?? 0);
    setEditableStatus(appointment.status);
    setEditableAdvancePaymentStatus(appointment.advancePaymentStatus ?? "pendiente");
    setEditableDate(appointment.date);
    setEditableStart(appointment.start);
    setEditableEnd(appointment.end);
  };

  useEffect(() => {
    let active = true;
    const loadReminderLogs = async () => {
      try {
        const logs = await fetchAppointmentReminderLogs();
        if (active) setSentReminderKeys(new Set(logs.map((log) => log.dedupeKey)));
      } catch {
        if (active) setSentReminderKeys(new Set());
      }
    };
    void loadReminderLogs();
    const client = supabase;
    if (!hasSupabaseConfig || !client) return () => { active = false; };

    const channel = client
      .channel("agenda-appointment-email-logs")
      .on("postgres_changes", { event: "*", schema: "public", table: "appointment_email_logs" }, () => void loadReminderLogs())
      .subscribe();
    return () => {
      active = false;
      void client.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!selectedOrder) return;
    const customer = selectedOrder.customerId ? customers.find((item) => item.id === selectedOrder.customerId) : undefined;
    const sendVia = customer?.whatsapp || customer?.phone || selectedOrder.customerWhatsapp || selectedOrder.customerPhone ? "whatsapp" : "email";
    setNewAppointment((current) => ({ ...current, sendVia }));
  }, [customers, selectedOrder]);
  const monday = useMemo(() => mondayOf(reference), [reference]);
  const days = useMemo(() => Array.from({ length: 6 }, (_, index) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + index);
    return day;
  }), [monday]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    days.forEach((day) => map.set(formatDate(day), []));
    visibleAppointments.forEach((appointment) => {
      if (appointment.status === "rechazada" || appointment.status === "cancelada") return;
      if (map.has(appointment.date)) map.get(appointment.date)?.push(appointment);
    });
    map.forEach((list, key) => map.set(key, list.sort((a, b) => a.start.localeCompare(b.start))));
    return map;
  }, [days, visibleAppointments]);

  const closeForm = () => {
    if (isSendingAppointment) return;
    const next = new URLSearchParams(searchParams);
    next.delete("nuevo");
    setSearchParams(next, { replace: true });
  };

  const cancelForm = async () => {
    closeForm();
    await showActionCancelled("El formulario de la cita se cerró sin guardar cambios.");
  };

  const buildConfirmationLink = (token: string) => `${window.location.origin}/app/cita/${token}`;
  const openWhatsAppMessage = (phone: string, text: string) => window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank");

  const createAppointmentPersisted = async (appointment: Omit<Appointment, "id">) => {
    try {
      const saved = await createSupabaseAppointment(appointment);
      upsertAppointment(saved);
      return saved;
    } catch (error) {
      void fireAppAlert({
        title: "No se pudo guardar la cita",
        text: error instanceof Error ? error.message : "Revisa la conexión e intenta nuevamente.",
        icon: "error",
        confirmButtonText: "Entendido",
      });
      return null;
    }
  };

  const updateAppointmentPersisted = async (appointmentId: string, patch: Partial<Appointment>) => {
    try {
      const saved = await updateSupabaseAppointment(appointmentId, patch);
      upsertAppointment(saved);
      return saved;
    } catch (error) {
      void fireAppAlert({
        title: "No se pudo actualizar la cita",
        text: error instanceof Error ? error.message : "Revisa la conexión e intenta nuevamente.",
        icon: "error",
        confirmButtonText: "Entendido",
      });
      return null;
    }
  };

  const searchPaidOrders = async () => {
    const query = orderSearch.trim().toLocaleLowerCase("es");
    if (!query) {
      await fireAppAlert({ title: "Busca una orden", text: "Captura nombre, teléfono, correo o número de orden.", icon: "info", confirmButtonText: "Entendido" });
      return;
    }

    setIsSearchingOrders(true);
    try {
      const supabase = await requireSupabaseSession();
      const { data, error } = await supabase
        .from("pos_sales")
        .select("*, pos_sale_items(*)")
        .order("created_at", { ascending: false })
        .limit(250);
      if (error) throw error;

      const rows = (data ?? []) as unknown as Record<string, unknown>[];
      const mapped = await applyPosPaymentMetaToSales(rows.map((row) => {
        const customer = row.customer_id ? customers.find((item) => item.id === String(row.customer_id)) : undefined;
        return mapOrderForAppointment(row, customer);
      }));
      const scheduledOrderIds = new Set(appointments.map((appointment) => appointment.posSaleId).filter(Boolean));
      const scheduledFolios = new Set(appointments.map((appointment) => appointment.orderFolio).filter(Boolean));
      const matches = mapped.filter((order) => {
        const haystack = [
          order.folio,
          order.customerName,
          order.customerEmail,
          order.customerPhone,
          order.customerWhatsapp,
          order.customerNumber ? String(order.customerNumber) : "",
        ].join(" ").toLocaleLowerCase("es");
        const isPaidEnough = order.paymentType === "garantia" || order.paymentStatus === "garantia" || orderPaidAmount(order) > 0 || order.paymentStatus === "pagado" || order.paymentStatus === "anticipo" || order.paymentStatus === "anticipo_pagado";
        const alreadyScheduled = Boolean(order.appointmentId) || scheduledOrderIds.has(order.id) || scheduledFolios.has(order.folio);
        return haystack.includes(query) && isPaidEnough && !alreadyScheduled;
      }).slice(0, 12);

      setOrderResults(matches);
      if (matches.length === 1) setSelectedOrder(matches[0]);
      if (matches.length === 0) {
        await fireAppAlert({ title: "Sin órdenes disponibles", text: "No encontré una orden con anticipo o pago completo pendiente de agendar.", icon: "info", confirmButtonText: "Entendido" });
      }
    } catch (error) {
      await fireAppAlert({
        title: "No se pudieron buscar órdenes",
        text: error instanceof Error ? error.message : "Revisa la conexión e intenta nuevamente.",
        icon: "error",
        confirmButtonText: "Entendido",
      });
    } finally {
      setIsSearchingOrders(false);
    }
  };

  const linkOrderToAppointment = async (orderId: string, appointmentId: string) => {
    try {
      const supabase = await requireSupabaseSession();
      const { error } = await supabase.from("pos_sales").update({ appointment_id: appointmentId }).eq("id", orderId);
      if (error?.code !== "PGRST204" && error) throw error;
      const order = selectedOrder?.id === orderId ? selectedOrder : orderResults.find((item) => item.id === orderId);
      if (error?.code === "PGRST204" && order) {
        await savePosPaymentMeta({
          saleId: order.id,
          paymentStatus: order.paymentStatus ?? "anticipo",
          advanceAmount: Number(order.advanceAmount ?? 0),
          paidAmount: orderPaidAmount(order),
          appointmentId,
        });
      }
    } catch {
      return;
    }
  };

  const handleCreateAppointment = async () => {
    if (!selectedOrder || isSendingAppointment) return;
    setIsSendingAppointment(true);
    setSendingMessage("Guardando la cita desde la orden pagada.");

    try {
      const token = crypto.randomUUID().slice(0, 10);
      const serviceName = selectedOrder.items.map((item) => item.serviceName).filter(Boolean).join(", ") || "Servicio agendado";
      const primaryItem = selectedOrder.items[0];
      const customerName = selectedOrder.customerName || selectedOrderCustomer?.name || "Cliente";
      const customerEmail = selectedOrderCustomer?.email || selectedOrder.customerEmail;
      const customerWhatsapp = selectedOrderCustomer?.whatsapp || selectedOrder.customerWhatsapp || selectedOrderCustomer?.phone || selectedOrder.customerPhone;
      const created = await createAppointmentPersisted({
        customerId: selectedOrder.customerId,
        customerName,
        customerEmail,
        customerWhatsapp,
        serviceId: primaryItem?.serviceId,
        service: serviceName,
        cost: Number(selectedOrder.total || 0),
        date: newAppointment.date,
        start: newAppointment.start,
        end: newAppointment.end,
        status: "creada",
        discountPercent: 0,
        advancePaymentStatus: selectedOrder.paymentStatus === "pendiente" ? "pendiente" : "pagado",
        advancePaidAt: selectedOrder.paymentStatus === "pendiente" ? undefined : new Date().toISOString(),
        posSaleId: selectedOrder.id,
        orderFolio: selectedOrder.folio,
        confirmationToken: token,
      });

      if (!created) return;

      const confirmLink = buildConfirmationLink(token);
      setLastCreatedLink(confirmLink);

      if (newAppointment.sendVia === "whatsapp" && customerWhatsapp) {
        setSendingMessage("Preparando el mensaje de WhatsApp con el enlace de confirmación.");
        openWhatsAppMessage(customerWhatsapp.replace(/[^\d]/g, ""), buildConfirmationText(customerName, confirmLink, selectedOrder.paymentStatus === "pendiente"));
        await updateAppointmentPersisted(created.id, { status: "enviada" });
      }
      if (newAppointment.sendVia === "whatsapp" && !customerWhatsapp) {
        void fireAppAlert({
          title: "Falta WhatsApp",
          text: "La cita fue creada, pero este cliente no tiene WhatsApp registrado. Agrega el dato en Clientes o cambia el método de contacto.",
          icon: "info",
          confirmButtonText: "Entendido",
        });
      }
      if (newAppointment.sendVia === "email" && customerEmail) {
        setSendingMessage("Enviando el correo de confirmación al cliente. Esto puede tardar unos segundos.");
        const result = await sendAppointmentEmail({
          to: customerEmail,
          customerName,
          service: serviceName,
          date: newAppointment.date,
          start: newAppointment.start,
          end: newAppointment.end,
          confirmationLink: confirmLink,
          kind: "confirmation",
        });
        if (result.ok) {
          setSendingMessage("Correo enviado. Actualizando el estado de la cita.");
          await updateAppointmentPersisted(created.id, { status: "enviada" });
        } else {
          await fireAppAlert({ title: "No se pudo enviar el correo", text: result.message, icon: "warning", confirmButtonText: "Entendido" });
        }
      }
      if (newAppointment.sendVia === "email" && !customerEmail) {
        void fireAppAlert({
          title: "Falta correo electrónico",
          text: "La cita fue creada, pero este cliente no tiene correo registrado. Agrega el correo en Clientes o usa WhatsApp como método de contacto.",
          icon: "info",
          confirmButtonText: "Entendido",
        });
      }

      await linkOrderToAppointment(selectedOrder.id, created.id);
      await updateAppointmentPersisted(created.id, { confirmationToken: token });
      closeForm();
      setSelectedOrder(null);
      setOrderResults([]);
      setOrderSearch("");
      await showActionSuccess("Cita guardada", "La cita se creó desde la orden y se procesó el enlace de confirmación.");
    } finally {
      setIsSendingAppointment(false);
      setSendingMessage("Preparando la cita y el enlace de confirmación.");
    }
  };

  const maybeCreateFollowupAppointments = async (appointment: Appointment) => {
    const recommendations = followupRecommendations(appointment.service);
    const optionsHtml = recommendations.map((item) => `<option value="${item.key}">${item.label}</option>`).join("");
    const result = await fireAppAlert({
      title: "Continuidad recomendada",
      html: `<p style="font-size:14px;color:#52525b;margin-bottom:10px;">Puedes agendar ahora el retoque o continuidad.</p><select id="followup-plan" class="swal2-select crm-swal-select" style="width:100%;margin:0;">${optionsHtml}</select>`,
      showCancelButton: true,
      confirmButtonText: "Agendar",
      cancelButtonText: "Cerrar",
      preConfirm: () => {
        const element = document.getElementById("followup-plan") as HTMLSelectElement | null;
        return element?.value || "";
      },
    });

    if (!result.isConfirmed || !result.value) return false;
    const created = await Promise.all(buildFollowupDates(appointment.date, result.value as string).map((date) =>
      createAppointmentPersisted({
        customerId: appointment.customerId,
        customerName: appointment.customerName,
        customerEmail: appointment.customerEmail,
        customerWhatsapp: appointment.customerWhatsapp,
        serviceId: appointment.serviceId,
        service: appointment.service,
        serviceSubtype: appointment.serviceSubtype,
        date,
        start: appointment.start,
        end: appointment.end,
        status: "creada",
        cost: 0,
        discountPercent: 0,
        autoGenerated: true,
        parentAppointmentId: appointment.id,
      }),
    ));
    return created.every(Boolean);
  };

  const sendReminderEmail = async (appointment: Appointment) => {
    const state = reminderButtonState(appointment, sentReminderKeys);
    if (state.sent) {
      await showActionSuccess("Recordatorio enviado", "Este correo ya fue enviado anteriormente.");
      return;
    }
    if (!appointment.customerEmail) {
      await fireAppAlert({ title: "Falta correo electrónico", text: "Registra el correo del cliente antes de enviar el recordatorio.", icon: "info", confirmButtonText: "Entendido" });
      return;
    }
    if (!state.due) {
      await fireAppAlert({ title: "Recordatorio aún no disponible", text: "El botón se activa un día laboral antes de la cita.", icon: "info", confirmButtonText: "Entendido" });
      return;
    }

    setSendingReminderId(appointment.id);
    try {
      const result = await sendAppointmentEmail({
        to: appointment.customerEmail,
        customerName: appointment.customerName,
        service: appointment.service,
        serviceSubtype: appointment.serviceSubtype,
        date: appointment.date,
        start: appointment.start,
        end: appointment.end,
        kind: "reminder",
      });
      if (!result.ok) throw new Error(result.message);
      const dedupeKey = await saveAppointmentReminderLog(appointment.id, appointment.date, appointment.customerEmail);
      setSentReminderKeys((current) => new Set(current).add(dedupeKey));
      await showActionSuccess("Correo enviado", "El recordatorio de la cita fue enviado correctamente.");
    } catch (error) {
      await fireAppAlert({ title: "No se pudo enviar el correo", text: error instanceof Error ? error.message : "Intenta nuevamente.", icon: "error", confirmButtonText: "Entendido" });
    } finally {
      setSendingReminderId(null);
    }
  };

  const dropAppointment = async (targetDate: string, targetSlot: string) => {
    if (!draggingAppointmentId) return;
    const appointment = appointments.find((item) => item.id === draggingAppointmentId);
    if (!appointment || appointment.status === "completada") return;
    const confirmed = await fireAppAlert({
      title: "Mover cita",
      text: `¿Deseas mover la cita de ${appointment.customerName} a ${targetDate} ${targetSlot}?`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Guardar",
      cancelButtonText: "Cancelar",
    });
    if (confirmed.isConfirmed) {
      const saved = await updateAppointmentPersisted(appointment.id, { date: targetDate, start: targetSlot });
      if (saved) await showActionSuccess("Cita reagendada", "La nueva fecha y hora se guardaron correctamente.");
    } else {
      await showActionCancelled("La cita conserva su fecha y hora originales.");
    }
    setDraggingAppointmentId(null);
  };

  const toggleSelected = (appointmentId: string) => {
    setSelectedIds((prev) => (prev.includes(appointmentId) ? prev.filter((item) => item !== appointmentId) : [...prev, appointmentId]));
  };

  const deleteByIds = async (ids: string[]) => {
    if (ids.length === 0) return;
    const result = await fireAppAlert({
      title: "Eliminar citas",
      text: `¿Seguro que deseas eliminar ${ids.length} cita(s)?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Eliminar",
      cancelButtonText: "Cancelar",
    });
    if (!result.isConfirmed) {
      await showActionCancelled("No se eliminó ninguna cita.");
      return;
    }
    try {
      await deleteSupabaseAppointments(ids);
      deleteAppointments(ids);
      setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)));
      await showActionSuccess("Citas eliminadas", ids.length === 1 ? "La cita fue eliminada correctamente." : "Las citas seleccionadas fueron eliminadas correctamente.");
    } catch (error) {
      void fireAppAlert({
        title: "No se pudieron eliminar las citas",
        text: error instanceof Error ? error.message : "Revisa la conexión e intenta nuevamente.",
        icon: "error",
        confirmButtonText: "Entendido",
      });
    }
  };

  const reminderButton = (appointment: Appointment, compact = false) => {
    const state = reminderButtonState(appointment, sentReminderKeys);
    const isSending = sendingReminderId === appointment.id;
    const colorClass = state.sent
      ? "border-emerald-300 bg-emerald-50 text-emerald-700"
      : state.due
        ? "border-rose-300 bg-rose-50 text-rose-700"
        : "border-zinc-200 bg-zinc-50 text-zinc-400";
    const label = state.sent ? "Enviado" : state.due ? "Enviar correo" : "Próximamente";
    return (
      <button
        type="button"
        disabled={!state.enabled || isSending}
        onClick={(event) => {
          event.stopPropagation();
          void sendReminderEmail(appointment);
        }}
        className={`inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-lg border ${compact ? "h-6 w-6 p-0" : "px-2 py-1 text-[11px]"} ${colorClass} disabled:cursor-not-allowed disabled:opacity-80`}
        title={state.sent ? "Recordatorio enviado" : state.due ? "Enviar recordatorio por correo" : "Se activa un día laboral antes"}
      >
        {isSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : state.sent ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />}
        {!compact ? <span>{label}</span> : null}
      </button>
    );
  };

  const sendConfirmationRequest = async (appointment: Appointment) => {
    const defaultChannel = appointment.customerWhatsapp ? "whatsapp" : appointment.customerEmail ? "email" : "";
    if (!defaultChannel) {
      await fireAppAlert({ title: "Falta contacto", text: "Este cliente no tiene correo ni WhatsApp registrado.", icon: "info", confirmButtonText: "Entendido" });
      return;
    }

    const channelResult = await fireAppAlert({
      title: "Enviar confirmación",
      html: `<p style="font-size:14px;color:#52525b;margin-bottom:10px;">Elige cómo enviar el enlace de confirmación al cliente.</p><select id="confirmation-channel" class="swal2-select crm-swal-select" style="width:100%;margin:0;"><option value="email"${appointment.customerEmail ? "" : " disabled"}${defaultChannel === "email" ? " selected" : ""}>Correo electrónico${appointment.customerEmail ? "" : " (no disponible)"}</option><option value="whatsapp"${appointment.customerWhatsapp ? "" : " disabled"}${defaultChannel === "whatsapp" ? " selected" : ""}>WhatsApp${appointment.customerWhatsapp ? "" : " (no disponible)"}</option></select>`,
      showCancelButton: true,
      confirmButtonText: "Enviar",
      cancelButtonText: "Cancelar",
      preConfirm: () => {
        const element = document.getElementById("confirmation-channel") as HTMLSelectElement | null;
        return element?.value || "";
      },
    });

    if (!channelResult.isConfirmed || !channelResult.value) {
      await showActionCancelled("No se envió la confirmación de la cita.");
      return;
    }

    const token = appointment.confirmationToken || crypto.randomUUID().slice(0, 10);
    const confirmationLink = buildConfirmationLink(token);

    if (channelResult.value === "whatsapp") {
      const phone = appointmentContactPhone(appointment);
      if (!phone) {
        await fireAppAlert({ title: "Falta WhatsApp", text: "Este cliente no tiene WhatsApp registrado.", icon: "info", confirmButtonText: "Entendido" });
        return;
      }
      openWhatsAppMessage(phone, buildConfirmationText(appointment.customerName, confirmationLink, appointment.advancePaymentStatus === "pendiente"));
      const saved = await updateAppointmentPersisted(appointment.id, { confirmationToken: token, status: "enviada" });
      if (saved) setSelectedAppointment(saved);
      await showActionSuccess("Confirmación lista", "Se abrió WhatsApp con el mensaje de confirmación.");
      return;
    }

    if (!appointment.customerEmail) {
      await fireAppAlert({ title: "Falta correo electrónico", text: "Este cliente no tiene correo registrado.", icon: "info", confirmButtonText: "Entendido" });
      return;
    }

    const result = await sendAppointmentEmail({
      to: appointment.customerEmail,
      customerName: appointment.customerName,
      service: appointment.service,
      serviceSubtype: appointment.serviceSubtype,
      date: appointment.date,
      start: appointment.start,
      end: appointment.end,
      confirmationLink,
      kind: "confirmation",
    });

    if (!result.ok) {
      await fireAppAlert({ title: "No se pudo enviar el correo", text: result.message, icon: "warning", confirmButtonText: "Entendido" });
      return;
    }

    const saved = await updateAppointmentPersisted(appointment.id, { confirmationToken: token, status: "enviada" });
    if (saved) setSelectedAppointment(saved);
    await showActionSuccess("Correo enviado", "El cliente recibió el enlace para confirmar fecha y hora.");
  };

  const closeAppointmentManager = async () => {
    setSelectedAppointment(null);
    await showActionCancelled("La ventana se cerró sin guardar cambios adicionales.");
  };

  const rejectSelectedAppointment = async () => {
    if (!selectedAppointment) return;
    const confirmation = await fireAppAlert({ title: "Rechazar cita", text: "¿Seguro que deseas rechazar esta cita?", icon: "warning", showCancelButton: true, confirmButtonText: "Rechazar", cancelButtonText: "Cancelar" });
    if (!confirmation.isConfirmed) {
      await showActionCancelled("La cita conserva su estado actual.");
      return;
    }
    const saved = await updateAppointmentPersisted(selectedAppointment.id, { status: "rechazada" });
    if (saved) {
      setSelectedAppointment(null);
      await showActionSuccess("Cita rechazada", "El cambio de estado se guardó correctamente.");
    }
  };

  const saveSelectedAppointment = async () => {
    if (!selectedAppointment) return;
    if (editableAdvancePaymentStatus !== "pagado" && ["enviada", "aceptada"].includes(editableStatus)) {
      await fireAppAlert({
        title: "Anticipo pendiente",
        text: "No puedes marcar la cita como enviada o aceptada hasta registrar el anticipo como pagado.",
        icon: "info",
        confirmButtonText: "Entendido",
      });
      return;
    }
    const beforeStatus = selectedAppointment.status;
    const advancePaidAt = editableAdvancePaymentStatus === "pagado"
      ? selectedAppointment.advancePaidAt ?? new Date().toISOString()
      : undefined;
    const saved = await updateAppointmentPersisted(selectedAppointment.id, {
      status: editableStatus,
      cost: editableCost,
      date: editableDate,
      start: editableStart,
      end: editableEnd,
      advancePaymentStatus: editableAdvancePaymentStatus,
      advancePaidAt,
    });
    if (!saved) return;
    if (beforeStatus !== "completada" && saved.status === "completada") {
      const scheduled = await maybeCreateFollowupAppointments(saved);
      if (scheduled) setSelectedAppointment(null);
    } else {
      setSelectedAppointment(saved);
    }
    await showActionSuccess("Cita actualizada", "Los cambios se guardaron correctamente.");
  };

  return (
    <>
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">Citas</h1>
            <p className="text-sm text-zinc-500">Vista semanal y tabla de citas</p>
            {lastCreatedLink ? <p className="mt-1 text-xs text-rose-500">Último link de cita: {lastCreatedLink}</p> : null}
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <button onClick={() => setViewMode("calendar")} className={`flex-1 rounded-lg border px-3 py-2 text-xs sm:flex-none ${viewMode === "calendar" ? "border-zinc-300 bg-zinc-100 text-zinc-900" : "border-zinc-200 bg-white text-zinc-600"}`}><CalendarDays className="mr-1 inline h-4 w-4" />Calendario</button>
            <button onClick={() => setViewMode("table")} className={`flex-1 rounded-lg border px-3 py-2 text-xs sm:flex-none ${viewMode === "table" ? "border-zinc-300 bg-zinc-100 text-zinc-900" : "border-zinc-200 bg-white text-zinc-600"}`}><List className="mr-1 inline h-4 w-4" />Tabla</button>
          </div>
        </div>

        {agendaQuery && visibleAppointments.length === 0 ? (
          <article className="rounded-2xl border border-zinc-200 bg-white">
            <MakeupEmptyState title="No encontramos citas" message="No hay citas que coincidan con la búsqueda del encabezado." />
          </article>
        ) : viewMode === "calendar" ? (
          <>
            <div className="flex items-center gap-2">
              <button onClick={() => setReference((prev) => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() - 7))} className="rounded-lg border border-zinc-200 p-2 text-zinc-600 hover:bg-zinc-50"><ChevronLeft className="h-4 w-4" /></button>
              <p className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-700">{weekRangeLabel(monday)}</p>
              <button onClick={() => setReference((prev) => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + 7))} className="rounded-lg border border-zinc-200 p-2 text-zinc-600 hover:bg-zinc-50"><ChevronRight className="h-4 w-4" /></button>
            </div>

            <article className="space-y-3 md:hidden">
              {days.map((day, index) => {
                const dayKey = formatDate(day);
                const dayEvents = eventsByDay.get(dayKey) ?? [];
                return (
                  <section key={`mobile-${dayKey}`} className="rounded-2xl border border-zinc-200 bg-white p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-semibold text-zinc-800">{weekDays[index]}</p>
                      <p className="text-[11px] text-zinc-500">{day.toLocaleDateString("es-MX")}</p>
                    </div>
                    {dayEvents.length === 0 ? <p className="rounded-xl bg-zinc-50 px-3 py-2 text-xs text-zinc-500">Sin citas agendadas.</p> : (
                      <div className="space-y-2">
                        {dayEvents.map((event) => (
                          <article key={`mobile-event-${event.id}`} onClick={() => openAppointment(event)} className={`relative cursor-pointer rounded-xl border p-3 text-xs ${appointmentStatusClass(event.status)}`}>
                            {event.status === "completada" ? <span className="mb-2 inline-flex rounded-md bg-black px-2 py-0.5 text-[10px] font-semibold text-white">Completada</span> : null}
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate font-semibold">{event.customerName}</p>
                                <p className="mt-0.5 truncate">{event.service}{event.serviceSubtype ? ` - ${event.serviceSubtype}` : ""}</p>
                                <p className="mt-1 inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{event.start} - {event.end}</p>
                              </div>
                              {reminderButton(event)}
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
            </article>

            <article className="hidden overflow-auto rounded-2xl border border-zinc-200 bg-white md:block">
              <div className="grid min-w-[860px] grid-cols-[76px_repeat(6,minmax(116px,1fr))]">
                <div className="border-b border-r border-zinc-200 bg-zinc-50 px-2 py-3 text-[10px] uppercase tracking-[0.14em] text-zinc-500">Hora</div>
                {days.map((day, index) => (
                  <div key={formatDate(day)} className="border-b border-r border-zinc-200 bg-zinc-50 px-2 py-3">
                    <p className="text-xs font-semibold text-zinc-800">{weekDays[index]}</p>
                    <p className="text-[11px] text-zinc-500">{day.toLocaleDateString("es-MX")}</p>
                  </div>
                ))}
                {timeSlots.map((slot) => (
                  <div key={`row-${slot}`} className="contents">
                    <div className="border-b border-r border-zinc-100 px-2 py-4 text-[11px] text-zinc-600">{slot}</div>
                    {days.map((day) => {
                      const dayKey = formatDate(day);
                      const eventsAtTime = (eventsByDay.get(dayKey) ?? []).filter((event) => event.start.startsWith(slot.slice(0, 2)));
                      const visibleEvents = eventsAtTime.slice(0, 2);
                      const hiddenEvents = eventsAtTime.slice(2);
                      return (
                        <div key={`${slot}-${dayKey}`} className="min-h-[76px] border-b border-r border-zinc-100 p-1.5" onDragOver={(event) => event.preventDefault()} onDrop={() => void dropAppointment(dayKey, slot)}>
                          <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.max(1, visibleEvents.length + (hiddenEvents.length > 0 ? 1 : 0))}, minmax(0, 1fr))` }}>
                            {visibleEvents.map((event) => (
                              <div key={event.id} draggable={event.status !== "completada"} onDragStart={() => { if (event.status !== "completada") setDraggingAppointmentId(event.id); }} className={`group relative w-full overflow-hidden rounded-lg border px-1.5 py-1 text-left text-[9px] leading-tight ${appointmentStatusClass(event.status)}`} title={`${event.customerName} | ${event.service} | ${event.start}-${event.end}`}>
                                {event.status === "completada" ? <span className="absolute left-1 top-1 rounded-md bg-black px-1.5 py-0.5 text-[10px] font-semibold text-white">Completada</span> : null}
                                <button type="button" onClick={() => openAppointment(event)} className={`block w-full pb-6 text-left ${event.status === "completada" ? "pt-4" : ""}`}>
                                  <p className="truncate font-semibold">{event.customerName}</p>
                                  <p className="truncate">{event.service}{event.serviceSubtype ? ` - ${event.serviceSubtype}` : ""}</p>
                                  <p className="truncate">{event.start} - {event.end}</p>
                                </button>
                                <span className="absolute bottom-1 right-1">{reminderButton(event, true)}</span>
                              </div>
                            ))}
                            {hiddenEvents.length > 0 ? (
                              <div className="group relative">
                                <div className="flex h-full min-h-[56px] items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-1 text-[11px] text-zinc-600">
                                  +{hiddenEvents.length} más
                                </div>
                                <div className="absolute left-0 top-full z-20 mt-1 hidden w-64 rounded-xl border border-zinc-200 bg-white p-2 text-xs text-zinc-700 shadow-xl group-hover:block">
                                  <p className="mb-1 text-[11px] font-semibold text-zinc-500">Citas en este horario</p>
                                  <div className="space-y-1">
                                    {hiddenEvents.map((event) => (
                                      <div key={`hidden-${event.id}`} onClick={() => openAppointment(event)} className="cursor-pointer rounded-md border border-zinc-100 bg-zinc-50 px-2 py-1">
                                        <div className="flex items-start justify-between gap-2"><p className="font-semibold">{event.customerName}</p>{reminderButton(event, true)}</div>
                                        <p>{event.service}{event.serviceSubtype ? ` - ${event.serviceSubtype}` : ""}</p>
                                        <p>{event.start} - {event.end} | {event.status}</p>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </article>
          </>
        ) : (
          <article className="rounded-2xl border border-zinc-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-sm text-zinc-600">Seleccionadas: {selectedIds.length}</p>
              <button onClick={() => void deleteByIds(selectedIds)} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" />Eliminar seleccionadas</button>
            </div>
            <div className="space-y-2 md:hidden">
              {sortedAppointments.map((appointment) => (
                <article key={`table-mobile-${appointment.id}`} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs">
                  <div className="flex items-start gap-2">
                    <input className="mt-1" type="checkbox" checked={selectedIds.includes(appointment.id)} onChange={() => toggleSelected(appointment.id)} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate font-semibold text-zinc-900">{appointment.customerName}</p><p className="truncate text-zinc-600">{appointment.service}</p></div><span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] ${appointmentStatusClass(appointment.status)}`}>{appointment.status}</span></div>
                      <p className="mt-2 text-zinc-500">{appointment.date} | {appointment.start} - {appointment.end}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">{reminderButton(appointment)}<button onClick={() => openAppointment(appointment)} className="rounded-lg border border-zinc-200 px-2 py-1 text-[11px] text-zinc-700">Editar</button><button onClick={() => void deleteByIds([appointment.id])} className="rounded-lg border border-rose-200 px-2 py-1 text-[11px] text-rose-600">Eliminar</button></div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-[900px] w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-[0.12em] text-zinc-500">
                    <th className="px-2 py-2"><input type="checkbox" checked={selectedIds.length > 0 && selectedIds.length === sortedAppointments.length} onChange={(event) => setSelectedIds(event.target.checked ? sortedAppointments.map((item) => item.id) : [])} /></th>
                    <th className="px-2 py-2">Cliente</th><th className="px-2 py-2">Servicio</th><th className="px-2 py-2">Fecha</th><th className="px-2 py-2">Horario</th><th className="px-2 py-2">Estado</th><th className="px-2 py-2">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedAppointments.map((appointment) => (
                    <tr key={appointment.id} className="border-b border-zinc-100">
                      <td className="px-2 py-2"><input type="checkbox" checked={selectedIds.includes(appointment.id)} onChange={() => toggleSelected(appointment.id)} /></td>
                      <td className="px-2 py-2">{appointment.customerName}</td>
                      <td className="px-2 py-2">{appointment.service}</td>
                      <td className="px-2 py-2">{appointment.date}</td>
                      <td className="px-2 py-2">{appointment.start} - {appointment.end}</td>
                      <td className="px-2 py-2"><span className={`rounded-full border px-2 py-1 text-xs ${appointmentStatusClass(appointment.status)}`}>{appointment.status}</span></td>
                       <td className="px-2 py-2"><div className="flex items-center gap-2">{reminderButton(appointment)}<button onClick={() => openAppointment(appointment)} className="rounded-lg border border-zinc-200 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50">Editar</button><button onClick={() => void deleteByIds([appointment.id])} className="rounded-lg border border-rose-200 px-2 py-1 text-xs text-rose-600 hover:bg-rose-50">Eliminar</button></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        )}
      </section>

      {isFormOpen ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/30 p-3 backdrop-blur-sm md:p-6">
          {isSendingAppointment ? <AppointmentLoading title="Procesando cita" message={sendingMessage} mode={newAppointment.sendVia === "email" ? "mail" : "calendar"} /> : null}
          <div className="mx-auto max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-4 shadow-2xl sm:rounded-3xl sm:p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-semibold text-zinc-900 sm:text-2xl">Nueva cita</h3>
                <p className="text-xs text-zinc-500 sm:text-sm">Busca una orden POS con anticipo o pago completo para agendar.</p>
              </div>
              <button onClick={() => void cancelForm()} disabled={isSendingAppointment} className="rounded-full p-2 text-zinc-500 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"><X className="h-5 w-5" /></button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs uppercase tracking-[0.12em] text-zinc-500">Buscar orden</label>
                <div className="flex gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-zinc-200 px-3 py-2">
                    <Search className="h-4 w-4 text-zinc-400" />
                    <input value={orderSearch} onChange={(e) => setOrderSearch(e.target.value)} placeholder="Nombre, teléfono, correo o folio POS" className="w-full text-sm outline-none" />
                  </div>
                  <Button variant="secondary" onClick={() => void searchPaidOrders()} disabled={isSearchingOrders}>{isSearchingOrders ? "Buscando..." : "Buscar"}</Button>
                </div>
              </div>
              {orderResults.length > 0 ? (
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs uppercase tracking-[0.12em] text-zinc-500">Órdenes disponibles</label>
                  <div className="grid max-h-48 gap-2 overflow-y-auto rounded-2xl border border-zinc-200 p-2">
                    {orderResults.map((order) => (
                      <button key={order.id} type="button" onClick={() => setSelectedOrder(order)} className={`rounded-xl border px-3 py-2 text-left text-xs ${selectedOrder?.id === order.id ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-zinc-200 bg-zinc-50 text-zinc-700"}`}>
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-semibold">{order.folio} · {order.customerName ?? "Cliente"}</span>
                          <span>{orderPaymentLabel(order)}</span>
                        </div>
                        <p className="mt-1 truncate">{order.items.map((item) => item.serviceName).join(", ") || "Servicio"}</p>
                        <p className="mt-1 text-zinc-500">Orden {formatCurrencyMXN(order.total)} · Cobrado {formatCurrencyMXN(orderPaidAmount(order))} · Debe {formatCurrencyMXN(orderBalance(order))}</p>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {selectedOrder ? (
                <div className="md:col-span-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                  <p className="font-semibold">Orden seleccionada: {selectedOrder.folio}</p>
                  <p>{selectedOrder.customerName ?? "Cliente"} · {selectedOrder.items.map((item) => item.serviceName).join(", ") || "Servicio"}</p>
                  <p>Total {formatCurrencyMXN(selectedOrder.total)} · Cobrado {formatCurrencyMXN(orderPaidAmount(selectedOrder))} · Debe {formatCurrencyMXN(orderBalance(selectedOrder))} · {orderPaymentLabel(selectedOrder)}</p>
                </div>
              ) : null}
              <div><label className="mb-1 block text-xs uppercase tracking-[0.12em] text-zinc-500">Fecha</label><Input type="date" value={newAppointment.date} onChange={(e) => setNewAppointment({ ...newAppointment, date: e.target.value })} /></div>
              <div><label className="mb-1 block text-xs uppercase tracking-[0.12em] text-zinc-500">Enviar confirmación por</label><Select value={newAppointment.sendVia} onChange={(e) => setNewAppointment({ ...newAppointment, sendVia: e.target.value as "whatsapp" | "email" })}><option value="email" disabled={!selectedOrderCustomer?.email && !selectedOrder?.customerEmail}>Correo electrónico{selectedOrderCustomer?.email || selectedOrder?.customerEmail ? "" : " (no disponible)"}</option><option value="whatsapp" disabled={!selectedOrderCustomer?.whatsapp && !selectedOrderCustomer?.phone && !selectedOrder?.customerWhatsapp && !selectedOrder?.customerPhone}>WhatsApp{selectedOrderCustomer?.whatsapp || selectedOrderCustomer?.phone || selectedOrder?.customerWhatsapp || selectedOrder?.customerPhone ? "" : " (no disponible)"}</option></Select></div>
              <div><label className="mb-1 block text-xs uppercase tracking-[0.12em] text-zinc-500">Hora de inicio</label><Input type="time" value={newAppointment.start} onChange={(e) => setNewAppointment({ ...newAppointment, start: e.target.value })} /></div>
              <div><label className="mb-1 block text-xs uppercase tracking-[0.12em] text-zinc-500">Hora de fin</label><Input type="time" value={newAppointment.end} onChange={(e) => setNewAppointment({ ...newAppointment, end: e.target.value })} /></div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2 sm:flex sm:justify-end"><Button variant="secondary" onClick={() => void cancelForm()} disabled={isSendingAppointment}>Cancelar</Button><Button onClick={() => void handleCreateAppointment()} disabled={isSendingAppointment || !selectedOrder}><Send className="h-4 w-4" /> {isSendingAppointment ? "Procesando..." : "Crear cita y enviar"}</Button></div>
          </div>
        </div>
      ) : null}

      {selectedAppointment ? (
        <div style={{display:"grid", placeItems:"center"}} className="fixed inset-0 z-40 bg-black/30 p-3 backdrop-blur-sm md:p-6">
          <div className="mx-auto max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-4 shadow-2xl sm:rounded-3xl sm:p-5">
            <h3 className="text-lg font-semibold text-zinc-900 sm:text-xl">Gestionar cita</h3>
            <p className="mt-2 text-xs text-zinc-600 sm:text-sm">{selectedAppointment.customerName} - {selectedAppointment.service}{selectedAppointment.serviceSubtype ? ` - ${selectedAppointment.serviceSubtype}` : ""}</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className="mb-1 block text-[11px] uppercase tracking-[0.1em] text-zinc-500">Fecha</label><Input type="date" value={editableDate} onChange={(event) => setEditableDate(event.target.value)} disabled={selectedAppointment.status === "completada"} /></div>
              <div><label className="mb-1 block text-[11px] uppercase tracking-[0.1em] text-zinc-500">Inicio</label><Input type="time" value={editableStart} onChange={(event) => setEditableStart(event.target.value)} disabled={selectedAppointment.status === "completada"} /></div>
              <div><label className="mb-1 block text-[11px] uppercase tracking-[0.1em] text-zinc-500">Fin</label><Input type="time" value={editableEnd} onChange={(event) => setEditableEnd(event.target.value)} disabled={selectedAppointment.status === "completada"} /></div>
              <div><label className="mb-1 block text-[11px] uppercase tracking-[0.1em] text-zinc-500">Costo</label><Input type="number" min={0} value={editableCost} onChange={(event) => setEditableCost(Number(event.target.value || 0))} disabled={selectedAppointment.status === "completada"} /></div>
              <div><label className="mb-1 block text-[11px] uppercase tracking-[0.1em] text-zinc-500">Cambiar estado</label><Select value={editableStatus} onChange={(e) => setEditableStatus(e.target.value as Appointment["status"])} disabled={selectedAppointment.status === "completada"}><option value="creada">Creada</option><option value="enviada">Enviada</option><option value="aceptada">Aceptada</option><option value="rechazada">Rechazada</option><option value="reagendada">Reagendada</option><option value="completada">Completada</option></Select></div>
              <div className="col-span-2"><label className="mb-1 block text-[11px] uppercase tracking-[0.1em] text-zinc-500">Anticipo</label><Select value={editableAdvancePaymentStatus} onChange={(e) => setEditableAdvancePaymentStatus(e.target.value as NonNullable<Appointment["advancePaymentStatus"]>)} disabled={selectedAppointment.status === "completada"}><option value="pendiente">Pendiente de pago</option><option value="pagado">Pagado</option></Select></div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-1 text-xs ${selectedAppointment.advancePaymentStatus === "pagado" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>Anticipo {selectedAppointment.advancePaymentStatus === "pagado" ? "pagado" : "pendiente"}</span>
              {reminderButton(selectedAppointment)}
              <button onClick={() => void sendConfirmationRequest(selectedAppointment)} disabled={selectedAppointment.status === "completada"} className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"><Send className="h-3.5 w-3.5" /> Enviar confirmación</button>
              {selectedAppointment.confirmationToken ? <button onClick={() => void navigator.clipboard.writeText(buildConfirmationLink(selectedAppointment.confirmationToken!))} className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50"><Link2 className="h-3.5 w-3.5" /> Copiar link</button> : null}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Button className="order-3 col-span-2 sm:order-1 sm:col-span-1" variant="secondary" onClick={() => void closeAppointmentManager()}>Cerrar</Button>
              <button onClick={() => void rejectSelectedAppointment()} disabled={selectedAppointment.status === "completada"} className="order-1 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600 disabled:opacity-50 sm:order-2">Rechazar cita</button>
              <button onClick={() => void saveSelectedAppointment()} disabled={selectedAppointment.status === "completada"} className="order-2 rounded-xl bg-zinc-900 px-3 py-2 text-xs text-white disabled:opacity-50 sm:order-3">Guardar cambios</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
