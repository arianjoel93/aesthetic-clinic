import { Navigate, Outlet } from "react-router-dom";
import { useCrmStore } from "../store/crmStore";

export function ModulePermissionGate({ module }: { module: string }) {
  const session = useCrmStore((state) => state.session);
  const allowed = session?.role === "Administrador" || session?.permissions?.[module] !== false;
  return allowed ? <Outlet /> : <Navigate to="/app/panel-general" replace />;
}
