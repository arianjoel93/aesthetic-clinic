import {
  BriefcaseMedical,
  ChartNoAxesColumnIncreasing,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Sparkles,
  Store,
  Users,
  X,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { useCrmStore } from "../../store/crmStore";
import { cn } from "../../utils/cn";

const sections = [
  { to: "/app/panel-general", label: "Panel general", icon: LayoutGrid },
  { to: "/app/pos", label: "POS", icon: Store },
  { to: "/app/ventas", label: "Ventas", icon: ChartNoAxesColumnIncreasing },
  { to: "/app/agenda", label: "Citas", icon: CalendarDays },
  { to: "/app/clientes", label: "Clientes", icon: Users },
  { to: "/app/servicios", label: "Servicios", icon: Sparkles },
];

interface SidebarProps {
  collapsed: boolean;
  mobileOpen: boolean;
  onMobileClose: () => void;
  onToggle: () => void;
}

export function Sidebar({ collapsed, mobileOpen, onMobileClose, onToggle }: SidebarProps) {
  const session = useCrmStore((state) => state.session);
  const companyName = useCrmStore((state) => state.companyName);

  return (
    <>
      {mobileOpen ? <button type="button" aria-label="Cerrar menú" onClick={onMobileClose} className="fixed inset-0 z-40 bg-zinc-950/35 backdrop-blur-[2px] lg:hidden" /> : null}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 flex h-dvh w-[276px] shrink-0 flex-col border-r border-rose-100 bg-white shadow-2xl transition-all duration-300 lg:sticky lg:top-0 lg:z-30 lg:h-screen lg:translate-x-0 lg:shadow-none",
        mobileOpen ? "translate-x-0" : "-translate-x-full",
        collapsed ? "lg:w-[76px]" : "lg:w-[224px]",
      )}>
      <button
        type="button"
        onClick={onToggle}
        className="absolute -right-3 top-20 z-20 hidden h-7 w-7 place-items-center rounded-full border border-rose-200 bg-white text-rose-500 shadow-sm hover:bg-rose-50 lg:grid"
        title={collapsed ? "Mostrar menú" : "Ocultar menú"}
      >
        {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </button>
      <div className="flex items-center justify-between border-b border-rose-100 px-4 py-4 lg:px-5">
        <div className="flex items-center gap-3 text-rose-400">
          <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full border border-rose-200 bg-rose-50">
            {session?.avatarUrl ? (
              <img src={session.avatarUrl} alt={session.name || "Perfil"} className="h-full w-full object-cover" />
            ) : (
              <BriefcaseMedical className="h-5 w-5" />
            )}
          </div>
          <div className={cn(collapsed && "hidden")}>
            <p className="text-[12px] font-semibold tracking-tight text-zinc-800">{session?.name || "Usuario"}</p>
            <p className="text-xs text-zinc-500">{companyName || session?.companyName || "CRM"}</p>
          </div>
        </div>
        <button type="button" onClick={onMobileClose} className="grid h-9 w-9 place-items-center rounded-full text-zinc-500 hover:bg-zinc-100 lg:hidden" aria-label="Cerrar menú"><X className="h-5 w-5" /></button>
      </div>

      <nav className="space-y-1 px-3 py-4">
        {sections.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onMobileClose}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 font-medium transition",
                isActive
                  ? "bg-rose-50 text-rose-500"
                  : "text-zinc-700 hover:bg-zinc-50 hover:text-zinc-950",
                collapsed && "justify-center px-2",
              )
            }
          >
            <Icon className="h-[18px] w-[18px] shrink-0" />
            <span className={cn("text-sm", collapsed && "lg:hidden")}>{label}</span>
          </NavLink>
        ))}
      </nav>
      </aside>
    </>
  );
}
