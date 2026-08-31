import {
  Activity,
  BarChart3,
  Building2,
  ContactRound,
  Home,
  LayoutDashboard,
  LogOut,
  Menu,
  NotebookPen,
  Settings,
  Target,
  Workflow,
  X,
} from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";

import { Button } from "../components/ui/Button";
import { useAuthStore } from "../store/authStore";
import { cn } from "../utils/cn";

const navigation = [
  { to: "/", label: "Inicio", icon: Home },
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/customers", label: "Clientes", icon: Building2 },
  { to: "/contacts", label: "Contactos", icon: ContactRound },
  { to: "/leads", label: "Leads", icon: Target },
  { to: "/pipeline", label: "Pipeline", icon: Workflow },
  { to: "/activities", label: "Seguimiento", icon: Activity },
  { to: "/notes", label: "Notas", icon: NotebookPen },
  { to: "/settings", label: "Configuración", icon: Settings },
];

export function DashboardLayout() {
  const [open, setOpen] = useState(false);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-72 border-r border-line bg-paper px-4 py-5 shadow-soft transition-transform lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-ink text-white">
              <BarChart3 size={20} />
            </div>
            <div>
              <p className="text-base font-bold">CRM Modular</p>
              <p className="text-xs text-muted">MVP empresarial</p>
            </div>
          </div>
          <button className="lg:hidden" onClick={() => setOpen(false)} aria-label="Cerrar menu">
            <X size={20} />
          </button>
        </div>

        <nav className="mt-8 space-y-1">
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted transition hover:bg-stone-100 hover:text-ink",
                    isActive && "bg-stone-100 text-ink",
                  )
                }
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-30 border-b border-line bg-paper/90 px-4 py-3 backdrop-blur sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button className="lg:hidden" onClick={() => setOpen(true)} aria-label="Abrir menu">
                <Menu size={22} />
              </button>
              <div>
                <p className="text-sm text-muted">Sesión activa</p>
                <h2 className="text-lg font-bold">{user?.full_name ?? "Usuario"}</h2>
              </div>
            </div>
            <Button variant="ghost" onClick={handleLogout}>
              <LogOut size={17} />
              Salir
            </Button>
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
