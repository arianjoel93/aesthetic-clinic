import { CalendarCheck2, CalendarRange, RefreshCcw, Scissors, Store, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { requireSupabaseSession } from "../lib/cloud";
import { applyPosPaymentMetaToSales } from "../lib/posPaymentMetaApi";
import { listDashboardTreatmentCounts, type DashboardTreatmentCount } from "../lib/salesHistoryApi";
import { useCrmStore } from "../store/crmStore";
import type { CashSession, PosSale, PosSaleItem } from "../types/crm";

const weekLabels = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"];
const isRejectedStatus = (status: string) => status === "rechazada" || status === "cancelada";
const money = (value: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(value || 0);
const todayKey = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
};
const dateKey = (value: string) => {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const dateTime = (value: string) => new Date(value).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
const salePaidAmount = (sale: Pick<PosSale, "paidAmount" | "total">) => Number(sale.paidAmount ?? sale.total);
const saleBalance = (sale: Pick<PosSale, "paidAmount" | "total">) => Math.max(0, Number(sale.total || 0) - salePaidAmount(sale));
const salePaymentLabel = (sale: Pick<PosSale, "paymentStatus" | "paidAmount" | "total">) =>
  (sale.paymentStatus === "anticipo" || sale.paymentStatus === "anticipo_pagado") && saleBalance(sale) > 0 ? "Anticipo pagado" : "Pagado completo";
const hasAdvanceBalance = (sale: Pick<PosSale, "paymentStatus" | "paidAmount" | "total">) =>
  (sale.paymentStatus === "anticipo" || sale.paymentStatus === "anticipo_pagado") && salePaidAmount(sale) > 0 && saleBalance(sale) > 0;
const formatLocalDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const currentMonthRange = () => {
  const today = new Date();
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return { from: formatLocalDate(first), to: formatLocalDate(last) };
};

type DatePreset = "today" | "last7" | "last30" | "currentMonth" | "currentQuarter" | "currentSemester" | "all" | "custom";

function rangeForPreset(preset: Exclude<DatePreset, "custom">) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (preset === "all") return { from: "", to: "" };
  if (preset === "today") {
    const value = formatLocalDate(today);
    return { from: value, to: value };
  }
  if (preset === "last7" || preset === "last30") {
    const from = new Date(today);
    from.setDate(today.getDate() - (preset === "last7" ? 6 : 29));
    return { from: formatLocalDate(from), to: formatLocalDate(today) };
  }
  if (preset === "currentMonth") return currentMonthRange();
  if (preset === "currentQuarter") {
    const startMonth = Math.floor(today.getMonth() / 3) * 3;
    return {
      from: formatLocalDate(new Date(today.getFullYear(), startMonth, 1)),
      to: formatLocalDate(new Date(today.getFullYear(), startMonth + 3, 0)),
    };
  }
  const semesterStart = today.getMonth() < 6 ? 0 : 6;
  return {
    from: formatLocalDate(new Date(today.getFullYear(), semesterStart, 1)),
    to: formatLocalDate(new Date(today.getFullYear(), semesterStart + 6, 0)),
  };
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

function mapSaleItem(row: Record<string, unknown>): PosSaleItem {
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

function mapSale(row: Record<string, unknown>): PosSale {
  const rawItems = Array.isArray(row.pos_sale_items)
    ? row.pos_sale_items as Record<string, unknown>[]
    : [];
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
    items: rawItems.map(mapSaleItem),
  };
}

function KpiCard({ title, value, subtitle, negative, onClick }: { title: string; value: string; subtitle: string; negative?: boolean; onClick?: () => void }) {
  const content = (
    <>
      <p className="text-sm text-zinc-500">{title}</p>
      <p className="mt-1 text-2xl font-semibold leading-none text-zinc-900 sm:text-[28px]">{value}</p>
      <p className={`mt-3 text-sm ${negative ? "text-rose-500" : "text-emerald-600"}`}>{subtitle}</p>
    </>
  );
  if (onClick) {
    return <button type="button" onClick={onClick} className="rounded-2xl border border-zinc-200 bg-white px-5 py-4 text-left transition hover:-translate-y-0.5 hover:border-rose-200 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-rose-200">{content}</button>;
  }
  return <article className="rounded-2xl border border-zinc-200 bg-white px-5 py-4">{content}</article>;
}

export function DashboardPage() {
  const appointments = useCrmStore((state) => state.appointments);
  const customers = useCrmStore((state) => state.customers);
  const services = useCrmStore((state) => state.services);

  const initialRange = useMemo(() => rangeForPreset("last7"), []);
  const [datePreset, setDatePreset] = useState<DatePreset>("last7");
  const [dateFrom, setDateFrom] = useState(initialRange.from);
  const [dateTo, setDateTo] = useState(initialRange.to);
  const [service, setService] = useState("Todos");
  const [status, setStatus] = useState("Todos");
  const [posSales, setPosSales] = useState<PosSale[]>([]);
  const [posCashSessions, setPosCashSessions] = useState<CashSession[]>([]);
  const [posDate, setPosDate] = useState("");
  const [posCustomer, setPosCustomer] = useState("");
  const [posCashier, setPosCashier] = useState("");
  const [posCashStatus, setPosCashStatus] = useState("Todos");
  const [posMinTotal, setPosMinTotal] = useState("");
  const [showTodaySales, setShowTodaySales] = useState(false);
  const [treatmentCounts, setTreatmentCounts] = useState<DashboardTreatmentCount[]>([]);
  const serviceFilterOptions = useMemo(
    () => Array.from(new Set(services.filter((item) => item.active).map((item) => item.name.split(" - ")[0].trim()))).sort((a, b) => a.localeCompare(b, "es")),
    [services],
  );

  useEffect(() => {
    let active = true;
    let removeRealtimeChannel = () => undefined;
    const startPosSync = async () => {
      const client = await requireSupabaseSession();
      const loadPosSummary = async () => {
      const [{ data: saleRows }, { data: cashRows }] = await Promise.all([
        client.from("pos_sales").select("*, pos_sale_items(*)").order("created_at", { ascending: false }).limit(250),
        client.from("cash_sessions").select("*").order("opened_at", { ascending: false }).limit(100),
      ]);
      if (!active) return;
      setPosSales(await applyPosPaymentMetaToSales(((saleRows ?? []) as unknown as Record<string, unknown>[]).map(mapSale)));
      setPosCashSessions(((cashRows ?? []) as unknown as Record<string, unknown>[]).map(mapCash));
      };

      await loadPosSummary();
      const channel = client
        .channel("dashboard-pos-sync")
        .on("postgres_changes", { event: "*", schema: "public", table: "pos_sales" }, () => void loadPosSummary())
        .on("postgres_changes", { event: "*", schema: "public", table: "cash_sessions" }, () => void loadPosSummary())
        .subscribe();
      removeRealtimeChannel = () => {
        void client.removeChannel(channel);
      };
    };

    void startPosSync().catch(() => {
      if (!active) return;
      setPosSales([]);
      setPosCashSessions([]);
    });
    return () => {
      active = false;
      removeRealtimeChannel();
    };
  }, []);

  useEffect(() => {
    let active = true;
    let removeRealtimeChannel = () => undefined;

    if (status !== "Todos" && status !== "completada") {
      setTreatmentCounts([]);
      return () => {
        active = false;
      };
    }

    const startTreatmentSync = async () => {
      const loadTreatmentCounts = async () => {
        const counts = await listDashboardTreatmentCounts({
          dateFrom,
          dateTo,
          service: service === "Todos" ? undefined : service,
        });
        if (active) setTreatmentCounts(counts);
      };

      await loadTreatmentCounts();
      const client = await requireSupabaseSession();
      const channel = client
        .channel("dashboard-treatment-sync")
        .on("postgres_changes", { event: "*", schema: "public", table: "customer_service_history" }, () => void loadTreatmentCounts())
        .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, () => void loadTreatmentCounts())
        .on("postgres_changes", { event: "*", schema: "public", table: "pos_sales" }, () => void loadTreatmentCounts())
        .subscribe();
      removeRealtimeChannel = () => {
        void client.removeChannel(channel);
      };
    };

    void startTreatmentSync().catch(() => {
      // Keep the last valid distribution visible if a realtime refresh fails temporarily.
    });

    return () => {
      active = false;
      removeRealtimeChannel();
    };
  }, [dateFrom, dateTo, service, status]);

  const filteredAppointments = useMemo(
    () =>
      appointments.filter((appointment) => {
        const matchesService = service === "Todos" || appointment.service === service;
        const matchesStatus = status === "Todos" || appointment.status === status;
        const matchesDate = (!dateFrom || appointment.date >= dateFrom) && (!dateTo || appointment.date <= dateTo);
        return matchesService && matchesStatus && matchesDate;
      }),
    [appointments, dateFrom, dateTo, service, status],
  );

  const kpis = useMemo(() => {
    const incomeTotal = filteredAppointments.filter((appointment) => appointment.status === "completada").reduce((sum, appointment) => sum + Number(appointment.cost ?? 0), 0);

    const todayStr = todayKey();
    const monthPrefix = todayStr.slice(0, 7);

    const citasHoy = filteredAppointments.filter((appointment) => appointment.date === todayStr && !isRejectedStatus(appointment.status)).length;
    const ingresosMes = filteredAppointments
      .filter((appointment) => appointment.date.startsWith(monthPrefix) && appointment.status === "completada")
      .reduce((sum, appointment) => sum + Number(appointment.cost ?? 0), 0);
    const filteredCustomerIds = new Set(filteredAppointments.map((appointment) => appointment.customerId).filter(Boolean));
    const filteredCustomerNames = new Set(filteredAppointments.map((appointment) => appointment.customerName.toLocaleLowerCase("es")));
    const clientesActivos = customers.filter((customer) => customer.status === "activo" && (
      filteredCustomerIds.has(customer.id) || filteredCustomerNames.has(customer.name.toLocaleLowerCase("es"))
    )).length;
    const canceladas = filteredAppointments.filter((appointment) => isRejectedStatus(appointment.status)).length;

    return { incomeTotal, citasHoy, ingresosMes, clientesActivos, canceladas };
  }, [filteredAppointments, customers]);

  const posSummary = useMemo(() => {
    const today = todayKey();
    const month = today.slice(0, 7);
    const todaySales = posSales.filter((sale) => dateKey(sale.createdAt) === today);
    const monthSales = posSales.filter((sale) => dateKey(sale.createdAt).startsWith(month));
    const activeCash = posCashSessions.find((cashSession) => cashSession.status === "abierta") ?? null;
    const lastSale = posSales[0] ?? null;
    const pendingBalanceSales = posSales.filter(hasAdvanceBalance);
    const pendingBalanceTotal = pendingBalanceSales.reduce((sum, sale) => sum + saleBalance(sale), 0);
    const pendingAdvanceTotal = pendingBalanceSales.reduce((sum, sale) => sum + salePaidAmount(sale), 0);
    const todayTotal = todaySales.reduce((sum, sale) => sum + salePaidAmount(sale), 0);
    const monthTotal = monthSales.reduce((sum, sale) => sum + salePaidAmount(sale), 0);

    return {
      activeCash,
      lastSale,
      todaySales,
      todayTotal,
      monthTotal,
      todayCount: todaySales.length,
      averageTicket: todaySales.length ? todayTotal / todaySales.length : 0,
      pendingBalanceSales,
      pendingBalanceTotal,
      pendingAdvanceTotal,
    };
  }, [posCashSessions, posSales]);

  const cashById = useMemo(() => new Map(posCashSessions.map((cashSession) => [cashSession.id, cashSession])), [posCashSessions]);

  const filteredPosSales = useMemo(
    () =>
      posSales.filter((sale) => {
        const cash = cashById.get(sale.cashSessionId);
        const matchesDate = !posDate || dateKey(sale.createdAt) === posDate;
        const matchesCustomer = !posCustomer || (sale.customerName ?? "Venta general").toLowerCase().includes(posCustomer.toLowerCase());
        const matchesCashier = !posCashier || sale.userName.toLowerCase().includes(posCashier.toLowerCase());
        const matchesCashStatus = posCashStatus === "Todos" || cash?.status === posCashStatus;
        const matchesTotal = !posMinTotal || sale.total >= Number(posMinTotal);
        return matchesDate && matchesCustomer && matchesCashier && matchesCashStatus && matchesTotal;
      }),
    [cashById, posCashier, posCashStatus, posCustomer, posDate, posMinTotal, posSales],
  );

  const upcomingAppointments = useMemo(() => {
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    return appointments
      .filter((appointment) => !isRejectedStatus(appointment.status) && appointment.date >= todayKey)
      .sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`))
      .slice(0, 6);
  }, [appointments]);

  const treatmentsTop = useMemo(
    () => treatmentCounts.map((item) => ({
      name: item.serviceName,
      count: item.count,
      pct: item.total > 0 ? Math.round((item.count / item.total) * 100) : 0,
    })),
    [treatmentCounts],
  );
  const soldServicesCount = treatmentCounts[0]?.total ?? 0;

  const weeklyIncome = useMemo(() => {
    const now = new Date();
    const monday = new Date(now);
    const day = monday.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    monday.setDate(monday.getDate() + diff);
    monday.setHours(0, 0, 0, 0);

    return weekLabels.map((label, index) => {
      const dayDate = new Date(monday);
      dayDate.setDate(monday.getDate() + index);
      const key = `${dayDate.getFullYear()}-${String(dayDate.getMonth() + 1).padStart(2, "0")}-${String(dayDate.getDate()).padStart(2, "0")}`;
      const total = filteredAppointments
        .filter((appointment) => appointment.date === key && appointment.status === "completada")
        .reduce((sum, appointment) => sum + Number(appointment.cost ?? 0), 0);
      return { label, total };
    });
  }, [filteredAppointments]);

  const maxWeekly = Math.max(...weeklyIncome.map((item) => item.total), 1);

  const applyDatePreset = (preset: DatePreset) => {
    setDatePreset(preset);
    if (preset === "custom") return;
    const range = rangeForPreset(preset);
    setDateFrom(range.from);
    setDateTo(range.to);
  };

  const resetFilters = () => {
    applyDatePreset("all");
    setService("Todos");
    setStatus("Todos");
  };

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">Dashboard</h1>
        <p className="text-sm text-zinc-500">Indicadores del negocio</p>
      </div>

      <div className="grid gap-3 xl:grid-cols-[1.55fr_1fr_1fr_auto]">
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2.5">
          <CalendarRange className="h-4 w-4 text-zinc-500" />
          <select value={datePreset} onChange={(event) => applyDatePreset(event.target.value as DatePreset)} className="min-w-[150px] flex-1 text-xs outline-none">
            <option value="today">Hoy</option>
            <option value="last7">Últimos 7 días</option>
            <option value="last30">Últimos 30 días</option>
            <option value="currentMonth">Mes actual</option>
            <option value="currentQuarter">Trimestre actual</option>
            <option value="currentSemester">Semestre actual</option>
            <option value="all">Todo</option>
            <option value="custom">Personalizado</option>
          </select>
          {datePreset === "custom" ? (
            <div className="flex w-full items-center gap-2 border-t border-zinc-100 pt-2">
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="min-w-0 flex-1 text-xs outline-none" aria-label="Fecha inicial" />
              <span className="text-zinc-400">-</span>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="min-w-0 flex-1 text-xs outline-none" aria-label="Fecha final" />
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3">
          <Scissors className="h-4 w-4 text-zinc-500" />
          <select value={service} onChange={(e) => setService(e.target.value)} className="w-full text-sm outline-none">
            <option>Todos</option>
            {serviceFilterOptions.map((item) => <option key={item}>{item}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3">
          <CalendarCheck2 className="h-4 w-4 text-zinc-500" />
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full text-sm outline-none">
            <option>Todos</option>
            <option value="creada">Creada</option>
            <option value="enviada">Enviada</option>
            <option value="aceptada">Aceptada</option>
            <option value="reagendada">Reagendada</option>
            <option value="completada">Completada</option>
            <option value="rechazada">Rechazada</option>
          </select>
        </div>

        <button onClick={resetFilters} className="flex items-center justify-center gap-2 rounded-xl border border-rose-200 px-5 py-3 text-sm text-rose-400 hover:bg-rose-50">
          <RefreshCcw className="h-4 w-4" /> Limpiar filtros
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <KpiCard title="Citas de Hoy" value={`${kpis.citasHoy}`} subtitle="Citas activas para hoy" />
        <KpiCard title="Ingresos del mes" value={money(kpis.ingresosMes)} subtitle="Citas completadas del mes actual" />
        <KpiCard title="Clientes activos" value={`${kpis.clientesActivos}`} subtitle="Clientes con estatus activo" />
        <KpiCard title="Ingresos totales" value={money(kpis.incomeTotal)} subtitle="Según filtros aplicados y citas completadas" />
        <KpiCard title="Citas canceladas" value={`${kpis.canceladas}`} subtitle="Dentro del rango filtrado" negative />
      </div>

      <article className="rounded-2xl border border-zinc-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Store className="h-5 w-5 text-rose-500" />
              <h2 className="text-xl font-semibold text-zinc-800 sm:text-2xl">Punto de Venta</h2>
            </div>
            <p className="mt-1 text-sm text-zinc-500">Ventas, caja activa y resumen rápido del día.</p>
          </div>
          <Link to="/app/pos" className="rounded-xl bg-zinc-900 px-4 py-2.5 w-100 font-semibold text-white hover:bg-zinc-800 w-3 sm:text-sm text-center">Ir al POS</Link>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            title="Ventas de hoy"
            value={money(posSummary.todayTotal)}
            subtitle={`${posSummary.todayCount} ventas registradas · Ver detalle`}
            onClick={() => setShowTodaySales(true)}
          />
          <KpiCard title="Ticket promedio" value={money(posSummary.averageTicket)} subtitle="Promedio de ventas de hoy" />
          <KpiCard title="Ingresos POS del mes" value={money(posSummary.monthTotal)} subtitle="Cobros registrados en POS" />
          <KpiCard
            title="Cuentas por cobrar"
            value={money(posSummary.pendingBalanceTotal)}
            subtitle={`${posSummary.pendingBalanceSales.length} reservas con saldo pendiente`}
            negative={posSummary.pendingBalanceTotal > 0}
          />
          <KpiCard title="Anticipos cobrados" value={money(posSummary.pendingAdvanceTotal)} subtitle="Reservas apartadas con anticipo" />
          <KpiCard
            title="Estado de caja"
            value={posSummary.activeCash ? (posSummary.activeCash.posLocked ? "Bloqueada" : "Abierta") : "Cerrada"}
            subtitle={posSummary.activeCash ? `Abierta por ${posSummary.activeCash.userName}` : "Sin caja activa"}
            negative={Boolean(posSummary.activeCash?.posLocked)}
          />
          <KpiCard
            title="Última venta"
            value={posSummary.lastSale ? money(salePaidAmount(posSummary.lastSale)) : "$0.00"}
            subtitle={posSummary.lastSale ? `${posSummary.lastSale.folio} · ${posSummary.lastSale.customerName ?? "Venta general"}` : "Sin ventas registradas"}
          />
        </div>

        <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-zinc-900">Cuentas por cobrar por anticipo</h3>
              <p className="text-xs text-zinc-500">Clientes que ya reservaron cita y aún deben liquidar su orden.</p>
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-rose-600">{money(posSummary.pendingBalanceTotal)}</span>
          </div>
          {posSummary.pendingBalanceSales.length === 0 ? (
            <p className="rounded-xl bg-white px-3 py-4 text-center text-xs text-zinc-500">No hay reservas con saldo pendiente.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-xs">
                <thead className="border-b border-zinc-200 uppercase tracking-[0.12em] text-zinc-500">
                  <tr><th className="py-2">Folio</th><th>Cliente</th><th>Estado</th><th>Total</th><th>Cobrado</th><th>Debe</th></tr>
                </thead>
                <tbody>
                  {posSummary.pendingBalanceSales.slice(0, 8).map((sale) => (
                    <tr key={`pending-${sale.id}`} className="border-b border-zinc-100">
                      <td className="py-2 font-semibold text-zinc-900">{sale.folio}</td>
                      <td>{sale.customerName ?? "Venta general"}</td>
                      <td>{salePaymentLabel(sale)}</td>
                      <td>{money(sale.total)}</td>
                      <td>{money(salePaidAmount(sale))}</td>
                      <td className="font-semibold text-rose-600">{money(saleBalance(sale))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </article>

      <article className="rounded-2xl border border-zinc-200 bg-white p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-zinc-800 sm:text-2xl">Próximas citas</h2>
          <Link to="/app/agenda" className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50">Ver agenda</Link>
        </div>
        <div className="space-y-2">
          {upcomingAppointments.map((appointment) => (
            <div key={appointment.id} className="rounded-xl border border-zinc-200 px-3 py-2">
              <p className="text-sm text-zinc-800">{appointment.customerName}</p>
              <p className="text-xs text-zinc-600">{appointment.service}</p>
              <p className="mt-1 text-xs text-rose-500">{appointment.date} - {appointment.start} a {appointment.end}</p>
            </div>
          ))}
        </div>
      </article>

      <div className="grid items-stretch gap-3 sm:gap-4 xl:grid-cols-2">
        <article className="h-full rounded-2xl border border-zinc-200 bg-white p-3 sm:p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-xl font-semibold text-zinc-800 sm:text-2xl">Servicios más solicitados</h2>
              <p className="mt-1 text-sm text-zinc-500">Conteo de los servicios registrados en Ventas, tengan o no un precio.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-rose-50 px-3 py-1 text-xs text-rose-600">
                {soldServicesCount.toLocaleString("es-MX")} vendidos
              </span>
              <Link to="/app/ventas" className="rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-600 transition hover:bg-zinc-50">
                Ver ventas
              </Link>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {treatmentsTop.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-200 px-4 py-8 text-center">
                <p className="text-sm text-zinc-600">No hay servicios completados en este periodo.</p>
                <p className="mt-1 text-xs text-zinc-400">Prueba con otro rango de fechas o cambia los filtros.</p>
              </div>
            ) : (
              treatmentsTop.map((item) => (
                <div key={item.name}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate text-zinc-700">{item.name}</span>
                    <span className="shrink-0 text-zinc-600">{item.count} · {item.pct}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-zinc-100">
                    <div className="h-2 rounded-full bg-rose-300" style={{ width: `${item.pct}%` }} />
                  </div>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="flex min-h-[390px] h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white p-3 sm:min-h-[460px] sm:p-4 xl:min-h-0">
          <h2 className="text-lg font-semibold text-zinc-800 sm:text-2xl">Ingresos semanales</h2>
          <div className="mt-4 grid min-h-[280px] flex-1 grid-cols-7 items-stretch gap-1 sm:min-h-[340px] sm:gap-2 xl:min-h-0">
            {weeklyIncome.map((item) => (
              <div key={item.label} className="flex min-w-0 flex-col text-center">
                <div className="mx-auto flex min-h-[240px] w-full max-w-6 flex-1 items-end overflow-hidden rounded-md bg-zinc-100 sm:min-h-[300px] sm:max-w-8 xl:min-h-0" title={`${item.label}: ${money(item.total)}`}>
                  <div className="w-full rounded-t-md bg-rose-300" style={{ height: `${Math.max(8, (item.total / maxWeekly) * 100)}%` }} />
                </div>
                <p className="mt-2 truncate text-[10px] text-zinc-500 sm:text-xs">{item.label}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 border-t border-zinc-100 pt-3 text-xs text-zinc-600 sm:mt-4 sm:text-sm">
            Total semanal: {money(weeklyIncome.reduce((sum, item) => sum + item.total, 0))}
          </div>
        </article>
      </div>

      <article className="rounded-2xl border border-zinc-200 bg-white p-4">
        <div className="mb-4">
          <div>
            <h2 className="text-xl font-semibold text-zinc-800 sm:text-2xl">Ventas POS</h2>
            <p className="text-sm text-zinc-500">Historial con filtros por fecha, cliente, cajero, estado de caja y total.</p>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <input type="date" value={posDate} onChange={(event) => setPosDate(event.target.value)} className="rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none" />
          <input value={posCustomer} onChange={(event) => setPosCustomer(event.target.value)} placeholder="Cliente" className="rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none" />
          <input value={posCashier} onChange={(event) => setPosCashier(event.target.value)} placeholder="Cajero" className="rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none" />
          <select value={posCashStatus} onChange={(event) => setPosCashStatus(event.target.value)} className="rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none">
            <option>Todos</option>
            <option value="abierta">Caja abierta</option>
            <option value="cerrada">Caja cerrada</option>
          </select>
          <input type="number" value={posMinTotal} onChange={(event) => setPosMinTotal(event.target.value)} placeholder="Total mínimo" className="rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none" />
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs uppercase tracking-[0.12em] text-zinc-500">
              <tr>
                <th className="py-2">Folio</th>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Cajero</th>
                <th>Caja</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {filteredPosSales.length === 0 ? (
                <tr><td colSpan={6} className="py-5 text-center text-zinc-500">No hay ventas para los filtros seleccionados.</td></tr>
              ) : (
                filteredPosSales.map((sale) => {
                  const cash = cashById.get(sale.cashSessionId);
                  return (
                    <tr key={sale.id} className="border-b border-zinc-100">
                      <td className="py-3 font-semibold text-zinc-900">{sale.folio}</td>
                      <td>{dateTime(sale.createdAt)}</td>
                      <td>{sale.customerName ?? "Venta general"}</td>
                      <td>{sale.userName}</td>
                      <td>
                        <span className={`rounded-full px-2.5 py-1 text-xs ${cash?.status === "abierta" ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-600"}`}>
                          {cash?.status === "abierta" ? (cash.posLocked ? "Bloqueada" : "Abierta") : "Cerrada"}
                        </span>
                      </td>
                      <td className="font-semibold text-zinc-900">{money(salePaidAmount(sale))}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </article>

      {showTodaySales ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-zinc-950/45 p-3 backdrop-blur-[2px] sm:p-6"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowTodaySales(false);
          }}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="today-sales-title" className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-zinc-100 px-4 py-4 sm:px-6">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-rose-500">Punto de Venta</p>
                <h2 id="today-sales-title" className="mt-1 text-xl font-semibold text-zinc-900 sm:text-2xl">Ventas de hoy</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  {new Date().toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })}
                </p>
              </div>
              <button type="button" onClick={() => setShowTodaySales(false)} aria-label="Cerrar detalle de ventas" className="rounded-full border border-zinc-200 p-2 text-zinc-500 transition hover:bg-zinc-50 hover:text-zinc-900">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 border-b border-zinc-100 bg-zinc-50/70 px-4 py-3 sm:px-6">
              <div>
                <p className="text-xs text-zinc-500">Total vendido</p>
                <p className="mt-1 text-lg font-semibold text-zinc-900">{money(posSummary.todayTotal)}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Ventas registradas</p>
                <p className="mt-1 text-lg font-semibold text-zinc-900">{posSummary.todayCount}</p>
              </div>
            </div>

            <div className="overflow-y-auto px-4 py-4 sm:px-6">
              {posSummary.todaySales.length === 0 ? (
                <div className="rounded-xl border border-dashed border-zinc-200 px-4 py-10 text-center">
                  <Store className="mx-auto h-8 w-8 text-rose-300" />
                  <p className="mt-3 text-sm text-zinc-600">Todavía no hay ventas registradas hoy.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {posSummary.todaySales.map((sale) => (
                    <article key={sale.id} className="rounded-xl border border-zinc-200 p-3 sm:p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-zinc-900">{sale.folio}</p>
                          <p className="mt-0.5 text-xs text-zinc-500">{dateTime(sale.createdAt)}</p>
                        </div>
                        <p className="text-base font-semibold text-zinc-900">{money(salePaidAmount(sale))}</p>
                      </div>
                      <div className="mt-3 grid gap-2 text-xs text-zinc-600 sm:grid-cols-3">
                        <p><span className="text-zinc-400">Cliente:</span> {sale.customerName ?? "Venta general"}</p>
                        <p><span className="text-zinc-400">Cajero:</span> {sale.userName}</p>
                        <p className="capitalize"><span className="text-zinc-400">Pago:</span> {sale.paymentMethod}</p>
                      </div>
                      {sale.items.length > 0 ? (
                        <div className="mt-3 border-t border-zinc-100 pt-3">
                          {sale.items.map((item) => (
                            <div key={item.id} className="flex items-center justify-between gap-3 py-1 text-xs text-zinc-600">
                              <span className="min-w-0 truncate">{item.quantity} × {item.serviceName}</span>
                              <span className="shrink-0">{money(item.total)}</span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end border-t border-zinc-100 px-4 py-3 sm:px-6">
              <button type="button" onClick={() => setShowTodaySales(false)} className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm text-white transition hover:bg-zinc-800">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
