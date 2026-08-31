import { create } from "zustand";
import type { Activity, AppNotification, Appointment, CashSession, Contact, Customer, Lead, LeadStage, Note, PosSale, Service, UserSession } from "../types/crm";

interface CrmState {
  companyName: string;
  session: UserSession | null;
  customers: Customer[];
  contacts: Contact[];
  leads: Lead[];
  activities: Activity[];
  notes: Note[];
  appointments: Appointment[];
  notifications: AppNotification[];
  cashSessions: CashSession[];
  posSales: PosSale[];
  services: Service[];
  sentNotificationKeys: string[];
  dismissedNotificationKeys: string[];
  newNotificationKeys: string[];
  setSession: (session: UserSession | null) => void;
  login: (email: string) => void;
  logout: () => void;
  updateCompanyName: (companyName: string) => void;
  setCustomers: (customers: Customer[]) => void;
  setServices: (services: Service[]) => void;
  upsertService: (service: Service) => void;
  deleteServiceLocal: (serviceId: string) => void;
  addCustomer: (customer: Omit<Customer, "id" | "createdAt">) => void;
  updateCustomer: (customerId: string, patch: Partial<Customer>) => void;
  deleteCustomer: (customerId: string) => void;
  addContact: (contact: Omit<Contact, "id">) => void;
  addLead: (lead: Omit<Lead, "id">) => void;
  moveLead: (leadId: string, stage: LeadStage) => void;
  addActivity: (activity: Omit<Activity, "id" | "completed">) => void;
  toggleActivity: (activityId: string) => void;
  addNote: (note: Omit<Note, "id" | "createdAt">) => void;
  addAppointment: (appointment: Omit<Appointment, "id">) => Appointment;
  setAppointments: (appointments: Appointment[]) => void;
  upsertAppointment: (appointment: Appointment) => void;
  deleteAppointmentLocal: (appointmentId: string) => void;
  updateAppointment: (appointmentId: string, patch: Partial<Appointment>) => void;
  deleteAppointments: (appointmentIds: string[]) => void;
  cancelAppointment: (appointmentId: string) => void;
  confirmAppointmentByToken: (token: string) => boolean;
  cancelAppointmentByToken: (token: string) => boolean;
  findAppointmentByToken: (token: string) => Appointment | undefined;
  deleteNotification: (notificationId: string) => void;
  markNotificationRead: (notificationId: string) => void;
  markAllNotificationsRead: () => void;
  acknowledgeNotificationsShown: () => void;
  clearNotifications: () => void;
  setNotifications: (notifications: AppNotification[]) => void;
  upsertNotification: (notification: AppNotification) => void;
  updateProfile: (patch: Partial<UserSession>) => void;
  openCashSession: (openingAmount: number) => { ok: boolean; message: string; session?: CashSession };
  closeCashSession: (cashSessionId: string) => { ok: boolean; message: string; session?: CashSession };
  setCashSessionLocked: (cashSessionId: string, locked: boolean) => { ok: boolean; message: string; session?: CashSession };
  addPosSale: (sale: Omit<PosSale, "id" | "folio" | "createdAt" | "userName">) => { ok: boolean; message: string; sale?: PosSale };
  pushNotification: (payload: Omit<AppNotification, "id" | "date" | "read">) => void;
  regenerateNotifications: () => void;
  resetDemoData: () => void;
}

const id = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
const today = () => new Date().toISOString().slice(0, 10);
const isRejectedStatus = (status: Appointment["status"]) => status === "rechazada" || status === "cancelada";
const normalizeText = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
const stableNotificationKinds = new Set(["appointment_confirmed", "tomorrow_reminder"]);
const notificationDedupKey = (notification: Pick<AppNotification, "appointmentId" | "kind" | "title" | "message">) =>
  stableNotificationKinds.has(notification.kind ?? "")
    ? `${notification.appointmentId}::${notification.kind ?? "general"}`
    : `${notification.appointmentId}::${notification.kind ?? "general"}::${normalizeText(notification.title)}::${normalizeText(notification.message)}`;
export const getNotificationDedupKey = notificationDedupKey;

const unique = <T,>(values: T[]) => Array.from(new Set(values));

