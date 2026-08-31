import { CalendarRange, ChevronLeft, ChevronRight, CircleDollarSign, ReceiptText, Search, WalletCards } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AppointmentLoading } from "../components/ui/AppointmentLoading";
import { MakeupEmptyState } from "../components/ui/MakeupEmptyState";
import { requireSupabaseSession } from "../lib/cloud";
import { listSalesHistoryPage } from "../lib/salesHistoryApi";
import { useCrmStore } from "../store/crmStore";
import type { SalesHistoryRecord } from "../types/crm";
import { fireAppAlert } from "../utils/appAlert";

const pageSize = 50;
const money = (value: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(value);
const dateLabel = (value: string) =>
  value
    ? new Date(`${value}T12:00:00`).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })
    : "Sin fecha";

const paymentLabels: Record<SalesHistoryRecord["paymentStatus"], string> = {
  sin_registro: "Sin registro",
  pendiente: "Pendiente",
  pagado: "Pagado",
};

const sourceLabels: Record<SalesHistoryRecord["sourceType"], string> = {
  importacion: "Historial importado",
  manual: "Registro manual",
  cita: "Cita completada",
  pos: "Punto de Venta",
};

function paymentClasses(status: SalesHistoryRecord["paymentStatus"]) {
  if (status === "pagado") return "bg-emerald-50 text-emerald-700";
  if (status === "pendiente") return "bg-amber-50 text-amber-700";
  return "bg-zinc-100 text-zinc-600";
}

