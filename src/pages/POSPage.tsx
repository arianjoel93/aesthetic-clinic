import { Banknote, CircleDollarSign, Download, Lock, Mail, Printer, ReceiptText, Search, Trash2, UnlockKeyhole, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Swal, { type SweetAlertOptions } from "sweetalert2";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { requireSupabaseSession } from "../lib/cloud";
import { applyPosPaymentMetaToSales, savePosPaymentMeta } from "../lib/posPaymentMetaApi";
import { listServices } from "../lib/servicesApi";
import { useCrmStore } from "../store/crmStore";
import type { CashSession, PosSale, PosSaleItem, Service } from "../types/crm";
import { isValidPin, sha256 } from "../utils/security";
import { showActionCancelled, showActionSuccess } from "../utils/appAlert";
import { getDemoLimitNotice } from "../utils/demoAccess";
import { sendCashReportEmail as sendConfiguredCashReportEmail } from "../utils/appointmentEmail";

type PosCustomerOption = { id: string; name: string; email?: string; phone?: string; whatsapp?: string };
type CashReport = { session: CashSession; sales: PosSale[]; closedAt: string; soldTotal: number; expectedTotal: number };

const money = (value: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(value || 0);
const dateKey = (value: string) => new Date(value).toISOString().slice(0, 10);
const dateTime = (value: string) => new Date(value).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
const salePaidAmount = (sale: Pick<PosSale, "paidAmount" | "total">) => Number(sale.paidAmount ?? sale.total);
const saleBalance = (sale: Pick<PosSale, "paidAmount" | "total">) => Math.max(0, Number(sale.total || 0) - salePaidAmount(sale));
const isAdvancePaidSale = (sale: Pick<PosSale, "paymentStatus" | "paidAmount" | "total">) =>
  (sale.paymentStatus === "anticipo" || sale.paymentStatus === "anticipo_pagado") && saleBalance(sale) > 0;
const salePaymentLabel = (sale: Pick<PosSale, "paymentStatus" | "paidAmount" | "total">) =>
  isAdvancePaidSale(sale) ? "Anticipo pagado" : "Pagado completo";
function firePosAlert(options: SweetAlertOptions) {
  return Swal.fire({
    ...options,
    buttonsStyling: false,
    customClass: {
      popup: "crm-swal-popup",
      title: "crm-swal-title",
      htmlContainer: "crm-swal-content",
      confirmButton: "crm-swal-btn crm-swal-btn-confirm",
      denyButton: "crm-swal-btn crm-swal-btn-save",
      cancelButton: "crm-swal-btn crm-swal-btn-cancel",
      actions: "crm-swal-actions",
    },
  });
}

function mapCash(row: Record<string, unknown>): CashSession {
  return {
    id: String(row.id),
    openedAt: String(row.opened_at),
    closedAt: row.closed_at ? String(row.closed_at) : undefined,
    userName: String(row.user_name ?? "Administrador"),
    openingAmount: Number(row.opening_amount ?? 0),
    status: row.status === "cerrada" ? "cerrada" : "abierta",
    posLocked: Boolean(row.pos_locked),
  };
}

function mapSale(row: Record<string, unknown>, items: PosSaleItem[] = []): PosSale {
  const total = Number(row.total ?? 0);
  const advanceAmount = Number(row.advance_amount ?? 500);
  const paymentStatus = String(row.payment_status ?? "pagado") as PosSale["paymentStatus"];
  const paidAmount = paymentStatus === "anticipo" || paymentStatus === "anticipo_pagado"
    ? Number(row.paid_amount ?? advanceAmount)
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
    paymentStatus,
    paymentMethod: String(row.payment_method ?? "efectivo") as PosSale["paymentMethod"],
    appointmentId: row.appointment_id ? String(row.appointment_id) : undefined,
    items,
  };
}

function mapItem(row: Record<string, unknown>): PosSaleItem {
  return {
    id: String(row.id),
    serviceId: row.service_id ? String(row.service_id) : undefined,
    treatmentId: row.treatment_id ? String(row.treatment_id) : undefined,
    serviceName: String(row.service_name),
    quantity: Number(row.quantity ?? 1),
    unitPrice: Number(row.unit_price ?? 0),
    total: Number(row.total ?? 0),
  };
}

function buildReportCsv(companyName: string, report: CashReport) {
  const rows = [
    ["Reporte de caja"],
    ["Negocio", companyName],
    ["Apertura", dateTime(report.session.openedAt)],
    ["Cierre", dateTime(report.closedAt)],
    ["Cajero", report.session.userName],
    ["Monto inicial", report.session.openingAmount.toFixed(2)],
    ["Total cobrado", report.soldTotal.toFixed(2)],
    ["Número total de ventas", String(report.sales.length)],
    ["Total esperado", report.expectedTotal.toFixed(2)],
    [],
    ["Folio", "Fecha", "Cliente", "Servicios", "Total orden", "Cobrado", "Pago"],
    ...report.sales.map((sale) => [sale.folio, dateTime(sale.createdAt), sale.customerName ?? "Venta general", sale.items.map((item) => `${item.quantity} x ${item.serviceName}`).join(" | ") || "Sin detalle", sale.total.toFixed(2), salePaidAmount(sale).toFixed(2), salePaymentLabel(sale)]),
    [],
    ["Total general", report.soldTotal.toFixed(2)],
  ];
  return rows.map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
}

export function POSPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const companyName = useCrmStore((state) => state.companyName);
  const session = useCrmStore((state) => state.session);

  const [customers, setCustomers] = useState<PosCustomerOption[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [openSession, setOpenSession] = useState<CashSession | null>(null);
  const [sales, setSales] = useState<PosSale[]>([]);
  const [historySales, setHistorySales] = useState<PosSale[]>([]);
  const [openingAmount, setOpeningAmount] = useState("0");
  const [customerId, setCustomerId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [serviceSearch, setServiceSearch] = useState("");
  const [unitPrice, setUnitPrice] = useState("0");
  const [quantity, setQuantity] = useState("1");
  const [saleNote, setSaleNote] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<NonNullable<PosSale["paymentStatus"]>>("anticipo");
  const [advanceAmount, setAdvanceAmount] = useState("500");
  const [items, setItems] = useState<PosSaleItem[]>([]);
  const [message, setMessage] = useState("");
  const [lastSale, setLastSale] = useState<PosSale | null>(null);
  const [closedSummary, setClosedSummary] = useState<CashReport | null>(null);
  const [isSaleModalOpen, setIsSaleModalOpen] = useState(false);
  const [isCashModalOpen, setIsCashModalOpen] = useState(false);
  const [isClosingCash, setIsClosingCash] = useState(false);
  const [isSendingReport, setIsSendingReport] = useState(false);
  const [filterDate, setFilterDate] = useState("");
  const [filterCustomer, setFilterCustomer] = useState("");
  const [filterMin, setFilterMin] = useState("");
  const [filterMax, setFilterMax] = useState("");
  const soldTotal = sales.reduce((sum, sale) => sum + salePaidAmount(sale), 0);
  const expectedTotal = (openSession?.openingAmount ?? 0) + soldTotal;
  const subtotal = items.reduce((sum, item) => sum + item.total, 0);
  const currentPaidAmount = paymentStatus === "pagado" ? subtotal : Number(advanceAmount || 0);
  const currentBalance = Math.max(0, subtotal - currentPaidAmount);
  const selectedCustomer = customers.find((customer) => customer.id === customerId);
  const selectedService = services.find((service) => service.id === serviceId);
  const isLocked = Boolean(openSession?.posLocked);

  const filteredServices = useMemo(
    () => services.filter((service) => `${service.name} ${service.category ?? ""}`.toLowerCase().includes(serviceSearch.toLowerCase())),
    [serviceSearch, services],
  );

  const filteredHistory = useMemo(
    () =>
      historySales.filter((sale) => {
        const byDate = !filterDate || dateKey(sale.createdAt) === filterDate;
        const byCustomer = !filterCustomer || sale.customerId === filterCustomer;
        const byMin = !filterMin || sale.total >= Number(filterMin);
        const byMax = !filterMax || sale.total <= Number(filterMax);
        return byDate && byCustomer && byMin && byMax;
      }),
    [historySales, filterDate, filterCustomer, filterMin, filterMax],
  );

  const resetSaleForm = (nextServices = services) => {
    const firstService = nextServices[0];
    setCustomerId("");
    setServiceSearch("");
    setServiceId(firstService?.id ?? "");
    setUnitPrice(String(firstService?.price ?? 0));
    setQuantity("1");
    setSaleNote("");
    setPaymentStatus("anticipo");
    setAdvanceAmount("500");
    setItems([]);
  };

  const getPinHash = async () => {
    const supabase = await requireSupabaseSession();
    const { data, error } = await supabase.from("app_settings").select("value").eq("key", "pos_pin_hash").maybeSingle();
    if (error) throw error;
    return data?.value ? String(data.value) : "";
  };

  const verifyPin = async (title: string) => {
    let configuredHash = "";
    try {
      configuredHash = await getPinHash();
    } catch {
      await firePosAlert({
        icon: "error",
        title: "No se pudo validar el PIN",
        text: "Revisa tu conexión e inicia sesión nuevamente antes de operar la caja.",
        confirmButtonText: "Cerrar",
      });
      return false;
    }
    if (!configuredHash) {
      await firePosAlert({
        icon: "warning",
        title: "PIN del POS pendiente",
        text: "Configura el PIN del punto de venta desde Configuraciones antes de operar la caja.",
        confirmButtonText: "Entendido",
      });
      return false;
    }
    const result = await firePosAlert({
      title,
      input: "password",
      inputValue: "",
      inputLabel: "PIN de 4 dígitos",
      inputAttributes: { maxlength: "4", inputmode: "numeric", autocomplete: "off" },
      showCancelButton: true,
      confirmButtonText: "Validar",
      cancelButtonText: "Cancelar",
      inputValidator: (value) => (isValidPin(value) ? null : "El PIN debe tener exactamente 4 dígitos."),
      didOpen: () => {
        const input = Swal.getInput();
        if (input) {
          input.value = "";
          input.focus();
        }
      },
    });
    if (!result.isConfirmed) return false;
    const isValid = (await sha256(String(result.value))) === configuredHash;
    if (!isValid) {
      await firePosAlert({
        icon: "error",
        title: "PIN incorrecto",
        text: "El PIN ingresado no coincide con el configurado para el punto de venta.",
        confirmButtonText: "Intentar nuevamente",
      });
    }
    return isValid;
  };

  const loadSalesWithItems = async (rows: Record<string, unknown>[]) => {
    if (rows.length === 0) return [];
    const supabase = await requireSupabaseSession();
    const saleIds = rows.map((row) => String(row.id));
    const { data: itemRows, error } = await supabase.from("pos_sale_items").select("*").in("sale_id", saleIds);
    if (error) throw error;
    const itemsBySale = new Map<string, PosSaleItem[]>();
    (itemRows ?? []).forEach((row) => {
      const saleId = String(row.sale_id);
      itemsBySale.set(saleId, [...(itemsBySale.get(saleId) ?? []), mapItem(row as Record<string, unknown>)]);
    });
    return rows.map((row) => mapSale(row, itemsBySale.get(String(row.id)) ?? []));
  };

  const loadFromSupabase = async () => {
    const supabase = await requireSupabaseSession();

    const [customerResult, loadedServices, cashResult, salesResult] = await Promise.all([
      supabase.from("customers").select("id, full_name, email, phone, whatsapp").order("full_name", { ascending: true }),
      listServices({ activeOnly: true }),
      supabase.from("cash_sessions").select("*").eq("status", "abierta").order("opened_at", { ascending: false }).limit(1),
      supabase.from("pos_sales").select("*").order("created_at", { ascending: false }).limit(100),
    ]);
    const loadError = customerResult.error ?? cashResult.error ?? salesResult.error;
    if (loadError) throw loadError;
    const customerRows = customerResult.data;
    const cashRows = cashResult.data;
    const saleRows = salesResult.data;

    const nextCustomers = (customerRows ?? []).map((row) => ({
      id: String(row.id),
      name: String(row.full_name),
      email: row.email ? String(row.email) : undefined,
      phone: row.phone ? String(row.phone) : undefined,
      whatsapp: row.whatsapp ? String(row.whatsapp) : undefined,
    }));
    const nextServices = loadedServices;
    const nextOpen = cashRows?.[0] ? mapCash(cashRows[0] as Record<string, unknown>) : null;
    const nextHistory = await applyPosPaymentMetaToSales(await loadSalesWithItems((saleRows ?? []) as unknown as Record<string, unknown>[]));

    setCustomers(nextCustomers);
    setServices(nextServices);
    setOpenSession(nextOpen);
    setHistorySales(nextHistory);
    setSales(nextOpen ? nextHistory.filter((sale) => sale.cashSessionId === nextOpen.id) : []);
    resetSaleForm(nextServices);
  };

  useEffect(() => {
    void loadFromSupabase().catch((error) => {
      setMessage(error instanceof Error ? error.message : "No se pudieron cargar los datos del punto de venta.");
    });
  }, []);

  useEffect(() => {
    if (searchParams.get("nuevo") === "1") setIsSaleModalOpen(true);
  }, [searchParams]);

  const closeSaleModal = () => {
    setIsSaleModalOpen(false);
    const next = new URLSearchParams(searchParams);
    next.delete("nuevo");
    setSearchParams(next, { replace: true });
  };

  const cancelSaleModal = async () => {
    closeSaleModal();
    await showActionCancelled("La venta se cerró sin registrar cambios adicionales.");
  };

  const removeSaleItem = async (itemId: string) => {
    setItems((prev) => prev.filter((entry) => entry.id !== itemId));
    await showActionSuccess("Concepto eliminado", "El servicio fue retirado de la venta.");
  };

  const handleServiceChange = (nextServiceId: string) => {
    const service = services.find((item) => item.id === nextServiceId);
    setServiceId(nextServiceId);
    setUnitPrice(String(service?.price ?? 0));
  };
  const handleOpenCash = async () => {
    if (!(await verifyPin("Abrir caja"))) return;
    const amount = Number(openingAmount || 0);
    if (amount < 0 || Number.isNaN(amount)) {
      setMessage("El monto inicial no es válido.");
      return;
    }
    const supabase = await requireSupabaseSession();
    const { data, error } = await supabase.from("cash_sessions").insert({
      user_name: session?.name ?? "Administrador",
      opening_amount: amount,
      status: "abierta",
      pos_locked: false,
    }).select("*").single();
    if (error) {
      setMessage(error.message.includes("duplicate") ? "Ya existe una caja abierta." : error.message);
      return;
    }
    setOpenSession(mapCash(data as Record<string, unknown>));
    setSales([]);
    setClosedSummary(null);
    setMessage("Caja abierta correctamente.");
    await showActionSuccess("Caja abierta", "La sesión de caja quedó activa correctamente.");
  };

  const setLockState = async (locked: boolean) => {
    if (!openSession) return;
    if (!locked && !(await verifyPin("Desbloquear POS"))) return;
    const supabase = await requireSupabaseSession();
    const { data, error } = await supabase.from("cash_sessions").update({ pos_locked: locked }).eq("id", openSession.id).select("*").single();
    if (error || !data) {
      setMessage(error?.message ?? "No se pudo actualizar el estado del POS.");
      return;
    }
    setOpenSession(mapCash(data as Record<string, unknown>));
    setMessage(locked ? "POS bloqueado." : "POS desbloqueado.");
  };

  const addItem = () => {
    if (!openSession) {
      setMessage("Debes abrir una caja antes de registrar ventas.");
      return;
    }
    if (isLocked) {
      setMessage("El POS está bloqueado. Desbloquéalo para vender.");
      return;
    }
    if (!selectedService) {
      setMessage("Selecciona un servicio activo.");
      return;
    }
    const price = Number(unitPrice || 0);
    const qty = Number(quantity || 1);
    if (price <= 0) {
      setMessage("Captura un precio mayor a cero para este servicio.");
      return;
    }
    if (!Number.isInteger(qty) || qty <= 0) {
      setMessage("La cantidad debe ser un número entero mayor a cero.");
      return;
    }
    setItems((prev) => [...prev, {
      id: crypto.randomUUID(),
      serviceId: selectedService.id,
      serviceName: selectedService.name,
      quantity: qty,
      unitPrice: price,
      total: price * qty,
    }]);
    setQuantity("1");
    setMessage("");
  };

  const finishSale = async () => {
    if (!openSession) {
      setMessage("Debes abrir una caja antes de registrar ventas.");
      return;
    }
    if (isLocked) {
      setMessage("El POS está bloqueado. Desbloquéalo para vender.");
      return;
    }
    if (subtotal <= 0 || items.length === 0) {
      setMessage("No se puede registrar una venta con total en cero.");
      return;
    }
    if (!selectedCustomer) {
      setMessage("Selecciona un cliente para que esta orden pueda usarse al agendar la cita.");
      return;
    }
    const paidAmount = currentPaidAmount;
    if (paidAmount <= 0 || paidAmount > subtotal) {
      setMessage("El anticipo debe ser mayor a cero y no puede superar el total de la orden.");
      return;
    }
    const supabase = await requireSupabaseSession();
    const { data: folio } = await supabase.rpc("next_pos_folio");
    const salePayload: Record<string, unknown> = {
      folio: String(folio ?? `POS-${Date.now()}`),
      cash_session_id: openSession.id,
      customer_id: selectedCustomer.id,
      customer_name: selectedCustomer.name,
      user_name: session?.name ?? "Administrador",
      subtotal,
      total: subtotal,
      advance_amount: paymentStatus === "pagado" ? 0 : paidAmount,
      paid_amount: paidAmount,
      payment_status: paymentStatus,
      payment_method: "efectivo",
    };
    let saleResult = await supabase.from("pos_sales").insert(salePayload).select("*").single();
    if (saleResult.error?.code === "PGRST204") {
      const compatiblePayload = { ...salePayload };
      delete compatiblePayload.advance_amount;
      delete compatiblePayload.paid_amount;
      delete compatiblePayload.payment_status;
      saleResult = await supabase.from("pos_sales").insert(compatiblePayload).select("*").single();
    }
    const { data: saleRow, error: saleError } = saleResult;
    if (saleError || !saleRow) {
      const demoLimit = getDemoLimitNotice(saleError);
      const text = demoLimit?.message ?? saleError?.message ?? "No se pudo registrar la venta.";
      setMessage(text);
      if (demoLimit) {
        await firePosAlert({
          icon: "info",
          title: demoLimit.title,
          text: demoLimit.message,
          confirmButtonText: "Entendido",
        });
      } else {
        await firePosAlert({
          icon: "error",
          title: "No se pudo guardar la venta",
          text,
          confirmButtonText: "Cerrar",
        });
      }
      return;
    }
    const saleId = String(saleRow.id);
    const { data: itemRows, error: itemError } = await supabase.from("pos_sale_items").insert(items.map((item) => ({
      sale_id: saleId,
      service_id: item.serviceId,
      treatment_id: item.treatmentId,
      service_name: item.serviceName,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      total: item.total,
    }))).select("*");
    if (itemError) {
      await supabase.from("pos_sales").delete().eq("id", saleId);
      setMessage(itemError.message);
      return;
    }
    const created = {
      ...mapSale(saleRow as Record<string, unknown>, (itemRows ?? []).map((item) => mapItem(item as Record<string, unknown>))),
      advanceAmount: paymentStatus === "pagado" ? 0 : paidAmount,
      paidAmount,
      paymentStatus,
    };
    try {
      await savePosPaymentMeta({
        saleId,
        paymentStatus,
        advanceAmount: paymentStatus === "pagado" ? 0 : paidAmount,
        paidAmount,
        appointmentId: created.appointmentId,
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "La venta se guardó, pero no se pudo guardar la metadata del anticipo.");
      await firePosAlert({
        icon: "warning",
        title: "Venta guardada con advertencia",
        text: error instanceof Error ? error.message : "La venta se guardó, pero no se pudo guardar la metadata del anticipo.",
        confirmButtonText: "Cerrar",
      });
    }
    setSales((prev) => [created, ...prev]);
    setHistorySales((prev) => [created, ...prev]);
    setLastSale(created);
    resetSaleForm();
    closeSaleModal();
    setMessage("Venta registrada correctamente. Puedes iniciar una nueva venta sin recargar la página.");
    await showActionSuccess("Venta registrada", "La venta se guardó correctamente y se abrirá el ticket para impresión.");
    printTicket(created);
  };

  const completeSalePayment = async (sale: PosSale) => {
    if (!openSession) {
      setMessage("Debes abrir una caja antes de completar el pago de una orden.");
      return;
    }
    if (isLocked) {
      setMessage("El POS está bloqueado. Desbloquéalo para completar pagos.");
      return;
    }
    const balance = saleBalance(sale);
    if (balance <= 0) {
      setMessage("Esta orden ya está pagada completa.");
      return;
    }

    const confirmation = await firePosAlert({
      icon: "question",
      title: "Completar pago",
      html: `<div style="text-align:left;font-size:14px;line-height:1.7">
        <p><strong>Orden:</strong> ${sale.folio}</p>
        <p><strong>Cliente:</strong> ${sale.customerName ?? "Venta general"}</p>
        <p><strong>Total orden:</strong> ${money(sale.total)}</p>
        <p><strong>Cobrado:</strong> ${money(salePaidAmount(sale))}</p>
        <p><strong>Saldo pendiente:</strong> ${money(balance)}</p>
      </div>`,
      showCancelButton: true,
      confirmButtonText: "Registrar pago total",
      cancelButtonText: "Cancelar",
    });
    if (!confirmation.isConfirmed) {
      await showActionCancelled("La orden conserva su saldo pendiente.");
      return;
    }

    try {
      const supabase = await requireSupabaseSession();
      const { data, error } = await supabase
        .from("pos_sales")
        .update({ paid_amount: sale.total, payment_status: "pagado" })
        .eq("id", sale.id)
        .select("*")
        .single();
      if (error && error.code !== "PGRST204") throw error;
      const completed = {
        ...mapSale((data ?? sale) as unknown as Record<string, unknown>, sale.items),
        advanceAmount: sale.advanceAmount,
        paidAmount: sale.total,
        paymentStatus: "pagado" as const,
      };
      await savePosPaymentMeta({
        saleId: sale.id,
        paymentStatus: "pagado",
        advanceAmount: Number(sale.advanceAmount ?? 0),
        paidAmount: sale.total,
        appointmentId: sale.appointmentId,
      });
      setSales((prev) => prev.map((item) => (item.id === completed.id ? completed : item)));
      setHistorySales((prev) => prev.map((item) => (item.id === completed.id ? completed : item)));
      setLastSale(completed);
      setMessage("Pago total registrado. La orden quedó completada.");
      await showActionSuccess("Pago completado", "La orden se marcó como pagada completa y se abrirá el ticket para impresión.");
      printTicket(completed);
    } catch (error) {
      const text = error instanceof Error ? error.message : "No se pudo completar el pago de la orden.";
      setMessage(text);
      await firePosAlert({
        icon: "error",
        title: "No se pudo completar el pago",
        text,
        confirmButtonText: "Cerrar",
      });
    }
  };
  const downloadCashReport = (report: CashReport | null = closedSummary) => {
    if (!report) {
      setMessage("No hay un reporte de caja disponible.");
      return;
    }
    const csv = `\uFEFF${buildReportCsv(companyName, report)}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `reporte-caja-${dateKey(report.closedAt)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const sendCashReportByEmail = async (report: CashReport | null = closedSummary) => {
    if (!report) {
      await firePosAlert({
        icon: "info",
        title: "Reporte no disponible",
        text: "Primero debes cerrar una caja para generar y enviar su reporte.",
        confirmButtonText: "Cerrar",
      });
      return;
    }
    const response = await firePosAlert({
      title: "Enviar reporte por correo",
      input: "email",
      inputLabel: "Correo electrónico del destinatario",
      inputPlaceholder: "correo@empresa.com",
      showCancelButton: true,
      confirmButtonText: "Enviar",
      cancelButtonText: "Cancelar",
      inputValidator: (value) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? null : "Captura un correo válido."),
    });
    if (!response.isConfirmed) return;

    setIsSendingReport(true);
    void firePosAlert({
      title: "Enviando reporte",
      text: "Estamos preparando el resumen y el archivo CSV.",
      allowOutsideClick: false,
      allowEscapeKey: false,
      showConfirmButton: false,
      didOpen: () => Swal.showLoading(),
    });
    try {
      const result = await sendConfiguredCashReportEmail({
        to: String(response.value),
        kind: "cash_report",
        companyName,
        reportDate: dateKey(report.closedAt),
        openedAt: dateTime(report.session.openedAt),
        closedAt: dateTime(report.closedAt),
        cashier: report.session.userName,
        openingAmount: report.session.openingAmount,
        soldTotal: report.soldTotal,
        expectedTotal: report.expectedTotal,
        salesCount: report.sales.length,
        csv: buildReportCsv(companyName, report),
      });
      Swal.close();
      if (!result.ok) throw new Error(result.message);
      await firePosAlert({
        icon: "success",
        title: "Reporte enviado",
        text: "El resumen y el archivo CSV se enviaron correctamente.",
        confirmButtonText: "Cerrar",
      });
    } catch (error) {
      Swal.close();
      await firePosAlert({
        icon: "error",
        title: "No se pudo enviar el reporte",
        text: error instanceof Error ? error.message : "Ocurrió un error al enviar el reporte.",
        confirmButtonText: "Cerrar",
      });
    } finally {
      setIsSendingReport(false);
    }
  };

  const showClosedReportModal = async (report: CashReport) => {
    const result = await firePosAlert({
      icon: "success",
      title: "Caja cerrada correctamente",
      html: `<div style="text-align:left;font-size:14px;line-height:1.7">
        <p><strong>Cajero:</strong> ${report.session.userName}</p>
        <p><strong>Apertura:</strong> ${dateTime(report.session.openedAt)}</p>
        <p><strong>Cierre:</strong> ${dateTime(report.closedAt)}</p>
        <p><strong>Ventas:</strong> ${report.sales.length}</p>
        <p><strong>Total cobrado:</strong> ${money(report.soldTotal)}</p>
        <p><strong>Total esperado:</strong> ${money(report.expectedTotal)}</p>
      </div>`,
      showDenyButton: true,
      showCancelButton: true,
      confirmButtonText: "Descargar reporte",
      denyButtonText: "Enviar por correo",
      cancelButtonText: "Cerrar",
    });
    if (result.isConfirmed) downloadCashReport(report);
    if (result.isDenied) await sendCashReportByEmail(report);
  };

  const handleCloseCash = async () => {
    if (!openSession) {
      await firePosAlert({
        icon: "info",
        title: "Caja cerrada",
        text: "No hay una sesión de caja abierta en este momento.",
        confirmButtonText: "Cerrar",
      });
      return;
    }
    if (isClosingCash) return;
    if (!(await verifyPin("Cerrar caja"))) return;
    const closeAt = new Date().toISOString();
    const reportSnapshot: CashReport = { session: { ...openSession, closedAt: closeAt, status: "cerrada", posLocked: false }, sales: [...sales], closedAt: closeAt, soldTotal, expectedTotal };
    const confirm = await firePosAlert({
      title: "Confirmar cierre de caja",
      html: `<div style="text-align:left;font-size:14px;line-height:1.7">
        <p><strong>Monto inicial:</strong> ${money(openSession.openingAmount)}</p>
        <p><strong>Total cobrado:</strong> ${money(soldTotal)}</p>
        <p><strong>Ventas:</strong> ${sales.length}</p>
        <p><strong>Total esperado:</strong> ${money(expectedTotal)}</p>
        <p><strong>Apertura:</strong> ${dateTime(openSession.openedAt)}</p>
        <p><strong>Cierre:</strong> ${dateTime(closeAt)}</p>
      </div>`,
      showCancelButton: true,
      confirmButtonText: "Cerrar caja",
      cancelButtonText: "Cancelar",
    });
    if (!confirm.isConfirmed) {
      await showActionCancelled("La caja permanece abierta.");
      return;
    }

    setIsClosingCash(true);
    try {
      const supabase = await requireSupabaseSession();
      const { data, error } = await supabase
        .from("cash_sessions")
        .update({ status: "cerrada", closed_at: closeAt, pos_locked: false })
        .eq("id", openSession.id)
        .eq("status", "abierta")
        .select("*")
        .maybeSingle();
      if (error) throw error;

      let closedRow = data;
      if (!closedRow) {
        const { data: currentRow, error: currentError } = await supabase
          .from("cash_sessions")
          .select("*")
          .eq("id", openSession.id)
          .maybeSingle();
        if (currentError) throw currentError;
        if (!currentRow || currentRow.status !== "cerrada") {
          throw new Error("La caja no cambió a estado cerrado. Actualiza la página e intenta nuevamente.");
        }
        closedRow = currentRow;
      }

      const closed = mapCash(closedRow as Record<string, unknown>);
      const effectiveCloseAt = closed.closedAt ?? closeAt;
      const finalReport = {
        ...reportSnapshot,
        session: closed,
        closedAt: effectiveCloseAt,
      };
      setClosedSummary(finalReport);
      setOpenSession(null);
      setIsCashModalOpen(false);
      resetSaleForm();
      setMessage("Caja cerrada correctamente.");
      await showActionSuccess("Caja cerrada", "El cierre y sus totales se guardaron correctamente.");
      await showClosedReportModal(finalReport);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "";
      const text = /permission|policy|row-level|jwt|session/i.test(detail)
        ? "Tu sesión no tiene permiso para cerrar la caja. Cierra sesión, vuelve a ingresar e inténtalo nuevamente."
        : detail || "No se pudo cerrar la caja. Revisa tu conexión e intenta nuevamente.";
      setMessage(text);
      await firePosAlert({
        icon: "error",
        title: "No se pudo cerrar la caja",
        text,
        confirmButtonText: "Cerrar",
      });
    } finally {
      setIsClosingCash(false);
    }
  };
  const printTicket = (sale: PosSale) => {
    if (!sale) {
      setMessage("No se encontró la venta para imprimir.");
      return;
    }
    const ticketRows = sale.items.map((item) => `<tr><td>${item.quantity}</td><td>${item.serviceName}</td><td>${money(item.unitPrice)}</td><td>${money(item.total)}</td></tr>`).join("");
    const html = `
      <html><head><title>${sale.folio}</title><style>
        @page { size: 80mm auto; margin: 0; }
        * { box-sizing: border-box; }
        body { margin: 0; padding: 0; color: #111; font-family: Arial, sans-serif; }
        .ticket-print { width: 72mm; max-width: 72mm; margin: 0 auto; padding: 4mm; font-size: 11px; line-height: 1.25; }
        h1 { font-size: 15px; margin: 0 0 2mm; text-align: center; text-transform: uppercase; }
        p { margin: 1mm 0; } .center { text-align: center; } .sep { border-top: 1px dashed #111; margin: 2.5mm 0; }
        table { width: 100%; border-collapse: collapse; } th, td { padding: 1mm 0; vertical-align: top; }
        th { border-bottom: 1px dashed #111; font-size: 10px; text-align: left; } td:nth-child(3), td:nth-child(4), th:nth-child(3), th:nth-child(4) { text-align: right; }
        .total { font-size: 15px; font-weight: 700; text-align: right; margin-top: 2mm; }
        .no-print { margin: 4mm auto; width: 72mm; display: block; }
        @media print { .no-print { display: none !important; } body { margin: 0; padding: 0; } .ticket-print { width: 72mm; max-width: 72mm; padding: 4mm; } }
      </style></head><body>
        <button class="no-print" onclick="window.print()">Imprimir ticket</button>
        <section class="ticket-print">
          <h1>${companyName}</h1>
          <p class="center">Ticket de venta</p><div class="sep"></div>
          <p><strong>Folio:</strong> ${sale.folio}</p>
          <p><strong>Fecha:</strong> ${dateTime(sale.createdAt)}</p>
          <p><strong>Cajero:</strong> ${sale.userName}</p>
          <p><strong>Cliente:</strong> ${sale.customerName ?? "Venta general"}</p>
          <div class="sep"></div>
          <table><thead><tr><th>Cant.</th><th>Servicio</th><th>P.U.</th><th>Total</th></tr></thead><tbody>${ticketRows}</tbody></table>
          <div class="sep"></div>
          <p>Subtotal: ${money(sale.subtotal)}</p>
          <p>Total orden: ${money(sale.total)}</p>
          <p class="total">Cobrado: ${money(salePaidAmount(sale))}</p>
          <p>Pendiente: ${money(saleBalance(sale))}</p>
          <p>Estado: ${salePaymentLabel(sale)}</p>
          <p>Método: ${sale.paymentMethod}</p>
          <div class="sep"></div>
          <p class="center">Gracias por su compra.</p><p class="center">Conserve su ticket.</p>
        </section><script>window.focus(); window.print();</script>
      </body></html>`;
    const popup = window.open("", "_blank", "width=420,height=720");
    if (!popup) return;
    popup.document.write(html);
    popup.document.close();
  };

  const saleFormContent = !openSession ? (
    <Card className="w-full max-w-2xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-zinc-900">Nueva venta</h2>
          <p className="mt-2 text-sm text-zinc-500">Debes abrir una caja antes de registrar ventas.</p>
        </div>
        <button onClick={() => void cancelSaleModal()} className="grid h-9 w-9 place-items-center rounded-full text-zinc-500 hover:bg-zinc-100"><X className="h-5 w-5" /></button>
      </div>
    </Card>
  ) : (
    <Card className={`w-full max-w-5xl ${isLocked ? "opacity-75" : ""}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3"><CircleDollarSign className="h-5 w-5 text-rose-500" /><div><h2 className="text-xl font-semibold text-zinc-900">Nueva venta</h2><p className="text-sm text-zinc-500">Agrega servicios y finaliza la venta.</p></div></div>
        <div className="flex items-center gap-2">{isLocked ? <span className="rounded-full bg-zinc-900 px-3 py-1 text-xs text-white">Bloqueado</span> : null}<button onClick={() => void cancelSaleModal()} className="grid h-9 w-9 place-items-center rounded-full text-zinc-500 hover:bg-zinc-100"><X className="h-5 w-5" /></button></div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div><label className="mb-1 block text-xs uppercase tracking-[0.12em] text-zinc-500">Cliente</label><Select disabled={isLocked} value={customerId} onChange={(event) => setCustomerId(event.target.value)}><option value="">Selecciona cliente</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</Select></div>
        <div><label className="mb-1 block text-xs uppercase tracking-[0.12em] text-zinc-500">Buscar servicio</label><div className="relative"><Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" /><Input disabled={isLocked} value={serviceSearch} onChange={(event) => setServiceSearch(event.target.value)} placeholder="Buscar servicio" className="pl-10" /></div></div>
        <div><label className="mb-1 block text-xs uppercase tracking-[0.12em] text-zinc-500">Servicio</label><Select disabled={isLocked} value={serviceId} onChange={(event) => handleServiceChange(event.target.value)}>{filteredServices.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</Select></div>
        <div><label className="mb-1 block text-xs uppercase tracking-[0.12em] text-zinc-500">Precio</label><Input disabled={isLocked} type="number" min={0} value={unitPrice} onChange={(event) => setUnitPrice(event.target.value)} /></div>
        <div><label className="mb-1 block text-xs uppercase tracking-[0.12em] text-zinc-500">Cantidad</label><Input disabled={isLocked} type="number" min={1} step={1} value={quantity} onChange={(event) => setQuantity(event.target.value)} /></div>
        <div className="flex items-end"><Button disabled={isLocked} className="w-full" variant="secondary" onClick={addItem}>Agregar concepto</Button></div>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <div><label className="mb-1 block text-xs uppercase tracking-[0.12em] text-zinc-500">Pago recibido</label><Select disabled={isLocked} value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value as NonNullable<PosSale["paymentStatus"]>)}><option value="anticipo">Anticipo pagado</option><option value="pagado">Orden pagada completa</option></Select></div>
        <div><label className="mb-1 block text-xs uppercase tracking-[0.12em] text-zinc-500">Anticipo</label><Input disabled={isLocked || paymentStatus === "pagado"} type="number" min={0} value={paymentStatus === "pagado" ? String(subtotal) : advanceAmount} onChange={(event) => setAdvanceAmount(event.target.value)} /></div>
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm"><p className="text-xs uppercase tracking-[0.12em] text-zinc-500">Debe por pagar</p><p className="mt-1 font-semibold text-zinc-900">{money(currentBalance)}</p></div>
      </div>
      <div className="mt-3"><label className="mb-1 block text-xs uppercase tracking-[0.12em] text-zinc-500">Nota temporal</label><Input disabled={isLocked} value={saleNote} onChange={(event) => setSaleNote(event.target.value)} placeholder="Nota interna de esta venta" /></div>
      <div className="mt-4 space-y-2 md:hidden">{items.length === 0 ? <p className="rounded-xl bg-zinc-50 p-3 text-center text-xs text-zinc-500">Agrega al menos un servicio para registrar la venta.</p> : items.map((item) => <article key={`mobile-item-${item.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3"><div className="min-w-0"><p className="truncate text-sm text-zinc-900">{item.serviceName}</p><p className="text-xs text-zinc-500">{item.quantity} × {money(item.unitPrice)} = {money(item.total)}</p></div><button disabled={isLocked} onClick={() => void removeSaleItem(item.id)} className="shrink-0 rounded-lg border border-rose-200 p-2 text-rose-600 disabled:opacity-50"><Trash2 className="h-4 w-4" /></button></article>)}</div>
      {items.length > 0 ? <div className="mt-3 grid gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm md:hidden"><p className="flex justify-between"><span>Total orden</span><strong>{money(subtotal)}</strong></p><p className="flex justify-between"><span>{paymentStatus === "pagado" ? "Pagado ahora" : "Anticipo pagado"}</span><strong>{money(currentPaidAmount)}</strong></p><p className="flex justify-between text-rose-600"><span>Debe por pagar</span><strong>{money(currentBalance)}</strong></p></div> : null}
      <div className="mt-5 hidden overflow-x-auto md:block"><table className="w-full min-w-[620px] text-left text-sm"><thead className="border-b border-zinc-200 text-xs uppercase tracking-[0.12em] text-zinc-500"><tr><th className="py-2">Concepto</th><th>Cantidad</th><th>Precio</th><th>Total</th><th></th></tr></thead><tbody>{items.length === 0 ? <tr><td colSpan={5} className="py-5 text-center text-zinc-500">Agrega al menos un servicio para registrar la venta.</td></tr> : items.map((item) => <tr key={item.id} className="border-b border-zinc-100"><td className="py-3">{item.serviceName}</td><td>{item.quantity}</td><td>{money(item.unitPrice)}</td><td>{money(item.total)}</td><td className="text-right"><button disabled={isLocked} onClick={() => void removeSaleItem(item.id)} className="rounded-lg border border-rose-200 p-2 text-rose-600 hover:bg-rose-50 disabled:opacity-50"><Trash2 className="h-4 w-4" /></button></td></tr>)}</tbody>{items.length > 0 ? <tfoot className="border-t border-zinc-200 text-sm"><tr><td colSpan={3} className="py-3 text-right text-zinc-500">Total orden</td><td className="font-semibold text-zinc-900">{money(subtotal)}</td><td /></tr><tr><td colSpan={3} className="py-2 text-right text-zinc-500">{paymentStatus === "pagado" ? "Pagado ahora" : "Anticipo pagado"}</td><td className="font-semibold text-zinc-900">{money(currentPaidAmount)}</td><td /></tr><tr><td colSpan={3} className="py-2 text-right text-rose-600">Debe por pagar</td><td className="font-semibold text-rose-600">{money(currentBalance)}</td><td /></tr></tfoot> : null}</table></div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm text-zinc-500">Total pagado</p><p className="text-3xl font-semibold text-zinc-900">{money(currentPaidAmount)}</p><p className="mt-1 text-sm text-zinc-500">Debe por pagar: {money(currentBalance)}</p></div><Button onClick={finishSale} disabled={isLocked || items.length === 0 || subtotal <= 0}>Finalizar venta</Button></div>
    </Card>
  );

  const cashPanelContent = !openSession ? (
    <Card className="w-full max-w-2xl">
      <div className="flex items-start justify-between gap-4">
        <div><h2 className="text-2xl font-semibold text-zinc-900">Caja cerrada</h2><p className="mt-2 text-sm text-zinc-500">Abre una caja para comenzar a vender.</p></div>
        <button onClick={() => setIsCashModalOpen(false)} className="grid h-9 w-9 place-items-center rounded-full text-zinc-500 hover:bg-zinc-100"><X className="h-5 w-5" /></button>
      </div>
    </Card>
  ) : (
    <Card className="w-full max-w-2xl p-4">
      <div className="mb-3 flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Banknote className="h-5 w-5 text-rose-500" /><h2 className="text-lg font-semibold text-zinc-900">Caja activa</h2></div><div className="flex items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-xs ${isLocked ? "bg-amber-100 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>{isLocked ? "Bloqueada" : "Operando"}</span><button onClick={() => setIsCashModalOpen(false)} className="grid h-9 w-9 place-items-center rounded-full text-zinc-500 hover:bg-zinc-100"><X className="h-5 w-5" /></button></div></div>
      <div className="grid gap-2 text-sm text-zinc-600">
        <div className="rounded-2xl bg-zinc-50 px-3 py-2"><p className="text-xs uppercase tracking-[0.12em] text-zinc-500">Apertura</p><p className="text-base font-semibold text-zinc-900">{dateTime(openSession.openedAt)}</p></div>
        <div className="grid grid-cols-2 gap-2"><div className="rounded-2xl bg-zinc-50 px-3 py-2"><p className="text-xs uppercase tracking-[0.12em] text-zinc-500">Cajero</p><p className="text-base font-semibold text-zinc-900">{openSession.userName}</p></div><div className="rounded-2xl bg-zinc-50 px-3 py-2"><p className="text-xs uppercase tracking-[0.12em] text-zinc-500">Inicial</p><p className="text-base font-semibold text-zinc-900">{money(openSession.openingAmount)}</p></div></div>
        <div className="grid grid-cols-2 gap-2"><div className="rounded-2xl bg-zinc-50 px-3 py-2"><p className="text-xs uppercase tracking-[0.12em] text-zinc-500">Cobrado</p><p className="text-base font-semibold text-zinc-900">{money(soldTotal)}</p></div><div className="rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2"><p className="text-xs uppercase tracking-[0.12em] text-rose-500">Total esperado</p><p className="text-2xl font-semibold text-zinc-950">{money(expectedTotal)}</p></div></div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2"><Button className="px-3 py-2 text-xs" variant="secondary" onClick={() => void setLockState(!isLocked)}>{isLocked ? <UnlockKeyhole className="h-4 w-4" /> : <Lock className="h-4 w-4" />}{isLocked ? "Desbloquear" : "Hibernar"}</Button><Button className="px-3 py-2 text-xs" variant="danger" disabled={isClosingCash} onClick={() => void handleCloseCash()}>{isClosingCash ? "Cerrando..." : "Cerrar caja"}</Button>{closedSummary ? <Button className="px-3 py-2 text-xs" variant="secondary" onClick={() => downloadCashReport()}><Download className="h-4 w-4" /> Reporte</Button> : null}</div>
      {lastSale ? <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-3"><div className="flex items-center gap-2"><ReceiptText className="h-4 w-4 text-rose-500" /><p className="font-semibold text-zinc-900">Última venta: {lastSale.folio}</p></div><p className="mt-1 text-sm text-zinc-600">Cobrado: {money(salePaidAmount(lastSale))}</p>{saleBalance(lastSale) > 0 ? <p className="mt-1 text-xs text-rose-600">Pendiente: {money(saleBalance(lastSale))}</p> : null}<Button className="mt-2 w-full px-3 py-2 text-xs" variant="secondary" onClick={() => printTicket(lastSale)}><Printer className="h-4 w-4" /> Imprimir ticket</Button></div> : null}
    </Card>
  );

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">Punto de Venta</h1><p className="text-sm text-zinc-500">Caja, ventas sencillas y ticket térmico.</p></div>
        <div className="flex items-center gap-2">
          <div className={`rounded-2xl border px-4 py-3 text-sm ${openSession ? (isLocked ? "border-amber-200 bg-amber-50 text-amber-700" : "border-emerald-200 bg-emerald-50 text-emerald-700") : "border-zinc-200 bg-white text-zinc-600"}`}>
            {openSession ? (isLocked ? "Caja abierta · POS bloqueado" : "Caja abierta") : "Caja cerrada"}
          </div>
          <button onClick={() => setIsCashModalOpen(true)} className="rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm font-semibold text-rose-500 shadow-sm hover:bg-rose-50">Caja</button>
        </div>
      </div>

      {message ? <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">{message}</div> : null}

      {!openSession ? (
        <Card>
          <div className="grid gap-4 lg:grid-cols-[1fr_330px] lg:items-end">
            <div><div className="flex items-center gap-3"><UnlockKeyhole className="h-5 w-5 text-rose-500" /><h2 className="text-xl font-semibold text-zinc-900">Apertura de caja</h2></div><p className="mt-2 text-sm text-zinc-500">Solicita PIN y monto inicial antes de comenzar a vender.</p></div>
            <div className="flex gap-2"><Input type="number" min={0} value={openingAmount} onChange={(event) => setOpeningAmount(event.target.value)} placeholder="Monto inicial" /><button onClick={handleOpenCash} className="min-w-[140px] rounded-2xl bg-rose-500 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-60">Abrir</button></div>
          </div>
        </Card>
      ) : (
        <Card>
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-2xl bg-zinc-50 p-4"><p className="text-xs uppercase tracking-[0.12em] text-zinc-500">Monto inicial</p><p className="mt-2 text-2xl font-semibold text-zinc-900">{money(openSession.openingAmount)}</p></div>
            <div className="rounded-2xl bg-zinc-50 p-4"><p className="text-xs uppercase tracking-[0.12em] text-zinc-500">Total cobrado</p><p className="mt-2 text-2xl font-semibold text-zinc-900">{money(soldTotal)}</p></div>
            <div className="rounded-2xl bg-zinc-50 p-4"><p className="text-xs uppercase tracking-[0.12em] text-zinc-500">Ventas</p><p className="mt-2 text-2xl font-semibold text-zinc-900">{sales.length}</p></div>
            <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4"><p className="text-xs uppercase tracking-[0.12em] text-rose-500">Total esperado</p><p className="mt-2 text-2xl font-semibold text-zinc-950">{money(expectedTotal)}</p></div>
          </div>
          <p className="mt-4 text-sm text-zinc-500">Usa el botón <span className="font-semibold text-rose-500">Nueva venta</span> del encabezado para registrar una venta, o <span className="font-semibold text-rose-500">Caja</span> para ver los detalles de la caja activa.</p>
        </Card>
      )}

      {isSaleModalOpen ? <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-zinc-950/35 p-3 backdrop-blur-sm sm:px-4 sm:py-6">{saleFormContent}</div> : null}
      {isCashModalOpen ? <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-zinc-950/35 p-3 backdrop-blur-sm sm:px-4 sm:py-6">{cashPanelContent}</div> : null}

      {closedSummary ? <Card><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold text-zinc-900">Resumen de cierre</h2><div className="flex gap-2"><Button variant="secondary" onClick={() => downloadCashReport()}><Download className="h-4 w-4" /> Descargar</Button><Button variant="secondary" disabled={isSendingReport} onClick={() => void sendCashReportByEmail()}><Mail className="h-4 w-4" /> {isSendingReport ? "Enviando..." : "Enviar por correo"}</Button></div></div><div className="mt-4 grid gap-3 md:grid-cols-4"><p className="rounded-2xl bg-zinc-50 p-3 text-sm">Monto inicial<br /><span className="text-lg font-semibold">{money(closedSummary.session.openingAmount)}</span></p><p className="rounded-2xl bg-zinc-50 p-3 text-sm">Total cobrado<br /><span className="text-lg font-semibold">{money(closedSummary.soldTotal)}</span></p><p className="rounded-2xl bg-zinc-50 p-3 text-sm">Ventas<br /><span className="text-lg font-semibold">{closedSummary.sales.length}</span></p><p className="rounded-2xl bg-zinc-50 p-3 text-sm">Total esperado<br /><span className="text-lg font-semibold">{money(closedSummary.expectedTotal)}</span></p></div></Card> : null}

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold text-zinc-900">Ventas realizadas</h2><Button variant="secondary" onClick={() => void loadFromSupabase()}>Actualizar</Button></div>
        <div className="grid gap-3 md:grid-cols-4"><Input type="date" value={filterDate} onChange={(event) => setFilterDate(event.target.value)} /><Select value={filterCustomer} onChange={(event) => setFilterCustomer(event.target.value)}><option value="">Todos los clientes</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</Select><Input type="number" placeholder="Monto mínimo" value={filterMin} onChange={(event) => setFilterMin(event.target.value)} /><Input type="number" placeholder="Monto máximo" value={filterMax} onChange={(event) => setFilterMax(event.target.value)} /></div>
        <div className="mt-4 space-y-2 md:hidden">{filteredHistory.length === 0 ? <p className="rounded-xl bg-zinc-50 p-3 text-center text-xs text-zinc-500">No hay ventas para los filtros seleccionados.</p> : filteredHistory.map((sale) => <article key={`mobile-sale-${sale.id}`} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3"><div className="flex items-start justify-between gap-2"><div><p className="text-sm font-semibold text-zinc-900">{sale.folio}</p><p className="text-xs text-zinc-500">{dateTime(sale.createdAt)}</p></div><p className="text-sm font-semibold text-zinc-900">{money(salePaidAmount(sale))}</p></div><p className="mt-2 truncate text-xs text-zinc-600">{sale.customerName ?? "Venta general"} | {sale.items.map((item) => item.serviceName).join(", ") || "Sin detalle"}</p><p className="mt-1 text-xs text-zinc-500">{salePaymentLabel(sale)} · Orden {money(sale.total)}{saleBalance(sale) > 0 ? ` · Debe ${money(saleBalance(sale))}` : ""}</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{saleBalance(sale) > 0 ? <Button className="w-full" onClick={() => void completeSalePayment(sale)}>Completar pago</Button> : null}<Button className="w-full" variant="secondary" onClick={() => printTicket(sale)}><Printer className="h-4 w-4" /> Reimprimir</Button></div></article>)}</div>
        <div className="mt-4 hidden overflow-x-auto md:block"><table className="w-full min-w-[980px] text-left text-xs"><thead className="border-b border-zinc-200 text-xs uppercase tracking-[0.12em] text-zinc-500"><tr><th className="py-2">Folio</th><th>Fecha</th><th>Cliente</th><th>Servicios</th><th>Pago</th><th>Total orden</th><th>Cobrado</th><th>Pendiente</th><th></th></tr></thead><tbody>{filteredHistory.length === 0 ? <tr><td colSpan={9} className="py-5 text-center text-zinc-500">No hay ventas para los filtros seleccionados.</td></tr> : filteredHistory.map((sale) => <tr key={sale.id} className="border-b border-zinc-100"><td className="py-5 font-semibold">{sale.folio}</td><td>{dateTime(sale.createdAt)}</td><td>{sale.customerName ?? "Venta general"}</td><td>{sale.items.map((item) => item.serviceName).join(", ") || "Sin detalle"}</td><td>{salePaymentLabel(sale)}</td><td>{money(sale.total)}</td><td>{money(salePaidAmount(sale))}</td><td className={saleBalance(sale) > 0 ? "font-semibold text-rose-600" : "text-zinc-500"}>{money(saleBalance(sale))}</td><td className="text-right"><div className="flex justify-end gap-2">{saleBalance(sale) > 0 ? <Button onClick={() => void completeSalePayment(sale)}>Completar pago</Button> : null}<Button variant="secondary" onClick={() => printTicket(sale)}><Printer className="h-4 w-4" /> Reimprimir</Button></div></td></tr>)}</tbody></table></div>
      </Card>
    </section>
  );
}
