import { Navigate, createBrowserRouter } from "react-router-dom";
import { AppLayout } from "../layouts/AppLayout";
import { AgendaPage } from "../pages/AgendaPage";
import { AppointmentConfirmationPage } from "../pages/AppointmentConfirmationPage";
import { CustomersPage } from "../pages/CustomersPage";
import { DashboardPage } from "../pages/DashboardPage";
import { LoginPage } from "../pages/LoginPage";
import { ModulePlaceholderPage } from "../pages/ModulePlaceholderPage";
import { POSPage } from "../pages/POSPage";
import { ProfilePage } from "../pages/ProfilePage";
import { ServicesPage } from "../pages/ServicesPage";
import { SettingsPage } from "../pages/SettingsPage";
import { SalesPage } from "../pages/SalesPage";
import { AdminPinGate } from "./AdminPinGate";
import { ProtectedRoute } from "./ProtectedRoute";

export const router = createBrowserRouter([
  { path: "/", element: <Navigate to="/app/panel-general" replace /> },
  { path: "/login", element: <LoginPage /> },
  { path: "/app/cita/:token", element: <AppointmentConfirmationPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        path: "/app",
        element: <AppLayout />,
        children: [
          { index: true, element: <Navigate to="/app/panel-general" replace /> },
          { path: "panel-general", element: <DashboardPage /> },
          { path: "agenda", element: <AgendaPage /> },
          { path: "clientes", element: <CustomersPage /> },
          { path: "pos", element: <POSPage /> },
          { path: "ventas", element: <SalesPage /> },
          { path: "servicios", element: <ServicesPage /> },
          { path: "tratamientos", element: <ModulePlaceholderPage title="Tratamientos" description="Este módulo concentrará catálogo de tratamientos, duración, precio y recursos asociados." createLabel="Nuevo tratamiento" /> },
          { path: "seguimientos", element: <ModulePlaceholderPage title="Seguimientos" description="Aquí centralizaremos seguimientos post cita, recordatorios y estados de avance por cliente." createLabel="Nuevo seguimiento" /> },
          { path: "ventas-cotizaciones", element: <ModulePlaceholderPage title="Ventas y cotizaciones" description="Aquí estaremos montando cotizadores, cierre de ventas y control de propuestas comerciales." createLabel="Nueva cotización" /> },
          { path: "reportes", element: <ModulePlaceholderPage title="Reportes" description="Este apartado consolidara reportes avanzados. El Panel general ya muestra los KPIs principales." createLabel="Nuevo reporte" /> },
          { path: "usuarios", element: <ModulePlaceholderPage title="Usuarios" description="Aquí configuraremos perfiles, roles y permisos por módulo en una siguiente iteración." createLabel="Nuevo usuario" /> },
          {
            element: <AdminPinGate />,
            children: [
              { path: "mi-perfil", element: <ProfilePage /> },
              { path: "configuracion", element: <SettingsPage /> },
            ],
          },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/app/panel-general" replace /> },
]);