const dedupeNotifications = (notifications: AppNotification[]) => {
  const byKey = new Map<string, AppNotification>();
  notifications.forEach((notification) => {
    const key = notificationDedupKey(notification);
    const previous = byKey.get(key);
    if (!previous) {
      byKey.set(key, notification);
      return;
    }
    byKey.set(key, {
      ...previous,
      ...notification,
      id: previous.id || notification.id,
      read: previous.read || notification.read,
    });
  });
  return Array.from(byKey.values());
};

const ymd = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;


const buildTomorrowNotifications = (appointments: Appointment[]): AppNotification[] => {
  const base = new Date();
  const tomorrow = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1);
  const tomorrowKey = ymd(tomorrow);
  return appointments
    .filter((appointment) => appointment.date === tomorrowKey && !isRejectedStatus(appointment.status))
    .map((appointment) => ({
      id: id("not"),
      appointmentId: appointment.id,
      title: "Cita de mañana",
      message: `${appointment.customerName} - ${appointment.service} a las ${appointment.start}`,
      kind: "tomorrow_reminder",
      date: today(),
      read: false,
    }));
};

export const useCrmStore = create<CrmState>()((set, get) => ({
      companyName: "",
      session: null,
      customers: [],
      contacts: [],
      leads: [],
      activities: [],
      notes: [],
      appointments: [],
      notifications: [],
      cashSessions: [],
      posSales: [],
      services: [],
      sentNotificationKeys: [],
      dismissedNotificationKeys: [],
      newNotificationKeys: [],
      setSession: (session) =>
        set((state) => {
          if (session && state.session?.email === session.email) return { session };
          return {
            session,
            companyName: "",
            customers: [],
            contacts: [],
            leads: [],
            activities: [],
            notes: [],
            appointments: [],
            notifications: [],
            cashSessions: [],
            posSales: [],
            services: [],
            sentNotificationKeys: [],
            dismissedNotificationKeys: [],
            newNotificationKeys: [],
          };
        }),
      login: (email) =>
        set((state) => ({
          session: {
            name: email.split("@")[0] || "Usuario",
            email,
            role: "Administrador",
            companyName: state.companyName,
          },
        })),
      logout: () =>
        set({
          companyName: "",
          session: null,
          customers: [],
          contacts: [],
          leads: [],
          activities: [],
          notes: [],
          appointments: [],
          notifications: [],
          cashSessions: [],
          posSales: [],
          services: [],
          sentNotificationKeys: [],
          dismissedNotificationKeys: [],
          newNotificationKeys: [],
        }),
      updateCompanyName: (companyName) =>
        set((state) => ({
          companyName,
          session: state.session ? { ...state.session, companyName } : state.session,
        })),
      updateProfile: (patch) =>
        set((state) => {
          if (!state.session) return { session: state.session };
          const nextSession = { ...state.session, ...patch };
          if (nextSession.firstName || nextSession.lastName) {
            nextSession.name = `${nextSession.firstName ?? ""} ${nextSession.lastName ?? ""}`.trim();
          }
          return { session: nextSession };
        }),
      setCustomers: (customers) => set({ customers }),
      setServices: (services) => set({ services }),
      upsertService: (service) =>
        set((state) => ({
          services: state.services.some((item) => item.id === service.id)
            ? state.services.map((item) => (item.id === service.id ? service : item))
            : [...state.services, service].sort((a, b) => a.name.localeCompare(b.name, "es")),
        })),
      deleteServiceLocal: (serviceId) =>
        set((state) => ({ services: state.services.filter((service) => service.id !== serviceId) })),
      openCashSession: (openingAmount) => {
        if (get().cashSessions.some((cashSession) => cashSession.status === "abierta")) {
          return { ok: false, message: "Ya existe una caja abierta." };
        }
        if (openingAmount < 0 || Number.isNaN(openingAmount)) {
          return { ok: false, message: "El monto inicial no es válido." };
        }
        const session: CashSession = {
          id: id("cash"),
          openedAt: new Date().toISOString(),
          userName: get().session?.name ?? "Administrador",
          openingAmount,
          status: "abierta",
          posLocked: false,
        };
        set((state) => ({ cashSessions: [session, ...state.cashSessions] }));
        return { ok: true, message: "Caja abierta correctamente.", session };
      },
      closeCashSession: (cashSessionId) => {
        const target = get().cashSessions.find((cashSession) => cashSession.id === cashSessionId);
        if (!target) return { ok: false, message: "No se encontró la caja." };
        if (target.status === "cerrada") return { ok: false, message: "Esta caja ya está cerrada." };
        const session: CashSession = { ...target, status: "cerrada", closedAt: new Date().toISOString() };
        set((state) => ({
          cashSessions: state.cashSessions.map((cashSession) => (cashSession.id === cashSessionId ? session : cashSession)),
        }));
        return { ok: true, message: "Caja cerrada correctamente.", session };
      },
      setCashSessionLocked: (cashSessionId, locked) => {
        const target = get().cashSessions.find((cashSession) => cashSession.id === cashSessionId);
        if (!target) return { ok: false, message: "No se encontró la caja." };
        if (target.status === "cerrada") return { ok: false, message: "La caja ya está cerrada." };
        const session: CashSession = { ...target, posLocked: locked };
        set((state) => ({
          cashSessions: state.cashSessions.map((cashSession) => (cashSession.id === cashSessionId ? session : cashSession)),
        }));
        return { ok: true, message: locked ? "POS bloqueado." : "POS desbloqueado.", session };
      },
      addPosSale: (sale) => {
        const openSession = get().cashSessions.find((cashSession) => cashSession.id === sale.cashSessionId && cashSession.status === "abierta");
        if (!openSession) return { ok: false, message: "Debes abrir una caja antes de registrar ventas." };
        if (openSession.posLocked) return { ok: false, message: "El POS está bloqueado. Desbloquéalo para vender." };
        if (sale.total <= 0 || sale.items.length === 0) {
          return { ok: false, message: "No se puede registrar una venta con total en cero." };
        }
        const created: PosSale = {
          ...sale,
          id: id("sale"),
          folio: `POS-${String(get().posSales.length + 1).padStart(5, "0")}`,
          createdAt: new Date().toISOString(),
          userName: get().session?.name ?? "Administrador",
        };
        set((state) => ({ posSales: [created, ...state.posSales] }));
        return { ok: true, message: "Venta registrada correctamente.", sale: created };
      },
      addCustomer: (customer) => set((state) => ({ customers: [{ id: id("cus"), createdAt: today(), ...customer }, ...state.customers] })),
      updateCustomer: (customerId, patch) => set((state) => ({ customers: state.customers.map((customer) => (customer.id === customerId ? { ...customer, ...patch } : customer)) })),
      deleteCustomer: (customerId) => set((state) => ({ customers: state.customers.filter((customer) => customer.id !== customerId) })),
      addContact: (contact) => set((state) => ({ contacts: [{ id: id("con"), ...contact }, ...state.contacts] })),
      addLead: (lead) => set((state) => ({ leads: [{ id: id("lead"), ...lead }, ...state.leads] })),
      moveLead: (leadId, stage) => set((state) => ({ leads: state.leads.map((lead) => (lead.id === leadId ? { ...lead, stage } : lead)) })),
      addActivity: (activity) => set((state) => ({ activities: [{ id: id("act"), completed: false, ...activity }, ...state.activities] })),
      toggleActivity: (activityId) => set((state) => ({ activities: state.activities.map((activity) => (activity.id === activityId ? { ...activity, completed: !activity.completed } : activity)) })),
      addNote: (note) => set((state) => ({ notes: [{ id: id("note"), createdAt: today(), ...note }, ...state.notes] })),
      addAppointment: (appointment) => {
        const created: Appointment = { id: id("apt"), ...appointment };
        set((state) => ({ appointments: [created, ...state.appointments] }));
        get().pushNotification({ appointmentId: created.id, title: "Nueva cita", message: `${created.customerName} - ${created.service} (${created.date} ${created.start})`, kind: "appointment_created" });
        get().regenerateNotifications();
        return created;
      },
      setAppointments: (appointments) => {
        set({ appointments });
      },
      upsertAppointment: (appointment) => {
        set((state) => {
          const exists = state.appointments.some((item) => item.id === appointment.id);
          return {
            appointments: exists
              ? state.appointments.map((item) => (item.id === appointment.id ? { ...item, ...appointment } : item))
              : [appointment, ...state.appointments],
          };
        });
      },
      deleteAppointmentLocal: (appointmentId) =>
        set((state) => ({
          appointments: state.appointments.filter((appointment) => appointment.id !== appointmentId),
          notifications: state.notifications.filter((notification) => notification.appointmentId !== appointmentId),
        })),
      updateAppointment: (appointmentId, patch) => {
        const previous = get().appointments.find((appointment) => appointment.id === appointmentId);
        if (!previous) return;
        if (previous.status === "completada" && patch.status && patch.status !== "completada") {
          return;
        }
        set((state) => ({ appointments: state.appointments.map((appointment) => (appointment.id === appointmentId ? { ...appointment, ...patch } : appointment)) }));
        const next = get().appointments.find((appointment) => appointment.id === appointmentId);
        if (!previous || !next) return;

        const wasRescheduled = previous.date !== next.date || previous.start !== next.start || previous.end !== next.end;
        if (wasRescheduled) {
          if (!patch.status && next.status !== "reagendada") {
            set((state) => ({ appointments: state.appointments.map((appointment) => (appointment.id === appointmentId ? { ...appointment, status: "reagendada" } : appointment)) }));
          }
          get().pushNotification({ appointmentId: next.id, title: "Cita reprogramada", message: `${next.customerName}: ${previous.date} ${previous.start} -> ${next.date} ${next.start}`, kind: "appointment_rescheduled" });
          get().regenerateNotifications();
          return;
        }
        if (previous.status !== next.status) {
          get().pushNotification({ appointmentId: next.id, title: "Estado de cita actualizado", message: `${next.customerName}: ${next.status}`, kind: "appointment_status_changed" });

        }
        get().regenerateNotifications();
      },
      deleteAppointments: (appointmentIds) =>
        set((state) => ({
          appointments: state.appointments.filter((appointment) => !appointmentIds.includes(appointment.id)),
          notifications: state.notifications.filter((notification) => !appointmentIds.includes(notification.appointmentId)),
        })),
      cancelAppointment: (appointmentId) => {
        set((state) => ({ appointments: state.appointments.map((appointment) => (appointment.id === appointmentId ? { ...appointment, status: "rechazada" } : appointment)) }));
        const appointment = get().appointments.find((item) => item.id === appointmentId);
        if (appointment) get().pushNotification({ appointmentId, title: "Cita rechazada", message: `${appointment.customerName} - ${appointment.date} ${appointment.start}`, kind: "appointment_status_changed" });
        get().regenerateNotifications();
      },
      confirmAppointmentByToken: (token) => {
        const target = get().appointments.find((appointment) => appointment.confirmationToken === token);
        if (!target) return false;
        set((state) => ({ appointments: state.appointments.map((appointment) => (appointment.confirmationToken === token ? { ...appointment, status: "aceptada" } : appointment)) }));
        get().pushNotification({ appointmentId: target.id, title: "Cita confirmada", message: `${target.customerName} confirmó su cita de ${target.service} (${target.date} ${target.start}).`, kind: "appointment_confirmed" });
        get().regenerateNotifications();
        return true;
      },
      cancelAppointmentByToken: (token) => {
        const target = get().appointments.find((appointment) => appointment.confirmationToken === token);
        if (!target) return false;
        set((state) => ({ appointments: state.appointments.map((appointment) => (appointment.confirmationToken === token ? { ...appointment, status: "rechazada" } : appointment)) }));
        get().pushNotification({ appointmentId: target.id, title: "Cita rechazada por cliente", message: `${target.customerName} rechazó su cita de ${target.service} (${target.date} ${target.start}).`, kind: "appointment_status_changed" });
        get().regenerateNotifications();
        return true;
      },
      findAppointmentByToken: (token) => get().appointments.find((appointment) => appointment.confirmationToken === token),
      deleteNotification: (notificationId) =>
        set((state) => {
          const target = state.notifications.find((notification) => notification.id === notificationId);
          if (!target) return state;
          const key = notificationDedupKey(target);
          return {
            notifications: state.notifications.filter((notification) => notification.id !== notificationId),
            dismissedNotificationKeys: unique([...state.dismissedNotificationKeys, key]),
            sentNotificationKeys: unique([...state.sentNotificationKeys, key]),
            newNotificationKeys: state.newNotificationKeys.filter((item) => item !== key),
          };
        }),
      markNotificationRead: (notificationId) =>
        set((state) => {
          const target = state.notifications.find((notification) => notification.id === notificationId);
          if (!target) {
            return { notifications: state.notifications };
          }
          const key = notificationDedupKey(target);
          return {
            notifications: state.notifications.map((notification) => (notification.id === notificationId ? { ...notification, read: true } : notification)),
            sentNotificationKeys: unique([...state.sentNotificationKeys, key]),
            newNotificationKeys: state.newNotificationKeys.filter((item) => item !== key),
          };
        }),
      markAllNotificationsRead: () =>
        set((state) => {
          const visibleKeys = state.notifications.map((notification) => notificationDedupKey(notification));
          return {
            notifications: state.notifications.map((notification) => ({ ...notification, read: true })),
            sentNotificationKeys: unique([...state.sentNotificationKeys, ...visibleKeys]),
            newNotificationKeys: state.newNotificationKeys.filter((key) => !visibleKeys.includes(key)),
          };
        }),
      acknowledgeNotificationsShown: () =>
        set((state) => {
          const visibleKeys = state.notifications.map((notification) => notificationDedupKey(notification));
          const seenAt = new Date().toISOString();
          return {
            notifications: state.notifications.map((notification) => notification.seenAt ? notification : { ...notification, seenAt }),
            sentNotificationKeys: unique([...state.sentNotificationKeys, ...visibleKeys]),
            newNotificationKeys: [],
          };
        }),
      clearNotifications: () =>
        set((state) => {
          const visibleKeys = state.notifications.map((notification) => notificationDedupKey(notification));
          return {
            notifications: [],
            dismissedNotificationKeys: unique([...state.dismissedNotificationKeys, ...visibleKeys]),
            sentNotificationKeys: unique([...state.sentNotificationKeys, ...visibleKeys]),
            newNotificationKeys: state.newNotificationKeys.filter((key) => !visibleKeys.includes(key)),
          };
        }),
      setNotifications: (notifications) =>
        set(() => {
          const deduped = dedupeNotifications(notifications);
          return {
            notifications: deduped,
            newNotificationKeys: deduped
              .filter((notification) => !notification.read && !notification.seenAt)
              .map((notification) => notificationDedupKey(notification)),
          };
        }),
      upsertNotification: (notification) =>
        set((state) => {
          const key = notificationDedupKey(notification);
          const sameEvent = state.notifications.find((item) => notificationDedupKey(item) === key);
          const exists = state.notifications.some((item) => item.id === notification.id);
          const isNewNotification = !notification.read && !notification.seenAt;
          const nextNewKeys = isNewNotification
            ? unique([...state.newNotificationKeys, key])
            : state.newNotificationKeys.filter((item) => item !== key);
          if (sameEvent) {
            return {
              notifications: state.notifications.map((item) =>
                item.id === sameEvent.id
                  ? { ...item, ...notification, id: item.id }
                  : item,
              ),
              newNotificationKeys: nextNewKeys,
            };
          }
          if (exists) {
            return {
              notifications: state.notifications.map((item) => (item.id === notification.id ? { ...item, ...notification } : item)),
              newNotificationKeys: nextNewKeys,
            };
          }
          return { notifications: [notification, ...state.notifications], newNotificationKeys: nextNewKeys };
        }),
      pushNotification: () => undefined,
      regenerateNotifications: () => undefined,
      resetDemoData: () =>
        set({
          customers: [],
          contacts: [],
          leads: [],
          activities: [],
          notes: [],
          appointments: [],
          notifications: [],
          cashSessions: [],
          posSales: [],
          services: [],
          sentNotificationKeys: [],
          dismissedNotificationKeys: [],
          newNotificationKeys: [],
        }),
}));

