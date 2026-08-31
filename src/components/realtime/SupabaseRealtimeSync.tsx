import { useEffect } from "react";
import {
  fetchSupabaseAppointments,
  mapDbAppointment,
  mapDbNotification,
} from "../../lib/appointmentsApi";
import { listSupabaseCustomers } from "../../lib/customersApi";
import { getSetting, applyAppTheme, type AppTheme } from "../../lib/appSettings";
import { listServices, mapService } from "../../lib/servicesApi";
import { hasSupabaseConfig, supabase } from "../../lib/supabaseClient";
import { useCrmStore } from "../../store/crmStore";

export function SupabaseRealtimeSync() {
  const setAppointments = useCrmStore((state) => state.setAppointments);
  const setCustomers = useCrmStore((state) => state.setCustomers);
  const upsertAppointment = useCrmStore((state) => state.upsertAppointment);
  const deleteAppointmentLocal = useCrmStore((state) => state.deleteAppointmentLocal);
  const setNotifications = useCrmStore((state) => state.setNotifications);
  const upsertNotification = useCrmStore((state) => state.upsertNotification);
  const deleteNotification = useCrmStore((state) => state.deleteNotification);
  const setServices = useCrmStore((state) => state.setServices);
  const upsertService = useCrmStore((state) => state.upsertService);
  const deleteServiceLocal = useCrmStore((state) => state.deleteServiceLocal);
  const updateCompanyName = useCrmStore((state) => state.updateCompanyName);

  useEffect(() => {
    const client = supabase;
    let cancelled = false;

    if (!hasSupabaseConfig || !client) {
      setAppointments([]);
      setCustomers([]);
      setNotifications([]);
      setServices([]);
      updateCompanyName("");
      return undefined;
    }

    void fetchSupabaseAppointments()
      .then(setAppointments)
      .catch((error) => console.warn("No se pudieron cargar citas desde Supabase.", error));

    void listSupabaseCustomers()
      .then(setCustomers)
      .catch((error) => console.warn("No se pudieron cargar clientes desde Supabase.", error));

    void listServices()
      .then(setServices)
      .catch((error) => console.warn("No se pudieron cargar servicios desde la base de datos.", error));

    const refreshSettings = async () => {
      const [companyName, theme] = await Promise.all([getSetting("company_name"), getSetting("app_theme")]);
      if (cancelled) return;
      updateCompanyName(companyName ?? "");
      if (theme) applyAppTheme(theme as AppTheme);
    };
    void refreshSettings().catch(() => undefined);

    const refreshCustomers = () => {
      void listSupabaseCustomers().then(setCustomers).catch(() => undefined);
    };

    void client.from("notifications").select("*").order("created_at", { ascending: false }).limit(100).then(({ data }) => {
      if (!data) return;
      setNotifications(data.map((item) => mapDbNotification(item as unknown as Record<string, unknown>)));
    });

    const channel = client
      .channel("crm-live-sync")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "appointments" }, (payload) => {
        upsertAppointment(mapDbAppointment(payload.new as Record<string, unknown>));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "appointments" }, (payload) => {
        upsertAppointment(mapDbAppointment(payload.new as Record<string, unknown>));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "appointments" }, (payload) => {
        const deletedId = String((payload.old as Record<string, unknown>)?.id ?? "");
        if (deletedId) deleteAppointmentLocal(deletedId);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, (payload) => {
        upsertNotification(mapDbNotification(payload.new as Record<string, unknown>));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications" }, (payload) => {
        upsertNotification(mapDbNotification(payload.new as Record<string, unknown>));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "notifications" }, (payload) => {
        const deletedId = String((payload.old as Record<string, unknown>)?.id ?? "");
        if (deletedId) deleteNotification(deletedId);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "customers" }, refreshCustomers)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "services" }, (payload) => {
        upsertService(mapService(payload.new as Record<string, unknown>));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "services" }, (payload) => {
        upsertService(mapService(payload.new as Record<string, unknown>));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "services" }, (payload) => {
        const deletedId = String((payload.old as Record<string, unknown>)?.id ?? "");
        if (deletedId) deleteServiceLocal(deletedId);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "app_settings" }, () => {
        void refreshSettings();
      })
      .subscribe();

    return () => {
      cancelled = true;
      void client.removeChannel(channel);
    };
  }, [deleteAppointmentLocal, deleteNotification, deleteServiceLocal, setAppointments, setCustomers, setNotifications, setServices, updateCompanyName, upsertAppointment, upsertNotification, upsertService]);

  return null;
}
