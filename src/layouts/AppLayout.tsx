import { Outlet } from "react-router-dom";
import { useEffect, useState } from "react";
import { Sidebar } from "../components/layout/Sidebar";
import { Topbar } from "../components/layout/Topbar";
import { SupabaseRealtimeSync } from "../components/realtime/SupabaseRealtimeSync";
import { DatabaseActivityOverlay } from "../components/ui/DatabaseActivityOverlay";
import { loadAppTheme } from "../lib/appSettings";
import { useCrmStore } from "../store/crmStore";

export function AppLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const companyName = useCrmStore((state) => state.companyName);

  useEffect(() => {
    void loadAppTheme();
  }, []);

  useEffect(() => {
    document.title = companyName ? `${companyName} | CRM` : "CRM";
  }, [companyName]);

  return (
    <div className="app-shell min-h-screen bg-[#fbf9fb] text-zinc-800 lg:flex">
      <DatabaseActivityOverlay />
      <SupabaseRealtimeSync />
      <Sidebar
        collapsed={sidebarCollapsed}
        mobileOpen={mobileSidebarOpen}
        onMobileClose={() => setMobileSidebarOpen(false)}
        onToggle={() => setSidebarCollapsed((prev) => !prev)}
      />
      <div className="min-w-0 flex-1">
        <Topbar onOpenSidebar={() => setMobileSidebarOpen(true)} />
        <main className="px-3 py-4 sm:px-4 md:px-5 md:py-5 xl:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
