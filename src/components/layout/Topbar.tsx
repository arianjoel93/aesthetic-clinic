import { Bell, ChevronDown, Mail, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Menu } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { hasSupabaseConfig, supabase } from "../../lib/supabaseClient";
import { getNotificationDedupKey, useCrmStore } from "../../store/crmStore";
import { saveAppointmentReminderLog } from "../../lib/appointmentReminderApi";
import { sendAppointmentEmail } from "../../utils/appointmentEmail";
import { fireAppAlert, showActionCancelled, showActionSuccess } from "../../utils/appAlert";
import { MakeupEmptyState } from "../ui/MakeupEmptyState";

const routeNewLabels: Record<string, string> = {
  "/app/agenda": "Nueva cita",
  "/app/clientes": "Nuevo cliente",
  "/app/pos": "Nueva venta",
  "/app/servicios": "Nuevo servicio",
  "/app/tratamientos": "Nuevo tratamiento",
  "/app/seguimientos": "Nuevo seguimiento",
  "/app/ventas-cotizaciones": "Nueva cotización",
  "/app/reportes": "Nuevo reporte",
  "/app/usuarios": "Nuevo usuario",
};

interface TopbarProps {
  onOpenSidebar: () => void;
}

export function Topbar({ onOpenSidebar }: TopbarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [openNotifications, setOpenNotifications] = useState(false);
  const [openProfileMenu, setOpenProfileMenu] = useState(false);
  const [openGlobalSearch, setOpenGlobalSearch] = useState(false);
  const [sendingNotificationId, setSendingNotificationId] = useState<string | null>(null);
  const notificationsRef = useRef<HTMLDivElement | null>(null);
  const profileRef = useRef<HTMLDivElement | null>(null);
  const globalSearchRef = useRef<HTMLDivElement | null>(null);

  const notifications = useCrmStore((state) => state.notifications);
  const newNotificationKeys = useCrmStore((state) => state.newNotificationKeys);
  const appointments = useCrmStore((state) => state.appointments);
  const customers = useCrmStore((state) => state.customers);
  const services = useCrmStore((state) => state.services);
  const session = useCrmStore((state) => state.session);
  const deleteNotification = useCrmStore((state) => state.deleteNotification);
  const markAllNotificationsRead = useCrmStore((state) => state.markAllNotificationsRead);
  const acknowledgeNotificationsShown = useCrmStore((state) => state.acknowledgeNotificationsShown);
  const clearNotifications = useCrmStore((state) => state.clearNotifications);

  const currentPath = location.pathname.startsWith("/app/") ? location.pathname : "/app/clientes";
  const globalQuery = new URLSearchParams(location.search).get("q") ?? "";
  const newLabel = routeNewLabels[currentPath] ?? null;
  const pendingCount = notifications.filter((item) => !item.read && newNotificationKeys.includes(getNotificationDedupKey(item))).length;
  const globalSearchResults = useMemo(() => {
    const term = globalQuery.trim().toLocaleLowerCase("es");
    if (!term) return { customers: [], appointments: [], services: [] };
    return {
      customers: customers.filter((customer) => [
        customer.name,
        customer.email,
        customer.whatsapp,
        customer.phone,
      ].join(" ").toLocaleLowerCase("es").includes(term)).slice(0, 5),
      appointments: appointments.filter((appointment) => [
        appointment.customerName,
        appointment.service,
        appointment.serviceSubtype,
        appointment.date,
      ].join(" ").toLocaleLowerCase("es").includes(term)).slice(0, 5),
      services: services.filter((service) => [
        service.name,
        service.category,
        service.description,
      ].join(" ").toLocaleLowerCase("es").includes(term)).slice(0, 5),
    };
  }, [appointments, customers, globalQuery, services]);
  const hasGlobalResults = globalSearchResults.customers.length > 0
    || globalSearchResults.appointments.length > 0
    || globalSearchResults.services.length > 0;

  const notificationItems = useMemo(
    () =>
      notifications.map((notification) => {
        const appointment = appointments.find((item) => item.id === notification.appointmentId);
        return { ...notification, appointment };
      }),
    [notifications, appointments],
  );

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (openNotifications && notificationsRef.current && !notificationsRef.current.contains(target)) setOpenNotifications(false);
      if (openProfileMenu && profileRef.current && !profileRef.current.contains(target)) setOpenProfileMenu(false);
      if (openGlobalSearch && globalSearchRef.current && !globalSearchRef.current.contains(target)) setOpenGlobalSearch(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [openGlobalSearch, openNotifications, openProfileMenu]);

  const handleNew = () => {
    const next = new URLSearchParams(location.search);
    next.set("nuevo", "1");
    navigate(`${currentPath}?${next.toString()}`);
  };

  const handleGlobalSearch = (value: string) => {
    const next = new URLSearchParams(location.search);
    if (value) next.set("q", value);
    else next.delete("q");
    navigate({ pathname: location.pathname, search: next.toString() ? `?${next.toString()}` : "" }, { replace: true });
    setOpenGlobalSearch(Boolean(value));
  };

  const markAllReadInCloud = async () => {
    if (!hasSupabaseConfig || !supabase) return;
    const { error } = await supabase.from("notifications").update({ read: true }).neq("id", "00000000-0000-0000-0000-000000000000");
    if (!error) {
      markAllNotificationsRead();
      await showActionSuccess("Notificaciones actualizadas", "Todas quedaron marcadas como leídas.");
    }
  };

  const clearNotificationsInCloud = async () => {
    if (!hasSupabaseConfig || !supabase) return;
    const confirmation = await fireAppAlert({ title: "Vaciar notificaciones", text: "¿Deseas borrar todas las notificaciones visibles?", icon: "warning", showCancelButton: true, confirmButtonText: "Vaciar", cancelButtonText: "Cancelar" });
    if (!confirmation.isConfirmed) {
      await showActionCancelled();
      return;
    }
    const { error } = await supabase.from("notifications").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (!error) {
      clearNotifications();
      await showActionSuccess("Notificaciones vaciadas", "La bandeja quedó limpia correctamente.");
    }
  };

  const acknowledgeNotificationsInCloud = async () => {
    if (!hasSupabaseConfig || !supabase) return;
    const { error } = await supabase
      .from("notifications")
      .update({ seen_at: new Date().toISOString() })
      .is("seen_at", null);
    if (!error) acknowledgeNotificationsShown();
  };

  const deleteNotificationInCloud = async (notificationId: string) => {
    if (!hasSupabaseConfig || !supabase) return;
    const confirmation = await fireAppAlert({ title: "Borrar notificación", text: "¿Deseas borrar esta notificación?", icon: "warning", showCancelButton: true, confirmButtonText: "Borrar", cancelButtonText: "Cancelar" });
    if (!confirmation.isConfirmed) {
      await showActionCancelled();
      return;
    }
    const { error } = await supabase.from("notifications").delete().eq("id", notificationId);
    if (!error) {
      deleteNotification(notificationId);
      await showActionSuccess("Notificación borrada");
    }
  };

  const sendNotificationEmail = async (notification: (typeof notificationItems)[number]) => {
    const appointment = notification.appointment;
    if (!appointment?.customerEmail) {
      await fireAppAlert({ title: "Falta correo electrónico", text: "Este cliente no tiene un correo registrado.", icon: "info", confirmButtonText: "Entendido" });
      return;
    }
    setSendingNotificationId(notification.id);
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
      await saveAppointmentReminderLog(appointment.id, appointment.date, appointment.customerEmail);
      await showActionSuccess("Correo enviado", "El recordatorio de la cita fue enviado correctamente.");
    } catch (error) {
      await fireAppAlert({ title: "No se pudo enviar el correo", text: error instanceof Error ? error.message : "Intenta nuevamente.", icon: "error", confirmButtonText: "Entendido" });
    } finally {
      setSendingNotificationId(null);
    }
  };

  return (
    <header className="sticky top-0 z-30 border-b border-rose-100 bg-white px-3 py-2.5 sm:px-4 md:px-5">
      <div className="flex flex-wrap items-center gap-2.5 md:gap-3">
        <button type="button" onClick={onOpenSidebar} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-zinc-200 text-zinc-600 hover:bg-zinc-50 lg:hidden" aria-label="Abrir menú"><Menu className="h-5 w-5" /></button>
        <div ref={globalSearchRef} className="relative order-last w-full sm:order-none sm:min-w-[220px] sm:flex-1">
          <label className="flex w-full items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-zinc-500">
            <Search className="h-4 w-4" />
            <input
              aria-label="Buscador global"
              className="w-full bg-transparent text-sm outline-none"
              placeholder="Buscar clientes, citas, servicios o ventas..."
              value={globalQuery}
              onFocus={() => setOpenGlobalSearch(Boolean(globalQuery))}
              onChange={(event) => handleGlobalSearch(event.target.value)}
            />
          </label>
          {openGlobalSearch && globalQuery.trim() ? (
            <div className="fixed inset-x-3 top-[108px] z-50 max-h-[70dvh] overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-3 shadow-2xl sm:absolute sm:inset-auto sm:left-0 sm:right-0 sm:top-12">
              {!hasGlobalResults ? (
                <MakeupEmptyState compact title="Sin coincidencias" message="No encontramos clientas, citas ni servicios con esa búsqueda." />
              ) : (
                <div className="space-y-3">
                  {globalSearchResults.customers.length > 0 ? (
                    <section>
                      <p className="mb-1 px-2 text-[10px] uppercase tracking-[0.16em] text-zinc-500">Clientes</p>
                      {globalSearchResults.customers.map((customer) => (
                        <button key={customer.id} type="button" onClick={() => { setOpenGlobalSearch(false); navigate(`/app/clientes?q=${encodeURIComponent(customer.name)}`); }} className="block w-full rounded-xl px-3 py-2 text-left hover:bg-zinc-50">
                          <span className="block truncate text-sm text-zinc-800">{customer.name}</span>
                          <span className="block truncate text-xs text-zinc-500">{customer.email || customer.whatsapp || customer.phone}</span>
                        </button>
                      ))}
                    </section>
                  ) : null}
                  {globalSearchResults.appointments.length > 0 ? (
                    <section>
                      <p className="mb-1 px-2 text-[10px] uppercase tracking-[0.16em] text-zinc-500">Citas</p>
                      {globalSearchResults.appointments.map((appointment) => (
                        <button key={appointment.id} type="button" onClick={() => { setOpenGlobalSearch(false); navigate(`/app/agenda?q=${encodeURIComponent(appointment.customerName)}`); }} className="block w-full rounded-xl px-3 py-2 text-left hover:bg-zinc-50">
                          <span className="block truncate text-sm text-zinc-800">{appointment.customerName} · {appointment.service}</span>
                          <span className="block text-xs text-zinc-500">{appointment.date} · {appointment.start}</span>
                        </button>
                      ))}
                    </section>
                  ) : null}
                  {globalSearchResults.services.length > 0 ? (
                    <section>
                      <p className="mb-1 px-2 text-[10px] uppercase tracking-[0.16em] text-zinc-500">Servicios</p>
                      {globalSearchResults.services.map((service) => (
                        <button key={service.id} type="button" onClick={() => { setOpenGlobalSearch(false); navigate(`/app/servicios?q=${encodeURIComponent(service.name)}`); }} className="block w-full rounded-xl px-3 py-2 text-left hover:bg-zinc-50">
                          <span className="block truncate text-sm text-zinc-800">{service.name}</span>
                          <span className="block truncate text-xs text-zinc-500">{service.category || "Sin categoría"}</span>
                        </button>
                      ))}
                    </section>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}
        </div>

        {newLabel ? <button onClick={handleNew} className="flex h-10 shrink-0 items-center gap-2 rounded-xl bg-rose-500 px-3 text-xs text-white hover:bg-rose-600 sm:px-4"><Plus className="h-4 w-4" /><span className="hidden sm:inline">{newLabel}</span><span className="sm:hidden">Nuevo</span></button> : null}

        <div ref={notificationsRef} className="relative">
          <button onClick={() => setOpenNotifications((prev) => {
            const next = !prev;
            if (next) void acknowledgeNotificationsInCloud();
            return next;
          })} className="relative grid h-10 w-10 place-items-center rounded-full text-zinc-500 hover:bg-zinc-100">
            <Bell className="h-5 w-5" />
            {pendingCount > 0 ? <span className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-rose-400 text-[10px] font-semibold text-white">{pendingCount > 9 ? "9+" : pendingCount}</span> : null}
          </button>

          {openNotifications ? (
            <div className="fixed inset-x-3 top-[62px] z-40 rounded-2xl border border-zinc-200 bg-white p-3 shadow-2xl sm:absolute sm:inset-auto sm:right-0 sm:top-12 sm:w-[360px]">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm text-zinc-800">Notificaciones</p>
                <div className="flex items-center gap-1">
                  <button onClick={() => void markAllReadInCloud()} className="rounded-md px-2 py-1 text-[11px] text-zinc-600 hover:bg-zinc-100">Marcar todas leídas</button>
                  <button onClick={() => void clearNotificationsInCloud()} className="rounded-md px-2 py-1 text-xs text-rose-600 hover:bg-rose-50">Vaciar</button>
                </div>
              </div>
              <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
                {notificationItems.length === 0 ? <p className="rounded-xl border border-zinc-100 p-3 text-sm text-zinc-500">No hay notificaciones por ahora.</p> : notificationItems.map((notification) => (
                  <article key={notification.id} className={`rounded-xl border p-3 ${notification.read ? "border-zinc-100 bg-zinc-50" : "border-zinc-200 bg-white"}`}>
                    <p className="text-sm text-zinc-800">{notification.title}</p><p className="mt-1 text-xs text-zinc-600">{notification.message}</p>
                    <div className="mt-2 flex justify-end gap-1.5">
                      <button disabled={sendingNotificationId === notification.id} onClick={() => void sendNotificationEmail(notification)} className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-zinc-200 px-2 py-1 text-[10px] text-zinc-700 hover:bg-zinc-50 disabled:opacity-60">{sendingNotificationId === notification.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />} Enviar correo</button>
                      <button onClick={() => void deleteNotificationInCloud(notification.id)} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" /> Borrar</button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div ref={profileRef} className="relative ml-auto sm:ml-0">
          <button onClick={() => setOpenProfileMenu((prev) => !prev)} className="flex items-center gap-3 rounded-xl px-2 py-1 hover:bg-zinc-50">
            {session?.avatarUrl ? <img src={session.avatarUrl} alt={session.name} className="h-10 w-10 rounded-full object-cover" /> : <div className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-amber-200 to-rose-300 text-sm text-white">{(session?.name ?? "DA").split(" ").map((item) => item[0]).join("").slice(0, 2).toUpperCase()}</div>}
            <div className="hidden text-left md:block"><p className="text-sm text-zinc-800">{session?.name || "Usuario"}</p><p className="text-xs text-zinc-500">{session?.role || "Administrador"}</p></div>
            <ChevronDown className="hidden h-4 w-4 text-zinc-500 sm:block" />
          </button>

          {openProfileMenu ? (
            <div className="fixed right-3 top-[62px] z-40 w-52 rounded-2xl border border-zinc-200 bg-white p-2 shadow-2xl sm:absolute sm:right-0 sm:top-12">
              <button onClick={() => { setOpenProfileMenu(false); navigate("/app/mi-perfil"); }} className="w-full rounded-lg px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50">Mi perfil</button>
              <button onClick={() => { setOpenProfileMenu(false); navigate("/app/configuracion"); }} className="w-full rounded-lg px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50">Configuraciones</button>
              <button onClick={async () => { if (hasSupabaseConfig && supabase) await supabase.auth.signOut(); useCrmStore.getState().logout(); navigate("/login"); }} className="w-full rounded-lg px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50">Cerrar sesión</button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}