export function SalesPage() {
  const services = useCrmStore((state) => state.services);
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const [debouncedQuery, setDebouncedQuery] = useState(query.trim());
  const [records, setRecords] = useState<SalesHistoryRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [service, setService] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [sourceType, setSourceType] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [reloadVersion, setReloadVersion] = useState(0);
  const pageTopRef = useRef<HTMLDivElement | null>(null);
  const initialPageRender = useRef(true);

  const serviceOptions = useMemo(
    () => Array.from(new Set(services.map((item) => item.name))).sort((a, b) => a.localeCompare(b, "es")),
    [services],
  );
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageStart = total === 0 ? 0 : ((page - 1) * pageSize) + 1;
  const pageEnd = Math.min(page * pageSize, total);
  const visibleAmount = records.reduce((sum, record) => sum + (record.amount ?? 0), 0);
  const pageWithoutAmount = records.filter((record) => record.amount === undefined).length;
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
  }, [dateFrom, dateTo, debouncedQuery, paymentStatus, service, sourceType]);

  useEffect(() => {
    if (initialPageRender.current) {
      initialPageRender.current = false;
      return;
    }
    window.requestAnimationFrame(() => {
      pageTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [page]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void listSalesHistoryPage({
      page,
      pageSize,
      search: debouncedQuery,
      service,
      paymentStatus,
      sourceType,
      dateFrom,
      dateTo,
    })
      .then((result) => {
        if (!active) return;
        const lastPage = Math.max(1, Math.ceil(result.total / pageSize));
        setTotal(result.total);
        if (page > lastPage) {
          setPage(lastPage);
          return;
        }
        setRecords(result.records);
      })
      .catch((error) => {
        if (!active) return;
        setRecords([]);
        setTotal(0);
        void fireAppAlert({
          title: "No se pudieron cargar las ventas",
          text: error instanceof Error ? error.message : "Revisa tu conexión e intenta nuevamente.",
          icon: "error",
          confirmButtonText: "Entendido",
        });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [dateFrom, dateTo, debouncedQuery, page, paymentStatus, reloadVersion, service, sourceType]);

  useEffect(() => {
    let active = true;
    let removeRealtimeChannel = () => undefined;

    const startRealtime = async () => {
      const client = await requireSupabaseSession();
      const refresh = () => {
        if (active) setReloadVersion((value) => value + 1);
      };
      const channel = client
        .channel("sales-history-page-sync")
        .on("postgres_changes", { event: "*", schema: "public", table: "customer_service_history" }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "pos_sales" }, refresh)
        .subscribe();
      removeRealtimeChannel = () => {
        void client.removeChannel(channel);
      };
    };

    void startRealtime().catch(() => undefined);
    return () => {
      active = false;
      removeRealtimeChannel();
    };
  }, []);

  const clearFilters = () => {
    setSearchQuery("");
    setService("");
    setPaymentStatus("");
    setSourceType("");
    setDateFrom("");
    setDateTo("");
  };

  return (
    <section ref={pageTopRef} className="space-y-5 scroll-mt-24">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">Ventas</h1>
          <p className="mt-1 text-sm text-zinc-500">Historial consolidado de servicios realizados, citas completadas y ventas del POS.</p>
        </div>
        <button type="button" onClick={() => setReloadVersion((value) => value + 1)} className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-700 transition hover:bg-zinc-50">
          Actualizar
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-zinc-200 bg-white p-4">
          <ReceiptText className="h-5 w-5 text-rose-500" />
          <p className="mt-3 text-xs text-zinc-500">Servicios contabilizados</p>
          <p className="mt-1 text-2xl font-semibold text-zinc-900">{total.toLocaleString("es-MX")}</p>
        </article>
        <article className="rounded-2xl border border-zinc-200 bg-white p-4">
          <WalletCards className="h-5 w-5 text-rose-500" />
          <p className="mt-3 text-xs text-zinc-500">Registros en esta página</p>
          <p className="mt-1 text-2xl font-semibold text-zinc-900">{records.length}</p>
        </article>
        <article className="rounded-2xl border border-zinc-200 bg-white p-4">
          <CircleDollarSign className="h-5 w-5 text-rose-500" />
          <p className="mt-3 text-xs text-zinc-500">Importe visible</p>
          <p className="mt-1 text-2xl font-semibold text-zinc-900">{money(visibleAmount)}</p>
        </article>
        <article className="rounded-2xl border border-zinc-200 bg-white p-4">
          <CalendarRange className="h-5 w-5 text-rose-500" />
          <p className="mt-3 text-xs text-zinc-500">Sin precio en esta página</p>
          <p className="mt-1 text-2xl font-semibold text-zinc-900">{pageWithoutAmount}</p>
        </article>
      </div>

      <article className="rounded-2xl border border-zinc-200 bg-white p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-zinc-500 md:col-span-2">
            <Search className="h-4 w-4 shrink-0" />
            <input value={query} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Buscar cliente, servicio o folio..." className="w-full bg-transparent text-sm outline-none" />
          </label>
          <select value={service} onChange={(event) => setService(event.target.value)} className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-700 outline-none">
            <option value="">Todos los servicios</option>
            {serviceOptions.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value)} className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-700 outline-none">
            <option value="">Todos los pagos</option>
            <option value="sin_registro">Sin registro</option>
            <option value="pendiente">Pendiente</option>
            <option value="pagado">Pagado</option>
          </select>
          <select value={sourceType} onChange={(event) => setSourceType(event.target.value)} className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-700 outline-none">
            <option value="">Todos los orígenes</option>
            <option value="importacion">Historial importado</option>
            <option value="manual">Registro manual</option>
            <option value="cita">Cita completada</option>
            <option value="pos">Punto de Venta</option>
          </select>
          <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} aria-label="Fecha inicial" className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-700 outline-none" />
          <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} aria-label="Fecha final" className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-700 outline-none" />
          <button type="button" onClick={clearFilters} className="rounded-xl border border-rose-200 px-4 py-2.5 text-sm text-rose-500 transition hover:bg-rose-50">
            Limpiar filtros
          </button>
        </div>
      </article>

      <article className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        {loading ? (
          <div className="grid min-h-[360px] place-items-center p-4">
            <AppointmentLoading title="Cargando ventas" message="Estamos consultando el historial completo en la base de datos." mode="database" overlay={false} />
          </div>
        ) : records.length === 0 ? (
          <MakeupEmptyState title="No encontramos ventas" message="Prueba con otros filtros o revisa el texto de búsqueda." />
        ) : (
          <>
            <div className="space-y-3 p-3 md:hidden">
              {records.map((record) => (
                <article key={record.id} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-zinc-900">{record.customerName}</p>
                      <p className="mt-0.5 text-xs text-zinc-500">{dateLabel(record.saleDate)}</p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold text-zinc-900">{record.amount === undefined ? "Sin precio" : money(record.amount)}</p>
                  </div>
                  <p className="mt-3 text-sm text-zinc-700">{record.serviceName}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                    <span className={`rounded-full px-2.5 py-1 ${paymentClasses(record.paymentStatus)}`}>{paymentLabels[record.paymentStatus]}</span>
                    <span className="rounded-full bg-white px-2.5 py-1 text-zinc-600">{sourceLabels[record.sourceType]}</span>
                  </div>
                </article>
              ))}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[940px] text-left text-sm">
                <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-[0.1em] text-zinc-500">
                  <tr>
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">Servicio</th>
                    <th className="px-4 py-3">Origen</th>
                    <th className="px-4 py-3">Pago</th>
                    <th className="px-4 py-3 text-right">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((record) => (
                    <tr key={record.id} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50/70">
                      <td className="whitespace-nowrap px-4 py-3 text-zinc-600">{dateLabel(record.saleDate)}</td>
                      <td className="max-w-[220px] px-4 py-3">
                        <p className="truncate text-zinc-900">{record.customerName}</p>
                        <p className="truncate text-xs text-zinc-500">{record.customerEmail || record.customerPhone || "Sin contacto"}</p>
                      </td>
                      <td className="max-w-[260px] px-4 py-3 text-zinc-700"><p className="truncate">{record.serviceName}</p></td>
                      <td className="px-4 py-3 text-xs text-zinc-600">{sourceLabels[record.sourceType]}</td>
                      <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs ${paymentClasses(record.paymentStatus)}`}>{paymentLabels[record.paymentStatus]}</span></td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-zinc-900">{record.amount === undefined ? "Sin precio" : money(record.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {!loading && total > 0 ? (
          <div className="flex flex-col gap-3 border-t border-zinc-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-zinc-500">Mostrando {pageStart.toLocaleString("es-MX")}–{pageEnd.toLocaleString("es-MX")} de {total.toLocaleString("es-MX")} ventas</p>
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              <button type="button" disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="grid h-9 w-9 place-items-center rounded-lg border border-zinc-200 text-zinc-600 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Página anterior"><ChevronLeft className="h-4 w-4" /></button>
              {paginationPages.map((pageNumber) => (
                <button key={pageNumber} type="button" onClick={() => setPage(pageNumber)} className={`h-9 min-w-9 rounded-lg px-2 text-sm ${pageNumber === page ? "bg-rose-500 text-white" : "border border-zinc-200 text-zinc-600 hover:bg-zinc-50"}`}>{pageNumber}</button>
              ))}
              <button type="button" disabled={page === totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} className="grid h-9 w-9 place-items-center rounded-lg border border-zinc-200 text-zinc-600 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Página siguiente"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        ) : null}
      </article>
    </section>
  );
}
